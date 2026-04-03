import { Queue } from 'bullmq';
import { env } from '#config/env.js';

export const bullMQConnection = {
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
};

export const alertsQueue = new Queue('alerts', { connection: bullMQConnection });

export const ALERTS_JOB_NAMES = {
  PROCESS_INCIDENT_ALERTS: 'process-incident-alerts',
};

export const addIncidentAlertsJob = (incidentId) =>
  alertsQueue.add(
    ALERTS_JOB_NAMES.PROCESS_INCIDENT_ALERTS,
    { incidentId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );