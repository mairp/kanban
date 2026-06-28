#!/usr/bin/env bash
# Autonomous kanban worker — run by systemd timer every 5 min.
# Skips if any card is already in-progress (interactive session may own it).
#
# Each task runs in its OWN fresh, persisted Claude session (unique --session-id):
#   - clean context per task (new session id = no carryover)
#   - saved to disk, so you can inspect it later with: claude --resume <id>
# Pickup and completion are announced to Telegram so runs are observable live.
set -euo pipefail

LOCK=/tmp/kanban-worker.lock
API="${KANBAN_API_URL:-http://localhost:3002}"
LOG=/var/log/kanban-worker.log
TG_TARGET="${KANBAN_TG_TARGET:-7790852780}"   # Marlon's Telegram chat id

# Plain-text Telegram notify (no emojis, per project convention). Best-effort.
notify() {
  openclaw message send --channel telegram --account default \
    --target "$TG_TARGET" -m "$1" >/dev/null 2>&1 || true
}

# Single-instance guard (prevents timer overlap)
exec 9>"$LOCK"
flock -n 9 || { echo "$(date -Is) already running, skipping" >> "$LOG"; exit 0; }

BOARD=$(curl -sf --max-time 5 "$API/api/board" 2>/dev/null) || exit 0
[ -z "$BOARD" ] && exit 0

# Skip if anything is already in-progress (another session is working).
# Board JSON is passed via env var, NOT stdin: `python3 -c` reads its program
# from the -c arg, leaving stdin free — feeding the board on stdin would be
# read as the program and crash.
IN_PROGRESS=$(BOARD="$BOARD" python3 -c '
import json, os
data = json.loads(os.environ["BOARD"])
for col in data["columns"]:
    if col["id"] == "in-progress" and col["cards"]:
        print(col["cards"][0]["title"])
        break
')
if [ -n "$IN_PROGRESS" ]; then
  echo "$(date -Is) in-progress: [$IN_PROGRESS] — skipping" >> "$LOG"
  exit 0
fi

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

echo "$(date -Is) picking up [$CARD_ID] $TITLE (session $SESSION_ID)" >> "$LOG"
notify "Kanban worker: started \"$TITLE\" (card $CARD_ID). Inspect later: claude --resume $SESSION_ID"

# Capture output so we can send a completion summary. Don't let a non-zero
# claude exit abort the script before we notify.
set +e
RESULT=$(claude --print --session-id "$SESSION_ID" "
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

# Summary = last chunk of the model's output (Telegram caption budget).
SUMMARY=$(echo "$RESULT" | tail -c 600)
if [ "$RC" -eq 0 ]; then
  notify "Kanban worker: finished \"$TITLE\" -> moved to Review.

$SUMMARY

Resume: claude --resume $SESSION_ID"
else
  notify "Kanban worker: \"$TITLE\" exited with error (rc=$RC). See /var/log/kanban-worker.log. Resume: claude --resume $SESSION_ID"
fi
