import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import RunDetail from './pages/RunDetail'
import TaskDetail from './pages/TaskDetail'
import MergeReview from './pages/MergeReview'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
          <Route path="/runs/:runId/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/merge/:projectId" element={<MergeReview />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App