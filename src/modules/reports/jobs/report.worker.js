import { Worker } from 'bullmq';
import { logger } from '#shared/utils/logger.js';
import { bullMQConnection, JOB_NAMES } from '#modules/reports/jobs/report.queue.js';
import { reportProcessor } from '#modules/reports/jobs/report.processor.js';

let worker = null;

const _logCompleted = (job, result) => {
  if (result?.skipped) {
    logger.info(`[worker] Job "${job.name}" #${job.id} skipped — ${result.reason}`);
    return;
  }

  switch (job.name) {
    case JOB_NAMES.AUTO_REJECT:
      logger.info(`[worker] Job #${job.id} done — report #${result?.reportId} auto-rejected`);
      break;
    case JOB_NAMES.CREATE_INCIDENT:
      logger.info(
        `[worker] Job #${job.id} done — incident #${result?.incidentId} created for report #${result?.reportId}`
      );
      break;
    case JOB_NAMES.CHECK_AUTO_DECISION:
      logger.info(
        `[worker] Job #${job.id} done — auto-decision checked for report #${result?.reportId}`
      );
      break;
    case JOB_NAMES.SCORE_ADJUSTMENT:
      logger.info(
        `[worker] Job #${job.id} done — score "${result?.action}" for report #${result?.reportId}`
      );
      break;
    case JOB_NAMES.CACHE_INVALIDATION:
      logger.info(
        `[worker] Job #${job.id} done — cache invalidated for report #${result?.reportId}`
      );
      break;
    default:
      logger.info(`[worker] Job "${job.name}" #${job.id} done`);
  }
};

/**
 * @returns {import('bullmq').Worker}
 */
export const startReportWorker = () => {
  worker = new Worker('report', reportProcessor, {
    connection: bullMQConnection,
    concurrency: 5,
  });

  worker.on('completed', _logCompleted);

  worker.on('failed', (job, err) => {
    logger.error(
      `[worker] Job "${job?.name}" #${job?.id} failed after ${job?.attemptsMade} attempt(s)`,
      {
        jobName: job?.name,
        data: job?.data,
        error: err.message,
      }
    );
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
