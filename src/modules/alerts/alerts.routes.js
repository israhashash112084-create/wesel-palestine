import { Router } from 'express';
import { AlertsRepository } from './alerts.repository.js';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { createSubscriptionSchema, updateSubscriptionSchema } from './alerts.validator.js';

const alertsRepository = new AlertsRepository();
const alertsService = new AlertsService(alertsRepository);
const alertsController = new AlertsController(alertsService);

const router = Router();

router.post(
  '/subscriptions',
  authenticate,
  validateRequest(createSubscriptionSchema, 'body'),
  alertsController.createSubscription
);

router.get('/subscriptions', authenticate, alertsController.getUserSubscriptions);

router.patch(
  '/subscriptions/:id',
  authenticate,
  validateRequest(updateSubscriptionSchema, 'body'),
  alertsController.updateSubscription
);

router.patch(
  '/subscriptions/:id/deactivate',
  authenticate,
  alertsController.deactivateSubscription
);

router.get('/', authenticate, alertsController.getUserAlerts);

router.patch('/:id/read', authenticate, alertsController.markAlertAsRead);

export default router;
