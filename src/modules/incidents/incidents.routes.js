import { Router } from 'express';
import { authenticate, authorize } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { IncidentsRepository } from './incidents.repository.js';
import { IncidentsService } from './incidents.service.js';
import { IncidentsController } from './incidents.controller.js';
import {
  createIncidentSchema,
  updateIncidentBodySchema,
  updateIncidentParamSchema,
} from './incidents.validator.js';

const router = Router();

const incidentsRepository = new IncidentsRepository();
const incidentsService = new IncidentsService(incidentsRepository);
const incidentsController = new IncidentsController(incidentsService);

router.get('/', authenticate, authorize('moderator', 'admin'), incidentsController.getAllIncidents);
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
  validateRequest(updateIncidentParamSchema, 'params'),
  validateRequest(updateIncidentBodySchema, 'body'),
  incidentsController.updateIncident
);

export default router;
