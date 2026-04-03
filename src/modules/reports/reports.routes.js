import { Router } from 'express';
import {
  authenticate,
  optionalAuthenticate,
  authorize,
} from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { reportSubmitLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import {
  ReportSchema,
  updateReportSchema,
  listReportsSchema,
  voteReportSchema,
  reportIdSchema,
  moderateReportSchema,
} from './reports.validator.js';
import { UserRoles } from '#shared/constants/roles.js';

export const createReportsRouter = ({ reportsController }) => {
  const router = Router();
  router.post(
    '/',
    authenticate,
    reportSubmitLimiter,
    validateRequest(ReportSchema, 'body'),
    areaReportLimiter,
    reportsController.submitReport
  );
  router.get(
    '/',
    optionalAuthenticate,
    validateRequest(listReportsSchema, 'query'),
    reportsController.retrieveReports
  );
  router.get(
    '/:id',
    optionalAuthenticate,
    validateRequest(reportIdSchema, 'params'),
    reportsController.getReport
  );
  router.post(
    '/:id/vote',
    authenticate,
    validateRequest(reportIdSchema, 'params'),
    validateRequest(voteReportSchema, 'body'),
    reportsController.voteOnReport
  );
  router.patch(
    '/:id',
    authenticate,
    validateRequest(reportIdSchema, 'params'),
    validateRequest(updateReportSchema, 'body'),
    reportsController.updateReport
  );
  router.patch(
    '/:id/moderate',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(reportIdSchema, 'params'),
    validateRequest(moderateReportSchema, 'body'),
    reportsController.moderateReport
  );
  return router;
};

export default createReportsRouter;
