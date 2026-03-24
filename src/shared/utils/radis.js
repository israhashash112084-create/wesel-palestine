import { createClient } from 'redis';
import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';

let redisClient = null;

if (env.REDIS_HOST && env.REDIS_PORT) {
  redisClient = createClient({
    socket: {
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT, 10),
      reconnectStrategy: false,
    },
    ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
  });

  redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
  redisClient.on('connect', () => logger.info('Redis connected successfully'));

  try {
    await redisClient.connect();
  } catch (err) {
    logger.error('[Redis Connection Error]', err);
    redisClient = null;
  }
}

export default redisClient;
