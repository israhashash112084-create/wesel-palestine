import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '#shared/utils/radis.js';
import { env } from '#config/env.js';
import { ConflictError } from '#shared/utils/errors.js';
/**
 * @param {{ max: number, windowSec: number, message?: string }} options
 */
const createRateLimiter = ({ max, windowSec, message }) =>
  rateLimit({
    windowMs: windowSec * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    keyGenerator: (req) => req.userInfo?.id ?? req.ip,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: message ?? 'Too many requests. Please try again later.',
      });
    },
  });

export const reportSubmitLimiter = createRateLimiter({
  max: parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.RATE_LIMIT_WINDOW_MS, 10) / 1000,
  message: `You can only submit ${env.RATE_LIMIT_MAX_REQUESTS} reports every ${parseInt(env.RATE_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const areaReportLimiter = async (req, _res, next) => {
  const userId = req.userInfo.id;
  const area = req.body.area.trim().toLowerCase();
  const key = `area_report_limit:${userId}:${area}`;

  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, env.AREA_REPORT_LIMIT_TTL_SEC);
  }

  if (count > env.AREA_REPORT_LIMIT_MAX) {
    const ttl = await redisClient.ttl(key);
    const hoursLeft = Math.ceil(ttl / 3600);

    throw new ConflictError(
      `You have reached the maximum of ${env.AREA_REPORT_LIMIT_MAX} reports for "${req.body.area}". ` +
        `Try again in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`
    );
  }

  next();
};
