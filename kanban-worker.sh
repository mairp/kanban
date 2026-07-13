#!/usr/bin/env bash
# Autonomous kanban worker — run by systemd timer every 5 min.
#
# Design (self-healing):
#   - Holds an exclusive flock for the WHOLE run (incl. the blocking build), so
#     no two workers ever overlap and the reaper never races an active build.
#   - Reaper: an in-progress card older than KANBAN_STALE_MINUTES is reclaimed to
#     backlog (this is what un-jams a stranded card — the bug that froze the board
#     for ~15 days). Age comes from cards.updated_at (UTC), exposed by the API.
#   - Fresh in-progress card (age <= threshold): still skipped, so an interactive
#     session or an active build keeps priority. Only the "forever" part is fixed.
#   - Each cycle publishes health to a Prometheus textfile metric so a silent
#     freeze is visible (never again invisible for 15 days).
#
# Each task runs in its OWN fresh, persisted Claude session (unique --session-id):
# clean context per task, saved to disk (claude --resume <id>). Pickup/completion
# announced to Telegram so runs are observable live.
set -euo pipefail

LOCK=/tmp/kanban-worker.lock
API="${KANBAN_API_URL:-http://localhost:3002}"
LOG=/var/log/kanban-worker.log
SESSIONS=/var/log/kanban-sessions.jsonl        # card -> claude session map (read by `kanban-cli.sh sessions`)
TG_TARGET="${KANBAN_TG_TARGET:-7790852780}"    # Marlon's Telegram chat id
CLI=/root/kanban/kanban-cli.sh
STALE_MIN="${KANBAN_STALE_MINUTES:-90}"        # reclaim an in-progress card older than this (minutes)
METRICS="${KANBAN_METRICS_FILE:-/var/lib/node_exporter/textfile_collector/kanban.prom}"
LAST_PICKUP_FILE=/var/log/kanban-last-pickup   # unix ts of the last successful pickup (for metrics)

# Plain-text Telegram notify (no emojis, per project convention). Best-effort.
notify() {
  openclaw message send --channel telegram --account default \
    --target "$TG_TARGET" -m "$1" >/dev/null 2>&1 || true
}

# Append a card->session record (JSON, safely escaped via python). Args: status card_id session_id title
record_session() {
  STATUS="$1" RC_CARD="$2" RC_SID="$3" RC_TITLE="$4" python3 -c '
import json, os, datetime
rec = {
    "ts": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "status": os.environ["STATUS"],
    "card_id": os.environ["RC_CARD"],
    "session_id": os.environ["RC_SID"],
    "title": os.environ["RC_TITLE"],
}
print(json.dumps(rec))
' >> "$SESSIONS" 2>/dev/null || true
}

# Publish board health to the node_exporter textfile collector (atomic write).
# Args: backlog_depth  inprogress_age_seconds(-1 if none)
write_metrics() {
  local depth="$1" age="$2" pickup tmp
  pickup="$(cat "$LAST_PICKUP_FILE" 2>/dev/null || echo 0)"
  tmp="$(mktemp)"
  {
    echo "# HELP kanban_backlog_depth Cards waiting in the backlog column."
    echo "# TYPE kanban_backlog_depth gauge"
    echo "kanban_backlog_depth ${depth}"
    echo "# HELP kanban_inprogress_age_seconds Age of the current in-progress card (-1 if none)."
    echo "# TYPE kanban_inprogress_age_seconds gauge"
    echo "kanban_inprogress_age_seconds ${age}"
    echo "# HELP kanban_worker_last_pickup_timestamp_seconds Unix time the worker last picked up a card."
    echo "# TYPE kanban_worker_last_pickup_timestamp_seconds gauge"
    echo "kanban_worker_last_pickup_timestamp_seconds ${pickup}"
    echo "# HELP kanban_worker_heartbeat_timestamp_seconds Unix time the worker loop last ran (not blocked)."
    echo "# TYPE kanban_worker_heartbeat_timestamp_seconds gauge"
    echo "kanban_worker_heartbeat_timestamp_seconds $(date +%s)"
  } > "$tmp"
  mv "$tmp" "$METRICS" 2>/dev/null && chmod 644 "$METRICS" 2>/dev/null || true
}

# Single-instance guard (prevents timer overlap AND protects an in-flight build
# from the reaper — the lock is held for the whole script lifetime).
exec 9>"$LOCK"
flock -n 9 || { echo "$(date -Is) already running, skipping" >> "$LOG"; exit 0; }

BOARD=$(curl -sf --max-time 5 "$API/api/board" 2>/dev/null) || exit 0
[ -z "$BOARD" ] && exit 0

# Extract in-progress (id/age_seconds) and backlog depth in one pass.
# Board JSON passed via env var, NOT stdin (`python3 -c` reads its program from -c).
# Capture-then-parse (not `read < <(...)`) so a python failure can't abort set -e.
SNAP=$(BOARD="$BOARD" python3 -c '
import json, os, datetime
data = json.loads(os.environ["BOARD"])
ip_id, ip_age, depth = "-", "-1", 0
for col in data["columns"]:
    if col["id"] == "backlog":
        depth = len(col["cards"])
    if col["id"] == "in-progress" and col["cards"]:
        c = col["cards"][0]
        ip_id = c["id"]
        ts = c.get("updated_at") or c.get("created_at")
        if ts:
            try:
                # updated_at is UTC ("YYYY-MM-DD HH:MM:SS"); compare to now(UTC).
                dt = datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
                now = datetime.datetime.now(datetime.timezone.utc)
                ip_age = str(int((now - dt).total_seconds()))
            except Exception:
                ip_age = "999999"   # unparseable -> treat as very old (reclaimable)
        else:
            ip_age = "999999"       # no timestamp -> reclaimable (pre-migration/stranded)
print(ip_id, ip_age, depth)
') || SNAP="- -1 0"
read -r IP_ID IP_AGE BACKLOG_DEPTH <<< "$SNAP"
IP_ID="${IP_ID:--}"; IP_AGE="${IP_AGE:--1}"; BACKLOG_DEPTH="${BACKLOG_DEPTH:-0}"

# The in-progress title (for logs/alerts) — separate, may contain spaces.
IP_TITLE=""
if [ "$IP_ID" != "-" ]; then
  IP_TITLE=$(BOARD="$BOARD" python3 -c '
import json, os
data = json.loads(os.environ["BOARD"])
for col in data["columns"]:
    if col["id"] == "in-progress" and col["cards"]:
        print(col["cards"][0]["title"]); break
')
fi

write_metrics "$BACKLOG_DEPTH" "$IP_AGE"

# --- Reaper + priority guard ---------------------------------------------------
if [ "$IP_ID" != "-" ]; then
  STALE_SEC=$(( STALE_MIN * 60 ))
  if [ "$IP_AGE" -ge "$STALE_SEC" ]; then
    AGE_MIN=$(( IP_AGE / 60 ))
    echo "$(date -Is) RECLAIM stale in-progress [$IP_ID] '$IP_TITLE' age ${AGE_MIN}m (>= ${STALE_MIN}m) -> backlog" >> "$LOG"
    if "$CLI" move "$IP_ID" backlog >/dev/null 2>&1; then
      notify "Kanban worker: reclaimed a STRANDED card -> backlog. \"$IP_TITLE\" (card $IP_ID) sat in-progress for ${AGE_MIN} min with no active worker. It will be picked up next cycle."
    else
      echo "$(date -Is) reclaim move FAILED for [$IP_ID]" >> "$LOG"
    fi
    exit 0   # next cycle sees an empty in-progress and picks up work
  fi
  # Fresh card (active session or in-flight build has priority) — skip.
  echo "$(date -Is) in-progress: [$IP_TITLE] age $(( IP_AGE / 60 ))m — skipping (fresh)" >> "$LOG"
  exit 0
fi
# ------------------------------------------------------------------------------

# Get first backlog card (tab-separated id/title/details)
TASK=$(BOARD="$BOARD" python3 -c '
import json, os
data = json.loads(os.environ["BOARD"])
for col in data["columns"]:
    if col["id"] == "backlog" and col["cards"]:
        c = col["cards"][0]
        print("\t".join([c["id"], c["title"], c.get("details", "")]))
        break
')

[ -z "$TASK" ] && exit 0   # empty backlog — nothing to do

CARD_ID=$(echo "$TASK" | cut -f1)
TITLE=$(echo "$TASK"   | cut -f2)
DETAILS=$(echo "$TASK" | cut -f3)

# Fresh session id per task: clean context, but persisted (resumable/inspectable).
SESSION_ID=$(cat /proc/sys/kernel/random/uuid)

date +%s > "$LAST_PICKUP_FILE" 2>/dev/null || true
echo "$(date -Is) picking up [$CARD_ID] $TITLE (session $SESSION_ID)" >> "$LOG"
record_session started "$CARD_ID" "$SESSION_ID" "$TITLE"
notify "Kanban worker: started \"$TITLE\" (card $CARD_ID). Inspect later: claude --resume $SESSION_ID"

# Capture output so we can send a completion summary. Don't let a non-zero
# claude exit abort the script before we notify.
#
# --dangerously-skip-permissions: in --print (non-interactive) there is no
# approver, so Write/Edit/Bash would auto-DENY -> the agent runs read-only and
# every coding task fails "filesystem read-only". IS_SANDBOX=1 is REQUIRED for
# root, else the skip-permissions flag silently no-ops (cf. ralph_loop.sh).
# Enabled 2026-07-13 with Marlon's explicit approval so the worker can do real
# coding work autonomously.
set +e
RESULT=$(IS_SANDBOX=1 claude --print --dangerously-skip-permissions --session-id "$SESSION_ID" "
You are working autonomously on a Kanban task. Complete it fully, then update the board.

Card ID : $CARD_ID
Title   : $TITLE
Details : $DETAILS

Steps:
1. Run: /root/kanban/kanban-cli.sh move $CARD_ID in-progress
2. Do the work described in Title + Details.
3. When complete, run: /root/kanban/kanban-cli.sh move $CARD_ID review
4. Output a one-paragraph summary of what was done (this becomes the completion notice).

Use whatever tools are needed (Bash, Read, Edit, Write, WebSearch, etc.).
Work autonomously to completion — do not ask for confirmation.
" 2>&1)
RC=$?
set -e

echo "$RESULT" >> "$LOG"
echo "$(date -Is) done [$CARD_ID] rc=$RC" >> "$LOG"
record_session "$([ "$RC" -eq 0 ] && echo done || echo error)" "$CARD_ID" "$SESSION_ID" "$TITLE"

# Summary = last chunk of the model's output (Telegram caption budget).
SUMMARY=$(echo "$RESULT" | tail -c 600)
if [ "$RC" -eq 0 ]; then
  notify "Kanban worker: finished \"$TITLE\" -> moved to Review.

$SUMMARY

Resume: claude --resume $SESSION_ID"
else
  notify "Kanban worker: \"$TITLE\" exited with error (rc=$RC). See /var/log/kanban-worker.log. Resume: claude --resume $SESSION_ID"
fi
