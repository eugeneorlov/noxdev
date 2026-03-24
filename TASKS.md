# noxdev: Version bump to v1.0.0

## T1: Bump version to 1.0.0 across the monorepo
- STATUS: done
- FILES: packages/cli/package.json, packages/dashboard/package.json, package.json, CHANGELOG.md
- VERIFY: pnpm build && node packages/cli/dist/index.js --version 2>&1 | grep -q "1.0.0"
- CRITIC: skip
- PUSH: auto
- SPEC: Bump the version from 0.1.0 to 1.0.0 across all package.json files.
  1. In packages/cli/package.json: change "version": "0.1.0" to "version": "1.0.0"
  2. In packages/dashboard/package.json: change "version": "0.1.0" to "version": "1.0.0"
  3. In the root package.json: change "version": "0.1.0" to "version": "1.0.0"
  4. In CHANGELOG.md: add a new section at the top:
     ```
     ## [1.0.0] - 2026-03-24

     ### Added
     - Multi-project orchestration with `noxdev run --all`
     - Interactive merge workflow with `noxdev merge`
     - React morning dashboard with dark mode
     - SQLite ledger for full execution history
     - `noxdev doctor` prerequisite checker (9/9 checks)
     - `noxdev remove` command for project cleanup
     - Auto-sync worktree with base branch before runs
     - Auto-commit TASKS.md status updates after runs
     - Auto-create initial commit for empty repos during init
     - Default branch detection (main/master/custom)
     - Diff capture includes untracked files for critic review
     - Credential snapshot restore before each Docker launch

     ### Fixed
     - Merge badge UX: hidden for auto-push, prefixed for gate tasks
     - Approve/Reject buttons: help text clarifying CLI merge required
     - noxdev projects: reads TASKS.md from worktree, not repo
     - Turbo build order: dashboard builds before CLI
     ```
  Do NOT change any other fields in package.json files.
