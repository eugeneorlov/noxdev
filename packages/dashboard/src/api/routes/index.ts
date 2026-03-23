import { Router } from 'express';
import projectsRouter from './projects.js';
import runsRouter from './runs.js';
import mergeRouter from './merge.js';

const router: Router = Router();

// Mount all route modules
router.use('/projects', projectsRouter);
router.use('/runs', runsRouter);
router.use('/merge', mergeRouter);

export default router;