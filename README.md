# Kanban Board

A persistent kanban board with a TypeScript microservices backend, Telegram bot integration, AI assistant, and an autonomous Claude Code worker that picks up tasks from the backlog every 5 minutes.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS 4, @dnd-kit |
| Backend API | Hono (TypeScript), Node.js 22 |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| AI assistant | LiteLLM proxy (gpt-5 / claude-sonnet) |
| Automation | Claude Code CLI + systemd timer |
| Telegram | OpenClaw gateway (netops agent) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Task sources                         │
│                                                             │
│  Telegram (@mairp_netops_bot)    Claude Code (this chat)   │
│          │                               │                  │
│          │  kanban-cli.sh add            │ expedited path   │
│          │  (Relay / netops agent)       │ (immediate)      │
│          └───────────────┬───────────────┘                  │
└──────────────────────────│──────────────────────────────────┘
                           ▼
              ┌────────────────────────┐
              │   Kanban API :3002     │
              │   Hono + SQLite        │
              │                        │
              │  ┌──────────────────┐  │
              │  │ cards (active)   │  │
              │  └──────────────────┘  │
              │  ┌──────────────────┐  │
              │  │ card_archive     │  │──► GET /api/board/archive
              │  │ (history log)    │  │    kanban-cli.sh history
              │  └──────────────────┘  │
              └───────┬────────────────┘
                      │ SSE broadcast
          ┌───────────┼────────────────────┐
          ▼           ▼                    ▼
   Next.js UI    kanban-worker.sh    Relay (netops)
   :3001         (every 5 min)       kanban-screenshot.sh
   browser       │                   → Telegram image
                 │ claude --print
                 ▼
          Claude Code (headless)
          works on task autonomously
          backlog → in-progress → review

Column flow: backlog → in-progress → review → done (or → blocked)
Deleted cards → card_archive (history preserved)
```

## Features

- Drag-and-drop cards across columns with persistence
- Real-time sync via Server-Sent Events (SSE) — changes from any source appear instantly
- AI assistant panel to help plan tasks
- Bot-friendly REST API with a shell CLI for automation
- Telegram integration: add tasks, move cards, get board screenshot via `@mairp_netops_bot`
- Autonomous worker: Claude Code picks up backlog tasks every 5 min (systemd timer)
- Card history: completed and deleted cards are archived in SQLite, never lost

## Quick Start

```bash
cp .env.example .env
# Edit .env — add your LITELLM_API_KEY and LITELLM_URL

# Run services (production mode)
cd api && npm run build && node dist/index.js &
cd frontend && npm run build && npm start &
```

- Board: http://localhost:3001
- API: http://localhost:3002

## API

```
GET    /api/board                              Full board state
GET    /api/board/events                       SSE stream (board-changed)
GET    /api/board/archive                      Completed/deleted card history
GET    /api/board/search?q=...                 Search cards
PUT    /api/board/columns/:id                  Rename column
POST   /api/board/columns/:id/cards            Add card
DELETE /api/board/columns/:id/cards/:cardId    Delete card (archived before delete)
POST   /api/board/move                         Move/reorder card
POST   /api/ai/suggest                         AI suggestions (streaming)
```

## CLI

```bash
./kanban-cli.sh list
./kanban-cli.sh add backlog "Review configs" "Check BGP sessions"
./kanban-cli.sh move <card-id> in-progress
./kanban-cli.sh move <card-id> done
./kanban-cli.sh find "BGP"
./kanban-cli.sh delete <card-id>
./kanban-cli.sh history           # show completed/deleted card log
```

Set `KANBAN_API_URL` to override the default `http://localhost:3002`.

## Automation scripts

| Script | Purpose |
|---|---|
| `kanban-cli.sh` | Shell CLI for all board operations |
| `kanban-worker.sh` | Autonomous Claude Code worker (run by systemd timer) |
| `kanban-screenshot.sh` | Send board UI screenshot to Telegram |

### Autonomous worker (kanban-worker.sh)

Invoked by a `kanban-worker.timer` systemd unit every 5 minutes:

1. Skips if any card is already `in-progress` (interactive session has priority)
2. Takes the first card from `backlog`
3. Invokes `claude --print` headlessly to work on it
4. Claude phases the card: `in-progress` → work → `review`

### Telegram screenshot (kanban-screenshot.sh)

Uses chromium headless to screenshot the board UI and sends it via `openclaw message send --media`. Triggered by the netops Relay agent ("send me the board").

## Environment Variables

| Variable | Description |
|---|---|
| `LITELLM_API_KEY` | API key for the LiteLLM proxy |
| `LITELLM_URL` | LiteLLM proxy URL (default: `http://localhost:4000`) |
| `KANBAN_API_URL` | CLI API target (default: `http://localhost:3002`) |
| `DB_PATH` | SQLite database path (default: `/data/kanban.db`) |
