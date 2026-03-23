import { useParams } from 'react-router-dom'

export default function MergeReview() {
  const { projectId } = useParams()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Merge Review</h1>
      <p className="text-gray-600">Merge Review page placeholder for project: {projectId}</p>
    </div>
  )
}