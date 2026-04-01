import { Router } from 'express';
import {
  authenticate,
  optionalAuthenticate,
  authorize,
} from '#shared/middlewares/auth.middleware.js';
import { UserRoles } from '#shared/constants/roles.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import {
  checkpointCreateLimiter,
  checkpointDeleteLimiter,
  checkpointUpdateLimiter,
} from '#shared/middlewares/rate-limit.middleware.js';
import {
  listCheckpointsSchema,
  checkpointIdParamSchema,
  createCheckpointSchema,
  updateCheckpointSchema,
  updateCheckpointStatusSchema,
  nearbyCheckpointsQuerySchema,
  checkpointStatusHistoryQuerySchema,
} from './checkpoints.validator.js';

export const createCheckpointsRouter = ({ checkpointsController }) => {
  const router = Router();

  router.post(
    '/',
    authenticate,
    authorize(UserRoles.ADMIN),
    checkpointCreateLimiter,
    validateRequest(createCheckpointSchema, 'body'),
    checkpointsController.createCheckpoint
  );

  router.get(
    '/',
    optionalAuthenticate,
    validateRequest(listCheckpointsSchema, 'query'),
    checkpointsController.getAllCheckpoints
  );

  router.get(
    '/nearby',
    optionalAuthenticate,
    validateRequest(nearbyCheckpointsQuerySchema, 'query'),
    checkpointsController.getNearbyCheckpoints
  );

  router.get(
    '/:id',
    optionalAuthenticate,
    validateRequest(checkpointIdParamSchema, 'params'),
    checkpointsController.getCheckpointById
  );

  router.patch(
    '/:id',
    authenticate,
    authorize(UserRoles.ADMIN),
    checkpointUpdateLimiter,
    validateRequest(checkpointIdParamSchema, 'params'),
    validateRequest(updateCheckpointSchema, 'body'),
    checkpointsController.updateCheckpoint
  );

  router.patch(
    '/:id/status',
    authenticate,
    authorize(UserRoles.ADMIN),
    checkpointUpdateLimiter,
    validateRequest(checkpointIdParamSchema, 'params'),
    validateRequest(updateCheckpointStatusSchema, 'body'),
    checkpointsController.updateCheckpointStatus
  );

  router.get(
    '/:id/status-history',
    authenticate,
    authorize(UserRoles.MODERATOR, UserRoles.ADMIN),
    validateRequest(checkpointIdParamSchema, 'params'),
    validateRequest(checkpointStatusHistoryQuerySchema, 'query'),
    checkpointsController.getCheckpointStatusHistory
  );

  router.delete(
    '/:id',
    authenticate,
    authorize(UserRoles.ADMIN),
    checkpointDeleteLimiter,
    validateRequest(checkpointIdParamSchema, 'params'),
    checkpointsController.deleteCheckpoint
  );

  return router;
};

export default createCheckpointsRouter;
