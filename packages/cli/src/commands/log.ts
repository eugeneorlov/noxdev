import type { Command } from "commander";
import type { Database } from "../db/connection.js";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import chalk from "chalk";
import { getDb } from "../db/index.js";
import { formatCost, formatNumber } from "../lib/format.js";

interface TaskResultRow {
  id: number;
  run_id: string;
  task_id: string;
  title: string;
  status: string;
  exit_code: number | null;
  auth_mode: string | null;
  critic_mode: string | null;
  attempt: number;
  commit_sha: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  dev_log_file: string | null;
  critic_log_file: string | null;
  diff_file: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  model: string | null;
  auth_mode_cost: string | null;
  cost_usd: number | null;
}

interface TaskCacheRow {
  spec: string | null;
  files: string | null;
  verify: string | null;
  critic: string | null;
}

function inferProjectFromCwd(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    const configPath = path.join(dir, '.noxdev', 'config.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        return config.project || null;
      } catch {
        return null;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

function statusBadge(status: string): string {
  switch (status) {
    case "completed":
      return chalk.green("COMPLETED");
    case "failed":
      return chalk.red("FAILED");
    case "skipped":
      return chalk.yellow("SKIPPED");
    case "completed_retry":
      return chalk.green("COMPLETED") + chalk.green(" (retry)");
    default:
      return status.toUpperCase();
  }
}


export async function logCommand(project?: string, taskId?: string): Promise<void> {
  const db = getDb();

  // A. If project is undefined, try to infer from cwd
  if (project === undefined) {
    const inferred = inferProjectFromCwd();
    if (inferred) {
      project = inferred;
    } else {
      // Print usage help and exit 0
      console.log("Usage: noxdev log <project> [task-id]");
      console.log("  noxdev log mit-nexus              List tasks from most recent run");
      console.log("  noxdev log mit-nexus T3           Show detail for task T3");
      console.log("");
      console.log("Run from inside a project worktree to infer project automatically.");
      return;
    }
  }

  // B. Validate the project exists
  const projectRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(project);
  if (!projectRow) {
    console.error(chalk.red(`✖ No such project: "${project}"`));
    console.error(chalk.gray(`  Registered projects:`));
    const all = db.prepare('SELECT id, display_name FROM projects ORDER BY id').all() as Array<{id: string, display_name: string}>;
    for (const p of all) {
      console.error(chalk.gray(`    ${p.id}  (${p.display_name})`));
    }
    process.exit(1);
  }

  // C. Find the most recent run for this project
  const mostRecentRun = db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1').get(project) as any;
  if (!mostRecentRun) {
    console.log(`No runs recorded for ${project}. Run: noxdev run ${project}`);
    return;
  }

  // D. If taskId is undefined (project-only mode, list tasks)
  if (taskId === undefined) {
    const tasks = db.prepare(`
      SELECT tr.task_id, tr.title, tr.status, tr.duration_seconds, tr.commit_sha
      FROM task_results tr
      WHERE run_id = ?
      ORDER BY started_at ASC
    `).all(mostRecentRun.id) as Array<{task_id: string, title: string, status: string, duration_seconds: number | null, commit_sha: string | null}>;

    // Print header
    const displayName = (projectRow as any).display_name;
    const startedAt = mostRecentRun.started_at;
    const relativeTime = new Date(startedAt).toLocaleString(); // Simple formatting

    console.log(`noxdev log: ${displayName}  ·  run ${mostRecentRun.id}  ·  started ${relativeTime}`);

    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const total = tasks.length;

    console.log(`${completed}/${total} tasks completed, ${failed} failed`);
    console.log("");

    // Print task list
    for (const task of tasks) {
      const statusColor = task.status === 'completed' ? chalk.green(task.status.toUpperCase()) :
                         task.status === 'failed' ? chalk.red(task.status.toUpperCase()) :
                         chalk.yellow(task.status.toUpperCase());

      const duration = task.duration_seconds != null ? `${task.duration_seconds}s` : '—';
      const commitSha = task.commit_sha ? task.commit_sha.slice(0, 7) : '—';

      // Truncate title to fit 80 columns
      const maxTitleLength = 40;
      const truncatedTitle = task.title.length > maxTitleLength ?
                            task.title.slice(0, maxTitleLength - 3) + '...' : task.title;

      console.log(`${task.task_id}  ${statusColor}   ${duration.padStart(4)}   ${commitSha}  ${truncatedTitle}`);
    }

    console.log("");
    console.log(`For detail: noxdev log ${project} <task-id>`);
    return;
  }

  // E. If taskId is provided (detail mode)
  const taskResult = db.prepare('SELECT * FROM task_results WHERE run_id = ? AND task_id = ? LIMIT 1').get(mostRecentRun.id, taskId) as TaskResultRow | undefined;
  if (!taskResult) {
    console.error(`✖ No task ${taskId} in most recent run of ${project}.`);
    const allTaskIds = db.prepare('SELECT task_id FROM task_results WHERE run_id = ? ORDER BY started_at ASC').all(mostRecentRun.id) as Array<{task_id: string}>;
    console.error(`  Last run had: ${allTaskIds.map(t => t.task_id).join(', ')}`);
    process.exit(1);
  }

  // Query the tasks cache for spec/files/verify/critic fields
  const taskCache = db.prepare('SELECT spec, files, verify, critic FROM tasks WHERE run_id = ? AND task_id = ?').get(mostRecentRun.id, taskId) as TaskCacheRow | undefined;

  // Render the detail view (reusing existing logic but without History section)
  console.log(`noxdev log: ${chalk.bold(taskId)} — ${taskResult.title}`);
  console.log("");
  console.log(`Latest run: ${taskResult.run_id} · ${statusBadge(taskResult.status)} · attempt ${taskResult.attempt}`);
  console.log("");

  if (taskCache?.spec) {
    console.log("Spec:");
    for (const line of taskCache.spec.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");
  }

  console.log(`Files: ${taskCache?.files || "none specified"}`);
  console.log(`Verify: ${taskCache?.verify || "none"}`);
  console.log(`Critic: ${taskCache?.critic || taskResult.critic_mode || "review"}`);
  console.log("");

  console.log("Execution:");
  console.log(`  Started:   ${taskResult.started_at || "unknown"}`);
  console.log(`  Finished:  ${taskResult.finished_at || "unknown"}`);
  console.log(`  Duration:  ${taskResult.duration_seconds != null ? `${taskResult.duration_seconds}s` : "unknown"}`);
  console.log(`  Exit code: ${taskResult.exit_code ?? "none"}`);
  console.log(`  Auth mode: ${taskResult.auth_mode || "unknown"}`);
  console.log(`  Commit:    ${taskResult.commit_sha || "none"}`);
  console.log("");

  // Cost section
  if (taskResult.cost_usd === null && taskResult.model === null) {
    console.log("Cost: no data captured");
  } else if (taskResult.model) {
    console.log("Cost:");
    console.log(`  Model              ${taskResult.model}`);
    console.log(`  Input tokens       ${formatNumber(taskResult.input_tokens)}`);
    console.log(`  Output tokens      ${formatNumber(taskResult.output_tokens)}`);
    console.log(`  Cache read         ${formatNumber(taskResult.cache_read_tokens)}`);
    console.log(`  Cache write        ${formatNumber(taskResult.cache_write_tokens)}`);

    if (taskResult.auth_mode_cost === 'api') {
      console.log(`  Cost               ${formatCost(taskResult.cost_usd, 4)}  (api)`);
    } else if (taskResult.auth_mode_cost === 'max') {
      console.log(`  Cost               ${formatCost(taskResult.cost_usd, 4)} equivalent  (max)`);
    } else {
      console.log(`  Cost               ${formatCost(taskResult.cost_usd, 4)}`);
    }
  } else {
    console.log("Cost: no data captured");
  }
  console.log("");

  console.log("Logs:");
  console.log(`  Dev agent:  ${taskResult.dev_log_file || "not available"}`);
  console.log(`  Critic:     ${taskResult.critic_log_file || "not available"}`);
  console.log(`  Diff:       ${taskResult.diff_file || "not available"}`);

  if (taskResult.dev_log_file) {
    console.log("");
    console.log(`View dev agent log? Run: cat ${taskResult.dev_log_file}`);
  }

  // NOTE: History section is intentionally removed per requirements
}


export function registerLog(program: Command): void {
  program
    .command("log [project] [taskId]")
    .description("Show task details from a project's most recent run")
    .action((project?: string, taskId?: string) => {
      try {
        const db = getDb();
        logCommand(project, taskId);
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
