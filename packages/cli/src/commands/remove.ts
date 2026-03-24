import type { Command } from "commander";
import { execSync } from "node:child_process";
import readline from "node:readline";
import chalk from "chalk";
import { getDb } from "../db/index.js";

interface ProjectRow {
  id: string;
  worktree_path: string;
}

function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function registerRemove(program: Command): void {
  program
    .command("remove")
    .description("Remove a project from noxdev")
    .argument("<project>", "project ID to remove")
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (projectId: string, opts: { force?: boolean }) => {
      try {
        await runRemove(projectId, opts.force ?? false);
      } catch (err: unknown) {
        console.error(
          chalk.red(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exitCode = 1;
      }
    });
}

async function runRemove(projectId: string, force: boolean): Promise<void> {
  const db = getDb();

  // 1. Verify the project exists in SQLite
  const project = db
    .prepare("SELECT id, worktree_path FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!project) {
    console.error(chalk.red(`✖ Project not found: ${projectId}`));
    process.exit(1);
  }

  // 2. Ask for confirmation unless --force is used
  if (!force) {
    console.log(chalk.yellow(`⚠ This will remove project "${projectId}" from noxdev.`));
    console.log(chalk.gray('  SQLite records (runs, tasks, results) will be deleted.'));
    console.log(chalk.gray(`  Worktree at ${project.worktree_path} will be removed.`));
    console.log(chalk.gray('  Your repo and main branch are NOT affected.'));
    console.log();

    const confirmed = await askConfirmation('Confirm? [y/N] ');
    if (!confirmed) {
      console.log('Operation cancelled.');
      return;
    }
  }

  // 3. Delete from SQLite in order (foreign keys)
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

  // 4. Remove the git worktree if it exists
  try {
    execSync(`git worktree remove ${project.worktree_path} --force`, { stdio: 'pipe' });
  } catch {
    // Worktree may already be gone, that's fine
  }

  // 5. Print success
  console.log(chalk.green(`✓ Project "${projectId}" removed from noxdev.`));
}