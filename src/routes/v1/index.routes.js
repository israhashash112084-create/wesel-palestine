import { Router } from 'express';
import authRoute from '#modules/auth/auth.routes.js';
import reportsRoute from '#modules/reports/reports.routes.js';
import alertsRoute from '#modules/alerts/alerts.routes.js';
import incidentsRouter from '#modules/incidents/incidents.routes.js';

const router = Router();

router.use('/auth', authRoute);
router.use('/reports', reportsRoute);
router.use('/alerts', alertsRoute);
router.use('/incidents', incidentsRouter);

export default router;