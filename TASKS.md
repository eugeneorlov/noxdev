# noxdev Fix: Auto-commit TASKS.md after run

## T1: Auto-commit TASKS.md status updates after noxdev run completes
- STATUS: done
- FILES: packages/cli/src/commands/run.ts
- VERIFY: pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: After noxdev run finishes all tasks (or hits circuit breaker), TASKS.md
  has been modified with status updates (pending → done/failed) but is left
  as an unstaged change. This requires a manual git add + commit before merging.
  Fix: at the END of the run command, after the summary is printed and all
  tasks are complete, add an auto-commit of TASKS.md on the worktree branch.
  In packages/cli/src/commands/run.ts, find the section after the task loop
  completes (after the summary/status output). Add:
  ```typescript
  // Auto-commit TASKS.md status updates
  try {
    const worktreePath = project.worktree_path;
    execSync('git add TASKS.md', { cwd: worktreePath, stdio: 'pipe' });
    execSync('git commit -m "noxdev: update task statuses"', { cwd: worktreePath, stdio: 'pipe' });
    console.log(chalk.gray('  ✓ TASKS.md status updates committed'));
  } catch {
    // Silently ignore — TASKS.md might not exist or have no changes
  }
  ```
  This must run AFTER all task processing is done, AFTER the run summary
  is printed, but BEFORE the process exits. It should be the very last
  action in the run command.
  The commit message uses "noxdev:" prefix (not "noxdev(T#):") to distinguish
  it from task commits.
  Import execSync from 'node:child_process' if not already imported.
  Do NOT change any other run logic — task loop, circuit breaker, retry,
  Docker launches, SQLite writes all stay the same.
