import { Router } from 'express';
import { authenticate, authorize } from '#shared/middlewares/auth.middleware.js';
import { UserRoles } from '#shared/constants/roles.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { CheckpointsRepository } from './checkpoints.repository.js';
import { CheckpointsService } from './checkpoints.service.js';
import { CheckpointsController } from './checkpoints.controller.js';
import {
  listCheckpointsSchema,
  checkpointIdParamSchema,
  createCheckpointSchema,
} from './checkpoints.validator.js';

const router = Router();

const checkpointsRepository = new CheckpointsRepository();
const checkpointsService = new CheckpointsService(checkpointsRepository);
const checkpointsController = new CheckpointsController(checkpointsService);

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

export default router;
