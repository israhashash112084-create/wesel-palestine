import { env } from '#config/env.js';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '#shared/utils/errors.js';

const _extractToken = (req) => {
  const authHeader = req.headers?.authorization ?? req.headers?.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No authentication token provided');
  }
  const token = authHeader.split(' ')[1];

  // jwt.verify throws TokenExpiredError / JsonWebTokenError on failure;
  // the global error handler normalizes these into 401 responses.

  try {
    const token = authHeader.split(' ')[1];
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch {
    return null;
  }
};
export const authenticate = (req, res, next) => {
  const decoded = _extractToken(req);
  if (!decoded) throw new UnauthorizedError('No authentication token provided');
  req.userInfo = decoded;
  next();
};
export const optionalAuthenticate = (req, res, next) => {
  const decoded = _extractToken(req);
  if (decoded) req.userInfo = decoded;
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
