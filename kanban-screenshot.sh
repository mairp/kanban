#!/usr/bin/env bash
# Send a screenshot of the kanban board UI (:3001) to Marlon via Telegram.
# Used by the netops agent when asked for a board screenshot/image.
set -euo pipefail

CHAT_ID="7790852780"
MEDIA_DIR="/root/.openclaw/media/netops"
SCREENSHOT="$MEDIA_DIR/kanban-board.png"
CAPTION="${1:-Kanban board}"

mkdir -p "$MEDIA_DIR"

# Capture board UI via chromium headless (clawbrowser user, same pattern as existing infra)
runuser -u clawbrowser -- env \
  HOME=/var/lib/clawbrowser \
  TMPDIR=/tmp \
  timeout 20 /usr/bin/chromium \
    --headless=new \
    --screenshot="$SCREENSHOT" \
    --window-size=1600,1000 \
    --hide-scrollbars \
    --no-first-run \
    --no-default-browser-check \
    --disable-gpu \
    --disable-dev-shm-usage \
    http://localhost:3001

[[ -f "$SCREENSHOT" ]] || { echo "screenshot failed" >&2; exit 1; }

exec openclaw message send \
  --channel telegram \
  --account default \
  --target "$CHAT_ID" \
  --media "$SCREENSHOT" \
  -m "$CAPTION"
