import { useParams } from 'react-router-dom'

export default function RunDetail() {
  const { runId } = useParams()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Run Detail</h1>
      <p className="text-gray-600">Run Detail page placeholder for run: {runId}</p>
    </div>
  )
}