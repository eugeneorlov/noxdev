import type { Command } from "commander";
import type { Database } from "../db/connection.js";
import chalk from "chalk";
import { getDb } from "../db/index.js";
import {
  getLatestRun,
  getTaskResults,
  getProject,
  getAllProjects,
} from "../db/queries.js";
import {
  getAllProjectSummaries,
  formatSummaryTable,
} from "../engine/summary.js";
import { formatCost } from "../lib/format.js";

interface RunRow {
  id: string;
  project_id: string;
  started_at: string;
  finished_at: string | null;
  total_tasks: number;
  completed: number;
  failed: number;
  skipped: number;
  status: string;
}

interface TaskResultRow {
  task_id: string;
  title: string;
  status: string;
  commit_sha: string | null;
  duration_seconds: number | null;
  attempt: number;
}

interface ProjectRow {
  id: string;
  display_name: string;
}

interface RunCostRow {
  api_cost: number | null;
  max_cost: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const dateStr = isoDate.endsWith("Z") ? isoDate : isoDate + "Z";
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 60) return `${Math.max(diffMin, 1)}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return isoDate.slice(0, 10);
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

function getRunCost(db: Database, runId: string): RunCostRow | null {
  return db.prepare(`
    SELECT
      SUM(CASE WHEN auth_mode_cost = 'api' THEN cost_usd ELSE 0 END) as api_cost,
      SUM(CASE WHEN auth_mode_cost = 'max' THEN cost_usd ELSE 0 END) as max_cost,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens
    FROM task_results
    WHERE run_id = ? AND model IS NOT NULL
  `).get(runId) as unknown as RunCostRow | null;
}


function formatTokens(tokens: number | null): string {
  if (tokens === null || tokens === 0) return '0';
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return String(tokens);
}

export function showProjectStatus(db: Database, projectId: string): void {
  const project = getProject(db, projectId) as ProjectRow | null;
  if (!project) {
    console.log(chalk.red(`Project not found: ${projectId}`));
    return;
  }

  const run = getLatestRun(db, projectId) as RunRow | null;
  if (!run) {
    console.log(`${projectId}: No runs yet. Run: noxdev run ${projectId}`);
    return;
  }

  const tasks = getTaskResults(db, run.id) as unknown as TaskResultRow[];
  const timeStr = relativeTime(run.started_at);

  console.log(`noxdev status: ${chalk.bold(project.display_name)}`);

  if (run.status === "running") {
    console.log(`Run ${run.id} · ${timeStr} · ${chalk.cyan("running")}`);
    console.log(chalk.cyan(`Run in progress since ${timeStr}...`));
  } else if (run.status === "aborted") {
    console.log(`Run ${run.id} · ${timeStr} · ${chalk.red("aborted")}`);
  } else {
    console.log(`Run ${run.id} · ${timeStr} · ${run.status}`);
  }

  // Derive counts from task_results, not runs table (handles aborted runs correctly)
  const completed = tasks.filter(t => t.status === "completed" || t.status === "completed_retry").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  const skipped = tasks.filter(t => t.status === "skipped").length;
  const total = run.total_tasks ?? 0;

  console.log("");
  console.log(
    `Tasks: ${chalk.green(String(completed))} completed, ${chalk.red(String(failed))} failed, ${chalk.yellow(String(skipped))} skipped (of ${total})`,
  );

  // Show cost information
  const costData = getRunCost(db, run.id);
  if (costData && (costData.api_cost || costData.max_cost || costData.input_tokens || costData.output_tokens)) {
    const apiCostStr = formatCost(costData.api_cost, 'aggregate');
    const maxCostStr = formatCost(costData.max_cost, 'aggregate');
    const inputStr = formatTokens(costData.input_tokens);
    const outputStr = formatTokens(costData.output_tokens);
    console.log(`Cost: ${formatCost((costData.api_cost || 0) + (costData.max_cost || 0), 'aggregate')}  ·  ${inputStr} input / ${outputStr} output tokens`);
  }

  if (tasks.length > 0) {
    console.log("");
    console.log("Commits:");
    for (const t of tasks) {
      const badge = statusBadge(t.status);
      const sha = t.commit_sha || "no commit";
      const dur = t.duration_seconds != null ? `${t.duration_seconds}s` : "";
      console.log(`  ${t.task_id}: ${t.title}  ${badge}  ${sha}  ${dur}`);
    }
  }

}

function isRecentRun(startedAt: string): boolean {
  const dateStr = startedAt.endsWith("Z") ? startedAt : startedAt + "Z";
  const then = new Date(dateStr).getTime();
  const diffMs = Date.now() - then;
  return diffMs < 24 * 3_600_000;
}

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show project status")
    .argument("[project]", "project name")
    .option("--summary", "Show only the summary table, no per-project detail")
    .action((project: string | undefined, opts: { summary?: boolean }) => {
      try {
        const db = getDb();

        if (project) {
          showProjectStatus(db, project);
          return;
        }

        const projects = getAllProjects(db) as unknown as ProjectRow[];
        if (projects.length === 0) {
          console.log("No projects registered. Run: noxdev init <project> --repo <path>");
          return;
        }

        if (projects.length === 1 && !opts.summary) {
          showProjectStatus(db, projects[0].id);
          return;
        }

        // Multi-project: show summary table
        const summaries = getAllProjectSummaries(db);
        console.log(formatSummaryTable(summaries));

        if (opts.summary) {
          return;
        }

        // Show detailed status for projects with recent runs (last 24h)
        const recentProjects = summaries.filter(
          (s) => s.startedAt && isRecentRun(s.startedAt),
        );

        if (recentProjects.length > 0) {
          console.log("");
          for (const s of recentProjects) {
            console.log("---");
            showProjectStatus(db, s.projectId);
          }
        }
      } catch (err: unknown) {
        console.error(
          chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`),
        );
        process.exitCode = 1;
      }
    });
}
