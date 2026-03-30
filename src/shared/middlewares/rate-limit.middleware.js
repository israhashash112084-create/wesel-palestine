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

export const authRegisterLimiter = createRateLimiter({
  max: parseInt(env.AUTH_REGISTER_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.AUTH_REGISTER_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many registration attempts. You can only register ${env.AUTH_REGISTER_LIMIT_MAX_REQUESTS} times every ${parseInt(env.AUTH_REGISTER_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const authLoginLimiter = createRateLimiter({
  max: parseInt(env.AUTH_LOGIN_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.AUTH_LOGIN_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many login attempts. Try again after ${parseInt(env.AUTH_LOGIN_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const authRefreshLimiter = createRateLimiter({
  max: parseInt(env.AUTH_REFRESH_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.AUTH_REFRESH_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many token refresh attempts. Try again after ${parseInt(env.AUTH_REFRESH_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const authLogoutLimiter = createRateLimiter({
  max: parseInt(env.AUTH_LOGOUT_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.AUTH_LOGOUT_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many logout attempts. Try again after ${parseInt(env.AUTH_LOGOUT_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const authMeLimiter = createRateLimiter({
  max: parseInt(env.AUTH_ME_LIMIT_MAX_REQUESTS, 10),
  windowSec: parseInt(env.AUTH_ME_LIMIT_WINDOW_MS, 10) / 1000,
  message: `Too many profile requests. Try again after ${parseInt(env.AUTH_ME_LIMIT_WINDOW_MS, 10) / 60000} minutes.`,
});

export const checkAreaReportLimit = async (userId, area) => {
  if (!area || typeof area !== 'string') {
    return;
  }

  const normalizedArea = area.trim().toLowerCase();
  const key = `area_report_limit:${userId}:${normalizedArea}`;

  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, Number(env.AREA_REPORT_LIMIT_TTL_SEC));
  }

  if (count > Number(env.AREA_REPORT_LIMIT_MAX)) {
    const ttl = await redisClient.ttl(key);
    const hoursLeft = Math.ceil(ttl / 3600);

    throw new ConflictError(
      `You have reached the maximum of ${env.AREA_REPORT_LIMIT_MAX} reports for "${area}". ` +
        `Try again in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`
    );
  }
};

export const areaReportLimiter = async (req, _res, next) => {
  await checkAreaReportLimit(req.userInfo.id, req.body.area);
  next();
};
