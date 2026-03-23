import { Link } from 'react-router-dom';
import { StatusBadge } from './StatusBadge';

interface Project {
  id: string;
  name: string;
  display_name?: string;
  last_run_id?: string;
  last_run_status?: string;
  completed?: number;
  failed?: number;
  total_tasks?: number;
  last_run_at?: string;
}

interface RunCardProps {
  project: Project;
}

export function RunCard({ project }: RunCardProps) {
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

  const displayName = project.display_name || project.name;
  const hasRun = !!project.last_run_id;

  return (
    <div className="rounded-lg border shadow-sm p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-lg">{displayName}</h3>
        {hasRun && project.last_run_status && (
          <StatusBadge status={project.last_run_status} />
        )}
      </div>

      {hasRun ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Last run: {formatRelativeTime(project.last_run_at!)}
          </p>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-600">
              {project.completed || 0} completed
            </span>
            <span className="text-red-600">
              {project.failed || 0} failed
            </span>
            <span className="text-gray-500">
              {project.total_tasks || 0} total
            </span>
          </div>

          <Link
            to={`/runs/${project.last_run_id}`}
            className="inline-block mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View run details →
          </Link>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No runs yet</p>
      )}
    </div>
  );
}