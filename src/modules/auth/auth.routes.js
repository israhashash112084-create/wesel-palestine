import { Router } from 'express';
import { authenticate } from '#shared/middlewares/auth.middleware.js';
import { validateRequest } from '#shared/middlewares/validate.middleware.js';
import {
  authLoginLimiter,
  authLogoutLimiter,
  authMeLimiter,
  authRefreshLimiter,
  authRegisterLimiter,
} from '#shared/middlewares/rate-limit.middleware.js';
import { registerSchema, loginSchema, refreshCookieSchema } from './auth.validator.js';

export const createAuthRouter = ({ authController }) => {
  const router = Router();

  router.post(
    '/register',
    authRegisterLimiter,
    validateRequest(registerSchema, 'body'),
    authController.register
  );
  router.post(
    '/login',
    authLoginLimiter,
    validateRequest(loginSchema, 'body'),
    authController.login
  );
  router.post(
    '/refresh',
    authRefreshLimiter,
    validateRequest(refreshCookieSchema, 'cookies'),
    authController.refresh
  );
  router.post('/logout', authenticate, authLogoutLimiter, authController.logout);
  router.get('/me', authenticate, authMeLimiter, authController.me);

  return router;
};

export default createAuthRouter;
