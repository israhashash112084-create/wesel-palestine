import { env } from '#config/env.js';
import { AppError } from '#shared/utils/errors.js';
import { logger } from '#shared/utils/logger.js';

const normaliseError = (err) => {
  // jsonwebtoken errors
  if (err.name === 'TokenExpiredError') {
    return new AppError('Access token has expired', 401);
  }
  if (err.name === 'JsonWebTokenError') {
    return new AppError('Invalid access token', 401);
  }
  if (err.name === 'NotBeforeError') {
    return new AppError('Token not yet active', 401);
  }

  return err;
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const error = normaliseError(err);

  if (env.NODE_ENV !== 'test') {
    logger.error(error.message, {
      stack: error.stack,
      method: req.method,
      url: req.originalUrl,
      status: error.statusCode ?? 500,
    });
  }

  if (error instanceof AppError && error.isOperational) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again later.',
  });
};
