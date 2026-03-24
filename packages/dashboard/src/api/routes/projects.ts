import { Router } from 'express';
import { getDb } from '../db.js';

const router: Router = Router();

// GET /api/projects — returns all projects with their latest run info
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const query = `
      SELECT p.*, r.id as last_run_id, r.status as last_run_status,
             r.completed, r.failed, r.total_tasks, r.started_at as last_run_at
      FROM projects p
      LEFT JOIN runs r ON p.id = r.project_id
        AND r.started_at = (SELECT MAX(started_at) FROM runs WHERE project_id = p.id)
    `;

    const projects = db.prepare(query).all();
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id — returns single project with last 10 runs
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const projectId = req.params.id;

    // Get project info with last run
    const projectQuery = `
      SELECT p.*, r.id as last_run_id
      FROM projects p
      LEFT JOIN runs r ON p.id = r.project_id
        AND r.started_at = (SELECT MAX(started_at) FROM runs WHERE project_id = p.id)
      WHERE p.id = ?
    `;
    const project = db.prepare(projectQuery).get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get last 10 runs for this project
    const runsQuery = `
      SELECT * FROM runs
      WHERE project_id = ?
      ORDER BY started_at DESC
      LIMIT 10
    `;
    const runs = db.prepare(runsQuery).all(projectId);

    res.json({
      ...project,
      runs
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

export default router;