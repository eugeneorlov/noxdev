import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { StatusBadge } from '../components/StatusBadge';
import { TaskRow } from '../components/TaskRow';

interface TaskResult {
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

interface RunDetail {
  id: string;
  project_id: string;
  project_display_name: string;
  started_at: string;
  finished_at: string | null;
  auth_mode: string;
  total_tasks: number;
  completed: number;
  failed: number;
  skipped: number;
  status: string;
  log_file: string | null;
  commit_before: string | null;
  commit_after: string | null;
  task_results: TaskResult[];
}

export default function RunDetail() {
  const { runId } = useParams();
  const { data: run, loading, error } = useApi<RunDetail>(`/api/runs/${runId}`);

  const formatDateTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateSummaryBar = () => {
    if (!run) return { completed: 0, failed: 0, skipped: 0 };

    const total = run.total_tasks || 1; // Avoid division by zero
    return {
      completed: Math.round((run.completed / total) * 100),
      failed: Math.round((run.failed / total) * 100),
      skipped: Math.round((run.skipped / total) * 100),
    };
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <p className="text-gray-800">Run not found</p>
        </div>
      </div>
    );
  }

  const summaryBar = calculateSummaryBar();

  return (
    <div className="p-6">
      {/* Back Link */}
      <div className="mb-4">
        <Link
          to="/"
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          ← Back to Overview
        </Link>
      </div>

      {/* Run Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {run.project_display_name}
            </h1>
            <p className="text-gray-600 text-sm font-mono">Run ID: {run.id}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
          <div>
            <span className="text-gray-500">Started:</span>
            <div className="font-mono">{formatDateTime(run.started_at)}</div>
          </div>
          {run.finished_at && (
            <div>
              <span className="text-gray-500">Finished:</span>
              <div className="font-mono">{formatDateTime(run.finished_at)}</div>
            </div>
          )}
          <div>
            <span className="text-gray-500">Auth Mode:</span>
            <div className="font-mono">{run.auth_mode}</div>
          </div>
          <div>
            <span className="text-gray-500">Tasks:</span>
            <div className="font-mono">
              {run.completed}/{run.total_tasks} completed
            </div>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-4 text-sm mb-2">
            <div className="text-green-600 font-medium">
              {run.completed} completed
            </div>
            <div className="text-red-600 font-medium">
              {run.failed} failed
            </div>
            <div className="text-gray-500 font-medium">
              {run.skipped} skipped
            </div>
          </div>

          <div className="flex h-2 bg-gray-200 rounded-full overflow-hidden">
            {summaryBar.completed > 0 && (
              <div
                className="bg-green-500"
                style={{ width: `${summaryBar.completed}%` }}
              />
            )}
            {summaryBar.failed > 0 && (
              <div
                className="bg-red-500"
                style={{ width: `${summaryBar.failed}%` }}
              />
            )}
            {summaryBar.skipped > 0 && (
              <div
                className="bg-gray-400"
                style={{ width: `${summaryBar.skipped}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-lg">Tasks</h2>
        </div>

        <div className="divide-y">
          {run.task_results && run.task_results.length > 0 ? (
            run.task_results.map((task) => (
              <TaskRow key={task.id} task={task} runId={run.id} />
            ))
          ) : (
            <div className="p-6 text-center text-gray-500">
              No tasks found for this run
            </div>
          )}
        </div>
      </div>
    </div>
  );
}