import { Router } from 'express';
import { RoutesRepository } from './routes.repository.js';
import { RoutesService } from './routes.service.js';
import { RoutesController } from './routes.controller.js';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { routeEstimateLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { estimateRouteSchema, routeHistorySchema, compareRouteSchema } from './routes.validator.js';

const routesRepository = new RoutesRepository();
const routesService = new RoutesService(routesRepository);
const routesController = new RoutesController(routesService);

const router = Router();

router.post(
  '/estimate',
  authenticate,
  routeEstimateLimiter, 
  validateRequest(estimateRouteSchema),
  routesController.estimate
);

router.post(
  '/estimate/compare',
  authenticate,
  routeEstimateLimiter,
  validateRequest(compareRouteSchema),
  routesController.compare
);

router.get(
  '/history',
  authenticate,
  validateRequest(routeHistorySchema, 'query'),
  routesController.getHistory
);

router.get(
  '/areas/status',
  authenticate,
  routesController.getAreasStatus
);

router.get(
  '/history/stats',
  authenticate,
  routesController.getHistoryStats
);

router.get(
  '/checkpoints/active',
  authenticate,
  routesController.getActiveCheckpoints
);

router.get(
  '/incidents/active',
  authenticate,
  routesController.getActiveIncidents
);

export default router;