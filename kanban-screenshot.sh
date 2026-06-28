#!/usr/bin/env bash
# Send a screenshot of the kanban board UI (:3001) to Marlon via Telegram.
# Used by the netops agent when asked for a board screenshot/image.
set -euo pipefail

CHAT_ID="7790852780"
MEDIA_DIR="/root/.openclaw/media/netops"
MEDIA_FILE="$MEDIA_DIR/kanban-board.png"
TMP_FILE="/tmp/kanban-board-$$.png"   # clawbrowser writes here (world-writable)
CAPTION="${1:-Kanban board}"

mkdir -p "$MEDIA_DIR"

# Capture board UI via chromium headless (clawbrowser user, same pattern as existing infra).
# Write to /tmp first — clawbrowser cannot write to /root/.
runuser -u clawbrowser -- env \
  HOME=/var/lib/clawbrowser \
  TMPDIR=/tmp \
  timeout 20 /usr/bin/chromium \
    --headless=new \
    --screenshot="$TMP_FILE" \
    --window-size=1600,1000 \
    --hide-scrollbars \
    --no-first-run \
    --no-default-browser-check \
    --disable-gpu \
    --disable-dev-shm-usage \
    http://localhost:3001

# Copy from /tmp to media dir (as root) then clean up
[[ -f "$TMP_FILE" ]] || { echo "screenshot failed — chromium produced no output" >&2; exit 1; }
cp "$TMP_FILE" "$MEDIA_FILE"
rm -f "$TMP_FILE"

exec openclaw message send \
  --channel telegram \
  --account default \
  --target "$CHAT_ID" \
  --media "$MEDIA_FILE" \
  -m "$CAPTION"
