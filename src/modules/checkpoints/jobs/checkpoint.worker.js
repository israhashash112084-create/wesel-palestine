import { Worker } from 'bullmq';
import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';
import {
  checkpointBullMQConnection,
  scheduleStatusAuditScan,
} from '#modules/checkpoints/jobs/checkpoint.queue.js';
import { checkpointProcessor } from '#modules/checkpoints/jobs/checkpoint.processor.js';

let worker = null;

export const startCheckpointWorker = () => {
  if (!env.CHECKPOINT_MAINTENANCE_ENABLED) {
    logger.info('[checkpoint.worker] Checkpoint maintenance worker disabled by configuration');
    return null;
  }

  worker = new Worker('checkpoint-maintenance', checkpointProcessor, {
    connection: checkpointBullMQConnection,
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    if (result?.skipped) {
      logger.info(`[checkpoint.worker] Job #${job.id} skipped - ${result.reason}`);
      return;
    }

    logger.info(`[checkpoint.worker] Job #${job.id} done`, {
      scannedCount: result?.scannedCount,
      statusCounts: result?.statusCounts,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `[checkpoint.worker] Job #${job?.id} failed after ${job?.attemptsMade} attempt(s)`,
      {
        jobName: job?.name,
        data: job?.data,
        error: err.message,
      }
    );
  });

  worker.on('error', (err) => {
    logger.error('[checkpoint.worker] Redis connection error', { error: err.message });
  });

  scheduleStatusAuditScan().catch((error) => {
    logger.error('[checkpoint.worker] Failed to schedule status audit scan', {
      error: error.message,
    });
  });

  logger.info('[checkpoint.worker] Checkpoint maintenance worker started');
  return worker;
};

export const stopCheckpointWorker = async () => {
  if (worker) {
    await worker.close();
    logger.info('[checkpoint.worker] Checkpoint maintenance worker stopped');
  }
};
