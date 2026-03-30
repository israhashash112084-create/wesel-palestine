import { Router } from 'express';
import { authenticate, authorize } from '#shared/middlewares/auth.middleware.js';
import { UserRoles } from '#shared/constants/roles.js';
import { incidentSubmitLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import {
  createIncidentSchema,
  updateIncidentBodySchema,
  incidentIdParamSchema,
  listIncidentsSchema,
  incidentHistoryQuerySchema,
  incidentReportsQuerySchema,
  nearbyIncidentsSchema,
} from './incidents.validator.js';

export const createIncidentsRouter = ({ incidentsController }) => {
  const router = Router();

  router.get(
    '/',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(listIncidentsSchema, 'query'),
    incidentsController.getAllIncidents
  );

  router.get(
    '/nearby',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(nearbyIncidentsSchema, 'query'),
    incidentsController.getNearbyIncidents
  );

  router.get(
    '/:id',
    authenticate,
    validateRequest(incidentIdParamSchema, 'params'),
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    incidentsController.getIncidentById
  );

  router.post(
    '/',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    incidentSubmitLimiter,
    validateRequest(createIncidentSchema, 'body'),
    incidentsController.createIncident
  );

  router.patch(
    '/:id',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(incidentIdParamSchema, 'params'),
    validateRequest(updateIncidentBodySchema, 'body'),
    incidentsController.updateIncident
  );

  router.patch(
    '/:id/close',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(incidentIdParamSchema, 'params'),
    incidentsController.closeIncident
  );

  router.get(
    '/:id/reports',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(incidentIdParamSchema, 'params'),
    validateRequest(incidentReportsQuerySchema, 'query'),
    incidentsController.getIncidentReports
  );

  router.get(
    '/:id/history',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(incidentIdParamSchema, 'params'),
    validateRequest(incidentHistoryQuerySchema, 'query'),
    incidentsController.getIncidentHistory
  );

  return router;
};

export default createIncidentsRouter;
