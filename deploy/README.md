# Deploy — integration & persistence

Reproducible config for the autonomous worker, the Telegram bot integration, and the Claude Code session hook. All of it is persistent across host reboots (systemd user units + lingering).

## Contents

| File | Installs to | Purpose |
|---|---|---|
| `systemd/kanban-worker.service` | `~/.config/systemd/user/` | Runs the autonomous worker once |
| `systemd/kanban-worker.timer` | `~/.config/systemd/user/` | Fires the worker every 5 min |
| `skill/SKILL.md` | `~/.openclaw/workspace-<agent>/skills/kanban/` | Telegram bot skill (board ops + screenshot + history) |
| `hook-kanban-sessionstart.sh` | `~/.claude/hooks/` | Injects live board state at Claude Code session start |
| `exec-approvals.netops.json` | reference | Allowlist entries the bot agent needs |

The worker script itself (`../kanban-worker.sh`), the screenshot script (`../kanban-screenshot.sh`), and the CLI (`../kanban-cli.sh`) live at the repo root.

## Install

```bash
# 1. systemd worker (every 5 min, survives reboot)
cp deploy/systemd/kanban-worker.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kanban-worker.timer

# 2. Telegram bot skill
cp deploy/skill/SKILL.md ~/.openclaw/workspace-netops/skills/kanban/SKILL.md

# 3. exec approvals for the bot agent (reloads on gateway restart)
openclaw approvals allowlist add --agent netops "/root/kanban/**"
systemctl --user restart openclaw-gateway

# 4. Claude Code session hook (optional — surfaces the board at session start)
cp deploy/hook-kanban-sessionstart.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/hook-kanban-sessionstart.sh
# then add it to the SessionStart array in ~/.claude/settings.json

# 5. make user services run without an active login (persistence)
loginctl enable-linger "$USER"
```

## Verify persistence

```bash
systemctl --user is-enabled kanban-api kanban-frontend kanban-worker.timer openclaw-gateway
loginctl show-user "$USER" | grep Linger   # expect Linger=yes
```

## Gotcha — screenshot approval prompts

The bot must call `kanban-screenshot.sh` with **no argument** (it self-captions). Any `$(...)`, backtick, or shell variable in an argument forces an exec-approval prompt even though the path is allowlisted — the approval layer cannot statically verify a command containing shell expansion. The skill enforces this. If an agent has already learned the `$(...)` form, clear its session (archive the `.jsonl`, drop the key from `sessions.json`, restart the gateway) so it re-reads the corrected skill. See the root README Troubleshooting section.
