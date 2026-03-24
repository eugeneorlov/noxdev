import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { StatusBadge } from '../components/StatusBadge';
import { DiffViewer } from '../components/DiffViewer';

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

interface Project {
  id: string;
  name: string;
  display_name?: string;
  last_run_id?: string;
  last_run_status?: string;
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

type Decision = 'approved' | 'rejected';

interface LocalDecision {
  taskId: string;
  decision: Decision;
}

export default function MergeReview() {
  const { projectId } = useParams();
  const [localDecisions, setLocalDecisions] = useState<LocalDecision[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [taskDiffs, setTaskDiffs] = useState<Record<string, string>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Set<string>>(new Set());
  const [sendingDecisions, setSendingDecisions] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Fetch project info
  const { data: project, loading: projectLoading, error: projectError } = useApi<Project>(
    `/api/projects/${projectId}`
  );

  // Fetch run details
  const { data: run, loading: runLoading, error: runError } = useApi<RunDetail>(
    project?.last_run_id ? `/api/runs/${project.last_run_id}` : ''
  );

  // Filter pending tasks
  const pendingTasks = run?.task_results?.filter(
    task =>
      task.merge_decision === 'pending' &&
      task.commit_sha !== null &&
      (task.status === 'COMPLETED' || task.status === 'COMPLETED_RETRY')
  ) || [];

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

  const fetchDiff = async (taskId: string, runId: string) => {
    if (taskDiffs[taskId] || loadingDiffs.has(taskId)) return;

    setLoadingDiffs(prev => new Set([...prev, taskId]));
    try {
      const response = await fetch(`/api/runs/${runId}/tasks/${taskId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch diff: ${response.status}`);
      }
      const data = await response.json();
      setTaskDiffs(prev => ({ ...prev, [taskId]: data.diff }));
    } catch (error) {
      console.error('Error fetching diff:', error);
      setTaskDiffs(prev => ({ ...prev, [taskId]: 'Error loading diff' }));
    } finally {
      setLoadingDiffs(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    }
  };

  const toggleExpanded = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (expandedTasks.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
      if (run) {
        fetchDiff(taskId, run.id);
      }
    }
    setExpandedTasks(newExpanded);
  };

  const sendDecision = async (taskId: string, decision: Decision) => {
    if (!run || sendingDecisions.has(taskId)) return;

    setSendingDecisions(prev => new Set([...prev, taskId]));
    try {
      const response = await fetch(`/api/runs/${run.id}/tasks/${taskId}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send decision: ${response.status}`);
      }

      // Add to local decisions
      setLocalDecisions(prev => [
        ...prev.filter(d => d.taskId !== taskId),
        { taskId, decision }
      ]);
    } catch (error) {
      console.error('Error sending decision:', error);
      // Remove from local decisions on error
      setLocalDecisions(prev => prev.filter(d => d.taskId !== taskId));
    } finally {
      setSendingDecisions(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    }
  };

  const handleDecision = (taskId: string, decision: Decision) => {
    // Optimistically add to local state
    setLocalDecisions(prev => [
      ...prev.filter(d => d.taskId !== taskId),
      { taskId, decision }
    ]);

    // Send to API
    sendDecision(taskId, decision);
  };

  const getTaskDecision = (taskId: string): Decision | null => {
    const localDecision = localDecisions.find(d => d.taskId === taskId);
    return localDecision?.decision || null;
  };

  const calculateSummary = () => {
    const approved = localDecisions.filter(d => d.decision === 'approved').length;
    const rejected = localDecisions.filter(d => d.decision === 'rejected').length;
    const remaining = pendingTasks.length - localDecisions.length;
    return { approved, rejected, remaining };
  };

  const handleMerge = async () => {
    if (!project || merging) return;

    setMerging(true);
    setMergeResult(null);

    try {
      const response = await fetch(`/api/merge/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setMergeResult({ success: true, message: data.message });
      } else {
        setMergeResult({ success: false, message: data.error || 'Merge failed' });
      }
    } catch (error) {
      console.error('Error merging:', error);
      setMergeResult({ success: false, message: 'Network error during merge' });
    } finally {
      setMerging(false);
    }
  };

  if (projectLoading || runLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (projectError || runError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          Error: {projectError || runError}
        </div>
      </div>
    );
  }

  if (!project || !run) {
    return (
      <div className="p-6">
        <div className="text-gray-600">Project or run not found</div>
      </div>
    );
  }

  const { approved, rejected, remaining } = calculateSummary();
  const canMerge = approved > 0 && remaining === 0;

  if (pendingTasks.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">
            Merge review: {project.display_name || project.name}
          </h1>
          <p className="text-gray-600">Run {run.id}</p>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg text-center">
          <p className="text-gray-600 mb-4">All tasks reviewed. Nothing to merge.</p>
          <Link
            to="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          Merge review: {project.display_name || project.name}
        </h1>
        <p className="text-gray-600">
          Run {run.id} • {pendingTasks.length} task{pendingTasks.length !== 1 ? 's' : ''} pending review
        </p>
      </div>

      {/* Tasks List */}
      <div className="space-y-4 mb-6">
        {pendingTasks.map((task) => {
          const decision = getTaskDecision(task.task_id);
          const isExpanded = expandedTasks.has(task.task_id);
          const isLoadingDiff = loadingDiffs.has(task.task_id);
          const isSendingDecision = sendingDecisions.has(task.task_id);

          return (
            <div key={task.id} className="border border-gray-200 rounded-lg p-4">
              {/* Task Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-gray-500">{task.task_id}</span>
                  <h3 className="font-medium">{task.title}</h3>
                  <StatusBadge status={task.status} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 font-mono">
                    {formatDuration(task.duration_seconds)}
                  </span>
                  <span className="text-sm text-gray-600 font-mono">
                    {truncateCommitSha(task.commit_sha)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mb-3">
                {decision ? (
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      decision === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {decision === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    </span>
                    {isSendingDecision && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleDecision(task.task_id, 'approved')}
                      disabled={isSendingDecision}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {isSendingDecision ? 'Sending...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleDecision(task.task_id, 'rejected')}
                      disabled={isSendingDecision}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {isSendingDecision ? 'Sending...' : 'Reject'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => toggleExpanded(task.task_id)}
                  className="px-3 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                >
                  {isExpanded ? 'Hide diff' : 'Show diff'}
                </button>
              </div>

              {/* Expandable Diff */}
              {isExpanded && (
                <div className="mt-4 border-t pt-4">
                  {isLoadingDiff ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : taskDiffs[task.task_id] ? (
                    <DiffViewer diff={taskDiffs[task.task_id]} />
                  ) : (
                    <div className="text-gray-400 italic p-4">
                      No diff available for this task.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary and Merge Section */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-gray-600">
            {approved} approved, {rejected} rejected, {remaining} remaining
          </div>

          {canMerge && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {merging ? 'Merging...' : `Merge ${approved} approved commit${approved !== 1 ? 's' : ''} to main`}
            </button>
          )}
        </div>

        {/* Merge Result */}
        {mergeResult && (
          <div className={`p-4 rounded-lg mb-4 ${
            mergeResult.success
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            <p>{mergeResult.message}</p>
            {mergeResult.success && (
              <p className="mt-2 font-medium">Run 'git push origin main' when ready.</p>
            )}
          </div>
        )}

        {/* Back Link */}
        <div className="text-center">
          <Link
            to="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}