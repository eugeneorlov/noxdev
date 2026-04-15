import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { StatusBadge } from '../components/StatusBadge';
import { TaskRow } from '../components/TaskRow';
import { formatCost } from '../lib/format';

interface TaskResult {
  id: number;
  run_id: string;
  task_id: string;
  title: string;
  status: string;
  exit_code: number | null;
  auth_mode: string | null;
  critic_mode: string | null;
  attempt: number;
  commit_sha: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  dev_log_file: string | null;
  critic_log_file: string | null;
  diff_file: string | null;
  cost_usd: number | null;
  auth_mode_cost: string | null;
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

interface RunCostBreakdown {
  run_id: string;
  total_tasks: number;
  tasks_with_cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  api_tasks: number;
  api_cost_usd: number;
  max_tasks: number;
  max_cost_usd_equivalent: number;
}

export default function RunDetail() {
  const { runId } = useParams();
  const { data: run, loading, error } = useApi<RunDetail>(`/api/runs/${runId}`);
  const { data: costData, loading: costLoading } = useApi<RunCostBreakdown>(`/api/cost/runs/${runId}`);

  const formatDateTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <p className="text-red-800 dark:text-red-200">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-4">
          <p className="text-gray-800 dark:text-gray-200">Run not found</p>
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
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
        >
          ← Back to Overview
        </Link>
      </div>

      {/* Run Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              {run.project_display_name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-mono">Run ID: {run.id}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Started:</span>
            <div className="font-mono text-gray-900 dark:text-gray-100">{formatDateTime(run.started_at)}</div>
          </div>
          {run.finished_at && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Finished:</span>
              <div className="font-mono text-gray-900 dark:text-gray-100">{formatDateTime(run.finished_at)}</div>
            </div>
          )}
          <div>
            <span className="text-gray-500 dark:text-gray-400">Auth Mode:</span>
            <div className="font-mono text-gray-900 dark:text-gray-100">{run.auth_mode}</div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Tasks:</span>
            <div className="font-mono text-gray-900 dark:text-gray-100">
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
            <div className="text-gray-500 dark:text-gray-400 font-medium">
              {run.skipped} skipped
            </div>
          </div>

          <div className="flex h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
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

      {/* Cost Rollup Section */}
      {costData && (
        <div className="mb-8">
          {costData.tasks_with_cost === 0 && costData.total_tasks > 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-6">
              <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                No cost data captured for this run.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCost(costData.api_cost_usd, 'currency', { minDecimals: 2, maxDecimals: 2 }) as string}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Cost
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {costData.api_tasks} tasks
                </div>
              </div>

              <div className="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {formatCost(costData.max_cost_usd_equivalent, 'currency', { minDecimals: 2, maxDecimals: 2 }) as string}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Cost
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {costData.max_tasks} tasks
                </div>
              </div>

              <div className="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatNumber(costData.input_tokens + costData.output_tokens)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Total Tokens
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {costData.tasks_with_cost} tasks with cost data
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task List */}
      <div className="bg-white dark:bg-[var(--nox-surface)] rounded-lg border border-gray-200 dark:border-[var(--nox-border)] shadow-sm">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[var(--nox-border)] bg-gray-50 dark:bg-gray-800">
          <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">Tasks</h2>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-[var(--nox-border)]">
          {run.task_results && run.task_results.length > 0 ? (
            run.task_results.map((task) => (
              <TaskRow key={task.id} task={task} runId={run.id} />
            ))
          ) : (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              No tasks found for this run
            </div>
          )}
        </div>
      </div>
    </div>
  );
}