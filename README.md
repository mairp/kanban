# Kanban Board

A persistent kanban board with a TypeScript microservices backend, Telegram bot integration, and an AI assistant powered by Claude.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS 4, @dnd-kit |
| Backend API | Hono (TypeScript), Node.js 22 |
| Database | SQLite via `better-sqlite3` (Docker volume) |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Infrastructure | Docker Compose |

## Features

- Drag-and-drop cards across columns with persistence
- Real-time sync via Server-Sent Events (SSE) — changes from any source appear instantly
- AI assistant panel to help plan tasks
- Bot-friendly REST API with a shell CLI for automation

## Quick Start

```bash
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY

docker compose up --build
```

- Board: http://localhost:3000
- API: http://localhost:3001

## API

```
GET  /api/board                              Full board state
GET  /api/board/events                       SSE stream (board-changed)
PUT  /api/board/columns/:id                  Rename column
POST /api/board/columns/:id/cards            Add card
DELETE /api/board/columns/:id/cards/:cardId  Delete card
POST /api/board/move                         Move/reorder card
GET  /api/board/search?q=...                 Search cards
POST /api/ai/suggest                         AI suggestions (streaming)
```

## CLI

```bash
./kanban-cli.sh list
./kanban-cli.sh add backlog "Review configs" "Check BGP sessions"
./kanban-cli.sh move <card-id> done
./kanban-cli.sh find "BGP"
./kanban-cli.sh delete <card-id>
```

Set `KANBAN_API_URL` to override the default `http://localhost:3001`.

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Required for the AI assistant |
| `KANBAN_API_URL` | CLI API target (default: `http://localhost:3001`) |
