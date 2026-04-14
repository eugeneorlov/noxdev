import type { Database } from "./connection.js";

// Schema is inlined for compatibility with tsup bundling.
// Canonical schema definition lives in schema.sql.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch TEXT NOT NULL,
  test_command TEXT,
  build_command TEXT,
  lint_command TEXT,
  docker_memory TEXT DEFAULT '4g',
  docker_cpus INTEGER DEFAULT 2,
  docker_timeout_seconds INTEGER DEFAULT 1800,
  secrets_file TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  auth_mode TEXT NOT NULL DEFAULT 'max',
  total_tasks INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  log_file TEXT,
  commit_before TEXT,
  commit_after TEXT
);

CREATE TABLE IF NOT EXISTS task_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  auth_mode TEXT,
  critic_mode TEXT DEFAULT 'review',
  attempt INTEGER DEFAULT 1,
  commit_sha TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_seconds INTEGER,
  dev_log_file TEXT,
  critic_log_file TEXT,
  diff_file TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  model TEXT,
  auth_mode_cost TEXT,
  cost_usd REAL
);

CREATE INDEX IF NOT EXISTS idx_task_results_run ON task_results(run_id);
CREATE INDEX IF NOT EXISTS idx_task_results_status ON task_results(status);
CREATE INDEX IF NOT EXISTS idx_task_results_started ON task_results(started_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  files TEXT,
  verify TEXT,
  critic TEXT DEFAULT 'review',
  spec TEXT,
  status_before TEXT DEFAULT 'pending',
  UNIQUE(run_id, task_id)
);
`;

export function migrate(db: Database): void {
  // First, ensure basic tables exist for new installations
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      branch TEXT NOT NULL,
      test_command TEXT,
      build_command TEXT,
      lint_command TEXT,
      docker_memory TEXT DEFAULT '4g',
      docker_cpus INTEGER DEFAULT 2,
      docker_timeout_seconds INTEGER DEFAULT 1800,
      secrets_file TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      auth_mode TEXT NOT NULL DEFAULT 'max',
      total_tasks INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      log_file TEXT,
      commit_before TEXT,
      commit_after TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES runs(id),
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      files TEXT,
      verify TEXT,
      critic TEXT DEFAULT 'review',
      spec TEXT,
      status_before TEXT DEFAULT 'pending',
      UNIQUE(run_id, task_id)
    );
  `);

  // Check if task_results table exists and if it has merge_decision column
  const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_results'").get();

  if (tableInfo) {
    // Table exists, check if it has merge_decision column (indicating old schema)
    const columns = db.prepare("PRAGMA table_info(task_results)").all();
    const hasMergeDecision = columns.some((col: any) => col.name === 'merge_decision');

    if (hasMergeDecision) {
      // Perform table rebuild migration
      console.log('Migrating task_results table to new schema...');

      db.exec(`
        BEGIN;

        -- Create new table with updated schema
        CREATE TABLE task_results_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL REFERENCES runs(id),
          task_id TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          exit_code INTEGER,
          auth_mode TEXT,
          critic_mode TEXT DEFAULT 'review',
          attempt INTEGER DEFAULT 1,
          commit_sha TEXT,
          started_at TEXT,
          finished_at TEXT,
          duration_seconds INTEGER,
          dev_log_file TEXT,
          critic_log_file TEXT,
          diff_file TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cache_read_tokens INTEGER,
          cache_write_tokens INTEGER,
          model TEXT,
          auth_mode_cost TEXT,
          cost_usd REAL
        );

        -- Copy existing data, excluding merge columns and setting new columns to NULL
        INSERT INTO task_results_new (
          id, run_id, task_id, title, status, exit_code, auth_mode, critic_mode,
          attempt, commit_sha, started_at, finished_at, duration_seconds,
          dev_log_file, critic_log_file, diff_file,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          model, auth_mode_cost, cost_usd
        )
        SELECT
          id, run_id, task_id, title, status, exit_code, auth_mode, critic_mode,
          attempt, commit_sha, started_at, finished_at, duration_seconds,
          dev_log_file, critic_log_file, diff_file,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL
        FROM task_results;

        -- Drop old table and rename new one
        DROP TABLE task_results;
        ALTER TABLE task_results_new RENAME TO task_results;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_task_results_run ON task_results(run_id);
        CREATE INDEX IF NOT EXISTS idx_task_results_status ON task_results(status);
        CREATE INDEX IF NOT EXISTS idx_task_results_started ON task_results(started_at);

        COMMIT;
      `);

      console.log('Migration completed successfully.');
    }

    // Check if task_results has push_mode column and remove it
    const resultColumns = db.prepare("PRAGMA table_info(task_results)").all();
    const hasPushMode = resultColumns.some((col: any) => col.name === 'push_mode');

    if (hasPushMode) {
      console.log('Migrating task_results table to remove push_mode column...');

      db.exec(`
        BEGIN;

        -- Create new table without push_mode
        CREATE TABLE task_results_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL REFERENCES runs(id),
          task_id TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          exit_code INTEGER,
          auth_mode TEXT,
          critic_mode TEXT DEFAULT 'review',
          attempt INTEGER DEFAULT 1,
          commit_sha TEXT,
          started_at TEXT,
          finished_at TEXT,
          duration_seconds INTEGER,
          dev_log_file TEXT,
          critic_log_file TEXT,
          diff_file TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cache_read_tokens INTEGER,
          cache_write_tokens INTEGER,
          model TEXT,
          auth_mode_cost TEXT,
          cost_usd REAL
        );

        -- Copy data excluding push_mode
        INSERT INTO task_results_temp SELECT
          id, run_id, task_id, title, status, exit_code, auth_mode, critic_mode,
          attempt, commit_sha, started_at, finished_at, duration_seconds,
          dev_log_file, critic_log_file, diff_file,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          model, auth_mode_cost, cost_usd
        FROM task_results;

        -- Replace old table
        DROP TABLE task_results;
        ALTER TABLE task_results_temp RENAME TO task_results;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_task_results_run ON task_results(run_id);
        CREATE INDEX IF NOT EXISTS idx_task_results_status ON task_results(status);
        CREATE INDEX IF NOT EXISTS idx_task_results_started ON task_results(started_at);

        COMMIT;
      `);

      console.log('push_mode column migration completed successfully.');
    }

    // Check if tasks table has push column and remove it
    const taskColumns = db.prepare("PRAGMA table_info(tasks)").all();
    const taskHasPush = taskColumns.some((col: any) => col.name === 'push');

    if (taskHasPush) {
      console.log('Migrating tasks table to remove push column...');

      db.exec(`
        BEGIN;

        -- Create new tasks table without push
        CREATE TABLE tasks_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL REFERENCES runs(id),
          task_id TEXT NOT NULL,
          title TEXT NOT NULL,
          files TEXT,
          verify TEXT,
          critic TEXT DEFAULT 'review',
          spec TEXT,
          status_before TEXT DEFAULT 'pending',
          UNIQUE(run_id, task_id)
        );

        -- Copy data excluding push
        INSERT INTO tasks_temp SELECT
          id, run_id, task_id, title, files, verify, critic, spec, status_before
        FROM tasks;

        -- Replace old table
        DROP TABLE tasks;
        ALTER TABLE tasks_temp RENAME TO tasks;

        COMMIT;
      `);

      console.log('push column migration completed successfully.');
    }
  } else {
    // Table doesn't exist, create it with the new schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id),
        task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        exit_code INTEGER,
        auth_mode TEXT,
        critic_mode TEXT DEFAULT 'review',
        attempt INTEGER DEFAULT 1,
        commit_sha TEXT,
        started_at TEXT,
        finished_at TEXT,
        duration_seconds INTEGER,
        dev_log_file TEXT,
        critic_log_file TEXT,
        diff_file TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_write_tokens INTEGER,
        model TEXT,
        auth_mode_cost TEXT,
        cost_usd REAL
      );

      CREATE INDEX IF NOT EXISTS idx_task_results_run ON task_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_task_results_status ON task_results(status);
      CREATE INDEX IF NOT EXISTS idx_task_results_started ON task_results(started_at);
    `);
  }
}
