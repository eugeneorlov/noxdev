import type { Database } from "../db/connection.js";
import chalk from "chalk";
import { getAllProjects, getLatestRun, getTaskResults } from "../db/queries.js";

export interface ProjectSummary {
  projectId: string;
  displayName: string;
  runId: string | null;
  status: string | null;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  startedAt: string | null;
  finishedAt: string | null;
}

interface ProjectRow {
  id: string;
  display_name: string;
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  total_tasks: number;
  completed: number;
  failed: number;
  skipped: number;
  status: string;
}

export function getAllProjectSummaries(db: Database): ProjectSummary[] {
  const projects = getAllProjects(db) as unknown as ProjectRow[];
  const summaries: ProjectSummary[] = [];

  for (const p of projects) {
    const run = getLatestRun(db, p.id) as RunRow | null;

    if (!run) {
      summaries.push({
        projectId: p.id,
        displayName: p.display_name,
        runId: null,
        status: null,
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        startedAt: null,
        finishedAt: null,
      });
      continue;
    }

    summaries.push({
      projectId: p.id,
      displayName: p.display_name,
      runId: run.id,
      status: run.status,
      total: run.total_tasks ?? 0,
      completed: run.completed ?? 0,
      failed: run.failed ?? 0,
      skipped: run.skipped ?? 0,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
    });
  }

  return summaries;
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

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

export function formatSummaryTable(summaries: ProjectSummary[]): string {
  const header =
    `${pad("PROJECT", 21)}${pad("LAST RUN", 13)}${pad("STATUS", 14)}TASKS`;

  const lines: string[] = [chalk.bold(header)];

  for (const s of summaries) {
    if (!s.runId || !s.startedAt) {
      const line =
        `${pad(s.projectId, 21)}${pad("never", 13)}${pad("\u2014", 14)}\u2014`;
      lines.push(chalk.dim(line));
      continue;
    }

    const timeStr = relativeTime(s.startedAt);
    const statusStr = s.status ?? "\u2014";

    let tasksStr: string;
    if (s.failed > 0) {
      tasksStr = `${s.completed}/${s.total} (${s.failed} fail)`;
    } else if (s.completed === s.total && s.total > 0) {
      tasksStr = `${s.completed}/${s.total} \u2713`;
    } else {
      tasksStr = `${s.completed}/${s.total}`;
    }

    const raw =
      `${pad(s.projectId, 21)}${pad(timeStr, 13)}${pad(statusStr, 14)}${tasksStr}`;

    if (s.failed > 0) {
      lines.push(chalk.yellow(raw));
    } else if (s.completed === s.total && s.total > 0) {
      lines.push(chalk.green(raw));
    } else {
      lines.push(raw);
    }
  }

  return lines.join("\n");
}
