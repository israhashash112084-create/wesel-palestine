import { Worker } from 'bullmq';
import { logger } from '#shared/utils/logger.js';
import { bullMQConnection } from '#modules/reports/jobs/report.queue.js';
import { reportProcessor } from '#modules/reports/jobs/report.processor.js';

let worker = null;

/**
 * @returns {import('bullmq').Worker}
 */
export const startReportWorker = () => {
  worker = new Worker('report', reportProcessor, {
    connection: bullMQConnection,
    concurrency: 5,
  });

  worker.on('completed', (job, result) => {
    if (result?.skipped) {
      logger.info(`[worker] Job #${job.id} skipped — ${result.reason}`);
    } else {
      logger.info(`[worker] Job #${job.id} done — report #${result?.reportId} auto-rejected`);
    }
  });

  worker.on('failed', (job, err) => {
    logger.error(`[worker] Job #${job?.id} failed after ${job?.attemptsMade} attempt(s)`, {
      jobName: job?.name,
      data: job?.data,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('[worker] Redis connection error', { error: err.message });
  });

  logger.info('[worker] Report worker started');
  return worker;
};

export const stopReportWorker = async () => {
  if (worker) {
    await worker.close();
    logger.info('[worker] Report worker stopped');
  }
};
