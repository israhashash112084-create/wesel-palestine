import { Router } from 'express';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { CheckpointsRepository } from './checkpoints.repository.js';
import { CheckpointsService } from './checkpoints.service.js';
import { CheckpointsController } from './checkpoints.controller.js';
import { listCheckpointsSchema } from './checkpoints.validator.js';

const router = Router();

const checkpointsRepository = new CheckpointsRepository();
const checkpointsService = new CheckpointsService(checkpointsRepository);
const checkpointsController = new CheckpointsController(checkpointsService);

router.get(
  '/',
  authenticate,
  validateRequest(listCheckpointsSchema, 'query'),
  checkpointsController.getAllCheckpoints
);

export default router;
