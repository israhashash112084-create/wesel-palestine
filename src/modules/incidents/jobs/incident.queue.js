import { Queue } from 'bullmq';
import { env } from '#config/env.js';

export const incidentBullMQConnection = {
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
};

export const incidentQueue = new Queue('incident', { connection: incidentBullMQConnection });

export const INCIDENT_JOB_NAMES = {
  AUTO_CLOSE_STALE_PENDING: 'auto-close-stale-pending',
};

export const scheduleStalePendingScan = () => {
  const parsedEveryMs = Number(env.INCIDENT_AUTO_CLOSE_SCAN_INTERVAL_MS);
  const everyMs = Number.isFinite(parsedEveryMs) && parsedEveryMs > 0 ? parsedEveryMs : 3600000;

  return incidentQueue.add(
    INCIDENT_JOB_NAMES.AUTO_CLOSE_STALE_PENDING,
    {},
    {
      jobId: INCIDENT_JOB_NAMES.AUTO_CLOSE_STALE_PENDING,
      repeat: { every: everyMs },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};
