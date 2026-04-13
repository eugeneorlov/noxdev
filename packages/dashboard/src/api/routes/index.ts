import { Router } from 'express';
import projectsRouter from './projects.js';
import runsRouter from './runs.js';

const router: Router = Router();

// Mount all route modules
router.use('/projects', projectsRouter);
router.use('/runs', runsRouter);

export default router;