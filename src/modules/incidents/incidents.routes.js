import { Router } from 'express';
import { authenticate, authorize } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { IncidentsRepository } from './incidents.repository.js';
import { IncidentsService } from './incidents.service.js';
import { IncidentsController } from './incidents.controller.js';
import {
  createIncidentSchema,
  updateIncidentBodySchema,
  incidentIdParamSchema,
  listIncidentsSchema,
  incidentHistoryQuerySchema,
  nearbyIncidentsSchema,
} from './incidents.validator.js';

const router = Router();

const incidentsRepository = new IncidentsRepository();
const incidentsService = new IncidentsService(incidentsRepository);
const incidentsController = new IncidentsController(incidentsService);

router.get(
  '/',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(listIncidentsSchema, 'query'),
  incidentsController.getAllIncidents
);

router.get(
  '/nearby',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(nearbyIncidentsSchema, 'query'),
  incidentsController.getNearbyIncidents
);

router.get(
  '/:id',
  authenticate,
  validateRequest(incidentIdParamSchema, 'params'),
  authorize('moderator', 'admin'),
  incidentsController.getIncidentById
);

router.post(
  '/',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(createIncidentSchema, 'body'),
  incidentsController.createIncident
);

router.patch(
  '/:id',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(incidentIdParamSchema, 'params'),
  validateRequest(updateIncidentBodySchema, 'body'),
  incidentsController.updateIncident
);

router.patch(
  '/:id/close',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(incidentIdParamSchema, 'params'),
  incidentsController.closeIncident
);

router.get(
  '/:id/reports',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(incidentIdParamSchema, 'params'),
  incidentsController.getIncidentReports
);

router.get(
  '/:id/history',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(incidentIdParamSchema, 'params'),
  validateRequest(incidentHistoryQuerySchema, 'query'),
  incidentsController.getIncidentHistory
);

export default router;
