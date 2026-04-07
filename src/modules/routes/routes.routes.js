import { Router } from 'express';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { routeEstimateLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { estimateRouteSchema, routeHistorySchema, compareRouteSchema } from './routes.validator.js';

export const createRoutesRouter = ({ routesController }) => {
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

router.get(
  '/history/:id',
  authenticate,
  routesController.getRouteById
);

router.delete(
  '/history/:id',
  authenticate,
  routesController.deleteRouteById
);

  return router;
};

export default createRoutesRouter;