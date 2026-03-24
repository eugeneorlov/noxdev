# noxdev Fixes: Auto-init + Remove cleanup

# Session 1: T1 (auto-init), T2 (remove worktree fix)

## T1: Auto-create initial commit when noxdev init runs on empty repo
- STATUS: done
- FILES: packages/cli/src/commands/init.ts
- VERIFY: pnpm build && rm -rf /tmp/test-init-empty /home/eugene218/worktrees/test-init-empty && mkdir -p /tmp/test-init-empty && cd /tmp/test-init-empty && git init && node /home/eugene218/projects/noxdev/packages/cli/dist/index.js init test-init-empty --repo /tmp/test-init-empty 2>&1 | grep -q "Registered" && echo "PASS" || echo "FAIL"
- CRITIC: skip
- PUSH: auto
- SPEC: When noxdev init detects an empty repo (no commits), it currently
  shows an error and exits. Instead, it should auto-create an initial commit
  so the user doesn't need to do it manually.
  In packages/cli/src/commands/init.ts, find the block that checks for
  empty repos (the `git rev-parse HEAD` try/catch added in Phase G T3).
  Replace the error + exit with auto-initialization:
  ```typescript
  try {
    execSync('git rev-parse HEAD', { cwd: repoPath, stdio: 'pipe' });
  } catch {
    // Empty repo — create initial commit automatically
    console.log(chalk.yellow('  ⚠ Empty repository detected. Creating initial commit...'));
    const readmePath = path.join(repoPath, 'README.md');
    if (!existsSync(readmePath)) {
      writeFileSync(readmePath, `# ${project}\n`);
    }
    execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: repoPath, stdio: 'pipe' });
    console.log(chalk.green('  ✓ Initial commit created'));
  }
  ```
  Import writeFileSync from 'node:fs' and path from 'node:path' if not
  already imported. existsSync should already be imported.
  Do NOT change any other init logic — worktree creation, config writing,
  SQLite registration, Docker check all stay the same.

## T2: Fix noxdev remove to actually delete worktree directory
- STATUS: done
- FILES: packages/cli/src/commands/remove.ts
- VERIFY: pnpm build
- CRITIC: skip
- PUSH: auto
- SPEC: The remove command deletes SQLite records but fails to remove the
  worktree directory. Two problems:
  1. `git worktree remove` needs `cwd` set to the repo path, but the repo
     path is read from the project row which gets deleted before cleanup.
  2. Even with correct cwd, `git worktree remove` may fail if the repo
     itself was deleted.
  Fix in packages/cli/src/commands/remove.ts:
  1. Read BOTH `repo_path` and `worktree_path` from the project row BEFORE
     deleting any database records. The query is already there:
     `SELECT id, worktree_path FROM projects WHERE id = ?`
     Change it to also select repo_path:
     `SELECT id, worktree_path, repo_path FROM projects WHERE id = ?`
  2. Move the worktree cleanup to happen BEFORE the database deletion.
  3. Replace the `git worktree remove` approach with a two-step cleanup
     that handles all edge cases:
     ```typescript
     // Step 1: Try git worktree remove (clean way)
     try {
       execSync(`git worktree remove "${worktreePath}" --force`, {
         cwd: repoPath,
         stdio: 'pipe'
       });
     } catch {
       // Step 2: If git fails (repo gone, worktree detached), just rm -rf
       try {
         rmSync(worktreePath, { recursive: true, force: true });
       } catch {
         // Directory may already be gone, that's fine
       }
     }
     ```
  4. After cleanup, print what was removed:
     ```typescript
     if (!existsSync(worktreePath)) {
       console.log(chalk.green(`  ✓ Worktree removed: ${worktreePath}`));
     }
     ```
  Import rmSync and existsSync from 'node:fs' if not already imported.
  The final order should be: read DB → confirm → remove worktree → delete DB → print success.
  Do NOT change the SQLite deletion logic or the confirmation prompt.
