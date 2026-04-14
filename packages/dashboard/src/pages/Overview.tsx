import { useApi } from '../hooks/useApi';
import { RunCard } from '../components/RunCard';
import { CostSummary } from '../components/CostSummary';

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

export default function Overview() {
  const { data: projects, loading, error } = useApi<Project[]>('/api/projects');
  const { data: costSummary, loading: costLoading } = useApi('/api/cost/summary');

  const getCurrentDate = (): string => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateTotalStats = () => {
    if (!projects || projects.length === 0) {
      return { totalCompleted: 0, totalFailed: 0, totalTasks: 0 };
    }

    return projects.reduce(
      (acc, project) => ({
        totalCompleted: acc.totalCompleted + (project.completed || 0),
        totalFailed: acc.totalFailed + (project.failed || 0),
        totalTasks: acc.totalTasks + (project.total_tasks || 0),
      }),
      { totalCompleted: 0, totalFailed: 0, totalTasks: 0 }
    );
  };

  const hasZeroRuns = () => {
    if (!projects || projects.length === 0) return true;
    return projects.every(project => !project.last_run_id && (!project.total_tasks || project.total_tasks === 0));
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

  const stats = calculateTotalStats();

  return (
    <div className="p-6">
      <CostSummary summary={costSummary} loading={costLoading} />

      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Good morning</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{getCurrentDate()}</p>

        {projects && projects.length > 0 && (
          <div className="flex gap-6 text-sm">
            <div className="text-green-600 font-medium">
              {stats.totalCompleted} completed
            </div>
            <div className="text-red-600 font-medium">
              {stats.totalFailed} failed
            </div>
            <div className="text-gray-500 dark:text-gray-400 font-medium">
              {stats.totalTasks} total tasks
            </div>
          </div>
        )}
      </header>

      {hasZeroRuns() ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">No runs found</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Get started by running: <code className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 rounded">noxdev demo</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <RunCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}