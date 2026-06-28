#!/usr/bin/env bash
# SessionStart hook: inject live Kanban board state as additionalContext.
# Fail-open — never blocks session start.
set -u
API="${KANBAN_API_URL:-http://localhost:3002}"

BOARD=$(curl -sf --max-time 5 "$API/api/board" 2>/dev/null) || exit 0
[ -z "$BOARD" ] && exit 0

SUMMARY=$(python3 - <<'PY' <<< "$BOARD"
import json, sys
data = json.load(sys.stdin)
lines = ['## Kanban board (live)']
has_work = False
for col in data['columns']:
    cards = col['cards']
    if not cards:
        continue
    has_work = True
    lines.append(f"\n**{col['title']}** ({len(cards)})")
    for c in cards:
        det = f' — {c["details"]}' if c.get('details') else ''
        lines.append(f"  [{c['id']}] {c['title']}{det}")
if not has_work:
    lines.append('All columns empty.')
print('\n'.join(lines))
PY
) || exit 0

[ -z "$SUMMARY" ] && exit 0
python3 -c "import json,sys; print(json.dumps({'additionalContext': sys.argv[1]}))" "$SUMMARY"
