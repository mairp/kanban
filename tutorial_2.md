# Kanban Board — Tutorial

A step-by-step guide to running, configuring, and operating the Kanban Board project.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project structure](#2-project-structure)
3. [Configuration](#3-configuration)
4. [Starting the application](#4-starting-the-application)
5. [Using the UI](#5-using-the-ui)
6. [REST API reference](#6-rest-api-reference)
7. [Shell CLI](#7-shell-cli)
8. [AI Assistant panel](#8-ai-assistant-panel)
9. [Autonomous worker](#9-autonomous-worker)
10. [Telegram integration](#10-telegram-integration)
11. [Deployment and persistence](#11-deployment-and-persistence)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

- Node.js 22+
- npm (or pnpm / bun)
- A LiteLLM proxy (serves OpenAI-compatible LLM APIs)
- SQLite (bundled via `better-sqlite3` — no separate install needed)

## 2. Project structure

```
kanban/
  frontend/               # Next.js 16 SPA (client-side UI)
    app/
      page.tsx            # Root page — renders <KanbanBoard />
      layout.tsx          # Root layout with header + AI panel
      globals.css         # Glassmorphism dark theme
    components/
      KanbanBoard.tsx     # DnD orchestration, SSE sync, API calls
      KanbanColumn.tsx    # Per-column rendering (droppable zone)
      KanbanCard.tsx      # Individual card component (draggable)
      AiPanel.tsx         # AI assistant chat panel
    lib/
      types.ts            # Card / Column interfaces
      data.ts             # Dummy seed data (frontend display layer)
      theme.ts            # Per-column accent palette
    next.config.ts        # Rewrites: /api/* -> backend :3002
  api/                    # Hono backend (Node.js 22)
    src/
      index.ts            # Entry — Hono app, CORS, serve
      db.ts               # SQLite init, schema migration, seed data
      board.ts            # CRUD operations on cards/columns
      events.ts           # SSE broadcast hub
      routes/
        board.ts          # REST endpoints for board operations
        ai.ts             # LiteLLM streaming proxy
  deploy/                 # Production wiring (systemd, skills, hooks)
  kanban-cli.sh           # Shell CLI
  kanban-worker.sh        # Autonomous Claude Code worker
  kanban-screenshot.sh    # Telegram board screenshot
```

## 3. Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your values:

| Variable | Description |
|---|---|
| `LITELLM_API_KEY` | Master key from your LiteLLM proxy instance |
| `AI_MODEL` | Primary LLM model (default `gpt-5`) |
| `AI_FALLBACKS` | Comma-separated fallback models (default `gemini-2.5-flash,gpt-5.5`) |
| `AI_TIMEOUT_MS` | Request timeout in ms (default `30000`) |

The LiteLLM proxy (typically `http://localhost:4000`) must be running before the API starts.

## 4. Starting the application

### Development mode

```bash
# Terminal 1 — API
cd api && npm run dev

# Terminal 2 — Frontend (dev server on :3001, proxying API :3002)
cd frontend && npm run dev
```

### Production mode

```bash
# Build and start API
cd api && npm run build && node dist/index.js &

# Build and start frontend
cd frontend && npm run build && npm start &
```

| Service | URL |
|---|---|
| Board UI | http://localhost:3001 |
| API | http://localhost:3002 |

The frontend's Next.js rewrites transparently proxy `/api/*` requests to the backend, so the browser only talks to port 3001.

### Environment override

Set `KANBAN_API_URL` to change where the CLI and frontend look for the API.

## 5. Using the UI

The Kanban board has five columns:

1. **Backlog** — tasks to be picked up
2. **In Progress** — actively being worked on
3. **Review** — work completed, awaiting review
4. **Done** — finished tasks
5. **Blocked** — tasks waiting on external factors

### Operations

- **Move a card** — click and drag any card to another column or reorder within the same column.
- **Rename a column** — click on the column title. Edit and blur to save, or press Escape to cancel.
- **Add a card** — click "+ Add card" at the bottom of any column. Type a title (optional details). Press Enter or click Add.
- **Delete a card** — hover the card and click the X button. Deleted cards are archived, not lost.

All changes sync in real time via Server-Sent Events (SSE). If you add a card via the CLI or the API, the UI updates instantly.

## 6. REST API reference

### Board operations

```
GET    /api/board                           Full board state (all columns + cards)
GET    /api/board/events                    SSE stream — fires `board-changed` events
GET    /api/board/archive                   Card archive (completed/deleted history)
GET    /api/board/search?q=...              Search cards by title or details
PUT    /api/board/columns/:id               Rename a column
POST   /api/board/columns/:id/cards         Add a card to a column
DELETE /api/board/columns/:id/cards/:cardId Delete a card (archived first)
POST   /api/board/move                      Move/reorder a card
```

### AI operations

```
POST   /api/ai/suggest                      Stream AI suggestions (text streaming)
```

### Health

```
GET    /health                              Returns { ok: true }
```

### Example: add a card via curl

```bash
curl -X POST http://localhost:3002/api/board/columns/backlog/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix login bug", "details": "Users report being logged out on refresh"}'
```

### SSE client example

```javascript
const es = new EventSource('http://localhost:3002/api/board/events');
es.onmessage = () => {
  console.log('Board changed, refetching...');
  fetch('http://localhost:3002/api/board')
    .then(r => r.json())
    .then(data => console.log(data));
};
```

## 7. Shell CLI

The CLI (`kanban-cli.sh`) manages the board via curl + python. Set `KANBAN_API_URL` to point to your API.

```bash
chmod +x kanban-cli.sh

# List all columns and cards
./kanban-cli.sh list

# Add a card to a column
./kanban-cli.sh add backlog "Review configs" "Check BGP sessions"

# Move a card
./kanban-cli.sh move <card-id> in-progress
./kanban-cli.sh move <card-id> review

# Search cards
./kanban-cli.sh find "BGP"

# Delete a card
./kanban-cli.sh delete <card-id>

# Show completed/deleted card history
./kanban-cli.sh history

# Show worker Claude sessions (resume IDs)
./kanban-cli.sh sessions
./kanban-cli.sh sessions <card-id>     # filter by card
```

### Column IDs

`backlog` | `in-progress` | `review` | `done` | `blocked`

## 8. AI Assistant panel

The header bar includes an "Ask AI" button. Click it to open a chat panel that streams responses from the configured LLM.

The AI assistant receives the current board state (all columns and card titles) as context, so it can suggest task reorganizations, new tasks, or project plans.

The backend proxies requests through the LiteLLM proxy with automatic fallback:

1. Tries `AI_MODEL` (default `gpt-5`)
2. Falls back through `AI_FALLBACKS` (default `gemini-2.5-flash`, `gpt-5.5`)

If the primary model flakes, the panel degrades gracefully to a fallback without user intervention.

## 9. Autonomous worker

The worker (`kanban-worker.sh`) is a headless Claude Code agent that picks up tasks from the backlog and works on them autonomously.

### How it works

1. Runs every 5 minutes via a systemd timer.
2. Skips if any card is already in the `in-progress` column (interactive sessions have priority).
3. Takes the first card from `backlog`.
4. Invokes `claude --print` headlessly to do the work.
5. Moves the card to `review` when done.

### Session management

Each task runs in its own fresh Claude session (a unique `--session-id`). Context is clean per task, but the session is persisted to disk. To inspect what the worker did:

```bash
claude --resume <session-id>
```

Session records are stored at `/var/log/kanban-sessions.jsonl`. View them with the CLI:

```bash
./kanban-cli.sh sessions
```

### Notifications

The worker announces task start and completion via Telegram. Full output is logged to `/var/log/kanban-worker.log`.

## 10. Telegram integration

The Telegram bot (via the OpenClaw gateway) lets you manage the board through chat messages.

### Bot commands

The skill (`deploy/skill/SKILL.md`) defines how the bot agent interprets your messages. Supported operations:

- **Add tasks** — describe a task in natural language; the bot adds it to a column.
- **Move cards** — ask the bot to move a card by title or ID.
- **Board screenshot** — "send me the board" triggers a headless Chromium capture of the UI and sends it as an image.
- **History** — "show me completed tasks" returns the archive log.

### Screenshot gotcha

The skill instructs the agent to call `kanban-screenshot.sh` with **no arguments**. If the agent ever runs the script with `$(...)` substitution in the argument, it triggers an exec-approval prompt. If this happens, clear the agent's session to let it re-read the corrected skill.

## 11. Deployment and persistence

All components are designed to survive host reboots:

| Component | Mechanism |
|---|---|
| API / Frontend | systemd user units (`kanban-api`, `kanban-frontend`) |
| Worker | `kanban-worker.timer` systemd user unit, fires every 5 min |
| Telegram bot + exec approvals | OpenClaw gateway systemd user unit |
| User lingering | `loginctl enable-linger` runs services without an active login |

### Install steps

```bash
# 1. systemd worker timer
cp deploy/systemd/kanban-worker.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kanban-worker.timer

# 2. Telegram bot skill
cp deploy/skill/SKILL.md ~/.openclaw/workspace-netops/skills/kanban/SKILL.md

# 3. exec approvals for the bot agent
openclaw approvals allowlist add --agent netops "/root/kanban/**"
systemctl --user restart openclaw-gateway

# 4. Claude Code session hook (optional — surfaces board at session start)
cp deploy/hook-kanban-sessionstart.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/hook-kanban-sessionstart.sh

# 5. Enable user lingering
loginctl enable-linger "$USER"
```

### Verify

```bash
systemctl --user is-enabled kanban-api kanban-frontend kanban-worker.timer openclaw-gateway
loginctl show-user "$USER" | grep Linger
```

## 12. Troubleshooting

### Bot keeps asking for approval on screenshots

Two causes:

1. **Command substitution in the argument.** If the agent runs `kanban-screenshot.sh "Board as of $(date ...)"`, the `$(...)` trips the approval gate. Fix: the agent must call the script bare, with no arguments.
2. **Polluted session history.** Once an agent has run the `$(...)` form, it copies its own prior tool calls from session history. Clearing the agent's session (remove its entry from `agents/<id>/sessions/sessions.json` and archive the `.jsonl`, then restart the gateway) gives it a clean slate.

### Worker not running

Check the systemd timer:

```bash
systemctl --user status kanban-worker.timer
journalctl --user -u kanban-worker.service --no-pager -n 30
cat /var/log/kanban-worker.log
```

### AI panel shows errors

Verify the LiteLLM proxy is running and your `LITELLM_API_KEY` is correct:

```bash
curl -sf http://localhost:4000/health
```

Check the board summary the AI receives is being built correctly:

```bash
curl -sf http://localhost:3002/api/board | python3 -m json.tool
```

### Card drag-and-drop not working

The frontend uses `@dnd-kit` with an 8px activation constraint (prevents accidental drags). Click and drag for at least 8 pixels before releasing.

### SQLite WAL mode

The database runs in Write-Ahead Logging mode for concurrent read/write safety. The WAL file (`kanban.db-wal`) and shared-memory file (`kanban.db-shm`) are created automatically. They are part of the database and should not be deleted independently.
