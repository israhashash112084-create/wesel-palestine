import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';
import { CHECKPOINT_JOB_NAMES } from '#modules/checkpoints/jobs/checkpoint.queue.js';

const runStatusAuditScan = async () => {
  if (!env.CHECKPOINT_MAINTENANCE_ENABLED) {
    return { skipped: true, reason: 'disabled' };
  }

  const { prisma } = await import('#database/db.js');

  const grouped = await prisma.checkpoint.groupBy({
    by: ['status'],
    _count: {
      _all: true,
    },
  });

  const statusCounts = grouped.reduce((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});

  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

  return {
    scannedCount: total,
    statusCounts,
  };
};

export const checkpointProcessor = async (job) => {
  switch (job.name) {
    case CHECKPOINT_JOB_NAMES.STATUS_AUDIT_SCAN:
      return runStatusAuditScan();

    default:
      logger.warn(`[checkpointProcessor] Unknown job name "${job.name}"`, { jobId: job.id });
      return { skipped: true, reason: 'unknown_job_name' };
  }
};
