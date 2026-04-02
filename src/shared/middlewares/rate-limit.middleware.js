import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '#shared/utils/radis.js';
import { env } from '#config/env.js';
import { ConflictError } from '#shared/utils/errors.js';

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

const buildAreaReportLimitKey = (userId, area) => {
  const normalizedArea = area.trim().toLowerCase();
  return `area_report_limit:${userId}:${normalizedArea}`;
};

export const ensureAreaReportLimit = async (userId, area) => {
  if (!area || typeof area !== 'string') return;

  const key = buildAreaReportLimitKey(userId, area);
  const rawCount = await redisClient.get(key);
  const count = Number(rawCount ?? 0);
  const maxAllowed = Number(env.AREA_REPORT_LIMIT_MAX);

  if (count >= maxAllowed) {
    const ttl = await redisClient.ttl(key);
    const hoursLeft = ttl > 0 ? Math.ceil(ttl / 3600) : 0;

    throw new ConflictError(
      `You have reached the maximum of ${maxAllowed} reports for "${area}". ` +
        `Try again in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`
    );
  }
};

export const incrementAreaReportLimit = async (userId, area) => {
  if (!area || typeof area !== 'string') return;

  const key = buildAreaReportLimitKey(userId, area);
  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, Number(env.AREA_REPORT_LIMIT_TTL_SEC));
  }
};
