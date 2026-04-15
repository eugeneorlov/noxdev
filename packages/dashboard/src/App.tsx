import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import RunDetail from './pages/RunDetail'
import TaskDetail from './pages/TaskDetail'
import ProjectView from './pages/ProjectView'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/projects/:id" element={<ProjectView />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
          <Route path="/runs/:runId/tasks/:taskId" element={<TaskDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App