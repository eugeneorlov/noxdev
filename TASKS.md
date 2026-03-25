# noxdev Fix: Auto-sync worktree before run

## T1: Merge base branch into worktree at start of noxdev run
- STATUS: done
- FILES: packages/cli/src/commands/run.ts, packages/cli/src/db/schema.sql
- VERIFY: pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: Before running any tasks, noxdev run should sync the worktree with
  the project's base branch (main/master) so agents always work on current code.
  In packages/cli/src/commands/run.ts, add a sync step AFTER loading the
  project config but BEFORE the task loop starts:
  ```typescript
  // Sync worktree with base branch before running tasks
  try {
    const baseBranch = execSync('git symbolic-ref --short HEAD', {
      cwd: project.repo_path,
      encoding: 'utf-8'
    }).trim();
    execSync(`git merge ${baseBranch} --no-edit`, {
      cwd: project.worktree_path,
      stdio: 'pipe'
    });
    console.log(chalk.gray(`  ✓ Worktree synced with ${baseBranch}`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('CONFLICT')) {
      console.error(chalk.red('✖ Merge conflict syncing worktree with base branch.'));
      console.error(chalk.gray('  Resolve manually: cd ' + project.worktree_path));
      console.error(chalk.gray('  Then re-run: noxdev run ' + project.id));
      process.exit(1);
    }
    // If merge fails for other reasons (already up to date, etc), continue
    console.log(chalk.gray('  ✓ Worktree up to date'));
  }
  ```
  This runs git symbolic-ref on the REPO (not the worktree) to get the
  base branch name, then merges it into the worktree. If there's a merge
  conflict, it stops with a clear error instead of running tasks on
  conflicted code. If the merge is clean or already up to date, it continues.
  Import execSync from 'node:child_process' if not already imported.
  Place this step right after the "Starting run" log line but before
  parsing TASKS.md.
  Do NOT change any other run logic.
