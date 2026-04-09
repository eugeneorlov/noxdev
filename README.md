```
    ,___,
    [O.O]
   /)   )\
  " \|/ "
 ---m-m---
```

# noxdev

Ship code while you sleep

[![npm version](https://img.shields.io/badge/npm-0.1.0-green.svg)](https://www.npmjs.com/package/noxdev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## What is noxdev

An open-source Node.js CLI that orchestrates autonomous coding agents overnight. Write task specs, go to sleep, wake up to real commits on production codebases. Docker containment, git worktree isolation, and a morning review workflow keep your main branch safe.

## Quick Start

```bash
npm install -g noxdev
noxdev doctor                           # check prerequisites
noxdev init my-project --repo ~/my-repo # register a project
# write tasks in ~/worktrees/my-project/TASKS.md
noxdev run my-project                   # run task loop
noxdev status my-project                # morning summary
noxdev merge my-project                 # approve/reject commits
noxdev dashboard                        # visual review UI
```

## Task Format

Tasks are defined in `TASKS.md` using this format:

```markdown
## T1: Add user authentication
- STATUS: pending
- FILES: src/auth.ts, src/middleware/auth.ts
- VERIFY: npm test && npm run build
- CRITIC: review
- PUSH: gate
- SPEC: Implement JWT-based authentication for the API.
  Add login/logout endpoints with bcrypt password hashing.
  Create middleware for route protection.
  Add unit tests for auth functions.
```

**Field explanations:**
- `STATUS`: `pending` | `done` | `failed` | `skipped`
- `FILES`: Files the task should focus on (hints, not constraints)
- `VERIFY`: Command to run after completion to validate the task
- `CRITIC`: `skip` | `review` (whether to run critic agent review)
- `PUSH`: Push strategy for the commit (see table below)
- `SPEC`: Detailed task specification

**Push strategies:**

| Strategy | Behavior |
|----------|----------|
| `auto` | Auto-merge if verify passes and critic approves |
| `gate` | Commit but require manual approval before merge |
| `manual` | No auto-commit, human review required |

## Architecture

```mermaid
graph TB
    A[TASKS.md] --> B[noxdev CLI]
    B --> C[Docker Container]
    C --> D[Claude Code Agent]
    D --> E[Git Commit]
    E --> F[Morning Review]
    F --> G[CLI/Dashboard]
    G --> H[Merge to Main]

    I[Safety Layers]
    I --> J[Docker Containment]
    I --> K[Worktree Isolation]
    I --> L[Critic Agent]
    I --> M[Gated Push]
    I --> N[No Auto-Push]
```

The flow: **TASKS.md** → **noxdev CLI** → **Docker container** (Claude Code agent) → **git commit** → **morning review** (CLI or dashboard) → **merge to main**.

Safety layers include Docker containment, worktree isolation, critic agent review, gated push controls, and a strict no auto-push policy.

## CLI Commands

| Command | Description |
|---------|-------------|
| `noxdev init <project>` | Register a new project with git repo path |
| `noxdev run <project>` | Execute pending tasks for a project |
| `noxdev run --all` | Execute tasks across all registered projects |
| `noxdev run --overnight` | Unattended mode with extended timeouts |
| `noxdev status <project>` | Show project status and recent execution summary |
| `noxdev log <project>` | View detailed execution history and logs |
| `noxdev merge <project>` | Interactive commit review and merge workflow |
| `noxdev projects` | List all registered projects |
| `noxdev dashboard` | Launch web UI for visual review (localhost only) |
| `noxdev doctor` | Check prerequisites and system health |

## The Morning Dashboard

A React web interface for reviewing overnight work. Run `noxdev dashboard` to start the local server. The dashboard shows execution summaries, commit diffs, and provides a visual merge review workflow. Runs on localhost only for security.

## Safety Model

- **Docker containment**: Memory/CPU/timeout limits isolate agent execution
- **Git worktree**: Main branch is never directly modified, always safe
- **No auto-push ever**: All commits stay local until manual review
- **Critic agent review**: Optional second-pass validation of changes
- **Circuit breaker**: 3 consecutive failures automatically pause a project
- **SOPS + age encryption**: Secure handling of secrets and credentials

## Requirements

- Node.js >= 20 < 23
- Docker (with daemon running)
- Git
- Claude CLI (`claude login` required)
- SOPS + age (optional, for secrets encryption)

## Built With

Built by a single developer using AI-augmented development.

## License

[MIT](LICENSE)
