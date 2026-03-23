import type Database from "better-sqlite3";

export function insertRun(
  db: Database.Database,
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
  db: Database.Database,
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
  db: Database.Database,
  runId: string,
  tasks: Array<{
    taskId: string;
    title: string;
    files: string;
    verify: string;
    critic: string;
    push: string;
    spec: string;
    statusBefore: string;
  }>,
): void {
  const stmt = db.prepare(
    `INSERT INTO tasks (run_id, task_id, title, files, verify, critic, push, spec, status_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMany = db.transaction((rows: typeof tasks) => {
    for (const t of rows) {
      stmt.run(runId, t.taskId, t.title, t.files, t.verify, t.critic, t.push, t.spec, t.statusBefore);
    }
  });
  insertMany(tasks);
}

export function insertTaskResult(
  db: Database.Database,
  result: {
    runId: string;
    taskId: string;
    title: string;
    status: string;
    exitCode: number | null;
    authMode: string;
    criticMode: string;
    pushMode: string;
    attempt: number;
    commitSha: string | null;
    startedAt: string;
    finishedAt: string;
    durationSeconds: number;
    devLogFile: string | null;
    criticLogFile: string | null;
    diffFile: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO task_results
     (run_id, task_id, title, status, exit_code, auth_mode, critic_mode, push_mode,
      attempt, commit_sha, started_at, finished_at, duration_seconds,
      dev_log_file, critic_log_file, diff_file)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.runId,
    result.taskId,
    result.title,
    result.status,
    result.exitCode,
    result.authMode,
    result.criticMode,
    result.pushMode,
    result.attempt,
    result.commitSha,
    result.startedAt,
    result.finishedAt,
    result.durationSeconds,
    result.devLogFile,
    result.criticLogFile,
    result.diffFile,
  );
}

export function updateMergeDecision(
  db: Database.Database,
  taskResultId: number,
  decision: string,
  mergedAt?: string,
): void {
  db.prepare(
    `UPDATE task_results SET merge_decision = ?, merged_at = ? WHERE id = ?`,
  ).run(decision, mergedAt ?? null, taskResultId);
}

export function getLatestRun(db: Database.Database, projectId: string) {
  return (
    db
      .prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(projectId) ?? null
  );
}

export function getTaskResults(db: Database.Database, runId: string) {
  return db.prepare(`SELECT * FROM task_results WHERE run_id = ?`).all(runId);
}

export function getPendingMerge(db: Database.Database, runId: string) {
  return db
    .prepare(`SELECT * FROM task_results WHERE run_id = ? AND merge_decision = 'pending'`)
    .all(runId);
}

export function getProject(db: Database.Database, projectId: string) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) ?? null;
}

export function getAllProjects(db: Database.Database) {
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
