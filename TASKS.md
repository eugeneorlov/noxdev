# noxdev Phase C: Review Workflow

# Dependencies: Phase B complete (run engine, parser, db queries, docker runner, auth)
# Gate between sessions: pnpm build && pnpm test
#
# Session 1: T1, T2 (read-only commands — status + log)
# Session 2: T3 (interactive merge — the complex one)
# Session 3: T4, T5 (multi-project + summary)

## T1: Implement noxdev status command
- STATUS: done
- FILES: packages/cli/src/commands/status.ts, packages/cli/src/commands/__tests__/status.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/commands/__tests__/status.test.ts
- CRITIC: skip
- PUSH: auto
- SPEC: Implement the status command for morning review. Replace the stub in status.ts.
  When user runs "noxdev status [project]":
  1. If project argument provided, use it. If not, query all projects from SQLite.
     If only one project registered, use it automatically.
     If multiple projects and no argument, show status for ALL projects (iterate each).
  2. For each project, query the latest run using getLatestRun(db, projectId).
  3. If no runs exist, print: "{projectId}: No runs yet. Run: noxdev run {projectId}"
  4. If a run exists, query task results using getTaskResults(db, runId).
  5. Display formatted output using chalk:
     ---
     noxdev status: {displayName}
     Run {runId} · {relative time ago} · {status}

     Tasks: {completed} completed, {failed} failed, {skipped} skipped (of {total})

     Commits:
       T1: {title}  {status badge}  {commit SHA or "no commit"}  {duration}s
       T2: {title}  {status badge}  {commit SHA or "no commit"}  {duration}s
       ...

     Pending merge: {count} tasks awaiting review
     Next step: noxdev merge {projectId}
     ---
  6. Status badges with chalk colors: COMPLETED = green, FAILED = red,
     SKIPPED = yellow, COMPLETED_RETRY = green with "(retry)" suffix.
  7. Relative time: use the same logic from the projects command
     (<1h = "Xm ago", <24h = "Xh ago", <7d = "Xd ago", else date).
  8. If run status is 'running', show: "Run in progress since {time}..."
  File: packages/cli/src/commands/__tests__/status.test.ts
  Tests using vitest with in-memory SQLite:
  1. Status with one completed run → verify output includes task count and commit SHAs.
  2. Status with no runs → verify "No runs yet" message.
  3. Status with pending merge tasks → verify "Pending merge" count.
  4. Status with running run → verify "in progress" message.
  Mock console.log to capture output. Use the db query layer from Phase B
  (import runMigrations, insertRun, insertTaskResult, etc.).

## T2: Implement noxdev log command
- STATUS: done
- FILES: packages/cli/src/commands/log.ts, packages/cli/src/commands/__tests__/log.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/commands/__tests__/log.test.ts
- CRITIC: skip
- PUSH: auto
- SPEC: Implement the log command for detailed task inspection. Replace the stub in log.ts.
  When user runs "noxdev log <task-id>":
  1. The task-id is required (e.g. "T3"). If missing, print usage and exit.
  2. Query task_results from SQLite WHERE task_id = taskId, ordered by run_id DESC.
     This shows all executions of this task across runs (most recent first).
  3. For the most recent execution, also query the task cache (tasks table) to get
     the full spec, files, verify, critic, push fields.
  4. Display formatted output using chalk:
     ---
     noxdev log: {taskId} — {title}

     Latest run: {runId} · {status badge} · attempt {attempt}

     Spec:
       {full spec text, indented 2 spaces}

     Files: {files list or "none specified"}
     Verify: {verify command}
     Critic: {critic mode}  Push: {push mode}

     Execution:
       Started:   {startedAt}
       Finished:  {finishedAt}
       Duration:  {durationSeconds}s
       Exit code: {exitCode}
       Auth mode: {authMode}
       Commit:    {commitSha or "none"}

     Merge: {mergeDecision}

     Logs:
       Dev agent:  {devLogFile or "not available"}
       Critic:     {criticLogFile or "not available"}
       Diff:       {diffFile or "not available"}
     ---
  5. If the log files exist on disk, offer to show them:
     "View dev agent log? Run: cat {devLogFile}"
     (Don't cat them inline — they can be huge. Just show the path.)
  6. If task has been executed multiple times (multiple runs), show a history section:
     ---
     History:
       Run {runId1}: {status} · {duration}s · attempt {attempt}
       Run {runId2}: {status} · {duration}s · attempt {attempt}
     ---
  File: packages/cli/src/commands/__tests__/log.test.ts
  Tests using vitest with in-memory SQLite:
  1. Log with one execution → verify all fields displayed.
  2. Log with multiple executions → verify history section.
  3. Log with unknown task-id → verify "not found" message.
  4. Log shows spec from tasks cache → verify spec text appears.
  Mock console.log to capture output.

## T3: Implement noxdev merge command (interactive CLI)
- STATUS: done
- FILES: packages/cli/src/commands/merge.ts, packages/cli/src/merge/interactive.ts, packages/cli/src/merge/__tests__/merge-logic.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/merge/__tests__/merge-logic.test.ts
- CRITIC: review
- PUSH: gate
- SPEC: Implement the interactive merge command. This is the core morning review experience.
  File: packages/cli/src/merge/interactive.ts
  This module handles the merge logic, separated from the command for testability.
  Export interface MergeCandidate { taskResultId: number; taskId: string; title: string;
  status: string; commitSha: string; diffFile: string | null; }
  Export interface MergeDecision { taskResultId: number; taskId: string;
  decision: 'approved' | 'rejected' | 'skipped'; }
  Export function getMergeCandidates(db: Database, projectId: string): MergeCandidate[]
  Logic: get latest run for project, then query task_results where run_id = latestRun.id
  AND status IN ('COMPLETED', 'COMPLETED_RETRY') AND merge_decision = 'pending'
  AND commit_sha IS NOT NULL. Return as MergeCandidate array.
  Export function getDiffStats(worktreeDir: string, commitSha: string): string
  Run: git show --stat --format="" {commitSha} in the worktree. Returns the stat summary
  like "+14 -2 in src/components/CoffeeRoulette.tsx". Use execSync.
  Export function getFullDiff(worktreeDir: string, commitSha: string): string
  Run: git show {commitSha} in the worktree. Returns full diff. Use execSync.
  Export function applyMergeDecisions(db: Database, worktreeDir: string,
  projectGitDir: string, decisions: MergeDecision[]): { merged: number; rejected: number; skipped: number }
  Logic:
  1. For each rejected decision: run `git revert --no-commit {commitSha}` then
     `git commit -m "noxdev: revert {taskId} (rejected in merge review)"` in the worktree.
     Update SQLite merge_decision = 'rejected' and merged_at = now.
  2. For each approved decision: update SQLite merge_decision = 'approved' and merged_at = now.
  3. For each skipped decision: leave merge_decision as 'pending' (no SQLite update).
  4. After all decisions processed, if any approved: run git merge from main.
     cd to the PROJECT repo dir (not worktree), run:
     `git merge {worktree_branch} -m "noxdev: merge {n} approved tasks from run {runId}"`.
  5. Return counts.
  File: packages/cli/src/commands/merge.ts
  Replace the stub. When user runs "noxdev merge [project]":
  1. Resolve project (same logic as status: argument, single project, or error if ambiguous).
  2. Load project from SQLite to get worktreeDir and branch.
  3. Call getMergeCandidates. If empty, print "No pending merge tasks." and exit.
  4. Print header: "Run {runId}: {n} tasks pending review"
  5. For each candidate, display interactively:
     ---
     {taskId}: {title} [{status}]
        commit: {shortSha}  {diffStats}
        [a]pprove  [r]eject  [d]iff  [s]kip  >
     ---
  6. Read user input using Node.js readline (createInterface with process.stdin/stdout).
     Handle single keypress: 'a' = approve, 'r' = reject, 'd' = show full diff then
     re-prompt with [a]pprove [r]eject, 's' = skip.
  7. After all candidates reviewed, print summary:
     "Summary: {approved} approved, {rejected} rejected, {skipped} skipped"
  8. If any approved, prompt: "Merge {n} approved commits to main? [y/n]"
  9. If confirmed, call applyMergeDecisions and print result.
  10. Print: "Run 'git push origin main' when ready."
  Important: the readline interface must be properly closed after use to avoid
  the process hanging. Use rl.close() in a finally block.
  File: packages/cli/src/merge/__tests__/merge-logic.test.ts
  Tests for the merge LOGIC (not the interactive readline part):
  1. getMergeCandidates returns only COMPLETED tasks with pending merge and commit_sha.
  2. getMergeCandidates returns empty array when no pending tasks.
  3. getDiffStats and getFullDiff are tested by mocking execSync.
  4. applyMergeDecisions with all approved → verify SQLite updated, merge count correct.
  5. applyMergeDecisions with mixed decisions → verify rejected get reverted in SQLite,
     approved get merged, skipped unchanged.
  Mock child_process.execSync for git operations. Use in-memory SQLite for db tests.

## T4: Multi-project sequential run (--all flag)
- STATUS: pending
- FILES: packages/cli/src/commands/run.ts, packages/cli/src/commands/__tests__/run-multi.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run src/commands/__tests__/run-multi.test.ts
- CRITIC: skip
- PUSH: auto
- SPEC: Extend the run command to support --all flag for multi-project sequential execution.
  In packages/cli/src/commands/run.ts:
  1. When --all flag is set, query all registered projects from SQLite using getAllProjects.
  2. Print header: "noxdev run --all: {n} registered projects"
  3. Iterate projects sequentially. For each project:
     a. Print: "[{time}] Project {i}/{n}: {displayName} ({pendingCount} pending tasks)"
     b. Load project config.
     c. Resolve auth (same auth for all projects, resolved once before the loop).
     d. Generate a unique runId per project: YYYYMMDD_HHmmss_{projectId}
     e. Build RunContext and call executeRun.
     f. If a project circuit-breaks (all tasks fail), print warning and continue to next project.
  4. After all projects, print multi-project summary:
     ---
     MULTI-PROJECT RUN COMPLETE
       {project1}: {completed}/{total} completed
       {project2}: {completed}/{total} completed
       ...
     ---
  5. If --overnight is also set with --all, apply the overnight wrapper to the entire
     multi-project run (not per project).
  File: packages/cli/src/commands/__tests__/run-multi.test.ts
  Tests (mock executeRun since we don't want to actually run Docker):
  1. --all with 0 registered projects → prints "no projects" message.
  2. --all with multiple projects → executeRun called once per project.
  3. --all generates unique runId per project.
  Use vi.mock to mock the executeRun function and verify call arguments.

## T5: Enhanced run summary with per-project breakdown
- STATUS: pending
- FILES: packages/cli/src/commands/status.ts, packages/cli/src/engine/summary.ts
- VERIFY: cd packages/cli && pnpm build && pnpm vitest run
- CRITIC: skip
- PUSH: auto
- SPEC: Create a summary module and enhance the status command for multi-project views.
  File: packages/cli/src/engine/summary.ts
  Export interface ProjectSummary { projectId: string; displayName: string; runId: string | null;
  status: string | null; total: number; completed: number; failed: number; skipped: number;
  pendingMerge: number; startedAt: string | null; finishedAt: string | null; }
  Export function getAllProjectSummaries(db: Database): ProjectSummary[]
  For each project, query the latest run and compute summary stats.
  Uses getAllProjects from db/queries.ts and getTaskResults for each run.
  Export function formatSummaryTable(summaries: ProjectSummary[]): string
  Returns a formatted table string using chalk:
  ---
  PROJECT              LAST RUN     STATUS        TASKS         MERGE
  mit-nexus            2h ago       completed     10/10 ✓       3 pending
  securatrack          5h ago       completed     8/10 (2 fail) 8 pending
  agentic-research     never        —             —             —
  ---
  Color coding: all completed = green row, has failures = yellow, never run = dim.
  File: packages/cli/src/commands/status.ts
  Extend the status command:
  1. When called with no project argument AND multiple projects are registered,
     use formatSummaryTable to show the overview table first.
  2. Then show detailed status for each project that has a recent run (last 24h).
  3. When called with a specific project, show only that project's detailed status
     (same as T1 behavior).
  4. Add --summary flag that shows ONLY the table, no per-project detail.
     Useful for quick morning glance.
  This task builds on T1 — don't break the single-project status behavior.
  Just add the multi-project overview when appropriate.
