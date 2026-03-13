import { Router } from 'express';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { IncidentsRepository } from './incidents.repository.js';
import { IncidentsService } from './incidents.service.js';
import { IncidentsController } from './incidents.controller.js';

const router = Router();

const incidentsRepository = new IncidentsRepository();
const incidentsService = new IncidentsService(incidentsRepository);
const incidentsController = new IncidentsController(incidentsService);

router.get('/', authenticate, incidentsController.getAllIncidents);

export default router;
