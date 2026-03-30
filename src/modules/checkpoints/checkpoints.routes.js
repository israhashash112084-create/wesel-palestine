import { Router } from 'express';
import { authenticate, authorize } from '#shared/middlewares/auth.middleware.js';
import { UserRoles } from '#shared/constants/roles.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import {
  listCheckpointsSchema,
  checkpointIdParamSchema,
  createCheckpointSchema,
  updateCheckpointSchema,
  updateCheckpointStatusSchema,
  checkpointStatusHistoryQuerySchema,
} from './checkpoints.validator.js';

export const createCheckpointsRouter = ({ checkpointsController }) => {
  const router = Router();

  router.post(
    '/',
    authenticate,
    authorize(UserRoles.ADMIN),
    validateRequest(createCheckpointSchema, 'body'),
    checkpointsController.createCheckpoint
  );

  router.get(
    '/',
    authenticate,
    validateRequest(listCheckpointsSchema, 'query'),
    checkpointsController.getAllCheckpoints
  );

  router.get(
    '/:id',
    authenticate,
    validateRequest(checkpointIdParamSchema, 'params'),
    checkpointsController.getCheckpointById
  );

  router.patch(
    '/:id',
    authenticate,
    authorize(UserRoles.ADMIN),
    validateRequest(checkpointIdParamSchema, 'params'),
    validateRequest(updateCheckpointSchema, 'body'),
    checkpointsController.updateCheckpoint
  );

  router.patch(
    '/:id/status',
    authenticate,
    authorize(UserRoles.ADMIN),
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
    validateRequest(checkpointIdParamSchema, 'params'),
    checkpointsController.deleteCheckpoint
  );

  return router;
};

export default createCheckpointsRouter;
