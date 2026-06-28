#!/usr/bin/env bash
# SessionStart hook: inject live Kanban board state as additionalContext.
# Fail-open — never blocks session start.
set -u
API="${KANBAN_API_URL:-http://localhost:3002}"

BOARD=$(curl -sf --max-time 5 "$API/api/board" 2>/dev/null) || exit 0
[ -z "$BOARD" ] && exit 0

# Board JSON passed via env var, NOT stdin (`python3 -c` reads its program from
# the -c arg; feeding the board on stdin would be read as the program).
SUMMARY=$(BOARD="$BOARD" python3 -c '
import json, os
data = json.loads(os.environ["BOARD"])
lines = ["## Kanban board (live)"]
has_work = False
for col in data["columns"]:
    cards = col["cards"]
    if not cards:
        continue
    has_work = True
    lines.append("\n**" + col["title"] + "** (" + str(len(cards)) + ")")
    for c in cards:
        det = (" — " + c["details"]) if c.get("details") else ""
        lines.append("  [" + c["id"] + "] " + c["title"] + det)
if not has_work:
    lines.append("All columns empty.")
print("\n".join(lines))
') || exit 0

[ -z "$SUMMARY" ] && exit 0
SUMMARY="$SUMMARY" python3 -c 'import json,os; print(json.dumps({"additionalContext": os.environ["SUMMARY"]}))'
