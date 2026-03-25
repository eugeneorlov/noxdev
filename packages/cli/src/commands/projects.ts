import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { getDb } from "../db/index.js";

interface ProjectRow {
  id: string;
  display_name: string;
  repo_path: string;
  worktree_path: string;
  started_at: string | null;
  completed: number | null;
  failed: number | null;
  run_status: string | null;
}

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate + "Z").getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 60) return `${Math.max(diffMin, 1)}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return isoDate.slice(0, 10);
}

function countPendingTasks(repoPath: string): number {
  const tasksPath = join(repoPath, "TASKS.md");
  if (!existsSync(tasksPath)) return -1;
  try {
    const content = readFileSync(tasksPath, "utf-8");
    const matches = content.match(/^- STATUS:\s*pending/gim);
    return matches ? matches.length : 0;
  } catch {
    return -1;
  }
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

export function registerProjects(program: Command): void {
  program
    .command("projects")
    .description("List all projects")
    .action(() => {
      try {
        const db = getDb();

        const rows = db
          .prepare(
            `SELECT p.id, p.display_name, p.repo_path, p.worktree_path,
                    r.started_at, r.completed, r.failed, r.status AS run_status
             FROM projects p
             LEFT JOIN runs r ON r.id = (
               SELECT r2.id FROM runs r2
               WHERE r2.project_id = p.id
               ORDER BY r2.started_at DESC LIMIT 1
             )
             ORDER BY p.display_name`,
          )
          .all() as ProjectRow[];

        if (rows.length === 0) {
          console.log(
            "No projects registered. Run: noxdev init <project> --repo <path>",
          );
          return;
        }

        // Header
        const header =
          chalk.bold(pad("PROJECT", 20)) +
          chalk.bold(pad("LAST RUN", 14)) +
          chalk.bold(pad("STATUS", 20)) +
          chalk.bold("TASKS");
        console.log(header);
        console.log("-".repeat(60));

        // Rows
        for (const row of rows) {
          const project = pad(row.display_name, 20);

          const lastRun = row.started_at ? relativeTime(row.started_at) : "never";
          const lastRunCol = pad(lastRun, 14);

          let statusCol: string;
          if (row.started_at) {
            const c = row.completed ?? 0;
            const f = row.failed ?? 0;
            const plain = `${c} done / ${f} fail`;
            const trailing = " ".repeat(Math.max(0, 20 - plain.length));
            statusCol = `${chalk.green(String(c))} done / ${chalk.red(String(f))} fail${trailing}`;
          } else {
            statusCol = pad("-", 20);
          }

          const pending = countPendingTasks(row.worktree_path);
          const tasksCol = pending >= 0 ? String(pending) : "-";

          console.log(`${project}${lastRunCol}${statusCol}${tasksCol}`);
        }
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
