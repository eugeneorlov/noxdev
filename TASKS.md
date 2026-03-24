# noxdev Fix: Add remove command

## T1: Add noxdev remove command to unregister projects
- STATUS: done
- FILES: packages/cli/src/commands/remove.ts, packages/cli/src/index.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js remove --help
- CRITIC: skip
- PUSH: auto
- SPEC: Add a `noxdev remove <project>` command that cleanly unregisters a project.
  Step 1: Create packages/cli/src/commands/remove.ts
  The command takes a required project argument (the project ID).
  It must:
  1. Verify the project exists in SQLite:
     `SELECT id, worktree_path FROM projects WHERE id = ?`
     If not found, print `chalk.red('✖ Project not found: <id>')` and exit 1.
  2. Ask for confirmation before deleting. Print:
     `chalk.yellow('⚠ This will remove project "<id>" from noxdev.')` then
     `chalk.gray('  SQLite records (runs, tasks, results) will be deleted.')` then
     `chalk.gray('  Worktree at <path> will be removed.')` then
     `chalk.gray('  Your repo and main branch are NOT affected.')`
     Use readline to prompt: `Confirm? [y/N] `. Default is N. Only proceed on 'y' or 'Y'.
  3. Delete from SQLite in order (foreign keys):
     ```typescript
     const db = getDb();
     db.exec('BEGIN');
     try {
       db.prepare('DELETE FROM task_results WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)').run(projectId);
       db.prepare('DELETE FROM tasks WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)').run(projectId);
       db.prepare('DELETE FROM runs WHERE project_id = ?').run(projectId);
       db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
       db.exec('COMMIT');
     } catch (err) {
       db.exec('ROLLBACK');
       throw err;
     }
     ```
  4. Remove the git worktree if it exists:
     ```typescript
     try {
       execSync(`git worktree remove ${worktreePath} --force`, { stdio: 'pipe' });
     } catch {
       // Worktree may already be gone, that's fine
     }
     ```
  5. Print success: `chalk.green('✓ Project "<id>" removed from noxdev.')`
  Step 2: Register the command in packages/cli/src/index.ts
  Import and call the register function, following the same pattern as
  the other commands. Find where registerProjects, registerRun, etc. are
  called and add registerRemove in the same block.
  Add a --force flag that skips the confirmation prompt:
  `.option('-f, --force', 'Skip confirmation prompt')`
  Import chalk from 'chalk', execSync from 'node:child_process',
  readline from 'node:readline'.
  Do NOT modify any other commands or files.
