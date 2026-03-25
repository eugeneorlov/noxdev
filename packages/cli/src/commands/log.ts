import type { Command } from "commander";
import type Database from "better-sqlite3";
import chalk from "chalk";
import { getDb } from "../db/index.js";

interface TaskResultRow {
  id: number;
  run_id: string;
  task_id: string;
  title: string;
  status: string;
  exit_code: number | null;
  auth_mode: string | null;
  critic_mode: string | null;
  push_mode: string | null;
  attempt: number;
  commit_sha: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  dev_log_file: string | null;
  critic_log_file: string | null;
  diff_file: string | null;
  merge_decision: string;
  merged_at: string | null;
}

interface TaskCacheRow {
  spec: string | null;
  files: string | null;
  verify: string | null;
  critic: string | null;
  push: string | null;
}

function statusBadge(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return chalk.green("COMPLETED");
    case "FAILED":
      return chalk.red("FAILED");
    case "SKIPPED":
      return chalk.yellow("SKIPPED");
    case "COMPLETED_RETRY":
      return chalk.green("COMPLETED") + chalk.green(" (retry)");
    default:
      return status.toUpperCase();
  }
}

export function showTaskLog(db: Database.Database, taskId: string): void {
  const results = db
    .prepare(`SELECT * FROM task_results WHERE task_id = ? ORDER BY id DESC`)
    .all(taskId) as TaskResultRow[];

  if (results.length === 0) {
    console.log(chalk.red(`No results found for task: ${taskId}`));
    return;
  }

  const latest = results[0];

  const taskCache = db
    .prepare(
      `SELECT spec, files, verify, critic, push FROM tasks WHERE task_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(taskId) as TaskCacheRow | undefined;

  console.log(`noxdev log: ${chalk.bold(taskId)} — ${latest.title}`);
  console.log("");
  console.log(
    `Latest run: ${latest.run_id} · ${statusBadge(latest.status)} · attempt ${latest.attempt}`,
  );
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
  console.log(
    `Critic: ${taskCache?.critic || latest.critic_mode || "review"}  Push: ${taskCache?.push || latest.push_mode || "auto"}`,
  );
  console.log("");

  console.log("Execution:");
  console.log(`  Started:   ${latest.started_at || "unknown"}`);
  console.log(`  Finished:  ${latest.finished_at || "unknown"}`);
  console.log(
    `  Duration:  ${latest.duration_seconds != null ? `${latest.duration_seconds}s` : "unknown"}`,
  );
  console.log(`  Exit code: ${latest.exit_code ?? "none"}`);
  console.log(`  Auth mode: ${latest.auth_mode || "unknown"}`);
  console.log(`  Commit:    ${latest.commit_sha || "none"}`);
  console.log("");

  console.log(`Merge: ${latest.merge_decision}`);
  console.log("");

  console.log("Logs:");
  console.log(`  Dev agent:  ${latest.dev_log_file || "not available"}`);
  console.log(`  Critic:     ${latest.critic_log_file || "not available"}`);
  console.log(`  Diff:       ${latest.diff_file || "not available"}`);

  if (latest.dev_log_file) {
    console.log("");
    console.log(`View dev agent log? Run: cat ${latest.dev_log_file}`);
  }

  if (results.length > 1) {
    console.log("");
    console.log("History:");
    for (const r of results) {
      const dur =
        r.duration_seconds != null ? `${r.duration_seconds}s` : "unknown";
      console.log(
        `  Run ${r.run_id}: ${statusBadge(r.status)} · ${dur} · attempt ${r.attempt}`,
      );
    }
  }
}

export function registerLog(program: Command): void {
  program
    .command("log")
    .description("Show task log")
    .argument("<task-id>", "task identifier")
    .action((taskId: string) => {
      try {
        const db = getDb();
        showTaskLog(db, taskId);
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
