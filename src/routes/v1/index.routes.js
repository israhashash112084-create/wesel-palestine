import { Router } from 'express';
import authRoute from '#modules/auth/auth.routes.js';
import reportsRoute from '#modules/reports/reports.routes.js';
import routesRoute  from '#modules/routes/routes.routes.js';

const router = Router();
router.use('/auth', authRoute);
router.use('/reports', reportsRoute);
router.use('/routes',  routesRoute);

export default router;
