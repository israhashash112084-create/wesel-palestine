import { Worker } from 'bullmq';
import { logger } from '#shared/utils/logger.js';
import { bullMQConnection } from '#modules/alerts/alerts.queue.js';
import { alertsProcessor } from '#modules/alerts/alerts.processor.js';

let worker = null;

export const startAlertsWorker = () => {
  worker = new Worker('alerts', alertsProcessor, {
    connection: bullMQConnection,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.info(`[alerts-worker] Job #${job.id} completed`, {
      jobName: job.name,
      data: job.data,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(`[alerts-worker] Job #${job?.id} failed`, {
      jobName: job?.name,
      data: job?.data,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('[alerts-worker] Redis connection error', { error: err.message });
  });

  logger.info('[alerts-worker] Alerts worker started');
  return worker;
};

export const stopAlertsWorker = async () => {
  if (worker) {
    await worker.close();
    logger.info('[alerts-worker] Alerts worker stopped');
  }
};