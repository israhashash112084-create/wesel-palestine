import { Worker } from 'bullmq';
import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';
import {
  incidentBullMQConnection,
  scheduleStalePendingScan,
} from '#modules/incidents/jobs/incident.queue.js';
import { incidentProcessor } from '#modules/incidents/jobs/incident.processor.js';

let worker = null;

export const startIncidentWorker = () => {
  if (!env.INCIDENT_AUTO_CLOSE_ENABLED) {
    logger.info('[incident.worker] Incident auto-close worker disabled by configuration');
    return null;
  }

  worker = new Worker('incident', incidentProcessor, {
    connection: incidentBullMQConnection,
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    if (result?.skipped) {
      logger.info(`[incident.worker] Job #${job.id} skipped - ${result.reason}`);
      return;
    }

    logger.info(`[incident.worker] Job #${job.id} done`, {
      closedCount: result?.closedCount,
      skippedCount: result?.skippedCount,
      scannedCount: result?.scannedCount,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(`[incident.worker] Job #${job?.id} failed after ${job?.attemptsMade} attempt(s)`, {
      jobName: job?.name,
      data: job?.data,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('[incident.worker] Redis connection error', { error: err.message });
  });

  scheduleStalePendingScan().catch((error) => {
    logger.error('[incident.worker] Failed to schedule stale pending scan', {
      error: error.message,
    });
  });

  logger.info('[incident.worker] Incident worker started');
  return worker;
};

export const stopIncidentWorker = async () => {
  if (worker) {
    await worker.close();
    logger.info('[incident.worker] Incident worker stopped');
  }
};
