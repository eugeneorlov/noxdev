import { Router } from 'express';
import projectsRouter from './projects.js';
import runsRouter from './runs.js';
import costRouter from './cost.js';

const router: Router = Router();

// Mount all route modules
router.use('/projects', projectsRouter);
router.use('/runs', runsRouter);
router.use('/cost', costRouter);

export default router;