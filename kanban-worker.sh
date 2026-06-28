#!/usr/bin/env bash
# Autonomous kanban worker — run by systemd timer every 5 min.
# Skips if any card is already in-progress (interactive session may own it).
set -euo pipefail

LOCK=/tmp/kanban-worker.lock
API="${KANBAN_API_URL:-http://localhost:3002}"
LOG=/var/log/kanban-worker.log

# Single-instance guard (prevents timer overlap)
exec 9>"$LOCK"
flock -n 9 || { echo "$(date -Is) already running, skipping" >> "$LOG"; exit 0; }

BOARD=$(curl -sf --max-time 5 "$API/api/board" 2>/dev/null) || exit 0
[ -z "$BOARD" ] && exit 0

# Skip if anything is already in-progress (another session is working)
IN_PROGRESS=$(python3 - <<'PY' <<< "$BOARD"
import json, sys
data = json.load(sys.stdin)
for col in data['columns']:
    if col['id'] == 'in-progress' and col['cards']:
        print(col['cards'][0]['title'])
        sys.exit(0)
PY
)
if [ -n "$IN_PROGRESS" ]; then
  echo "$(date -Is) in-progress: [$IN_PROGRESS] — skipping" >> "$LOG"
  exit 0
fi

# Get first backlog card
TASK=$(python3 - <<'PY' <<< "$BOARD"
import json, sys
data = json.load(sys.stdin)
for col in data['columns']:
    if col['id'] == 'backlog' and col['cards']:
        c = col['cards'][0]
        print(f"{c['id']}\t{c['title']}\t{c.get('details','')}")
        sys.exit(0)
sys.exit(1)
PY
) || exit 0   # empty backlog — nothing to do

[ -z "$TASK" ] && exit 0

CARD_ID=$(echo "$TASK" | cut -f1)
TITLE=$(echo "$TASK"   | cut -f2)
DETAILS=$(echo "$TASK" | cut -f3)

echo "$(date -Is) picking up [$CARD_ID] $TITLE" >> "$LOG"

claude --print "
You are working autonomously on a Kanban task. Complete it fully, then update the board.

Card ID : $CARD_ID
Title   : $TITLE
Details : $DETAILS

Steps:
1. Run: /root/kanban/kanban-cli.sh move $CARD_ID in-progress
2. Do the work described in Title + Details.
3. When complete, run: /root/kanban/kanban-cli.sh move $CARD_ID review
4. Output a one-paragraph summary of what was done (appended to the worker log).

Use whatever tools are needed (Bash, Read, Edit, Write, WebSearch, etc.).
Work autonomously to completion — do not ask for confirmation.
" 2>&1 | tee -a "$LOG"

echo "$(date -Is) done [$CARD_ID]" >> "$LOG"
