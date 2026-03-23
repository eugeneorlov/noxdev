import { useParams } from 'react-router-dom'

export default function TaskDetail() {
  const { runId, taskId } = useParams()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Task Detail</h1>
      <p className="text-gray-600">Task Detail page placeholder for run: {runId}, task: {taskId}</p>
    </div>
  )
}