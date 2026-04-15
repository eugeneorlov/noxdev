import type { Database } from "./connection.js";

export function insertRun(
  db: Database,
  run: {
    id: string;
    projectId: string;
    startedAt: string;
    authMode: string;
    totalTasks: number;
    commitBefore: string;
    logFile: string;
  },
): void {
  db.prepare(
    `INSERT INTO runs (id, project_id, started_at, auth_mode, total_tasks, commit_before, log_file)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.projectId,
    run.startedAt,
    run.authMode,
    run.totalTasks,
    run.commitBefore,
    run.logFile,
  );
}

export function updateRunFinished(
  db: Database,
  runId: string,
  updates: {
    finishedAt: string;
    completed: number;
    failed: number;
    skipped: number;
    status: string;
    commitAfter: string;
  },
): void {
  db.prepare(
    `UPDATE runs
     SET finished_at = ?, completed = ?, failed = ?, skipped = ?, status = ?, commit_after = ?
     WHERE id = ?`,
  ).run(
    updates.finishedAt,
    updates.completed,
    updates.failed,
    updates.skipped,
    updates.status,
    updates.commitAfter,
    runId,
  );
}

export function insertTaskCache(
  db: Database,
  runId: string,
  tasks: Array<{
    taskId: string;
    title: string;
    files: string;
    verify: string;
    critic: string;
    spec: string;
    statusBefore: string;
  }>,
): void {
  const stmt = db.prepare(
    `INSERT INTO tasks (run_id, task_id, title, files, verify, critic, spec, status_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  try {
    for (const t of tasks) {
      stmt.run(runId, t.taskId, t.title, t.files, t.verify, t.critic, t.spec, t.statusBefore);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function insertTaskResult(
  db: Database,
  result: {
    runId: string;
    taskId: string;
    title: string;
    status: string;
    exitCode: number | null;
    authMode: string;
    criticMode: string;
    attempt: number;
    commitSha: string | null;
    startedAt: string;
    finishedAt: string;
    durationSeconds: number;
    devLogFile: string | null;
    criticLogFile: string | null;
    diffFile: string | null;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    model?: string | null;
    authModeCost?: string;
    costUsd?: number;
  },
): void {
  db.prepare(
    `INSERT INTO task_results
     (run_id, task_id, title, status, exit_code, auth_mode, critic_mode,
      attempt, commit_sha, started_at, finished_at, duration_seconds,
      dev_log_file, critic_log_file, diff_file,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      model, auth_mode_cost, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.runId,
    result.taskId,
    result.title,
    result.status,
    result.exitCode,
    result.authMode,
    result.criticMode,
    result.attempt,
    result.commitSha,
    result.startedAt,
    result.finishedAt,
    result.durationSeconds,
    result.devLogFile,
    result.criticLogFile,
    result.diffFile,
    result.inputTokens ?? null,
    result.outputTokens ?? null,
    result.cacheReadTokens ?? null,
    result.cacheWriteTokens ?? null,
    result.model ?? null,
    result.authModeCost ?? null,
    result.costUsd ?? null,
  );
}

export function getLatestRun(db: Database, projectId: string) {
  return (
    db
      .prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(projectId) ?? null
  );
}

export function getTaskResults(db: Database, runId: string) {
  return db.prepare(`SELECT * FROM task_results WHERE run_id = ?`).all(runId);
}

export function getProject(db: Database, projectId: string) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) ?? null;
}

export function getAllProjects(db: Database) {
  return db
    .prepare(
      `SELECT p.*,
              r.id AS latest_run_id,
              r.started_at AS latest_run_started_at,
              r.status AS latest_run_status,
              r.total_tasks AS latest_run_total_tasks,
              r.completed AS latest_run_completed,
              r.failed AS latest_run_failed
       FROM projects p
       LEFT JOIN runs r ON r.id = (
         SELECT r2.id FROM runs r2
         WHERE r2.project_id = p.id
         ORDER BY r2.started_at DESC
         LIMIT 1
       )`,
    )
    .all();
}

export function abortOrphanedRuns(db: Database): number {
  const result = db.prepare(
    `UPDATE runs
     SET status = 'aborted', finished_at = datetime('now')
     WHERE status = 'running'`
  ).run();
  return Number(result.changes);
}

export function getRunCostBreakdown(db: Database, runId: string) {
  return db.prepare(`
    SELECT
      COUNT(*) as total_tasks,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cache_write_tokens) as cache_write_tokens,
      SUM(CASE WHEN auth_mode_cost = 'api' THEN cost_usd ELSE 0 END) as api_cost_usd,
      SUM(CASE WHEN auth_mode_cost = 'max' THEN cost_usd ELSE 0 END) as max_cost_usd_equivalent,
      COUNT(CASE WHEN auth_mode_cost = 'api' THEN 1 END) as api_tasks,
      COUNT(CASE WHEN auth_mode_cost = 'max' THEN 1 END) as max_tasks,
      MIN(started_at) as earliest_started_at,
      MAX(finished_at) as latest_finished_at
    FROM task_results
    WHERE run_id = ? AND model IS NOT NULL
  `).get(runId);
}

export function getPerRunCostData(db: Database, projectId: string | null, sinceDate: string) {
  if (projectId === null) {
    return [];
  }

  return db.prepare(`
    SELECT
      r.id as run_id,
      r.started_at,
      r.finished_at,
      r.auth_mode,
      r.status,
      r.total_tasks,
      r.completed,
      r.failed,
      r.skipped,
      r.commit_before,
      r.commit_after,
      COALESCE(cost_data.tasks_with_cost, 0) as tasks_with_cost,
      COALESCE(cost_data.input_tokens, 0) as input_tokens,
      COALESCE(cost_data.output_tokens, 0) as output_tokens,
      COALESCE(cost_data.cache_read_tokens, 0) as cache_read_tokens,
      COALESCE(cost_data.cache_write_tokens, 0) as cache_write_tokens,
      COALESCE(cost_data.api_cost_usd, 0) as api_cost_usd,
      COALESCE(cost_data.max_cost_usd_equivalent, 0) as max_cost_usd_equivalent,
      COALESCE(cost_data.api_tasks, 0) as api_tasks,
      COALESCE(cost_data.max_tasks, 0) as max_tasks
    FROM runs r
    LEFT JOIN (
      SELECT
        tr.run_id,
        COUNT(*) as tasks_with_cost,
        SUM(tr.input_tokens) as input_tokens,
        SUM(tr.output_tokens) as output_tokens,
        SUM(tr.cache_read_tokens) as cache_read_tokens,
        SUM(tr.cache_write_tokens) as cache_write_tokens,
        SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost_usd,
        SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost_usd_equivalent,
        COUNT(CASE WHEN tr.auth_mode_cost = 'api' THEN 1 END) as api_tasks,
        COUNT(CASE WHEN tr.auth_mode_cost = 'max' THEN 1 END) as max_tasks
      FROM task_results tr
      WHERE tr.model IS NOT NULL
        AND (tr.started_at IS NULL OR tr.started_at >= ?)
      GROUP BY tr.run_id
    ) cost_data ON r.id = cost_data.run_id
    WHERE r.project_id = ?
      AND (r.started_at >= ? OR cost_data.tasks_with_cost > 0)
    ORDER BY r.started_at DESC
  `).all(sinceDate, projectId, sinceDate);
}

export function getPerTaskCostData(db: Database, runId: string) {
  return db.prepare(`
    SELECT
      task_id,
      status,
      duration_seconds,
      model,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
      cost_usd,
      auth_mode_cost,
      started_at,
      finished_at
    FROM task_results
    WHERE run_id = ?
      AND model IS NOT NULL
    ORDER BY task_id
  `).all(runId);
}

export function getProjectTaskExecutions(db: Database, projectId: string) {
  return db.prepare(`
    SELECT
      tr.*,
      r.started_at as run_started_at,
      r.auth_mode as run_auth_mode,
      r.status as run_status
    FROM task_results tr
    JOIN runs r ON tr.run_id = r.id
    WHERE r.project_id = ?
    ORDER BY r.started_at DESC, tr.started_at DESC
  `).all(projectId);
}
