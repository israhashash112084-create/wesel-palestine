import { Router } from 'express';
import { ReportsRepository }   from './reports.repository.js';
import { ReportsService }      from './reports.service.js';
import { ReportsController }   from './reports.controller.js';
import { authenticate }        from '#shared/middlewares/auth.middleware.js';
import { validateRequest }     from '#shared/middlewares/validate.middleware.js';
import { reportSubmitLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { createReportSchema }  from './reports.validator.js';

const reportsRepository = new ReportsRepository();
const reportsService    = new ReportsService(reportsRepository);
const reportsController = new ReportsController(reportsService);

const router = Router();
router.post('/',authenticate,reportSubmitLimiter,validateRequest(createReportSchema, 'body'),reportsController.submitReport);

export default router;