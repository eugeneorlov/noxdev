# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-24

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