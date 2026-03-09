import { rateLimit }         from 'express-rate-limit';
import { RedisStore }        from 'rate-limit-redis';
import redisClient           from '#shared/utils/radis.js';
import { REPORT_RATE_LIMIT } from '#shared/constants/enums.js';

/**
 * @param {{ max: number, windowSec: number, message?: string }} options
 */
const createRateLimiter = ({ max, windowSec, message }) =>
  rateLimit({
    windowMs:        windowSec * 1000,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
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
  max:       REPORT_RATE_LIMIT.MAX_REPORTS,
  windowSec: REPORT_RATE_LIMIT.WINDOW_SECONDS,
  message:   `You can only submit ${REPORT_RATE_LIMIT.MAX_REPORTS} reports every ${REPORT_RATE_LIMIT.WINDOW_SECONDS / 60} minutes.`,
});
