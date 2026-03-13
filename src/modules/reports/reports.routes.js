import { Router } from 'express';
import { ReportsRepository }   from './reports.repository.js';
import { ReportsService }      from './reports.service.js';
import { ReportsController }   from './reports.controller.js';
import { authenticate,optionalAuthenticate}        from '#shared/middlewares/auth.middleware.js';
import { validateRequest }     from '#shared/middlewares/validate.middleware.js';
import { reportSubmitLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { createReportSchema,  listReportsSchema,  voteReportSchema,reportIdSchema}  from './reports.validator.js';

const reportsRepository = new ReportsRepository();
const reportsService    = new ReportsService(reportsRepository);
const reportsController = new ReportsController(reportsService);

const router = Router();
router.post('/',authenticate,reportSubmitLimiter,validateRequest(createReportSchema, 'body'),reportsController.submitReport);
router.get('/',optionalAuthenticate,validateRequest(listReportsSchema, 'query'),reportsController.retrieveReports);
router.get('/:id',optionalAuthenticate,validateRequest(reportIdSchema, 'params'),reportsController.getReport);
router.post('/:id/vote',authenticate,validateRequest(reportIdSchema, 'params'),validateRequest(voteReportSchema, 'body'),reportsController.voteOnReport);

export default router;