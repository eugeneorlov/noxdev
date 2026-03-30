# noxdev: Robust merge flow fix — case-insensitive SQL + full flow audit

## T1: Audit and fix all case-sensitive SQL comparisons across noxdev codebase
- STATUS: done
- FILES: packages/cli/src/merge/interactive.ts, packages/cli/src/db/queries.ts, packages/cli/src/commands/run.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/log.ts, packages/cli/src/commands/merge.ts, packages/dashboard/src/api/routes/runs.ts, packages/dashboard/src/api/routes/merge.ts, packages/dashboard/src/api/routes/projects.ts
- VERIFY: cd packages/cli && pnpm build && cd ../../packages/dashboard && pnpm build && cd ../.. && grep -rn "status IN\|status =\|merge_decision =\|merge_decision IN" packages/cli/src packages/dashboard/src | grep -v "LOWER(" | grep -v node_modules | grep -v ".d.ts" | wc -l | grep -q "^0$"
- CRITIC: skip
- PUSH: auto
- SPEC: There is a case-sensitivity bug in noxdev's SQL queries. SQLite string
  comparison is case-sensitive by default. The run engine writes status values
  in UPPERCASE (e.g. 'COMPLETED', 'FAILED') and merge_decision in lowercase
  (e.g. 'pending', 'approved'). But various query functions compare against
  hardcoded strings without normalizing case. This causes silent query misses —
  most critically, `noxdev merge` returns "No merge tasks" even when 18 tasks
  are pending.

  CONTEXT: HOW THE MERGE FLOW SHOULD WORK

  noxdev has a three-tier push model that controls what happens after a task
  completes successfully during `noxdev run`:

  PUSH: auto
    1. Task runs in Docker, produces commits on worktree branch (noxdev/<project>)
    2. On success, run engine sets merge_decision = 'approved' in SQLite immediately
    3. When user runs `noxdev merge <project>`:
       - These tasks are NOT shown in the interactive approve/reject prompt
       - They are listed as a summary: "✓ N auto-approved tasks (PUSH: auto)"
       - They are included in the git merge from worktree branch into main
    4. User never has to individually approve auto tasks

  PUSH: gate
    1. Task runs in Docker, produces commits on worktree branch (noxdev/<project>)
    2. On success, run engine sets merge_decision = 'pending' in SQLite
    3. When user runs `noxdev merge <project>`:
       - These tasks ARE shown in the interactive approve/reject prompt
       - User sees commit SHA, diff stats, can view full diff
       - User chooses [a]pprove, [r]eject, [d]iff, or [s]kip per task
       - Approved tasks get merge_decision = 'approved'
       - Rejected tasks get reverted on the worktree branch
       - Skipped tasks remain 'pending' for next merge
    4. After interactive review, all approved tasks (auto + interactive) are
       merged via `git merge <worktree-branch>` into main

  PUSH: manual
    Same as gate — merge_decision = 'pending', requires interactive review.

  THE FIX — TWO PARTS:

  PART 1: Case-insensitive SQL everywhere

  Search the ENTIRE codebase (packages/cli/src/ and packages/dashboard/src/)
  for every SQL query that compares against status or merge_decision string
  values. For every such comparison, wrap the column in LOWER():

  WRONG (fragile):
    WHERE status IN ('COMPLETED', 'COMPLETED_RETRY')
    WHERE status = 'completed'
    WHERE merge_decision = 'pending'

  RIGHT (robust):
    WHERE LOWER(status) IN ('completed', 'completed_retry')
    WHERE LOWER(status) = 'completed'
    WHERE LOWER(merge_decision) = 'pending'

  Always use lowercase on the right side of the comparison. LOWER() on the
  column ensures it works regardless of what case the write side uses.

  Files to audit (check EVERY .ts file, not just these — these are the known ones):
  - packages/cli/src/merge/interactive.ts — getMergeCandidates(), getAutoApprovedTasks()
  - packages/cli/src/db/queries.ts — any status or merge_decision filters
  - packages/cli/src/commands/status.ts — status summary queries
  - packages/cli/src/commands/log.ts — task log queries
  - packages/cli/src/commands/run.ts — any post-run queries
  - packages/dashboard/src/api/routes/runs.ts — API queries
  - packages/dashboard/src/api/routes/merge.ts — merge decision queries
  - packages/dashboard/src/api/routes/projects.ts — project listing queries

  Use grep to find ALL instances:
    grep -rn "status\|merge_decision" packages/cli/src packages/dashboard/src --include="*.ts" | grep -i "select\|where\|and\|IN ("

  PART 2: Verify the PUSH: auto flow works end-to-end

  In packages/cli/src/commands/run.ts, find where task_results are INSERT'd
  or UPDATE'd after a successful task. Verify that when the task's push mode
  is 'auto' AND the task succeeded (status is COMPLETED or COMPLETED_RETRY),
  merge_decision is set to 'approved' (not 'pending'). If it is still
  hardcoded to 'pending' for all tasks regardless of push mode, fix it:

  Pseudocode:
  ```
  const mergeDecision = (task.push === 'auto' && isSuccessStatus(status))
    ? 'approved'
    : 'pending';
  // Use mergeDecision in the INSERT/UPDATE instead of hardcoded 'pending'
  // If 'approved', also set merged_at to new Date().toISOString()
  ```

  The push mode comes from the parsed TASKS.md task entry. Check how the
  parser stores it (likely task.push or similar) and use that value.

  After making all changes, run a final grep to confirm zero unprotected
  string comparisons remain:
    grep -rn "status IN\|status =\|merge_decision =\|merge_decision IN" packages/cli/src packages/dashboard/src --include="*.ts" | grep -v "LOWER(" | grep -v node_modules | grep -v ".d.ts"

  This should return ZERO lines.

  Do NOT change: the SQLite schema, the values written to the database
  (keep writing UPPERCASE status, lowercase merge_decision — that's fine),
  the git merge logic, the revert logic, or any CLI command signatures.
