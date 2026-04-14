# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-14

### Added
- Token usage and cost tracking per task, project, and globally
- `noxdev cost` command with `--since` and `--all` flags
- Cost summary on dashboard Overview and per-task detail pages
- Pricing override via ~/.noxdev/pricing.json
- Max-authenticated tasks show equivalent API cost for reference

### Changed
- Agent prompt now instructs the model to execute VERIFY as a real shell command
  and report exit code honestly

### Removed
- `noxdev merge` command — spec-driven workflows don't need per-commit review.
  Use `git merge noxdev/<project>` directly.
- Merge review page and approve/reject UI from the dashboard
- `merge_decision` and `merged_at` columns from the task_results table (migrated on first run)
- `PUSH` field from TASKS.md format. It was parsed and stored but never affected behavior.
  The agent always commits its work regardless. Existing TASKS.md files with PUSH lines
  continue to parse without error — the field is silently ignored.
- `push_mode` column from task_results table (migrated on first run)
- "Push:" display from `noxdev log` output

## [1.0.3] - 2026-04-11

### Added
- `dumpErr` helper utility for enhanced error diagnostics — all `demo.ts` catch blocks
  now surface stderr/stdout from failed child processes instead of swallowing errors.
- Postinstall script to detect missing better-sqlite3 native builds and provide
  helpful troubleshooting guidance.

### Fixed
- Vite scaffold reliability in `noxdev demo` — pinned to `pnpm dlx` form for
  non-interactive execution compatibility.

## [1.0.2] - 2026-04-09

### Fixed
- `noxdev setup` and `noxdev demo` path resolution — Dockerfile and templates
  now resolved via semantic walk-up instead of fragile relative paths. Fixes
  "Dockerfile not found" and "demo tasks not found" errors on installed packages.
- `noxdev setup` Node version check softened — Node 23/24 now warn instead of
  hard-exit. Node <20 and Node 25+ still blocked (known-broken).
- `noxdev demo` error diagnostics — all catch blocks now dump stderr/stdout
  from failed child processes instead of swallowing them.

### Added
- `noxdev demo --fresh` flag to clean up prior demo state before running.
- `src/lib/paths.ts` — shared `findCliRoot()` helper used by setup and demo.

## [1.0.1] - 2026-04-09

### Fixed
- Fixed doctor command recovery messages to be more user-friendly
- Improved demo command template packaging in npm distribution
- Enhanced demo command logic and template handling
- Refined setup command implementation

### Added
- New demo command with template support
- Improved CLI command structure and error handling

## [1.0.0] - 2026-03-24

### Added
- Initial stable release with all core features from 0.1.0

## [0.1.0] - 2026-03-23

### Added

#### Core CLI Features
- **Autonomous task orchestration** - Execute coding tasks overnight using Claude Code agents in isolated Docker containers
- **Project management** - Register and manage multiple codebases with `noxdev init` and `noxdev projects`
- **Task execution engine** - Parse TASKS.md specifications and run them with safety isolation using `noxdev run`
- **Git worktree isolation** - Keep main branch safe while agents work in isolated worktrees
- **Morning review workflow** - Inspect and approve commits with `noxdev status` and `noxdev merge`
- **Overnight execution mode** - Extended timeouts and unattended operation with `noxdev run --overnight`

#### Safety & Security
- **Docker containment** - Memory, CPU, and timeout limits isolate agent execution
- **No auto-push policy** - All commits stay local until manual review and approval
- **Critic agent review** - Optional second-pass validation of code changes
- **Circuit breaker** - Automatic project pause after 3 consecutive task failures
- **Credential management** - Secure Claude authentication with backup/restore mechanisms

#### CLI Experience
- **Prerequisites checker** - Validate system requirements with `noxdev doctor`
- **ASCII art branding** - Distinctive owl logo and visual identity
- **Version reporting** - Standard `--version` and `--help` support
- **Colored output** - Clear status indicators with chalk-powered formatting

#### Dashboard & UI
- **Web-based review interface** - Visual dashboard for reviewing overnight work
- **Dark/light theme support** - Toggle between themes with persistent preferences
- **Responsive design** - Works across desktop and mobile devices
- **Project overview** - Status cards, execution summaries, and commit diffs
- **Interactive merge workflow** - Visual approval/rejection of pending changes

#### Database & Persistence
- **SQLite storage** - Local database for project configuration and execution history
- **Execution logging** - Detailed logs of task runs, failures, and outcomes
- **Configuration management** - User preferences and project settings

#### Task Specification Format
- **TASKS.md parser** - Structured task definitions with status tracking
- **Push strategies** - Configurable commit policies (auto, gate, manual)
- **Verification commands** - Automated validation after task completion
- **File targeting** - Hint system for focusing agent attention
- **Critic integration** - Optional code review before commit

### Technical Details
- **Node.js 18+** - Modern JavaScript runtime requirement
- **TypeScript** - Full type safety across CLI and dashboard
- **Docker integration** - Containerized agent execution for safety
- **React dashboard** - Modern web UI built with Vite and Tailwind CSS
- **Express API server** - RESTful backend for dashboard functionality
- **Turborepo monorepo** - Efficient builds and dependency management
- **PNPM package management** - Fast, disk-efficient dependency resolution

### Dependencies
- **Claude CLI** - Anthropic's Claude Code agent integration
- **Docker** - Container runtime for isolated execution
- **Git** - Version control and worktree management
- **SOPS + age** - Optional secrets encryption support

[0.1.0]: https://github.com/eugeneorlov/noxdev/releases/tag/v0.1.0