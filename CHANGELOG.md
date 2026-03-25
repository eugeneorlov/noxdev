# Changelog

All notable changes to noxdev will be documented in this file.

## [1.0.0] - 2026-03-25

First public release.

### Core
- Docker-isolated task execution with memory/CPU/timeout limits
- Git worktree isolation — agents work on a branch, main is never touched
- TASKS.md parser with multi-line SPEC support
- Three-tier push model: auto, gate, manual
- Two-agent workflow: developer agent builds, optional critic agent reviews
- Circuit breaker: 3 consecutive failures pause project
- Max-first auth: Claude Max free compute, Sonnet API fallback with daily cap
- SOPS + age encryption for secrets at rest
- SQLite ledger for full execution history

### CLI
- `noxdev init` — register project, create worktree, auto-detect default branch, auto-create initial commit for empty repos
- `noxdev run` — execute pending tasks from TASKS.md
- `noxdev run --all` — multi-project sequential execution
- `noxdev run --overnight` — detached background mode with system sleep prevention
- `noxdev status` — project summary with completed/failed/pending counts
- `noxdev log` — full task detail: spec, agent logs, diff, duration
- `noxdev merge` — interactive per-commit approve/reject/diff/skip workflow
- `noxdev projects` — list registered projects with last run status
- `noxdev dashboard` — launch React web UI
- `noxdev doctor` — prerequisite checker (9 checks)
- `noxdev remove` — unregister project, clean up worktree

### Dashboard
- Overview page with project cards and last run status
- Run detail with task list, status badges, durations, expandable rows
- Task detail with full spec, execution info, diff viewer, merge controls
- Merge review page with batch approve/reject and inline diffs
- Dark mode with localStorage persistence
- Bundled serving: CLI serves dashboard static files + API on port 4400

### Operational
- Auto-sync worktree with base branch before runs
- Auto-commit TASKS.md status updates after runs
- Credential snapshot restore before each Docker launch
- Diff capture includes untracked files for critic review
