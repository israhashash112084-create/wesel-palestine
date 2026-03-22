import { Router } from 'express';
import { RoutesRepository }  from './routes.repository.js';
import { RoutesService }     from './routes.service.js';
import { RoutesController }  from './routes.controller.js';
import { authenticate }      from '#shared/middlewares/auth.middleware.js';
import { validateRequest }   from '#shared/middlewares/validate.middleware.js';
import { routeEstimateLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { estimateRouteSchema, routeHistorySchema } from './routes.validator.js';

// Dependency Injection
const routesRepository = new RoutesRepository();
const routesService    = new RoutesService(routesRepository);
const routesController = new RoutesController(routesService);

const router = Router();

router.post(
  '/estimate',
  authenticate,
  routeEstimateLimiter, 
  validateRequest(estimateRouteSchema),
  routesController.estimate
);

router.get(
  '/history',
  authenticate,
  validateRequest(routeHistorySchema, 'query'),
  routesController.getHistory
);

export default router;