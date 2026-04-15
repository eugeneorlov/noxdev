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

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
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
