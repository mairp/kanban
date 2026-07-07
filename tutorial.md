# Kanban Board — Tutorial

This tutorial walks you through the Kanban project management application. It covers what the app does, how it is built, and how to use and extend it.

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Frontend Walkthrough](#4-frontend-walkthrough)
5. [Backend API](#5-backend-api)
6. [Drag-and-Drop System](#6-drag-and-drop-system)
7. [Real-Time Sync via SSE](#7-real-time-sync-via-sse)
8. [AI Assistant Panel](#8-ai-assistant-panel)
9. [CLI Usage](#9-cli-usage)
10. [Autonomous Worker](#10-autonomous-worker)
11. [Telegram Integration](#11-telegram-integration)
12. [Deploying and Persistence](#12-deploying-and-persistence)
13. [Extending the App](#13-extending-the-app)

---

## 1. Overview

Kanban is a persistent project management board built as a full-stack TypeScript application. It consists of three layers:

- **Frontend** — A Next.js 16 single-page app with drag-and-drop card management
- **Backend API** — A Hono microservice with SQLite persistence
- **Automation** — An autonomous Claude Code worker and Telegram bot integration

Users interact with the board through the web UI, the CLI, or a Telegram bot. All changes are persisted and broadcast in real time.

## 2. Architecture

```
Task Sources                          Kanban API :3002
┌──────────────┐          ┌──────────────────────────┐
│ Telegram bot │─────────►│  Hono + SQLite           │
│ (add/move)   │          │                          │
├──────────────┤          │  ┌──────────────────┐    │
│ CLI script   │─────────►│  │ cards (active)   │    │
├──────────────┤          │  └──────────────────┘    │
│ Claude Code  │─────────►│  ┌──────────────────┐    │
│ (headless)   │          │  │ card_archive     │    │
└──────────────┘          │  └──────────────────┘    │
                          └────────┬─────────────────┘
                                   │ SSE broadcast
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        ┌───────────┐      ┌─────────────────┐   ┌─────────────────┐
        │ Next.js UI │      │ kanban-worker   │   │ Telegram bot    │
        │  :3001     │      │ (every 5 min)   │   │ (screenshots)   │
        └───────────┘      └────────┬────────┘   └─────────────────┘
                                    │
                                    ▼
                             ┌──────────────────┐
                             │ Claude Code      │
                             │ (headless, print)│
                             └──────────────────┘
```

Column flow: `backlog` → `in-progress` → `review` → `done` (or `blocked`)

## 3. Project Structure

```
/root/kanban/
├── frontend/                   # Next.js 16 frontend app
│   ├── app/
│   │   ├── layout.tsx          # Root layout with glass header + AI panel
│   │   ├── page.tsx            # Renders KanbanBoard component
│   │   └── globals.css         # Tailwind CSS 4 + glassmorphism theme
│   ├── components/
│   │   ├── KanbanBoard.tsx     # Board orchestrator (DnD context, SSE)
│   │   ├── KanbanColumn.tsx    # Single column (header, cards, add form)
│   │   ├── KanbanCard.tsx      # Draggable card (title, details, delete)
│   │   └── AiPanel.tsx         # AI assistant dropdown panel
│   ├── lib/
│   │   ├── types.ts            # TypeScript interfaces (Card, Column)
│   │   ├── data.ts             # Dummy data for standalone mode
│   │   └── theme.ts            # Per-column accent color mappings
│   ├── next.config.ts          # API rewrite proxy to backend
│   └── package.json
├── api/                        # Hono backend (TypeScript, SQLite)
│   ├── src/                    # Source code
│   ├── Dockerfile
│   └── package.json
├── deploy/                     # Systemd units, bot skills, hooks
│   ├── systemd/
│   │   ├── kanban-worker.service
│   │   └── kanban-worker.timer
│   └── skill/
│       └── SKILL.md            # Telegram bot skill definition
├── kanban-cli.sh               # Command-line board management
├── kanban-worker.sh            # Autonomous Claude Code worker script
├── kanban-screenshot.sh        # Board screenshot to Telegram
├── docker-compose.yml          # Docker Compose (api + frontend)
└── .env.example                # Environment variable template
```

## 4. Frontend Walkthrough

### 4.1 Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.2.9 | App framework (client-rendered) |
| React | 19.2.4 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Styling |
| @dnd-kit/core | 6.3.1 | Drag-and-drop primitives |
| @dnd-kit/sortable | 10.0.0 | Sortable list integration |

### 4.2 Core Components

**KanbanBoard** (`components/KanbanBoard.tsx`) is the main orchestrator:

- Wraps the entire board in a `<DndContext>` from `@dnd-kit/core`
- Fetches initial board state from `GET /api/board`
- Maintains an `EventSource` connection to `GET /api/board/events` for real-time SSE updates
- Handles drag lifecycle: `onDragStart` sets the overlay card, `onDragOver` provides live reordering feedback, `onDragEnd` commits the move via `POST /api/board/move`
- Delegates rename, add, and delete to child columns via callbacks

**KanbanColumn** (`components/KanbanColumn.tsx`) renders a single column:

- Uses `useDroppable` from `@dnd-kit/core` to mark the column body as a drop target
- Column header is clickable to enter rename mode (inline text input)
- Contains a `SortableContext` wrapping all cards in the column
- Shows an inline form when the user clicks "+ Add card"

**KanbanCard** (`components/KanbanCard.tsx`) is an individual draggable card:

- Uses `useSortable` from `@dnd-kit/sortable` for drag position tracking
- Shows a delete button on hover (`group-hover:opacity-100`)
- The drag overlay card is rendered via `<DragOverlay>` in the board component with a slight rotation and scale effect

### 4.3 Styling System

The app uses a dark glassmorphism theme defined in `globals.css`:

- **Animated gradient background** — Three radial gradients drift slowly across a deep purple-blue base
- **Glass surfaces** — Two utility classes: `.glass` (standard) and `.glass-strong` (header/column containers)
- **CSS custom properties** — `--text-primary`, `--text-muted`, `--glass-bg`, `--glass-border`
- **Column accents** — Each column has a unique color defined in `lib/theme.ts` with both a solid color and an rgba glow for shadows

```typescript
// lib/theme.ts
const ACCENTS: Record<string, ColumnAccent> = {
  backlog:      { color: "#94a3b8", glow: "rgba(148,163,184,0.45)" },
  "in-progress": { color: "#22d3ee", glow: "rgba(34,211,238,0.55)" },
  review:       { color: "#fbbf24", glow: "rgba(251,191,36,0.55)" },
  done:         { color: "#34d399", glow: "rgba(52,211,153,0.55)" },
  blocked:      { color: "#fb7185", glow: "rgba(251,113,133,0.55)" },
};
```

Each column has a colored accent bar at the top that glows when the column is a drag target.

## 5. Backend API

The API is a Hono service running on port 3002, backed by SQLite in WAL mode.

### 5.1 Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/board` | Full board state (all columns and cards) |
| `GET` | `/api/board/events` | SSE stream — fires `board-changed` on any mutation |
| `GET` | `/api/board/archive` | Completed/deleted card history |
| `GET` | `/api/board/search?q=...` | Search cards by title or details |
| `PUT` | `/api/board/columns/:id` | Rename a column |
| `POST` | `/api/board/columns/:id/cards` | Add a card to a column |
| `DELETE` | `/api/board/columns/:id/cards/:cardId` | Delete a card (archived first) |
| `POST` | `/api/board/move` | Move/reorder a card |
| `POST` | `/api/ai/suggest` | AI suggestions (streamed response) |

### 5.2 API Proxy

The Next.js frontend proxies `/api/*` requests to the backend via server-side rewrites in `next.config.ts`. This avoids CORS issues — the browser only ever talks to the frontend origin.

```typescript
// next.config.ts
const API_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:3002";

async rewrites() {
  return [
    { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
  ];
}
```

### 5.3 Persistence

The SQLite database stores:
- **cards** — Active cards with `id`, `title`, `details`, `column_id`, `position`
- **card_archive** — Deleted or completed cards for history (never lost)

Database path defaults to `/data/kanban.db` and is configured via the `DB_PATH` environment variable.

## 6. Drag-and-Drop System

The board uses `@dnd-kit` for drag-and-drop with these key concepts:

### Sensors

A `PointerSensor` with an 8-pixel activation constraint prevents accidental drags on touch/click:

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
);
```

### Collision Detection

`closestCorners` determines which element the dragged card is over.

### Drag Lifecycle

1. **Drag Start** — The card being dragged is captured and shown in a `<DragOverlay>` with rotation and scale
2. **Drag Over** — Live preview reordering as the card moves between columns (optimistic UI update, not committed)
3. **Drag End** — The final position is calculated and sent to the API via `POST /api/board/move`

### Own-Mutation Tracking

An `ownMutation` ref prevents the SSE listener from re-fetching the board after a change the user initiated:

```typescript
const ownMutation = useRef(false);

// Before API call
ownMutation.current = true;

// In SSE handler
if (ownMutation.current) {
  ownMutation.current = false;
  return; // Skip — we caused this change
}
```

## 7. Real-Time Sync via SSE

The board maintains a persistent `EventSource` connection:

```typescript
useEffect(() => {
  const es = new EventSource(`${API_URL}/api/board/events`);
  es.onmessage = () => {
    if (ownMutation.current) {
      ownMutation.current = false;
      return;
    }
    fetchBoard(); // Refetch from API
  };
  return () => es.close();
}, [fetchBoard]);
```

When any source (web UI, CLI, Telegram bot, autonomous worker) modifies the board, the API broadcasts a `board-changed` event. All connected browser tabs receive the event and re-fetch the latest state.

## 8. AI Assistant Panel

The header contains an "Ask AI" button that opens a dropdown panel (`components/AiPanel.tsx`):

1. User types a prompt (e.g., "suggest tasks for the backlog")
2. The panel sends `POST /api/ai/suggest` with the prompt
3. The API forwards the request to an LLM via LiteLLM proxy
4. The response is **streamed** back using `ReadableStream` — text appears word-by-word in the panel

```typescript
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (!done) {
  const { value, done: d } = await reader.read();
  done = d;
  if (value) setResponse((prev) => prev + decoder.decode(value, { stream: true }));
}
```

Configuration via environment variables:
- `LITELLM_API_KEY` — Master key for the LiteLLM proxy
- `AI_MODEL` — Primary model (default: `gpt-5`)
- `AI_FALLBACKS` — Comma-separated fallback models
- `AI_TIMEOUT_MS` — Request timeout in milliseconds

## 9. CLI Usage

The `kanban-cli.sh` script provides full board management from the terminal. It talks to the API over HTTP and formats output for terminal display.

### Commands

```bash
# List all columns and cards
./kanban-cli.sh list

# Add a card to the backlog
./kanban-cli.sh add backlog "Review configs" "Check BGP sessions"

# Move a card
./kanban-cli.sh move c1 in-progress

# Move a card to done
./kanban-cli.sh move c1 done

# Search for cards matching a term
./kanban-cli.sh find "BGP"

# Delete a card
./kanban-cli.sh delete c1

# View archived (completed/deleted) card history
./kanban-cli.sh history

# View worker Claude sessions
./kanban-cli.sh sessions
./kanban-cli.sh sessions c1   # filter by card id
```

### Environment

Set `KANBAN_API_URL` to override the default API endpoint (`http://localhost:3002`).

## 10. Autonomous Worker

The `kanban-worker.sh` script runs every 5 minutes via a systemd timer to autonomously process backlog items using Claude Code.

### How It Works

1. **Lock guard** — Uses `flock` to prevent overlapping runs
2. **Skip check** — If any card is already `in-progress`, the worker skips (an interactive session has priority)
3. **Pick up** — Takes the first card from `backlog`
4. **Execute** — Invokes `claude --print --session-id <uuid>` with a prompt that tells Claude to:
   - Move the card to `in-progress`
   - Do the work described in the card
   - Move the card to `review`
   - Output a one-paragraph summary
5. **Notify** — Sends Telegram messages when work starts and finishes

### Per-Task Session Isolation

Each task gets a fresh UUID session (`--session-id`). This means:
- Clean context per task (no carryover from previous work)
- Sessions are persisted to disk for inspection with `claude --resume <session-id>`
- Session records are logged to `/var/log/kanban-sessions.jsonl`

### Logging and Observability

- Full output appended to `/var/log/kanban-worker.log`
- OTEL telemetry flows to Grafana `claude-code` dashboard
- Telegram notifications include the resume session ID

## 11. Telegram Integration

### Bot Skill

The file `deploy/skill/SKILL.md` defines the bot's capabilities. When a user sends a message to the Telegram bot:

- **Add tasks** — Bot calls `kanban-cli.sh add`
- **Move cards** — Bot calls `kanban-cli.sh move`
- **Get board state** — Bot calls `kanban-cli.sh list`
- **Board screenshot** — Bot calls `kanban-screenshot.sh` (must call with no arguments)

### Screenshot Script

`kanban-screenshot.sh` captures the board UI using headless Chromium:

```bash
chromium --headless=new \
  --screenshot=/path/to/kanban-board.png \
  --window-size=1600,1000 \
  --no-sandbox \
  http://localhost:3001
```

The PNG is then sent to the user via `openclaw message send --media`.

> **Important:** The script must be called with no arguments. Any `$(...)` command substitution in the argument triggers an exec-approval prompt.

## 12. Deploying and Persistence

### Quick Start (Development)

```bash
# 1. Copy and edit environment variables
cp .env.example .env
# Edit .env — add your LITELLM_API_KEY

# 2. Start the API
cd api && npm install && npm run build && node dist/index.js &

# 3. Start the Frontend
cd frontend && npm install && npm run dev

# Board: http://localhost:3001
# API: http://localhost:3002
```

### Docker Compose

```bash
docker compose up --build
```

This builds and runs both the API (port 3002) and Frontend (port 3000) with persistent SQLite storage via the `kanban-data` volume.

### Production Persistence (systemd)

All services survive host reboot via systemd user units:

| Component | Mechanism |
|---|---|
| Kanban API | `systemctl --user enable kanban-api` |
| Frontend | `systemctl --user enable kanban-frontend` |
| Worker timer | `systemctl --user enable kanban-worker.timer` |
| User lingering | `loginctl enable-linger` |

```bash
# Install worker timer
cp deploy/systemd/kanban-worker.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kanban-worker.timer

# Verify
systemctl --user is-enabled kanban-api kanban-frontend kanban-worker.timer
```

Full deployment instructions are in `deploy/README.md`.

## 13. Extending the App

### Adding a New Column

The board reads columns from the API. To add a column:

1. Add the column to the API's initial data or via a management endpoint
2. Add a color accent in `frontend/lib/theme.ts`:

```typescript
const ACCENTS: Record<string, ColumnAccent> = {
  // ... existing columns
  "my-new-col": { color: "#6366f1", glow: "rgba(99,102,241,0.55)" },
};
```

### Adding Dummy Data

Edit `frontend/lib/data.ts` to change the initial sample data shown when the app opens. This file is not used when the API is connected — the API serves as the source of truth.

### Custom Styling

All visual styling is in `frontend/app/globals.css`. Key customization points:

- Background gradient — Edit the `body::before` rule
- Dot texture — Edit the `body::after` rule
- Glass effect intensity — Adjust `--glass-bg` and `--glass-bg-strong` variables
- Scrollbar style — Modify the `*::-webkit-scrollbar` rules
- Font — Change the `Inter` import in `app/layout.tsx`

### Adding API Endpoints

New endpoints go in the Hono API source (`api/src/`). After building (`npm run build`), they are automatically proxied through the frontend via the Next.js rewrites.

To trigger SSE broadcasts after mutations, emit a `board-changed` event from the API.

## Troubleshooting

**Bot asks for approval on screenshots.** Call `kanban-screenshot.sh` with no arguments. If the agent learned a form with `$(...)`, clear its session and restart the gateway so it re-reads the skill.

**Board not syncing.** Check that the API is running on port 3002 and that the Next.js rewrite in `next.config.ts` points to the correct target.

**Worker not running.** Verify the systemd timer:

```bash
systemctl --user status kanban-worker.timer
journalctl --user -u kanban-worker.service
```

**Database locked.** The API uses SQLite WAL mode. Ensure only one API process writes to the database at a time.
