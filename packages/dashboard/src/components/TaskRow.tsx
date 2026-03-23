import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './StatusBadge';
import { useApi } from '../hooks/useApi';

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

interface TaskRowProps {
  task: TaskResult;
  runId: string;
}

export function TaskRow({ task, runId }: TaskRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: taskDetail, loading } = useApi<{
    task_spec?: string;
    files?: string;
    verify?: string;
  }>(`/api/runs/${runId}/tasks/${task.task_id}${isExpanded ? '' : '?skip=true'}`);

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  const truncateCommitSha = (sha: string | null): string => {
    if (!sha) return '—';
    return sha.substring(0, 7);
  };

  const getMergeDecisionBadge = (decision: string) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      merged: 'bg-blue-100 text-blue-800',
    };

    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[decision as keyof typeof styles] || styles.pending}`}>
        {decision}
      </span>
    );
  };

  const parseTaskFiles = (files: string | null): string[] => {
    if (!files) return [];
    try {
      return JSON.parse(files);
    } catch {
      // If it's not JSON, treat it as a simple string
      return files.split(',').map(f => f.trim()).filter(Boolean);
    }
  };

  return (
    <div className="border-b py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
      {/* Collapsed View */}
      <div
        className="flex items-center gap-4 w-full"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-shrink-0 w-16 text-sm font-mono text-gray-500">
          {task.task_id}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{task.title}</h3>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={task.status} />
          <span className="text-sm text-gray-600 font-mono">
            {formatDuration(task.duration_seconds)}
          </span>
          <span className="text-sm text-gray-600 font-mono">
            {truncateCommitSha(task.commit_sha)}
          </span>
          {getMergeDecisionBadge(task.merge_decision)}
        </div>

        <div className="flex-shrink-0 text-gray-400">
          {isExpanded ? '▼' : '▶'}
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="mt-4 pl-20 pr-4 space-y-3 text-sm">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {taskDetail?.task_spec && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Task Specification:</h4>
                  <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                    {taskDetail.task_spec}
                  </pre>
                </div>
              )}

              {taskDetail?.files && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Files:</h4>
                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded">
                    {parseTaskFiles(taskDetail.files).map((file, index) => (
                      <div key={index} className="text-xs font-mono text-gray-600">
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {taskDetail?.verify && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Verify Command:</h4>
                  <code className="bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded text-xs">
                    {taskDetail.verify}
                  </code>
                </div>
              )}

              <div className="pt-2">
                <Link
                  to={`/runs/${runId}/tasks/${task.task_id}`}
                  className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  View full task details →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}