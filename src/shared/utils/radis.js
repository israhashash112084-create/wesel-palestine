import { createClient } from 'redis';
import { env }          from '#config/env.js';
import { logger }       from '#shared/utils/logger.js';

const redisClient = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
  },
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
});

redisClient.on('error',   (err) => logger.error('Redis Client Error:', err));
redisClient.on('connect', ()    => logger.info('Redis connected successfully'));

await redisClient.connect();

export default redisClient;