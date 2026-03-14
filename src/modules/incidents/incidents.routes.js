import { Router } from 'express';
import { authenticate, authorize } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { IncidentsRepository } from './incidents.repository.js';
import { IncidentsService } from './incidents.service.js';
import { IncidentsController } from './incidents.controller.js';
import { createIncidentSchema } from './incidents.validator.js';

const router = Router();

const incidentsRepository = new IncidentsRepository();
const incidentsService = new IncidentsService(incidentsRepository);
const incidentsController = new IncidentsController(incidentsService);

router.get('/', authenticate, incidentsController.getAllIncidents);
router.post(
  '/',
  authenticate,
  authorize('moderator', 'admin'),
  validateRequest(createIncidentSchema, 'body'),
  incidentsController.createIncident
);

export default router;
