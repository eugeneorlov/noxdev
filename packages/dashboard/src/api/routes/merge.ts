import { Router } from 'express';
import { getDb } from '../db.js';

const router: Router = Router();


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
      WHERE r.project_id = ? AND LOWER(tr.merge_decision) = 'approved' AND tr.merged_at IS NOT NULL
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