import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { getDb } from '../db.js';

const router: Router = Router();

// GET /api/runs — returns all runs, newest first, limit 50
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const query = `
      SELECT r.*, p.display_name as project_display_name
      FROM runs r
      JOIN projects p ON r.project_id = p.id
      ORDER BY r.started_at DESC
      LIMIT 50
    `;

    const runs = db.prepare(query).all();
    res.json(runs);
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// GET /api/runs/:id — returns run detail with all task_results
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const runId = req.params.id;

    // Get run info with project display_name
    const runQuery = `
      SELECT r.*, p.display_name as project_display_name
      FROM runs r
      JOIN projects p ON r.project_id = p.id
      WHERE r.id = ?
    `;
    const run = db.prepare(runQuery).get(runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Get all task_results for this run
    const taskResultsQuery = `
      SELECT * FROM task_results
      WHERE run_id = ?
      ORDER BY id ASC
    `;
    const taskResults = db.prepare(taskResultsQuery).all(runId);

    res.json({
      ...run,
      task_results: taskResults
    });
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

// GET /api/runs/:id/tasks/:taskId — returns single task_result plus cached task spec
router.get('/:id/tasks/:taskId', (req, res) => {
  try {
    const db = getDb();
    const runId = req.params.id;
    const taskId = req.params.taskId;

    // Get task_result with joined task spec
    const query = `
      SELECT tr.*, t.spec as task_spec
      FROM task_results tr
      JOIN tasks t ON t.run_id = tr.run_id AND t.task_id = tr.task_id
      WHERE tr.run_id = ? AND tr.task_id = ?
    `;

    const taskResult = db.prepare(query).get(runId, taskId);

    if (!taskResult) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Read diff file if it exists
    let diff = null;
    if ((taskResult as any).diff_file) {
      try {
        diff = readFileSync((taskResult as any).diff_file, 'utf-8');
      } catch (error) {
        // File doesn't exist or can't be read, diff stays null
        console.warn(`Could not read diff file: ${(taskResult as any).diff_file}`, error);
      }
    }

    res.json({
      ...taskResult,
      diff
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// GET /api/runs/:id/tasks/:taskId/diff — returns raw diff text
router.get('/:id/tasks/:taskId/diff', (req, res) => {
  try {
    const db = getDb();
    const runId = req.params.id;
    const taskId = req.params.taskId;

    // Get diff_file path from task_results
    const query = `
      SELECT diff_file FROM task_results
      WHERE run_id = ? AND task_id = ?
    `;

    const result = db.prepare(query).get(runId, taskId);

    if (!result || !(result as any).diff_file) {
      return res.status(404).json({ error: 'No diff available for this task' });
    }

    try {
      const diffContent = readFileSync((result as any).diff_file, 'utf-8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(diffContent);
    } catch (error) {
      console.error('Error reading diff file:', error);
      res.status(404).json({ error: 'Diff file not found' });
    }
  } catch (error) {
    console.error('Error fetching diff:', error);
    res.status(500).json({ error: 'Failed to fetch diff' });
  }
});

// POST /api/runs/:id/tasks/:taskId/merge — body: { decision: 'approved' | 'rejected' }
router.post('/:id/tasks/:taskId/merge', (req, res) => {
  try {
    const db = getDb();
    const runId = req.params.id;
    const taskId = req.params.taskId;
    const { decision } = req.body;

    // Validate decision
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
    }

    // Check if task exists
    const checkQuery = `
      SELECT id FROM task_results
      WHERE run_id = ? AND task_id = ?
    `;
    const existingTask = db.prepare(checkQuery).get(runId, taskId);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update merge decision
    const updateQuery = `
      UPDATE task_results
      SET merge_decision = LOWER(?), merged_at = datetime('now')
      WHERE run_id = ? AND task_id = ?
    `;

    const result = db.prepare(updateQuery).run(decision, runId, taskId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Task not found or no changes made' });
    }

    res.json({
      success: true,
      taskId,
      decision
    });
  } catch (error) {
    console.error('Error updating merge decision:', error);
    res.status(500).json({ error: 'Failed to update merge decision' });
  }
});

export default router;