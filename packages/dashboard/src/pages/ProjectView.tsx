import { useParams, Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { StatusBadge } from '../components/StatusBadge'

interface Run {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  total_tasks: number;
  completed: number;
  failed: number;
}

interface ProjectData {
  id: string;
  name: string;
  display_name?: string;
  last_run_id?: string;
  runs: Run[];
}

export default function ProjectView() {
  const { id: projectId } = useParams()
  const { data: project, loading, error } = useApi<ProjectData>(`/api/projects/${projectId}`)

  const formatRelativeTime = (timestamp: string): string => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const formatDateTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  if (!project) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
          <p className="text-yellow-800 dark:text-yellow-200">Project not found</p>
        </div>
      </div>
    );
  }

  const displayName = project.display_name || project.name;

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          to="/"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium mb-4 inline-block"
        >
          ← Back to Overview
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{displayName}</h1>
        <p className="text-gray-600 dark:text-gray-400">Project ID: {project.id}</p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Runs</h2>

          {project.runs && project.runs.length > 0 ? (
            <div className="space-y-3">
              {project.runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded-lg border border-gray-200 dark:border-[var(--nox-border)] bg-white dark:bg-[var(--nox-surface)] shadow-sm p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/runs/${run.id}`}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        Run {run.id.substring(0, 8)}...
                      </Link>
                      <StatusBadge status={run.status} />
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(run.started_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm mb-2">
                    <span className="text-green-600">
                      {run.completed || 0} completed
                    </span>
                    <span className="text-red-600">
                      {run.failed || 0} failed
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {run.total_tasks || 0} total
                    </span>
                  </div>

                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    Started: {formatDateTime(run.started_at)}
                    {run.completed_at && (
                      <> • Completed: {formatDateTime(run.completed_at)}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No runs found for this project</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Runs will appear here once you start using noxdev with this project.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}