# noxdev CLI

Autonomous overnight coding agent orchestrator — ship code while you sleep.

## Requirements

- **Node.js**: Requires Node.js >= 24
- Docker (with daemon running)
- Git
- Claude CLI (`claude login` required)

## Installation

```bash
npm install -g noxdev
```

## Quick Start

```bash
noxdev doctor                           # check prerequisites
noxdev init my-project --repo ~/my-repo # register a project
# write tasks in ~/worktrees/my-project/TASKS.md
noxdev run my-project                   # run task loop
noxdev status my-project                # morning summary
noxdev dashboard                        # visual review UI
```

For full documentation, see the [main README](../../README.md).