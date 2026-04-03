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
  CREATE_INCIDENT: 'create-incident',
  CHECK_AUTO_DECISION: 'check-auto-decision',
  SCORE_ADJUSTMENT: 'score-adjustment',
  CACHE_INVALIDATION: 'cache-invalidation',
};

const DELAYS = {
  AUTO_REJECT_MS: 43200000, // 12 hours
  //AUTO_REJECT_MS: 43200000,for test only wait 20 min
  AUTO_DECISION_MS: 500,
};

const BASE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false,
};

export const scheduleAutoReject = (reportId) =>
  reportQueue.add(
    JOB_NAMES.AUTO_REJECT,
    { reportId },
    {
      ...BASE_JOB_OPTIONS,
      delay: DELAYS.AUTO_REJECT_MS,
      jobId: `auto-reject-${reportId}`,
    }
  );

export const scheduleCreateIncident = (reportData) =>
  reportQueue.add(JOB_NAMES.CREATE_INCIDENT, reportData, {
    ...BASE_JOB_OPTIONS,
    jobId: `create-incident-report-${reportData.reportId}`,
  });

export const scheduleCheckAutoDecision = (reportId) =>
  reportQueue.add(
    JOB_NAMES.CHECK_AUTO_DECISION,
    { reportId },
    {
      ...BASE_JOB_OPTIONS,
      delay: DELAYS.AUTO_DECISION_MS,
      jobId: `check-auto-decision-${reportId}`,
    }
  );

export const scheduleScoreAdjustment = (reportId, action) =>
  reportQueue.add(
    JOB_NAMES.SCORE_ADJUSTMENT,
    { reportId, action },
    {
      ...BASE_JOB_OPTIONS,
      jobId: `score-${action}-${reportId}-${Date.now()}`,
    }
  );

export const scheduleCacheInvalidation = (reportId) =>
  reportQueue.add(
    JOB_NAMES.CACHE_INVALIDATION,
    { reportId },
    {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: true,
      priority: 10,
    }
  );
