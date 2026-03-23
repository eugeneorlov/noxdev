import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// POST /api/runs/:id/tasks/:taskId/merge — body: { decision: 'approved' | 'rejected' }
router.post('/runs/:id/tasks/:taskId/merge', (req, res) => {
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
      SET merge_decision = ?, merged_at = datetime('now')
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

// POST /api/merge/:projectId — executes merge for all approved tasks
router.post('/:projectId', (req, res) => {
  try {
    const db = getDb();
    const projectId = req.params.projectId;

    // Query all approved tasks for this project
    const approvedTasksQuery = `
      SELECT tr.run_id, tr.task_id, tr.diff_file
      FROM task_results tr
      JOIN runs r ON tr.run_id = r.id
      WHERE r.project_id = ? AND tr.merge_decision = 'approved' AND tr.merged_at IS NOT NULL
    `;

    const approvedTasks = db.prepare(approvedTasksQuery).all(projectId);

    // TODO: For v1, just update the SQLite records and return count.
    // The actual git merge is deferred to the CLI (noxdev merge).
    // In the future, this should:
    // 1. Read each approved task's diff_file
    // 2. Apply the changes via git merge using child_process.execSync
    // 3. Update the database to mark tasks as actually merged

    const count = approvedTasks.length;

    res.json({
      success: true,
      merged: count
    });
  } catch (error) {
    console.error('Error executing merge:', error);
    res.status(500).json({ error: 'Failed to execute merge' });
  }
});

export default router;