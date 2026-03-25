import { Queue } from 'bullmq';
import { env } from '#config/env.js';

export const bullMQConnection = {
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
};

export const reportQueue = new Queue('report', { connection: bullMQConnection });
export const JOB_NAMES = {
  AUTO_REJECT: 'auto-reject',
};

const DELAY_MS = 43200000;
//const DELAY_MS = 1200000;for test only wait 20 min

export const scheduleAutoReject = (reportId) =>
  reportQueue.add(
    JOB_NAMES.AUTO_REJECT,
    { reportId },
    {
      delay: DELAY_MS,
      jobId: `auto-reject-${reportId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
