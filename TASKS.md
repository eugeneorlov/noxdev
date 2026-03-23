# noxdev Phase B: Run Engine

# Dependencies: Phase A complete (monorepo, SQLite schema, CLI skeleton, init, projects)
# Gate between sessions: pnpm build && pnpm test
#
# Session 1: T1, T2 (core data modules — parser + db queries)
# Session 2: T3, T4, T5 (independent modules — prompt, auth, bash scripts)
# Session 3: T6, T7 (wrappers — docker runner, status updater)
# Session 4: T8, T9 (integration — orchestrator, overnight mode)

## T1: TASKS.md parser with multi-line SPEC support
- STATUS: pending
- FILES: packages/cli/src/parser/tasks.ts, packages/cli/src/parser/__tests__/tasks.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/parser/__tests__/tasks.test.ts
- CRITIC: review
- PUSH: gate
- SPEC: Create a TASKS.md parser that reads the noxdev task format and returns structured data.
  File: packages/cli/src/parser/tasks.ts
  Export interface ParsedTask { taskId: string; title: string; status: string; files: string[];
  verify: string; critic: string; push: string; spec: string; }
  Export function parseTasks(content: string): ParsedTask[]
  Export function parseTasksFromFile(filePath: string): ParsedTask[]
  Parsing rules:
  - Task headers match: /^## (T\d+): (.+)$/m — capture taskId and title.
  - Fields match: /^- (STATUS|FILES|VERIFY|CRITIC|PUSH|SPEC): (.+)$/m (case-insensitive field name).
  - FILES is comma-separated, split into string array trimming whitespace.
  - SPEC can be multi-line: the first line after "SPEC:" is the start, and all subsequent
    lines that start with 2+ spaces of indentation (before any other field or next task header)
    are continuation lines. Join with newline, trim trailing whitespace.
  - STATUS values: pending, done, failed, skipped. Only return tasks where status === 'pending'
    by default. Add optional parameter includeDone: boolean to return all.
  - If a field is missing, use defaults: critic='review', push='auto', files=[], verify='',
    spec=''.
  File: packages/cli/src/parser/__tests__/tasks.test.ts
  Tests using vitest:
  1. Parse a single task with all fields → verify all fields populated correctly.
  2. Parse multi-line SPEC → verify spec contains all continuation lines joined with \n.
  3. Parse multiple tasks → verify correct count and each task's fields.
  4. Filter by status → only pending by default, all with includeDone=true.
  5. Missing optional fields → verify defaults applied.
  6. Empty file → returns empty array.
  7. FILES comma splitting → "a.ts, b.ts, c.ts" becomes ["a.ts", "b.ts", "c.ts"].
  Add vitest to packages/cli/package.json scripts: "test": "vitest run".
  Ensure vitest config works with TypeScript (vitest should auto-detect tsconfig).

## T2: SQLite query layer for run engine
- STATUS: pending
- FILES: packages/cli/src/db/queries.ts, packages/cli/src/db/__tests__/queries.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/db/__tests__/queries.test.ts
- CRITIC: review
- PUSH: gate
- SPEC: Create the query layer that the run engine and CLI commands will use.
  File: packages/cli/src/db/queries.ts
  All functions take a Database instance (from better-sqlite3) as first argument.
  Export functions:
  - insertRun(db, run: { id: string, projectId: string, startedAt: string, authMode: string,
    totalTasks: number, commitBefore: string, logFile: string }): void
  - updateRunFinished(db, runId: string, updates: { finishedAt: string, completed: number,
    failed: number, skipped: number, status: string, commitAfter: string }): void
  - insertTaskCache(db, runId: string, tasks: Array<{ taskId: string, title: string,
    files: string, verify: string, critic: string, push: string, spec: string,
    statusBefore: string }>): void
  - insertTaskResult(db, result: { runId: string, taskId: string, title: string,
    status: string, exitCode: number | null, authMode: string, criticMode: string,
    pushMode: string, attempt: number, commitSha: string | null, startedAt: string,
    finishedAt: string, durationSeconds: number, devLogFile: string | null,
    criticLogFile: string | null, diffFile: string | null }): void
  - updateMergeDecision(db, taskResultId: number, decision: string, mergedAt?: string): void
  - getLatestRun(db, projectId: string): run row or null
  - getTaskResults(db, runId: string): array of task_result rows
  - getPendingMerge(db, runId: string): array of task_results where merge_decision = 'pending'
  - getProject(db, projectId: string): project row or null
  - getAllProjects(db): array of project rows with optional latest run joined
  Use prepared statements for performance. All inserts use db.prepare().run().
  All selects use db.prepare().get() or .all().
  File: packages/cli/src/db/__tests__/queries.test.ts
  Tests using vitest with an in-memory SQLite database (better-sqlite3 with ':memory:'):
  1. Run the schema migration on the in-memory db first (import from db/migrate.ts).
  2. insertRun + getLatestRun → verify round-trip.
  3. insertTaskResult + getTaskResults → verify all fields.
  4. updateRunFinished → verify status and counts updated.
  5. updateMergeDecision → verify decision and mergedAt.
  6. getPendingMerge → only returns rows where merge_decision = 'pending'.
  7. getAllProjects with no runs → returns projects with null run fields.
  8. getAllProjects after insertRun → returns project with latest run data.
  Important: the migrate function currently reads schema.sql from disk. For tests, either:
  (a) make migrate accept a db instance and read schema.sql relative to __dirname, or
  (b) inline the schema in the test. Prefer (a) — refactor migrate.ts to export
  a runMigrations(db: Database) function that the getDb() function calls internally,
  and that tests can call on an in-memory db.

## T3: Prompt builder for task execution
- STATUS: pending
- FILES: packages/cli/src/prompts/builder.ts, packages/cli/src/prompts/__tests__/builder.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/prompts/__tests__/builder.test.ts
- CRITIC: skip
- PUSH: auto
- SPEC: Create the prompt builder that generates the Claude prompt for each task execution.
  File: packages/cli/src/prompts/builder.ts
  Export interface PromptContext { task: ParsedTask (from parser/tasks.ts); projectConfig:
  ProjectConfig (from config/types.ts); worktreePath: string; runId: string;
  attempt: number; previousError?: string; }
  Export function buildTaskPrompt(ctx: PromptContext): string
  The prompt template should produce a string like:
  ---
  You are an autonomous coding agent working on project "{displayName}".
  Working directory: {worktreePath}

  ## Task: {taskId} — {title}

  {spec}

  ## Files to focus on (hints, not constraints):
  {files joined with newline, or "No specific files listed." if empty}

  ## Verification:
  After completing the task, run: {verify}
  If the verification command fails, fix the issue and re-run until it passes.

  ## Rules:
  - Make only the changes needed for this task. Do not refactor unrelated code.
  - Commit your changes with message: "noxdev({taskId}): {title}"
  - Do not push to any remote.
  - If you cannot complete the task, create a file FAILED.md explaining what went wrong.
  ---
  If attempt > 1 and previousError is provided, add a section before Rules:
  ## Previous attempt failed:
  {previousError}
  Analyze what went wrong and try a different approach.
  ---
  Export function buildCriticPrompt(task: ParsedTask, diffContent: string): string
  The critic prompt reviews the diff:
  ---
  You are a code review critic. Review this diff for task "{taskId}: {title}".

  ## Task specification:
  {spec}

  ## Diff to review:
  ```
  {diffContent}
  ```

  ## Review checklist:
  1. Does the diff implement what the spec asks for? (correctness)
  2. Are changes scoped to the task? No unrelated modifications? (scope)
  3. Are there security issues? (credential exposure, injection, missing validation)
  4. Does the code follow existing patterns in the project?

  Respond with APPROVED or REJECTED followed by a brief explanation.
  If REJECTED, explain what needs to change.
  ---
  File: packages/cli/src/prompts/__tests__/builder.test.ts
  Tests:
  1. buildTaskPrompt with all fields → verify taskId, title, spec, files, verify in output.
  2. buildTaskPrompt with empty files → verify "No specific files listed." appears.
  3. buildTaskPrompt with attempt > 1 and previousError → verify error section in output.
  4. buildTaskPrompt attempt 1 → no "Previous attempt" section.
  5. buildCriticPrompt → verify spec and diff appear in output, checklist present.

## T4: Auth module for Max-first with API fallback
- STATUS: pending
- FILES: packages/cli/src/auth/index.ts, packages/cli/src/auth/__tests__/auth.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/auth/__tests__/auth.test.ts
- CRITIC: review
- PUSH: gate
- SPEC: Create the auth module that determines whether to use Max (free compute) or API key.
  File: packages/cli/src/auth/index.ts
  Export type AuthMode = 'max' | 'api'
  Export interface AuthResult { mode: AuthMode; apiKey?: string; model: string; }
  Export interface AuthConfig { max: { preferred: boolean }; api: { fallback: boolean;
  dailyCapUsd: number; model: string }; secrets: { provider: string; globalSecretsFile: string;
  ageKeyFile: string }; }
  Export function resolveAuth(config: AuthConfig): AuthResult
  Logic:
  1. If max.preferred is true, check if Max credentials exist:
     Look for ~/.claude.json (the Max session file). If file exists and is non-empty,
     return { mode: 'max', model: 'claude-sonnet-4-20250514' }.
  2. If Max not available and api.fallback is true:
     Decrypt the API key using SOPS: run `sops -d --extract '["ANTHROPIC_API_KEY"]' {globalSecretsFile}`
     via child_process.execSync. If decryption succeeds, return { mode: 'api',
     apiKey: decryptedKey.trim(), model: config.api.model }.
  3. If neither works, throw an Error with a clear message:
     "No auth available. Max credentials not found at ~/.claude.json and API fallback
     is disabled or decryption failed."
  Export function getMaxCredentialPath(): string — returns ~/.claude.json (expandable).
  Export function isMaxAvailable(): boolean — checks if ~/.claude.json exists and is non-empty.
  File: packages/cli/src/auth/__tests__/auth.test.ts
  Tests (mock the filesystem and child_process):
  1. Max preferred + credentials exist → returns mode 'max'.
  2. Max preferred + no credentials + API fallback enabled → returns mode 'api'.
  3. Max preferred + no credentials + API fallback disabled → throws error.
  4. isMaxAvailable with existing file → true.
  5. isMaxAvailable with missing file → false.
  Use vitest mocking: vi.mock('node:fs') and vi.mock('node:child_process') to avoid
  touching real filesystem or running real sops commands.

## T5: Extract parameterized bash Docker scripts
- STATUS: pending
- FILES: packages/cli/scripts/docker-run-max.sh, packages/cli/scripts/docker-run-api.sh, packages/cli/scripts/docker-capture-diff.sh
- VERIFY: shellcheck packages/cli/scripts/*.sh 2>/dev/null || echo "shellcheck not installed, skipping" && test -x packages/cli/scripts/docker-run-max.sh
- CRITIC: review
- PUSH: gate
- SPEC: Create three parameterized bash scripts for Docker operations. These are extracted
  from the battle-tested v8 prototype and must NOT be rewritten in TypeScript.
  All scripts must be executable (chmod +x), have proper error handling (set -euo pipefail),
  and be invocable via child_process.execFile from TypeScript.
  File: packages/cli/scripts/docker-run-max.sh
  Args: $1=prompt_file $2=task_log $3=timeout_seconds $4=worktree_dir $5=project_git_dir
  $6=git_target_path $7=memory_limit $8=cpu_limit $9=docker_image
  Does:
  - Backup .claude.json from host: cp ~/.claude.json /tmp/.claude.json.bak
  - Run docker with: docker run --rm --memory=$7 --cpus=$8
    -v "$4":/workspace -v "$1":/tmp/prompt.md:ro
    -v /tmp/.claude.json.bak:/root/.claude.json
    --workdir /workspace "$9"
    bash -c '
      git config --global user.email "noxdev@local"
      git config --global user.name "noxdev"
      git config --global safe.directory /workspace
      timeout '"$3"' claude --print --output-format stream-json
        -p "$(cat /tmp/prompt.md)"
        --model claude-sonnet-4-20250514
        --max-turns 30
        --allowedTools "Bash(git*),Bash(npm*),Bash(pnpm*),Bash(node*),Bash(cat*),Bash(ls*),Bash(find*),Bash(grep*),Bash(sed*),Bash(mkdir*),Bash(cp*),Bash(mv*),Bash(rm*),Bash(echo*),Bash(touch*),Bash(head*),Bash(tail*),Read,Write,Edit"
    ' > "$2" 2>&1
  - Exit with docker's exit code.
  File: packages/cli/scripts/docker-run-api.sh
  Same as docker-run-max.sh but with these differences:
  - Additional arg: ${10}=api_key
  - Instead of mounting .claude.json, pass -e ANTHROPIC_API_KEY="${10}"
  - No .claude.json backup/mount
  - Uses same model flag and tool allowlist
  File: packages/cli/scripts/docker-capture-diff.sh
  Args: $1=worktree_dir $2=output_file
  Does:
  - cd "$1"
  - Capture full diff: (git diff HEAD && echo "---STAGED---" && git diff --cached
    && echo "---UNTRACKED---" && git ls-files --others --exclude-standard
    | while read f; do echo "=== $f ==="; cat "$f" 2>/dev/null; done) > "$2"
  - Exit 0 even if no changes (empty diff is valid).
  Make all scripts chmod +x. Add a comment header to each script with usage.

## T6: Docker runner TypeScript wrapper
- STATUS: pending
- FILES: packages/cli/src/docker/runner.ts, packages/cli/src/docker/types.ts
- VERIFY: cd packages/cli && pnpm build
- CRITIC: review
- PUSH: gate
- SPEC: Create the TypeScript wrapper that invokes the bash Docker scripts.
  File: packages/cli/src/docker/types.ts
  Export interface DockerRunOptions { promptFile: string; taskLog: string;
  timeoutSeconds: number; worktreeDir: string; projectGitDir: string;
  gitTargetPath: string; memoryLimit: string; cpuLimit: number;
  dockerImage: string; }
  Export interface DockerRunResult { exitCode: number; logFile: string;
  durationSeconds: number; }
  File: packages/cli/src/docker/runner.ts
  Export function runTaskInDocker(options: DockerRunOptions, auth: AuthResult): DockerRunResult
  Logic:
  1. Resolve script path: path.join(__dirname, '..', '..', 'scripts', 'docker-run-max.sh')
     for Max mode, docker-run-api.sh for API mode. Note: since we bundle with tsup,
     use import.meta.url or __filename to resolve relative to the source, OR use a
     constant that points to the installed scripts location. The scripts directory should
     be copied to dist/scripts/ during build — add a postbuild script in package.json:
     "postbuild": "cp -r scripts dist/scripts".
  2. Build args array based on DockerRunOptions matching the bash script parameter order.
  3. For API mode, append auth.apiKey as the 10th argument.
  4. Execute with child_process.execFileSync(scriptPath, args, { stdio: 'inherit',
     timeout: (options.timeoutSeconds + 60) * 1000 }). The +60 gives buffer for
     Docker startup/shutdown beyond the inner timeout.
  5. Capture start time before and end time after to compute durationSeconds.
  6. Return { exitCode: 0, logFile: options.taskLog, durationSeconds }.
  7. On error (non-zero exit or timeout), catch and return the exit code from the error.
     child_process errors have a .status property for exit code.
  Export function captureDiff(worktreeDir: string, outputFile: string): boolean
  Invokes docker-capture-diff.sh. Returns true if diff file is non-empty, false if empty.
  Export function checkDockerImage(imageName: string): boolean
  Runs: docker images -q {imageName} and returns true if output is non-empty.

## T7: TASKS.md status auto-updater
- STATUS: pending
- FILES: packages/cli/src/parser/status-update.ts, packages/cli/src/parser/__tests__/status-update.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/parser/__tests__/status-update.test.ts
- CRITIC: skip
- PUSH: auto
- SPEC: Create the module that updates task status in TASKS.md after execution.
  File: packages/cli/src/parser/status-update.ts
  Export function updateTaskStatus(filePath: string, taskId: string, newStatus: string): void
  Uses sed-like approach via string replacement (not actual sed for cross-platform compat):
  1. Read the file content.
  2. Find the line matching: /^- STATUS: \w+/ that appears after the task header
     matching the given taskId (## T{n}: ...).
  3. Replace the status value with newStatus.
  4. Write the file back.
  Must preserve all other content exactly (whitespace, blank lines, other tasks).
  Export function updateAllTaskStatuses(filePath: string,
  results: Array<{ taskId: string; status: string }>): void
  Batch version — reads once, updates all, writes once. More efficient for post-run updates.
  File: packages/cli/src/parser/__tests__/status-update.test.ts
  Tests (use a temp file with vitest's beforeEach/afterEach):
  1. Update single task status pending→done → verify only that task changed.
  2. Update single task, verify other tasks unchanged.
  3. Batch update 3 tasks → all statuses updated correctly.
  4. Task with multi-line SPEC → status update doesn't corrupt the SPEC.
  5. Non-existent taskId → throws or returns without modifying file.
  Use node:fs to create temp files in os.tmpdir() for testing, clean up in afterEach.

## T8: Run engine orchestrator
- STATUS: pending
- FILES: packages/cli/src/commands/run.ts, packages/cli/src/engine/orchestrator.ts, packages/cli/src/engine/types.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js run --help
- CRITIC: review
- PUSH: gate
- SPEC: Create the run engine that orchestrates task execution. This is the integration
  point — it uses parser, db queries, prompt builder, auth, docker runner, and status updater.
  File: packages/cli/src/engine/types.ts
  Export interface RunContext { projectId: string; projectConfig: ProjectConfig;
  worktreeDir: string; projectGitDir: string; gitTargetPath: string;
  runId: string; db: Database; auth: AuthResult; }
  Export interface TaskExecResult { taskId: string; title: string; status: string;
  exitCode: number | null; commitSha: string | null; durationSeconds: number;
  attempt: number; }
  File: packages/cli/src/engine/orchestrator.ts
  Export async function executeRun(ctx: RunContext): Promise<void>
  The orchestrator flow:
  1. Parse TASKS.md from worktree using parseTasksFromFile. Filter to pending tasks only.
  2. If no pending tasks, print "No pending tasks" and return.
  3. Get current git SHA: execSync('git rev-parse HEAD', { cwd: ctx.worktreeDir }).
  4. Insert run into SQLite (insertRun with total_tasks = pending count, commitBefore = SHA).
  5. Cache parsed tasks in SQLite (insertTaskCache).
  6. Print run header with chalk: "noxdev run {projectId} — {n} pending tasks"
  7. Initialize counters: completed=0, failed=0, skipped=0, consecutiveFailures=0.
  8. For each pending task:
     a. Print task header: "━━━ {taskId}: {title} ━━━" with chalk.
     b. Record start time.
     c. Build prompt using buildTaskPrompt.
     d. Write prompt to temp file (os.tmpdir()/noxdev-prompt-{runId}-{taskId}.md).
     e. Create task log path (~/.noxdev/logs/{runId}/{taskId}.log).
     f. Ensure log directory exists (mkdirSync recursive).
     g. Call runTaskInDocker with the options.
     h. Record end time, compute duration.
     i. Check for commit: run `git log --oneline -1` in worktree, if HEAD changed
        from before, capture the new SHA.
     j. Determine status: exit code 0 = COMPLETED, non-zero = FAILED.
        If FAILED and attempt < maxRetries (from config, default 1), retry once with
        attempt=2 and include error context in prompt.
     k. If task has critic='review' and status=COMPLETED:
        - Run captureDiff to get the diff.
        - Build critic prompt.
        - Write critic prompt to temp file.
        - Run critic in Docker (same runner, shorter timeout: 120s).
        - Parse critic output for APPROVED/REJECTED.
        - If REJECTED, status = FAILED (will trigger retry if attempts remain).
     l. Insert task_result into SQLite.
     m. Update TASKS.md status (done or failed).
     n. Update counters. If FAILED, increment consecutiveFailures.
        If COMPLETED, reset consecutiveFailures to 0.
     o. Circuit breaker: if consecutiveFailures >= threshold (default 3), print warning
        and break out of task loop.
     p. Clean up temp prompt file.
  9. Get final git SHA.
  10. Update run in SQLite (updateRunFinished with all counters and final SHA).
  11. Print summary: "Run {runId} complete: {completed} completed, {failed} failed,
      {skipped} skipped" with appropriate colors.
  File: packages/cli/src/commands/run.ts
  Replace the stub with real implementation:
  - Accept optional [project] argument. If not provided, use the only registered project
    (or error if multiple).
  - Load project from SQLite, load project config.
  - Resolve auth.
  - Generate runId: YYYYMMDD_HHmmss format using current timestamp.
  - Build RunContext and call executeRun.
  - Handle --all flag: query all projects, iterate sequentially, call executeRun for each.
  - Handle --overnight flag: defer to T9, for now just print "overnight mode not yet implemented".
  No unit tests for the orchestrator — this is integration code tested by running the actual
  loop. The components it calls are all individually tested.

## T9: Overnight mode wrapper
- STATUS: pending
- FILES: packages/cli/src/commands/run.ts (extend --overnight handling)
- VERIFY: cd packages/cli && pnpm build && node dist/index.js run --overnight --help
- CRITIC: skip
- PUSH: auto
- SPEC: Implement the --overnight flag for unattended execution.
  In packages/cli/src/commands/run.ts, when --overnight flag is set:
  1. Detach the process using nohup-like behavior. Use child_process.spawn with
     { detached: true, stdio: 'ignore' } to spawn a new node process running the
     same command without --overnight. Call unref() on the child.
  2. Before spawning, attempt to inhibit sleep. On Linux/WSL, try:
     Run `which systemd-inhibit` to check availability. If available, wrap the spawn
     command: systemd-inhibit --what=sleep --who=noxdev --why="Overnight coding run"
     node dist/index.js run [project] [--all].
     If systemd-inhibit not available, try: `which caffeinate` (macOS).
     If neither available, print warning: "Could not inhibit sleep. Machine may sleep
     during overnight run."
  3. Write PID to ~/.noxdev/noxdev.pid for status checks.
  4. Print: "noxdev overnight run started (PID: {pid}). Check status with: noxdev status"
  5. Exit the parent process cleanly.
  This is a simple wrapper — all the real work is done by executeRun from T8.
