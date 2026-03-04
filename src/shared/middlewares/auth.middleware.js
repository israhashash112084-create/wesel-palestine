import { env } from '#config/env.js';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '#shared/utils/errors.js';

/**
 * Reads the access token from the HttpOnly cookie and attaches
 * the decoded payload to req.userInfo.
 *
 * Express 5 will forward thrown errors to the global error handler.
 */

export const authenticate = (req, res, next) => {
  const authHeader = req.headers?.authorization ?? req.headers?.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No authentication token provided');
  }
  const token = authHeader.split(' ')[1];

  // jwt.verify throws TokenExpiredError / JsonWebTokenError on failure;
  // the global error handler normalizes these into 401 responses.

  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  req.userInfo = decoded;
  next();
};

/**
 * Middleware factory that checks if the authenticated user has
 * one of the permitted roles.
 *
 * Usage: authorize('admin', 'moderator')
 *
 * @param {...string} roles - Allowed roles.
 */

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.userInfo || !roles.includes(req.userInfo.role)) {
      throw new UnauthorizedError('Insufficient permissions');
    }
    next();
  };
};
