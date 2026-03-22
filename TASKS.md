# noxdev Phase A: Foundation

## T1: Initialize Turborepo monorepo with pnpm workspaces
- STATUS: done
- FILES: package.json, pnpm-workspace.yaml, turbo.json, packages/cli/package.json, packages/dashboard/package.json, tsconfig.json
- VERIFY: pnpm install && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Initialize a Turborepo monorepo with pnpm workspaces. Root package.json with
  "name": "noxdev", private: true, packageManager pnpm. pnpm-workspace.yaml pointing
  to packages/*. turbo.json with build and lint pipeline tasks.
  Two packages: packages/cli (name: @noxdev/cli) and packages/dashboard (name: @noxdev/dashboard).
  CLI package: TypeScript, "bin": { "noxdev": "./dist/index.js" }, build script using tsup
  (bundle to single file, target node18, format esm). Dependencies: commander, better-sqlite3,
  chalk, ora. DevDeps: tsup, typescript, @types/better-sqlite3, @types/node, vitest.
  Dashboard package: just a placeholder package.json for now with react, vite, typescript.
  No actual dashboard code yet.
  Root tsconfig.json with base config (strict, es2022, node module resolution).
  Each package gets its own tsconfig.json extending the root.
  Add .gitignore (node_modules, dist, *.db, .turbo).
  Add root .npmrc with shamefully-hoist=false.

## T2: CLI entry point with commander.js
- STATUS: done
- FILES: packages/cli/src/index.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/projects.ts, packages/cli/src/commands/run.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/log.ts, packages/cli/src/commands/merge.ts, packages/cli/src/commands/dashboard.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js --help
- CRITIC: skip
- PUSH: auto
- SPEC: Create the CLI entry point using commander.js. File: packages/cli/src/index.ts.
  Add #!/usr/bin/env node shebang. Import commander, define program with name "noxdev",
  description "Autonomous overnight coding agent orchestrator", version from package.json.
  Register subcommands: init, run, status, log, merge, projects, dashboard.
  Each command gets its own file in src/commands/ as a stub that prints
  "noxdev <command> — not yet implemented" and exits 0.
  The init command should accept a required <project> argument and optional --repo flag.
  The run command should accept optional [project] argument and flags: --overnight, --all.
  The status command should accept optional [project] argument.
  The log command should accept required <task-id> argument.
  The merge command should accept optional [project] argument.
  The projects command takes no arguments.
  The dashboard command takes no arguments.
  Make sure the built output at dist/index.js is executable (tsup banner with shebang).

## T3: SQLite schema and migration system
- STATUS: done
- FILES: packages/cli/src/db/schema.sql, packages/cli/src/db/index.ts, packages/cli/src/db/migrate.ts
- VERIFY: pnpm build
- CRITIC: review
- PUSH: gate
- SPEC: Create the SQLite database layer. Use better-sqlite3 (synchronous API).
  File: packages/cli/src/db/schema.sql — the full schema:
  Table "projects": id TEXT PK, display_name TEXT NOT NULL, repo_path TEXT NOT NULL,
  worktree_path TEXT NOT NULL, branch TEXT NOT NULL, test_command TEXT, build_command TEXT,
  lint_command TEXT, docker_memory TEXT DEFAULT '4g', docker_cpus INTEGER DEFAULT 2,
  docker_timeout_seconds INTEGER DEFAULT 1800, secrets_file TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')).
  Table "runs": id TEXT PK, project_id TEXT NOT NULL REFERENCES projects(id),
  started_at TEXT NOT NULL, finished_at TEXT, auth_mode TEXT NOT NULL DEFAULT 'max',
  total_tasks INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0, status TEXT DEFAULT 'running', log_file TEXT,
  commit_before TEXT, commit_after TEXT.
  Table "task_results": id INTEGER PK AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id),
  task_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, exit_code INTEGER,
  auth_mode TEXT, critic_mode TEXT DEFAULT 'review', push_mode TEXT DEFAULT 'auto',
  attempt INTEGER DEFAULT 1, commit_sha TEXT, started_at TEXT, finished_at TEXT,
  duration_seconds INTEGER, dev_log_file TEXT, critic_log_file TEXT, diff_file TEXT,
  merge_decision TEXT DEFAULT 'pending', merged_at TEXT.
  Add indexes: idx_task_results_run ON task_results(run_id),
  idx_task_results_status ON task_results(status).
  Table "tasks": id INTEGER PK AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id),
  task_id TEXT NOT NULL, title TEXT NOT NULL, files TEXT, verify TEXT,
  critic TEXT DEFAULT 'review', push TEXT DEFAULT 'auto', spec TEXT,
  status_before TEXT DEFAULT 'pending', UNIQUE(run_id, task_id).
  File: packages/cli/src/db/index.ts — exports getDb() function that opens or creates
  ~/.noxdev/ledger.db with WAL mode enabled. Creates ~/.noxdev/ directory if missing.
  Runs migrations on first open.
  File: packages/cli/src/db/migrate.ts — reads schema.sql, executes it.
  Use CREATE TABLE IF NOT EXISTS so migrations are idempotent.

## T4: Config loader (global + per-project)
- STATUS: done
- FILES: packages/cli/src/config/index.ts, packages/cli/src/config/types.ts
- VERIFY: pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Create configuration loading module.
  File: packages/cli/src/config/types.ts — TypeScript interfaces:
  GlobalConfig { accounts: { max: { preferred: boolean, rate_limit_ceiling: number },
  api: { fallback: boolean, daily_cap_usd: number, model: string } },
  safety: { auto_push: boolean, max_retries_per_task: number,
  circuit_breaker_threshold: number }, secrets: { provider: string, global: string,
  age_key: string } }.
  ProjectConfig { project: string, display_name: string, test_command: string,
  build_command: string, lint_command: string, docker: { memory: string, cpus: number,
  timeout_minutes: number }, secrets: string, tasks_file: string, critic_default: string,
  push_default: string }.
  File: packages/cli/src/config/index.ts — exports loadGlobalConfig() that reads
  ~/.noxdev/config.json and returns GlobalConfig with defaults merged.
  Exports loadProjectConfig(projectPath) that reads .noxdev/config.json from project root.
  Both return sensible defaults if files don't exist yet.
  Use JSON.parse with try/catch and helpful error messages.

## T5: Implement noxdev init command
- STATUS: pending
- FILES: packages/cli/src/commands/init.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js init test-project --repo /tmp/test-repo 2>&1 | grep -i "error\|created\|registered"
- CRITIC: review
- PUSH: gate
- SPEC: Implement the init command. When user runs "noxdev init <project> --repo <path>":
  1. Validate that --repo path exists and is a git repository (check for .git).
  2. Create git worktree: run "git worktree add -b noxdev/<project> ~/worktrees/<project> main"
     from the repo path. Use child_process.execSync. If branch already exists, skip creation.
  3. Create .noxdev/config.json in the project repo root with default ProjectConfig.
     Auto-detect test/build/lint commands from package.json if it exists
     (look for scripts.test, scripts.build, scripts.lint).
  4. Register the project in SQLite (insert into projects table).
  5. Check that Docker image noxdev-runner:latest exists (docker images -q noxdev-runner).
     Warn if missing but don't fail.
  6. Print summary with chalk: worktree path, branch name, detected commands, config path.
  7. Print next step: "Write tasks in ~/worktrees/<project>/TASKS.md then run: noxdev run <project>"
  Use ora spinner for long operations (worktree creation, dep install).
  Handle errors gracefully — if worktree exists, if project already registered, etc.

## T6: Implement noxdev projects command
- STATUS: pending
- FILES: packages/cli/src/commands/projects.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js projects
- CRITIC: skip
- PUSH: auto
- SPEC: Implement the projects command. Query all rows from the projects table in SQLite.
  For each project, also query the most recent run from the runs table
  (LEFT JOIN runs ON projects.id = runs.project_id ORDER BY runs.started_at DESC LIMIT 1).
  Display as a formatted table using chalk:
  PROJECT (left-aligned, 20 chars), LAST RUN (relative time like "2h ago" or "never"),
  STATUS (completed/failed counts or "-"), TASKS (count of pending tasks from TASKS.md if
  the file exists, or "-").
  If no projects registered, print "No projects registered. Run: noxdev init <project> --repo <path>"
  For relative time, compute the difference from now to runs.started_at. Use simple logic:
  <1h = "Xm ago", <24h = "Xh ago", <7d = "Xd ago", else date string.
