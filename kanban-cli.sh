#!/usr/bin/env bash
# Kanban board CLI — used by Relay (netops bot) to manage tasks via Telegram
set -euo pipefail

API="${KANBAN_API_URL:-http://localhost:3002}"
CMD="${1:-help}"
shift || true

fail() { echo "Error: $*" >&2; exit 1; }

case "$CMD" in
  list)
    curl -sf "$API/api/board" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for col in data['columns']:
    print(f\"\n── {col['title']} ({len(col['cards'])} cards) ──\")
    for card in col['cards']:
        details = f' — {card[\"details\"]}' if card.get('details') else ''
        print(f\"  [{card['id']}] {card['title']}{details}\")
"
    ;;

  add)
    COL_ID="${1:-}" TITLE="${2:-}"
    [ -z "$COL_ID" ] && fail "usage: kanban-cli.sh add <column-id> <title> [details]"
    [ -z "$TITLE" ] && fail "usage: kanban-cli.sh add <column-id> <title> [details]"
    DETAILS="${3:-}"
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'title':sys.argv[1],'details':sys.argv[2]}))" "$TITLE" "$DETAILS")
    RES=$(curl -sf -X POST "$API/api/board/columns/$COL_ID/cards" \
      -H "Content-Type: application/json" -d "$PAYLOAD")
    ID=$(echo "$RES" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
    echo "Added card [$ID]: $TITLE → $COL_ID"
    ;;

  move)
    CARD_ID="${1:-}" TO_COL="${2:-}" POS="${3:-0}"
    [ -z "$CARD_ID" ] && fail "usage: kanban-cli.sh move <card-id> <column-id> [position]"
    [ -z "$TO_COL" ]  && fail "usage: kanban-cli.sh move <card-id> <column-id> [position]"
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'cardId':sys.argv[1],'toColumnId':sys.argv[2],'toPosition':int(sys.argv[3])}))" "$CARD_ID" "$TO_COL" "$POS")
    curl -sf -X POST "$API/api/board/move" \
      -H "Content-Type: application/json" -d "$PAYLOAD" > /dev/null
    echo "Moved card $CARD_ID → $TO_COL (position $POS)"
    ;;

  delete)
    CARD_ID="${1:-}"
    [ -z "$CARD_ID" ] && fail "usage: kanban-cli.sh delete <card-id>"
    BOARD=$(curl -sf "$API/api/board")
    COL_ID=$(echo "$BOARD" | python3 -c "
import json,sys
board=json.load(sys.stdin)
for col in board['columns']:
    for c in col['cards']:
        if c['id'] == sys.argv[1]: print(col['id']); sys.exit(0)
sys.exit(1)
" "$CARD_ID") || fail "card $CARD_ID not found"
    curl -sf -X DELETE "$API/api/board/columns/$COL_ID/cards/$CARD_ID" > /dev/null
    echo "Deleted card $CARD_ID"
    ;;

  find)
    Q="${1:-}"
    [ -z "$Q" ] && fail "usage: kanban-cli.sh find <search-term>"
    curl -sf "$API/api/board/search?q=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$Q")" | \
      python3 -c "
import json,sys
data=json.load(sys.stdin)
if not data['cards']:
    print('No cards found.')
else:
    for c in data['cards']:
        print(f\"[{c['id']}] {c['title']} (in {c['column_title']})\")
"
    ;;

  help|*)
    echo "Kanban CLI — manage the kanban board from the command line"
    echo ""
    echo "Commands:"
    echo "  list                                  Show all columns and cards"
    echo "  add <column-id> <title> [details]     Add a card to a column"
    echo "  move <card-id> <column-id> [pos]      Move card to column at position (default 0)"
    echo "  delete <card-id>                      Remove a card"
    echo "  find <query>                          Search cards by title or details"
    echo ""
    echo "Column IDs: backlog | in-progress | review | done | blocked"
    echo "API: \$KANBAN_API_URL (default: http://localhost:3001)"
    ;;
esac
