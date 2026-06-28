#!/usr/bin/env bash
# Send a screenshot of the kanban board UI (:3001) to Marlon via Telegram.
# Used by the netops agent when asked for a board screenshot/image.
set -euo pipefail

CHAT_ID="7790852780"
MEDIA_DIR="/root/.openclaw/media/netops"
MEDIA_FILE="$MEDIA_DIR/kanban-board.png"
CAPTION="${1:-Kanban board}"

mkdir -p "$MEDIA_DIR"

# Run chromium as root (agent already runs as root); --no-sandbox required for root.
timeout 20 /usr/bin/chromium \
  --headless=new \
  --screenshot="$MEDIA_FILE" \
  --window-size=1600,1000 \
  --hide-scrollbars \
  --no-first-run \
  --no-default-browser-check \
  --disable-gpu \
  --disable-dev-shm-usage \
  --no-sandbox \
  http://localhost:3001 2>/dev/null

[[ -f "$MEDIA_FILE" ]] || { echo "screenshot failed — chromium produced no output" >&2; exit 1; }

exec openclaw message send \
  --channel telegram \
  --account default \
  --target "$CHAT_ID" \
  --media "$MEDIA_FILE" \
  -m "$CAPTION"
