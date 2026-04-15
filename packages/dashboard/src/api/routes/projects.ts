import { Router } from 'express';
import { getDb } from '../db.js';
import { getProjectTaskExecutions } from '../../../../cli/src/db/queries.js';

const router: Router = Router();

// GET /api/projects — returns all projects with their latest run info and cost data
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const query = `
      SELECT p.*, r.id as last_run_id, r.status as last_run_status,
             r.completed, r.failed, r.total_tasks, r.started_at as last_run_at,
             COALESCE(cost_data.api_cost_usd, 0) as api_cost_usd,
             COALESCE(cost_data.max_cost_usd_equivalent, 0) as max_cost_usd_equivalent,
             COALESCE(cost_data.total_cost_tasks, 0) as total_cost_tasks
      FROM projects p
      LEFT JOIN runs r ON p.id = r.project_id
        AND r.started_at = (SELECT MAX(started_at) FROM runs WHERE project_id = p.id)
      LEFT JOIN (
        SELECT
          r2.project_id,
          SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost_usd,
          SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost_usd_equivalent,
          COUNT(*) as total_cost_tasks
        FROM task_results tr
        JOIN runs r2 ON tr.run_id = r2.id
        WHERE tr.model IS NOT NULL
        GROUP BY r2.project_id
      ) cost_data ON p.id = cost_data.project_id
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

// GET /api/projects/:projectId/tasks — returns all task executions for one project as a flat list
router.get('/:projectId/tasks', (req, res) => {
  try {
    const db = getDb();
    const projectId = req.params.projectId;

    // Check if project exists
    const projectQuery = `SELECT id FROM projects WHERE id = ?`;
    const project = db.prepare(projectQuery).get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all task executions for this project
    const taskExecutions = getProjectTaskExecutions(db, projectId);

    res.json(taskExecutions);
  } catch (error) {
    console.error('Error fetching project task executions:', error);
    res.status(500).json({ error: 'Failed to fetch project task executions' });
  }
});

export default router;