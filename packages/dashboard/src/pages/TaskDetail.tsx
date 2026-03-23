import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { StatusBadge } from '../components/StatusBadge';
import { DiffViewer } from '../components/DiffViewer';
import { useState } from 'react';

interface TaskDetailData {
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
  task_spec?: string;
  files?: string;
  verify?: string;
  diff_content?: string;
}

export default function TaskDetail() {
  const { runId, taskId } = useParams();
  const { data: task, loading, error } = useApi<TaskDetailData>(`/api/runs/${runId}/tasks/${taskId}`);
  const [updating, setUpdating] = useState(false);

  const formatDateTime = (timestamp: string | null): string => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

  const handleMergeDecision = async (decision: 'approved' | 'rejected') => {
    if (!runId || !taskId || updating) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/runs/${runId}/tasks/${taskId}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Refresh the page to get updated data
      window.location.reload();
    } catch (err) {
      console.error('Failed to update merge decision:', err);
      alert('Failed to update merge decision. Please try again.');
    } finally {
      setUpdating(false);
    }
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

  if (!task) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <p className="text-gray-800">Task not found</p>
        </div>
      </div>
    );
  }

  const taskFiles = parseTaskFiles(task.files || null);

  return (
    <div className="p-6">
      {/* Back Link */}
      <div className="mb-4">
        <Link
          to={`/runs/${runId}`}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          ← Back to Run Detail
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {task.task_id} - {task.title}
            </h1>
          </div>
          <StatusBadge status={task.status} />
        </div>
      </div>

      <div className="space-y-8">
        {/* Specification */}
        {task.task_spec && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Specification</h2>
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
              {task.task_spec}
            </pre>
          </section>
        )}

        {/* Files */}
        {taskFiles.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Files</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <ul className="space-y-1">
                {taskFiles.map((file, index) => (
                  <li key={index} className="text-sm font-mono text-gray-700">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Execution */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Execution</h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600 block">Started:</span>
                <span className="font-mono">{formatDateTime(task.started_at)}</span>
              </div>
              <div>
                <span className="text-gray-600 block">Finished:</span>
                <span className="font-mono">{formatDateTime(task.finished_at)}</span>
              </div>
              <div>
                <span className="text-gray-600 block">Duration:</span>
                <span className="font-mono">{formatDuration(task.duration_seconds)}</span>
              </div>
              <div>
                <span className="text-gray-600 block">Exit Code:</span>
                <span className="font-mono">{task.exit_code ?? '—'}</span>
              </div>
              <div>
                <span className="text-gray-600 block">Auth Mode:</span>
                <span className="font-mono">{task.auth_mode ?? '—'}</span>
              </div>
              <div>
                <span className="text-gray-600 block">Commit SHA:</span>
                <span className="font-mono">{truncateCommitSha(task.commit_sha)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Diff */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Diff</h2>
          <DiffViewer diff={task.diff_content || ''} />
        </section>

        {/* Merge */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Merge</h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Current decision:</span>
                {getMergeDecisionBadge(task.merge_decision)}
              </div>

              {task.merge_decision === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMergeDecision('approved')}
                    disabled={updating}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleMergeDecision('rejected')}
                    disabled={updating}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Reject'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Logs */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Logs</h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600 block">Dev Agent Log:</span>
                <span className="font-mono">{task.dev_log_file || '—'}</span>
              </div>
              <div>
                <span className="text-gray-600 block">Critic Log:</span>
                <span className="font-mono">{task.critic_log_file || '—'}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}