import Joi from 'joi';
import { Router } from 'express';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import { createSubscriptionSchema, updateSubscriptionSchema } from './alerts.validator.js';

export const alertIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const createAlertsRouter = ({ alertsController }) => {
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
    validateRequest(alertIdParamSchema, 'params'),
    validateRequest(updateSubscriptionSchema, 'body'),
    alertsController.updateSubscription
  );

  router.patch(
    '/subscriptions/:id/deactivate',
    authenticate,
    validateRequest(alertIdParamSchema, 'params'),
    alertsController.deactivateSubscription
  );

  router.get('/', authenticate, alertsController.getUserAlerts);

  router.patch(
    '/:id/read',
    authenticate,
    validateRequest(alertIdParamSchema, 'params'),
    alertsController.markAlertAsRead
  );

  return router;
};

export default createAlertsRouter;