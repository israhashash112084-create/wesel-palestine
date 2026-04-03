import { createClient } from 'redis';
import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';

const redisClient = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
  },
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
});

redisClient.on('error', (err) => {
  logger.error('[redis] client error', {
    error: err.message,
  });
});

redisClient.on('connect', () => {
  logger.info('[redis] connected successfully');
});

redisClient.on('end', () => {
  logger.warn('[redis] connection closed');
});

export const isRedisAvailable = () => redisClient.isOpen && redisClient.isReady;

try {
  await redisClient.connect();
} catch (err) {
  logger.warn('[redis] initial connection failed; continuing with degraded mode', {
    error: err.message,
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
  });
}

export default redisClient;
