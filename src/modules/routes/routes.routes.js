import { Router } from 'express';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { routeEstimateLimiter } from '#shared/middlewares/rate-limit.middleware.js';
import { estimateRouteSchema, routeHistorySchema } from './routes.validator.js';

export const createRoutesRouter = ({ routesController }) => {
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

  return router;
};

export default createRoutesRouter;
