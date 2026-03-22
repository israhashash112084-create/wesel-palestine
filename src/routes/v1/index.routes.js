import { Router } from 'express';
import authRoute from '#modules/auth/auth.routes.js';
import reportsRoute from '#modules/reports/reports.routes.js';
import incidentsRouter from '#modules/incidents/incidents.routes.js';
import checkpointsRouter from '#modules/checkpoints/checkpoints.routes.js';

const router = Router();
router.use('/auth', authRoute);
router.use('/reports', reportsRoute);
router.use('/incidents', incidentsRouter);
router.use('/checkpoints', checkpointsRouter);

export default router;
