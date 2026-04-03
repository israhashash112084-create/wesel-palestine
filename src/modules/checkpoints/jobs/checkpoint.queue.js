import { Queue } from 'bullmq';
import { env } from '#config/env.js';

export const checkpointBullMQConnection = {
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
};

export const checkpointQueue = new Queue('checkpoint-maintenance', {
  connection: checkpointBullMQConnection,
});

export const CHECKPOINT_JOB_NAMES = {
  STATUS_AUDIT_SCAN: 'status-audit-scan',
};

export const scheduleStatusAuditScan = () => {
  const parsedEveryMs = Number(env.CHECKPOINT_MAINTENANCE_SCAN_INTERVAL_MS);
  const everyMs = Number.isFinite(parsedEveryMs) && parsedEveryMs > 0 ? parsedEveryMs : 3600000;

  return checkpointQueue.add(
    CHECKPOINT_JOB_NAMES.STATUS_AUDIT_SCAN,
    {},
    {
      jobId: CHECKPOINT_JOB_NAMES.STATUS_AUDIT_SCAN,
      repeat: { every: everyMs },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};
