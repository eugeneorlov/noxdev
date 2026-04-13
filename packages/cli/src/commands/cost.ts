import type { Command } from "commander";
import type Database from "better-sqlite3";
import chalk from "chalk";
import { getDb } from "../db/index.js";
import { getProject, getAllProjects } from "../db/queries.js";

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

function formatNumber(num: number | null): string {
  if (num === null) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

function formatCost(cost: number | null): string {
  if (cost === null || cost === 0) return '$0.00';
  return `$${cost.toFixed(2)}`;
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

function getCostData(db: Database.Database, projectId: string | null, sinceDate: string): CostRow[] | TotalCostRow {
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

function getPerProjectCostData(db: Database.Database, sinceDate: string): CostRow[] {
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
  `).all(sinceDate) as CostRow[];

  return results;
}

function getOlderTasksCount(db: Database.Database, sinceDate: string): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM task_results tr
    WHERE (tr.started_at IS NULL OR tr.started_at >= ?)
      AND tr.model IS NULL
  `).get(sinceDate) as { count: number } | undefined;

  return result?.count || 0;
}

export function registerCost(program: Command): void {
  program
    .command("cost")
    .description("Show cost breakdown for API and Max usage with tokens since date")
    .argument("[project]", "project name (omit for global cost)")
    .option("--since <spec>", "time range: '7d', '30d', 'YYYY-MM-DD', or 'all'", "all")
    .option("--all", "show per-project breakdown instead of totals")
    .action((project: string | undefined, opts: { since: string; all?: boolean }) => {
      try {
        const db = getDb();
        const sinceDate = parseSinceDate(opts.since);

        if (opts.all) {
          // Per-project breakdown
          const projects = getPerProjectCostData(db, sinceDate);
          const olderCount = getOlderTasksCount(db, sinceDate);

          console.log(`noxdev cost — per project  [${formatSinceRange(opts.since)}]`);

          if (projects.length === 0) {
            console.log("No cost data found for the specified time range.");
            return;
          }

          console.log("");
          console.log("PROJECT              TASKS   IN-TOK    OUT-TOK   $API      $EQUIV*");

          let totalTasks = 0;
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalApiCost = 0;
          let totalMaxCost = 0;

          for (const row of projects) {
            const projectName = row.display_name.length > 16
              ? row.display_name.substring(0, 13) + '...'
              : row.display_name;

            const apiCostStr = (row.api_cost && row.api_cost > 0) ? formatCost(row.api_cost) : '$-';
            const maxCostStr = (row.max_cost && row.max_cost > 0) ? formatCost(row.max_cost) + '*' : '$-';

            console.log(
              `${projectName.padEnd(16)} ${String(row.tasks).padStart(7)} ${formatNumber(row.input_tokens).padStart(9)} ${formatNumber(row.output_tokens).padStart(9)} ${apiCostStr.padStart(9)} ${maxCostStr.padStart(9)}`
            );

            totalTasks += row.tasks;
            totalInputTokens += row.input_tokens || 0;
            totalOutputTokens += row.output_tokens || 0;
            totalApiCost += row.api_cost || 0;
            totalMaxCost += row.max_cost || 0;
          }

          console.log("────────────────────────────────────────────────────────────────");
          console.log(
            `${'TOTAL'.padEnd(16)} ${String(totalTasks).padStart(7)} ${formatNumber(totalInputTokens).padStart(9)} ${formatNumber(totalOutputTokens).padStart(9)} ${formatCost(totalApiCost).padStart(9)} ${formatCost(totalMaxCost).padStart(9)}`
          );

          if (olderCount > 0) {
            console.log("");
            console.log(`Note: ${olderCount} older tasks have no cost data (pre-v1.2.0 runs).`);
          }

        } else {
          // Single project or global totals
          let costData: TotalCostRow | CostRow;
          let title: string;

          if (project) {
            const projectData = getProject(db, project);
            if (!projectData) {
              console.log(chalk.red(`Project not found: ${project}`));
              return;
            }
            costData = getCostData(db, project, sinceDate) as CostRow;
            title = `noxdev cost — ${(costData as CostRow).display_name || project}`;
          } else {
            costData = getCostData(db, null, sinceDate) as TotalCostRow;
            title = "noxdev cost — all projects";
          }

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

          if (apiTasks > 0) {
            console.log(`API tasks              ${String(apiTasks).padStart(2)} tasks    ${formatCost(costData.api_cost)}`);
          }

          if (maxTasks > 0) {
            console.log(`Max tasks (equiv.)     ${String(maxTasks).padStart(2)} tasks    ${formatCost(costData.max_cost)}*`);
          }

          console.log(`Total                  ${String(costData.tasks).padStart(2)} tasks    ${formatCost((costData.api_cost || 0) + (costData.max_cost || 0))}`);

          if (maxTasks > 0) {
            console.log("* Max cost is equivalent API cost — actual Max usage is flat-rate.");
          }

          const olderCount = getOlderTasksCount(db, sinceDate);
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