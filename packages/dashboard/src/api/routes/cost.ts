import { Router } from 'express';
import { getDb } from '../db.js';

const router: Router = Router();

// Helper function to parse since parameter
function parseSinceDate(since: string = 'all'): string {
  const now = new Date();

  if (since === 'all') {
    return '1970-01-01';
  }

  // Handle relative dates like '7d', '30d'
  const relativeMatch = since.match(/^(\d+)d$/);
  if (relativeMatch) {
    const days = parseInt(relativeMatch[1]);
    const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }

  // Handle absolute dates like 'YYYY-MM-DD'
  const absoluteMatch = since.match(/^\d{4}-\d{2}-\d{2}$/);
  if (absoluteMatch) {
    return since;
  }

  throw new Error(`Invalid since format: ${since}. Use '7d', '30d', 'YYYY-MM-DD', or 'all'`);
}

// GET /api/cost/summary?since=<spec>
router.get('/summary', (req, res) => {
  try {
    const db = getDb();
    const since = req.query.since as string;
    const sinceDate = parseSinceDate(since);

    const result = db.prepare(`
      SELECT
        COUNT(*) as total_tasks,
        SUM(tr.input_tokens) as input_tokens,
        SUM(tr.output_tokens) as output_tokens,
        SUM(tr.cache_read_tokens) as cache_read_tokens,
        SUM(tr.cache_write_tokens) as cache_write_tokens,
        SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost_usd,
        SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost_usd_equivalent,
        COUNT(CASE WHEN tr.auth_mode_cost = 'api' THEN 1 END) as api_tasks,
        COUNT(CASE WHEN tr.auth_mode_cost = 'max' THEN 1 END) as max_tasks
      FROM task_results tr
      JOIN runs r ON tr.run_id = r.id
      WHERE (tr.started_at IS NULL OR tr.started_at >= ?)
        AND tr.model IS NOT NULL
    `).get(sinceDate) as any;

    if (!result) {
      return res.json({
        tokens: {
          input: 0,
          output: 0,
          cache_read: 0,
          cache_write: 0
        },
        api: {
          tasks: 0,
          cost_usd: 0
        },
        max: {
          tasks: 0,
          cost_usd_equivalent: 0
        },
        total_tasks: 0
      });
    }

    res.json({
      tokens: {
        input: result.input_tokens || 0,
        output: result.output_tokens || 0,
        cache_read: result.cache_read_tokens || 0,
        cache_write: result.cache_write_tokens || 0
      },
      api: {
        tasks: result.api_tasks || 0,
        cost_usd: result.api_cost_usd || 0
      },
      max: {
        tasks: result.max_tasks || 0,
        cost_usd_equivalent: result.max_cost_usd_equivalent || 0
      },
      total_tasks: result.total_tasks || 0
    });
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// GET /api/cost/projects?since=<spec>
router.get('/projects', (req, res) => {
  try {
    const db = getDb();
    const since = req.query.since as string;
    const sinceDate = parseSinceDate(since);

    const results = db.prepare(`
      SELECT
        r.project_id,
        p.display_name,
        COUNT(*) as tasks,
        SUM(tr.input_tokens) as input_tokens,
        SUM(tr.output_tokens) as output_tokens,
        SUM(CASE WHEN tr.auth_mode_cost = 'api' THEN tr.cost_usd ELSE 0 END) as api_cost_usd,
        SUM(CASE WHEN tr.auth_mode_cost = 'max' THEN tr.cost_usd ELSE 0 END) as max_cost_usd_equivalent
      FROM task_results tr
      JOIN runs r ON tr.run_id = r.id
      JOIN projects p ON r.project_id = p.id
      WHERE (tr.started_at IS NULL OR tr.started_at >= ?)
        AND tr.model IS NOT NULL
      GROUP BY r.project_id, p.display_name
      ORDER BY p.display_name
    `).all(sinceDate) as any[];

    res.json(results.map(row => ({
      project_id: row.project_id,
      display_name: row.display_name,
      tasks: row.tasks || 0,
      input_tokens: row.input_tokens || 0,
      output_tokens: row.output_tokens || 0,
      api_cost_usd: row.api_cost_usd || 0,
      max_cost_usd_equivalent: row.max_cost_usd_equivalent || 0
    })));
  } catch (error) {
    console.error('Error fetching project costs:', error);
    res.status(500).json({ error: 'Failed to fetch project costs' });
  }
});

// GET /api/cost/runs/:runId
router.get('/runs/:runId', (req, res) => {
  try {
    const db = getDb();
    const { runId } = req.params;

    if (!runId) {
      return res.status(400).json({ error: 'runId parameter is required' });
    }

    const result = db.prepare(`
      SELECT
        COUNT(*) as total_tasks,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cache_read_tokens) as cache_read_tokens,
        SUM(cache_write_tokens) as cache_write_tokens,
        SUM(CASE WHEN auth_mode_cost = 'api' THEN cost_usd ELSE 0 END) as api_cost_usd,
        SUM(CASE WHEN auth_mode_cost = 'max' THEN cost_usd ELSE 0 END) as max_cost_usd_equivalent,
        COUNT(CASE WHEN auth_mode_cost = 'api' THEN 1 END) as api_tasks,
        COUNT(CASE WHEN auth_mode_cost = 'max' THEN 1 END) as max_tasks,
        MIN(started_at) as earliest_started_at,
        MAX(finished_at) as latest_finished_at
      FROM task_results
      WHERE run_id = ? AND model IS NOT NULL
    `).get(runId) as any;

    if (!result || result.total_tasks === 0) {
      return res.status(404).json({ error: 'Run not found or no tasks with cost data' });
    }

    res.json({
      run_id: runId,
      tokens: {
        input: result.input_tokens || 0,
        output: result.output_tokens || 0,
        cache_read: result.cache_read_tokens || 0,
        cache_write: result.cache_write_tokens || 0
      },
      api: {
        tasks: result.api_tasks || 0,
        cost_usd: result.api_cost_usd || 0
      },
      max: {
        tasks: result.max_tasks || 0,
        cost_usd_equivalent: result.max_cost_usd_equivalent || 0
      },
      total_tasks: result.total_tasks || 0,
      earliest_started_at: result.earliest_started_at,
      latest_finished_at: result.latest_finished_at
    });
  } catch (error) {
    console.error('Error fetching run cost breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch run cost breakdown' });
  }
});

export default router;