#!/usr/bin/env bash
# Send a screenshot of the kanban board UI (:3001) to Marlon via Telegram.
# Used by the netops agent when asked for a board screenshot/image.
set -euo pipefail

CHAT_ID="7790852780"
MEDIA_DIR="/root/.openclaw/media/netops"
MEDIA_FILE="$MEDIA_DIR/kanban-board.png"
CAPTION="${1:-Kanban board}"

mkdir -p "$MEDIA_DIR"

# Capture via kanban-shot.js (CDP render-wait). The board is client-rendered, so a
# plain `chromium --screenshot` fires before the /api/board fetch resolves and
# captures the "Loading board..." state — unreliable, esp. on a heavy board.
SHOT_URL="${KANBAN_UI_URL:-http://localhost:3001}" SHOT_OUT="$MEDIA_FILE" SHOT_H="${SHOT_H:-2200}" \
  timeout 45 node /root/kanban/kanban-shot.js >&2

[[ -f "$MEDIA_FILE" ]] || { echo "screenshot failed — no output" >&2; exit 1; }

exec openclaw message send \
  --channel telegram \
  --account default \
  --target "$CHAT_ID" \
  --media "$MEDIA_FILE" \
  -m "$CAPTION"
