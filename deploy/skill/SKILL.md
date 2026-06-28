---
name: kanban
description: Manage Marlon's personal kanban board via Telegram. Use for listing tasks, adding new tasks, moving tasks between columns, searching for cards, sending board screenshots, and viewing card history. The board is a persistent project tracker running locally; Claude Code works on tasks autonomously.
---

# Kanban Board Management

You can manage the kanban board using the CLI at `/root/kanban/kanban-cli.sh`.

## Trigger phrases
- "add task", "add a card", "create a ticket"
- "move X to done", "mark X as complete", "move X to in-progress"
- "show board", "what's in backlog", "list tasks", "what are we working on"
- "find task", "search for X"
- "delete task", "remove card"
- "send me the board", "show me the board", "screenshot the board", "board image", "board photo"
- "what did claude complete", "card history", "show history", "what was done"

## Column IDs (always use these exact IDs in commands)
| Column | ID |
|---|---|
| Backlog | `backlog` |
| In Progress | `in-progress` |
| Review | `review` |
| Done | `done` |
| Blocked | `blocked` |

## Commands

```bash
# Show the full board
/root/kanban/kanban-cli.sh list

# Add a card to a column
/root/kanban/kanban-cli.sh add <column-id> "<title>" ["<details>"]

# Move a card to another column (position defaults to top)
/root/kanban/kanban-cli.sh move <card-id> <column-id> [position]

# Delete a card
/root/kanban/kanban-cli.sh delete <card-id>

# Search cards by keyword
/root/kanban/kanban-cli.sh find "<search-term>"
```

## Examples
```bash
# Add a network review task to backlog
/root/kanban/kanban-cli.sh add backlog "Review BGP session configs" "Check all SR-OS nodes for session health"

# Mark something as done (move to done column)
/root/kanban/kanban-cli.sh move c4 done

# Show what's currently in progress
/root/kanban/kanban-cli.sh list
# (then describe only the "In Progress" section to the user)

# Find a card
/root/kanban/kanban-cli.sh find "BGP"
```

## Additional commands

```bash
# Send a screenshot of the board UI to Marlon via Telegram.
# IMPORTANT: call it with NO argument (or a plain quoted string with NO
# $(...) command substitution, backticks, or shell variables — those trigger
# an approval prompt). The script adds its own default caption.
/root/kanban/kanban-screenshot.sh

# Show completed/deleted card history
/root/kanban/kanban-cli.sh history
```

## Rules
- Always run `list` first if you need to reference a card by title (to get its ID)
- Report CLI output verbatim before adding your own commentary
- Card IDs look like `c1`, `c2`, or UUIDs — use them exactly as shown
- Never guess a card ID — look it up with `list` or `find` first
- Position 0 = top of the column; omit it to default to top
- Prefer screenshot when Marlon says "show" or "send"; prefer text (`list`) when they say "list" or "what's in"
- Deleted cards are archived — use `history` to view them; they are NOT gone forever

## CRITICAL: pre-approved scripts only
You MUST use ONLY the exact scripts listed above. NEVER:
- Write your own bash/shell script to take screenshots
- Use `curl`, `chromium`, `puppeteer`, or any other tool directly
- Use `ls`, `cat`, or any exploratory command on the kanban directory
- Wrap commands in `set -e` blocks or heredocs

For screenshots: run `/root/kanban/kanban-screenshot.sh` with NO argument — nothing else.
For board state: run `/root/kanban/kanban-cli.sh list` — nothing else.
NEVER add `$(...)`, backticks, or shell variables to any argument — they trigger an
approval prompt even on a pre-approved script. Plain literal arguments only.
These scripts are pre-approved and will run without prompts. Any other command will be blocked.
