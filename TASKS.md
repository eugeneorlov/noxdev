# noxdev Phase G: Pre-Publish Polish

# Dependencies: Phase F complete, all manual fixes committed
# Gate: pnpm build && noxdev dashboard (visual check)
#
# Session 1: T1, T2 (dashboard UX — merge badge + approve clarity)
# Session 2: T3, T4 (CLI UX — init error handling)
#
# All tasks are small, targeted fixes. Each should complete in under 2 minutes.

## T1: Hide merge badge on task rows for auto-push tasks, prefix for gate tasks
- STATUS: done
- FILES: packages/dashboard/src/components/TaskRow.tsx
- VERIFY: cd packages/dashboard && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: The task row shows a grey "pending" badge for merge_decision on every task.
  This is confusing because it looks like the task itself is pending, not the merge.
  Fix in packages/dashboard/src/components/TaskRow.tsx:
  1. If the task's push_mode is 'auto' and merge_decision is 'pending', do NOT
     show the merge badge at all. Auto-push tasks don't need manual merge review.
  2. If the task's push_mode is 'gate' (or if push_mode is not available in the
     data, fall back to always showing), prefix the badge text:
     - "pending" → show "merge: pending" in grey
     - "approved" → show "merge: approved" in green
     - "rejected" → show "merge: rejected" in red
  3. If merge_decision is null or undefined, don't render any merge badge.
  The merge badge is the small pill/span at the right side of the task row,
  after the commit SHA. Find it by looking for where merge_decision is rendered.
  Do NOT change the StatusBadge component (that's for task status, not merge).
  Do NOT change any other task row behavior — click to expand, chevron rotation,
  duration, commit SHA all stay the same.

## T2: Add context note to Approve/Reject buttons on task detail page
- STATUS: done
- FILES: packages/dashboard/src/pages/TaskDetail.tsx
- VERIFY: cd packages/dashboard && pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: The Approve/Reject buttons on the task detail page update the SQLite
  database but don't execute the actual git merge. Users need to know this.
  In packages/dashboard/src/pages/TaskDetail.tsx, find the Merge section
  where the Approve and Reject buttons are rendered.
  Add a small help text below the buttons:
  ```tsx
  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
    Records your decision. Run <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">noxdev merge</code> in terminal to execute.
  </p>
  ```
  Place this immediately after the div containing the Approve/Reject buttons.
  Only show this text when merge_decision is 'pending' (once decided, hide it).
  Do NOT change the button behavior, styling, or the POST request logic.

## T3: Friendly error when noxdev init runs on empty repo
- STATUS: done
- FILES: packages/cli/src/commands/init.ts
- VERIFY: pnpm build && mkdir -p /tmp/test-empty && cd /tmp/test-empty && git init && node ~/projects/noxdev/packages/cli/dist/index.js init test-empty --repo /tmp/test-empty 2>&1 | grep -i "commit" && rm -rf /tmp/test-empty
- CRITIC: skip
- PUSH: auto
- SPEC: When noxdev init runs on a repo with no commits, git worktree fails with
  "fatal: Not a valid object name: 'main'". This is confusing.
  In packages/cli/src/commands/init.ts, BEFORE attempting to create the worktree,
  add a check for whether the repo has any commits:
  ```typescript
  try {
    execSync('git rev-parse HEAD', { cwd: repoPath, stdio: 'pipe' });
  } catch {
    console.error(chalk.red('✖ Repository has no commits.'));
    console.error(chalk.gray('  Make an initial commit first:'));
    console.error(chalk.gray('  git add . && git commit -m "init"'));
    process.exit(1);
  }
  ```
  Add this check right after the "Repository validated" success message,
  before the worktree creation step.
  Import execSync from 'node:child_process' if not already imported.

## T4: Detect default branch instead of hardcoding main
- STATUS: done
- FILES: packages/cli/src/commands/init.ts
- VERIFY: pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: noxdev init hardcodes "main" as the base branch for git worktree.
  Repos using "master" or other default branch names fail.
  In packages/cli/src/commands/init.ts, replace the hardcoded "main" with
  dynamic detection. Find the line where the worktree is created, which
  looks like:
  ```typescript
  execSync(`git worktree add -b noxdev/${project} ${worktreePath} main`, ...
  ```
  Replace "main" with a detected default branch:
  ```typescript
  // Detect the default branch name
  const defaultBranch = execSync('git symbolic-ref --short HEAD', {
    cwd: repoPath,
    encoding: 'utf-8'
  }).trim();
  
  execSync(`git worktree add -b noxdev/${project} ${worktreePath} ${defaultBranch}`, ...
  ```
  This works because HEAD points to the current branch, which is the
  default branch in a fresh repo.
  Do NOT change anything else in the init command.
