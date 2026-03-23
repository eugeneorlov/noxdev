import { useParams } from 'react-router-dom'

export default function ProjectView() {
  const { projectId } = useParams()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Project View</h1>
      <p className="text-gray-600">Project View page placeholder for project: {projectId}</p>
    </div>
  )
}