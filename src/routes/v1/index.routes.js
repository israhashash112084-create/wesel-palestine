import { Router } from 'express';
import authRoute from '#modules/auth/auth.routes.js';
import reportsRoute from '#modules/reports/reports.routes.js';

const router = Router();
router.use('/auth', authRoute);
router.use('/reports', reportsRoute);

export default router;
