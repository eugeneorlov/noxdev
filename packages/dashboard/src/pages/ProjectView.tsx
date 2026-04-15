import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { StatusBadge } from '../components/StatusBadge'
import { formatCost, formatNumber, formatDurationSeconds } from '../lib/format'

interface TaskExecution {
  run_id: string;
  run_started_at: string;
  run_auth_mode: string | null;
  run_status: string;
  task_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  model: string | null;
  auth_mode_cost: string | null;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  commit_sha: string | null;
  attempt: number;
  started_at: string;
  finished_at: string | null;
}

interface ProjectData {
  id: string;
  name: string;
  display_name?: string;
  repo_path?: string;
  last_run_id?: string;
}

export default function ProjectView() {
  const { id: projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Get sort parameters from URL or use defaults
  const sortBy = searchParams.get('sort') || 'run_started_at'
  const sortDir = searchParams.get('dir') || 'desc'

  const { data: project, loading: projectLoading, error: projectError } = useApi<ProjectData>(`/api/projects/${projectId}`)
  const { data: tasks, loading: tasksLoading, error: tasksError } = useApi<TaskExecution[]>(`/api/projects/${projectId}/tasks?sort=${sortBy}&dir=${sortDir}`)

  const loading = projectLoading || tasksLoading
  const error = projectError || tasksError

  // Handle sorting
  const handleSort = (column: string) => {
    let newDir = 'desc'
    if (sortBy === column && sortDir === 'desc') {
      newDir = 'asc'
    }
    setSearchParams({ sort: column, dir: newDir })
  }

  // Format date as MM/DD HH:mm
  const formatRunDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Format model to show meaningful component (e.g., "sonnet-4")
  const formatModel = (model: string | null): string => {
    if (!model) return '—'
    const parts = model.split('-')
    if (parts.length >= 2) {
      return parts.slice(-2).join('-')
    }
    return model
  }

  // Format cost with auth-mode asterisk
  const formatTaskCost = (cost: number, authModeCost: string | null, model: string | null): string => {
    if (cost === 0 && model === null) return '—'
    const costStr = formatCost(cost, 'aggregate')
    return authModeCost === 'max' ? `${costStr}*` : costStr
  }

  // Calculate aggregates
  const totalCost = tasks ? tasks.reduce((sum, task) => sum + task.cost_usd, 0) : 0
  const totalTokens = tasks ? tasks.reduce((sum, task) => sum + task.input_tokens + task.output_tokens, 0) : 0
  const totalTasks = tasks ? tasks.length : 0
  const uniqueRunCount = tasks ? new Set(tasks.map(task => task.run_id)).size : 0
  const hasModelData = tasks ? tasks.some(task => task.model !== null) : false

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
          <Link
            to="/"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium mt-2 inline-block"
          >
            ← Back to Overview
          </Link>
        </div>
      </div>
    );
  }

  const displayName = project.display_name || project.name;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium mb-4 inline-block"
        >
          ← Back to Overview
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{displayName}</h1>
        {project.repo_path && (
          <p className="text-gray-600 dark:text-gray-400">{project.repo_path}</p>
        )}
      </div>

      {/* Aggregate Cards */}
      {hasModelData ? (
        <div className="mb-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {totalTasks} task executions across {uniqueRunCount} runs
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Cost Card */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCost(totalCost, 'aggregate')}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Cost*
              </div>
            </div>

            {/* Tokens Card */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatNumber(totalTokens)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Tokens*
              </div>
            </div>
          </div>

          {/* Footnotes */}
          <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
            <div>* Token-based cost. Max-mode tasks show equivalent API cost.</div>
            <div>* Input + output. Cache tokens shown in task detail.</div>
          </div>
        </div>
      ) : (
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
          <p className="text-blue-800 dark:text-blue-200">No cost data captured yet for this project.</p>
        </div>
      )}

      {/* Task Table */}
      {tasks && tasks.length > 0 ? (
        <div className="bg-white dark:bg-[var(--nox-surface)] rounded-lg border border-gray-200 dark:border-[var(--nox-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('run_started_at')}
                  >
                    Run Date {sortBy === 'run_started_at' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('task_id')}
                  >
                    Task ID {sortBy === 'task_id' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('duration_seconds')}
                  >
                    Duration {sortBy === 'duration_seconds' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Model
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('cost_usd')}
                  >
                    Cost {sortBy === 'cost_usd' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tasks.map((task, index) => (
                  <tr
                    key={`${task.run_id}-${task.task_id}-${index}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => navigate(`/runs/${task.run_id}/tasks/${task.task_id}`)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatRunDate(task.run_started_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">
                      {task.task_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" title={task.title}>
                      <div className="max-w-60 truncate">
                        {task.title}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDurationSeconds(task.duration_seconds)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatModel(task.model)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatTaskCost(task.cost_usd, task.auth_mode_cost, task.model)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No tasks recorded for this project yet.</p>
        </div>
      )}
    </div>
  )
}