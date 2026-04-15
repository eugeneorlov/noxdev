import type { Command } from "commander";
import type { Database } from "../db/connection.js";
import chalk from "chalk";
import { getDb } from "../db/index.js";
import { getProject, getAllProjects, getPerRunCostData, getPerTaskCostData } from "../db/queries.js";
import { formatCost, formatNumber } from "../lib/format.js";

interface CostRow {
  project_id: string;
  display_name: string;
  tasks: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  api_cost: number | null;
  max_cost: number | null;
}

interface TotalCostRow {
  tasks: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  api_cost: number | null;
  max_cost: number | null;
}

interface RunRow {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  auth_mode: string;
  status: string;
  total_tasks: number;
  completed: number | null;
  failed: number | null;
  skipped: number | null;
  commit_before: string | null;
  commit_after: string | null;
  tasks_with_cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  api_cost_usd: number;
  max_cost_usd_equivalent: number;
  api_tasks: number;
  max_tasks: number;
}

interface TaskRow {
  task_id: string;
  status: string;
  duration_seconds: number;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  auth_mode_cost: string | null;
  started_at: string;
  finished_at: string;
}

function parseSinceDate(since: string): string {
  const now = new Date();

  if (since === 'all') {
    return '1970-01-01';
  }

  // Handle relative dates like '7d', '30d'
  const relativeMatch = since.match(/^(\d+)d$/);
  if (relativeMatch) {
    const days = parseInt(relativeMatch[1]);
    const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }

  // Handle absolute dates like 'YYYY-MM-DD'
  const absoluteMatch = since.match(/^\d{4}-\d{2}-\d{2}$/);
  if (absoluteMatch) {
    return since;
  }

  throw new Error(`Invalid --since format: ${since}. Use '7d', '30d', 'YYYY-MM-DD', or 'all'`);
}


function formatSinceRange(since: string): string {
  if (since === 'all') {
    return 'since inception';
  }
  const relativeMatch = since.match(/^(\d+)d$/);
  if (relativeMatch) {
    return `since ${since} ago`;
  }
  return `since ${since}`;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '—';

  const start = new Date(startedAt);
  const end = new Date(finishedAt);
  const diffMs = end.getTime() - start.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatTaskCount(completed: number | null, failed: number | null, skipped: number | null, total: number): string {
  const done = (completed || 0) + (failed || 0) + (skipped || 0);
  return `${done}/${total}`;
}

function truncateModel(model: string | null): string {
  if (!model) return '—';
  if (model.length <= 20) return model;
  return model.substring(0, 17) + '...';
}

function formatTotalTokens(input: number | null, output: number | null): string {
  const total = (input || 0) + (output || 0);
  if (total === 0) return '0';
  if (total < 1000) return String(total);
  if (total < 1000000) return `${Math.round(total / 1000)}K`;
  return `${Math.round(total / 1000000)}M`;
}

function getCostData(db: Database, projectId: string | null, sinceDate: string): CostRow[] | TotalCostRow {
  const whereClause = projectId
    ? `WHERE r.project_id = ? AND (tr.started_at IS NULL OR tr.started_at >= ?)`
    : `WHERE (tr.started_at IS NULL OR tr.started_at >= ?)`;

  const params = projectId ? [projectId, sinceDate] : [sinceDate];

  if (projectId) {
    // Single project totals
    const result = db.prepare(`
      SELECT
        r.project_id,
        p.display_name,
        COUNT(*) as tasks,
        SUM(tr.input_tokens) as input_tokens,
        SUM(tr.output_tokens) as output_tokens,
        SUM(tr.cache_read_tokens) as cache_read_tokens,
        SUM(tr.cache_write_tokens) as cache_write_tokens,
        SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost,
        SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost
      FROM task_results tr
      JOIN runs r ON tr.run_id = r.id
      JOIN projects p ON r.project_id = p.id
      ${whereClause}
        AND tr.model IS NOT NULL
      GROUP BY r.project_id, p.display_name
    `).get(...params) as CostRow | undefined;

    if (!result) {
      return {
        tasks: 0,
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: null,
        cache_write_tokens: null,
        api_cost: null,
        max_cost: null
      };
    }
    return result;
  } else {
    // All projects totals
    const result = db.prepare(`
      SELECT
        COUNT(*) as tasks,
        SUM(tr.input_tokens) as input_tokens,
        SUM(tr.output_tokens) as output_tokens,
        SUM(tr.cache_read_tokens) as cache_read_tokens,
        SUM(tr.cache_write_tokens) as cache_write_tokens,
        SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost,
        SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost
      FROM task_results tr
      JOIN runs r ON tr.run_id = r.id
      ${whereClause}
        AND tr.model IS NOT NULL
    `).get(...params) as TotalCostRow | undefined;

    return result || {
      tasks: 0,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      api_cost: null,
      max_cost: null
    };
  }
}

function getPerProjectCostData(db: Database, sinceDate: string): CostRow[] {
  const results = db.prepare(`
    SELECT
      r.project_id,
      p.display_name,
      COUNT(*) as tasks,
      SUM(tr.input_tokens) as input_tokens,
      SUM(tr.output_tokens) as output_tokens,
      SUM(tr.cache_read_tokens) as cache_read_tokens,
      SUM(tr.cache_write_tokens) as cache_write_tokens,
      SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost,
      SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost
    FROM task_results tr
    JOIN runs r ON tr.run_id = r.id
    JOIN projects p ON r.project_id = p.id
    WHERE (tr.started_at IS NULL OR tr.started_at >= ?)
      AND tr.model IS NOT NULL
    GROUP BY r.project_id, p.display_name
    ORDER BY p.display_name
  `).all(sinceDate) as unknown as CostRow[];

  return results;
}

function getOlderTasksCount(db: Database, sinceDate: string): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM task_results tr
    WHERE (tr.started_at IS NULL OR tr.started_at >= ?)
      AND tr.model IS NULL
  `).get(sinceDate) as { count: number } | undefined;

  return result?.count || 0;
}

function renderPerRunTable(runs: RunRow[], projectName: string, sinceRange: string): void {
  console.log(`noxdev cost — ${projectName} runs  [${sinceRange}]`);

  if (runs.length === 0) {
    console.log("No runs found for the specified project and time range.");
    return;
  }

  console.log("");
  console.log("RUN ID                 STARTED    TASKS    DURATION    $COST");

  let totalApiCost = 0;
  let totalMaxCost = 0;
  let totalTasksWithCost = 0;

  for (const run of runs) {
    const runIdDisplay = run.run_id.length > 18
      ? run.run_id.substring(0, 15) + '...'
      : run.run_id;

    const startedDisplay = formatDateTime(run.started_at);
    const tasksDisplay = formatTaskCount(run.completed, run.failed, run.skipped, run.total_tasks);
    const durationDisplay = formatDuration(run.started_at, run.finished_at);

    const apiCostStr = run.api_cost_usd > 0 ? formatCost(run.api_cost_usd) : '$—';
    const maxCostStr = run.max_cost_usd_equivalent > 0 ? formatCost(run.max_cost_usd_equivalent) : '$—';
    const totalCostStr = formatCost(run.api_cost_usd + run.max_cost_usd_equivalent);

    console.log(
      `${runIdDisplay.padEnd(18)} ${startedDisplay.padEnd(10)} ${tasksDisplay.padEnd(8)} ${durationDisplay.padEnd(11)} ${totalCostStr.padStart(9)}`
    );

    totalApiCost += run.api_cost_usd;
    totalMaxCost += run.max_cost_usd_equivalent;
    totalTasksWithCost += run.tasks_with_cost;
  }

  console.log("─────────────────────────────────────────────────────────────────────────────");
  console.log(
    `${'TOTAL'.padEnd(18)} ${' '.padEnd(10)} ${' '.padEnd(8)} ${' '.padEnd(11)} ${formatCost(totalApiCost + totalMaxCost).padStart(9)}`
  );

  if (totalTasksWithCost > 0) {
    console.log("");
    console.log(`Note: Costs shown for ${totalTasksWithCost} tasks with cost data.`);
  }
}

function renderPerTaskTable(tasks: TaskRow[], runId: string): void {
  console.log(`noxdev cost — run ${runId} tasks`);

  if (tasks.length === 0) {
    console.log("No tasks with cost data found for this run.");
    return;
  }

  console.log("");
  console.log("TASK    STATUS    DURATION    MODEL                 TOKENS         $COST");

  let totalCost = 0;
  let totalTokens = 0;

  for (const task of tasks) {
    const taskId = task.task_id.padEnd(7);
    const status = task.status.padEnd(9);
    const duration = formatDuration(task.started_at, task.finished_at).padEnd(11);
    const model = truncateModel(task.model).padEnd(21);
    const tokens = formatTotalTokens(task.input_tokens, task.output_tokens).padStart(14);
    const cost = formatCost(task.cost_usd || 0).padStart(9);

    console.log(`${taskId} ${status} ${duration} ${model} ${tokens} ${cost}`);

    totalCost += task.cost_usd || 0;
    totalTokens += (task.input_tokens || 0) + (task.output_tokens || 0);
  }

  console.log("─────────────────────────────────────────────────────────────────────────");
  console.log(
    `${'TOTAL'.padEnd(7)} ${' '.padEnd(9)} ${' '.padEnd(11)} ${' '.padEnd(21)} ${formatTotalTokens(totalTokens, 0).padStart(14)} ${formatCost(totalCost).padStart(9)}`
  );
}

export function registerCost(program: Command): void {
  program
    .command("cost")
    .description("Show cost breakdown for API and Max usage with tokens since date")
    .argument("[project]", "project name (shows per-run breakdown for that project)")
    .option("--since <spec>", "time range: '7d', '30d', 'YYYY-MM-DD', or 'all'", "all")
    .option("--run <run-id>", "show per-task breakdown for specific run")
    .option("--global", "show global totals across all projects")
    .option("--all", "show per-project breakdown (default behavior)")
    .action((project: string | undefined, opts: { since: string; run?: string; global?: boolean; all?: boolean }) => {
      try {
        const db = getDb();
        const sinceDate = parseSinceDate(opts.since);

        // Priority order: --run > --global > project arg > default (per-project)
        if (opts.run) {
          // Per-task breakdown for specific run
          const tasks = getPerTaskCostData(db, opts.run) as unknown as TaskRow[];
          renderPerTaskTable(tasks, opts.run);

        } else if (opts.global) {
          // Global totals across all projects (old default behavior)
          const costData = getCostData(db, null, sinceDate) as TotalCostRow;
          const title = "noxdev cost — all projects";

          console.log(`${title}  [${formatSinceRange(opts.since)}]`);
          console.log("");

          if (costData.tasks === 0) {
            console.log("No cost data found for the specified time range.");
            return;
          }

          console.log(`Input tokens        ${formatNumber(costData.input_tokens)}`);
          console.log(`Output tokens       ${formatNumber(costData.output_tokens)}`);
          console.log(`Cache read tokens   ${formatNumber(costData.cache_read_tokens)}`);
          console.log(`Cache write tokens  ${formatNumber(costData.cache_write_tokens)}`);
          console.log("─────────────────────────────");

          const apiTasks = Math.round((costData.api_cost || 0) > 0 ? costData.tasks * ((costData.api_cost || 0) / ((costData.api_cost || 0) + (costData.max_cost || 0))) : 0);
          const maxTasks = costData.tasks - apiTasks;

          console.log(`Cost                   ${String(costData.tasks).padStart(2)} tasks    ${formatCost((costData.api_cost || 0) + (costData.max_cost || 0))}`);

          if (maxTasks > 0) {
            console.log("* Token-based cost combines API and equivalent Max usage costs.");
          }

          const olderCount = getOlderTasksCount(db, sinceDate);
          if (olderCount > 0) {
            console.log("");
            console.log(`Note: ${olderCount} older tasks have no cost data (pre-v1.2.0 runs).`);
          }

        } else if (project) {
          // Per-run breakdown for specific project
          const projectData = getProject(db, project);
          if (!projectData) {
            console.log(chalk.red(`Project not found: ${project}`));
            return;
          }

          const runs = getPerRunCostData(db, project, sinceDate) as unknown as RunRow[];
          renderPerRunTable(runs, String(projectData.display_name), formatSinceRange(opts.since));

        } else {
          // Default: per-project breakdown (current --all behavior)
          const projects = getPerProjectCostData(db, sinceDate);
          const olderCount = getOlderTasksCount(db, sinceDate);

          console.log(`noxdev cost — per project  [${formatSinceRange(opts.since)}]`);

          if (projects.length === 0) {
            console.log("No cost data found for the specified time range.");
            return;
          }

          console.log("");
          console.log("PROJECT              TASKS   IN-TOK    OUT-TOK   $COST*");

          let totalTasks = 0;
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalApiCost = 0;
          let totalMaxCost = 0;

          for (const row of projects) {
            const projectName = row.display_name.length > 16
              ? row.display_name.substring(0, 13) + '...'
              : row.display_name;

            const totalCostStr = ((row.api_cost || 0) + (row.max_cost || 0)) > 0 ? formatCost((row.api_cost || 0) + (row.max_cost || 0)) + '*' : '$-';

            console.log(
              `${projectName.padEnd(16)} ${String(row.tasks).padStart(7)} ${formatNumber(row.input_tokens).padStart(9)} ${formatNumber(row.output_tokens).padStart(9)} ${totalCostStr.padStart(9)}`
            );

            totalTasks += row.tasks;
            totalInputTokens += row.input_tokens || 0;
            totalOutputTokens += row.output_tokens || 0;
            totalApiCost += row.api_cost || 0;
            totalMaxCost += row.max_cost || 0;
          }

          console.log("────────────────────────────────────────────────────────────────");
          console.log(
            `${'TOTAL'.padEnd(16)} ${String(totalTasks).padStart(7)} ${formatNumber(totalInputTokens).padStart(9)} ${formatNumber(totalOutputTokens).padStart(9)} ${formatCost(totalApiCost + totalMaxCost).padStart(9)}`
          );

          if (olderCount > 0) {
            console.log("");
            console.log(`Note: ${olderCount} older tasks have no cost data (pre-v1.2.0 runs).`);
          }
        }

      } catch (err: unknown) {
        console.error(
          chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`)
        );
        process.exitCode = 1;
      }
    });
}