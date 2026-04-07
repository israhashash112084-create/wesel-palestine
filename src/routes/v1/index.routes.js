import { Router } from 'express';
import { createAuthRouter } from '#modules/auth/auth.routes.js';
import { AuthRepository } from '#modules/auth/auth.repository.js';
import { AuthService } from '#modules/auth/auth.service.js';
import { AuthController } from '#modules/auth/auth.controller.js';

import { createReportsRouter } from '#modules/reports/reports.routes.js';
import { ReportsRepository } from '#modules/reports/reports.repository.js';
import { ReportsService } from '#modules/reports/reports.service.js';
import { ReportsController } from '#modules/reports/reports.controller.js';

import { createAlertsRouter } from '#modules/alerts/alerts.routes.js';
import { AlertsRepository } from '#modules/alerts/alerts.repository.js';
import { AlertsService } from '#modules/alerts/alerts.service.js';
import { AlertsController } from '#modules/alerts/alerts.controller.js';

import { createRoutesRouter } from '#modules/routes/routes.routes.js';
import { RoutesRepository } from '#modules/routes/routes.repository.js';
import { RoutesService } from '#modules/routes/routes.service.js';
import { RoutesController } from '#modules/routes/routes.controller.js';
import { RouteCacheService } from '#modules/routes/route-cache.service.js';

import { createIncidentsRouter } from '#modules/incidents/incidents.routes.js';
import { IncidentsRepository } from '#modules/incidents/incidents.repository.js';
import { IncidentsService } from '#modules/incidents/incidents.service.js';
import { IncidentsController } from '#modules/incidents/incidents.controller.js';

import { createCheckpointsRouter } from '#modules/checkpoints/checkpoints.routes.js';
import { CheckpointsRepository } from '#modules/checkpoints/checkpoints.repository.js';
import { CheckpointsService } from '#modules/checkpoints/checkpoints.service.js';
import { CheckpointsController } from '#modules/checkpoints/checkpoints.controller.js';

import { RouteCacheRepository } from '#modules/routes/route-cache.repository.js';

const router = Router();

// Single composition root for v1 API: instantiate once and share across routers.
const alertsRepository = new AlertsRepository();
const alertsService = new AlertsService(alertsRepository);
const alertsController = new AlertsController(alertsService);

const routeCacheRepository = new RouteCacheRepository();
const routeCacheService = new RouteCacheService(routeCacheRepository);

const incidentsRepository = new IncidentsRepository();
const incidentsService = new IncidentsService(incidentsRepository, alertsService);
const incidentsController = new IncidentsController(incidentsService);

const checkpointsRepository = new CheckpointsRepository();
const checkpointsService = new CheckpointsService(checkpointsRepository, { routeCacheService });
const checkpointsController = new CheckpointsController(checkpointsService);

const reportsRepository = new ReportsRepository();
const reportsService = new ReportsService(reportsRepository, {
  incidentsService,
  checkpointsService,
  alertsService,
});
const reportsController = new ReportsController(reportsService);

incidentsService.setReportsService(reportsService);

const routesRepository = new RoutesRepository();
const routesService = new RoutesService(routesRepository, { checkpointsService, incidentsService });
const routesController = new RoutesController(routesService);

const authRepository = new AuthRepository();
const authService = new AuthService(authRepository, {
  reportsService,
  incidentsService,
  routesService,
  alertsService,
});
const authController = new AuthController(authService);

router.use('/auth', createAuthRouter({ authController }));
router.use('/reports', createReportsRouter({ reportsController }));
router.use('/alerts', createAlertsRouter({ alertsController }));
router.use('/routes', createRoutesRouter({ routesController }));
router.use('/incidents', createIncidentsRouter({ incidentsController }));
router.use('/checkpoints', createCheckpointsRouter({ checkpointsController }));

export default router;
