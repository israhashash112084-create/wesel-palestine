import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '#shared/utils/radis.js';
import { env } from '#config/env.js';

/**
 * @param {{ max: number, windowSec: number, message?: string }} options
 */
const createRateLimiter = ({ max, windowSec, message }) => {
  const options = {
    windowMs: windowSec * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.userInfo?.id ?? req.ip,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: message ?? 'Too many requests. Please try again later.',
      });
    },
  };

  if (redisClient) {
    options.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }

  return rateLimit(options);
};

export const reportSubmitLimiter = createRateLimiter({
  max: parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.RATE_LIMIT_WINDOW_MS, 10) / 1000,
  message: `You can only submit ${env.RATE_LIMIT_MAX_REQUESTS} reports every ${parseInt(env.RATE_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const routeEstimateLimiter = createRateLimiter({
  max: parseInt(env.ROUTE_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.ROUTE_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many route requests. You can only request ${env.ROUTE_LIMIT_MAX_REQUESTS} routes every ${parseInt(env.ROUTE_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const areaReportLimiter = createRateLimiter({
  max: parseInt(env.AREA_RATE_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.AREA_RATE_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many reports for this area. Try again later.`,
});
