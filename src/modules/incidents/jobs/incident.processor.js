import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';
import { INCIDENT_JOB_NAMES } from '#modules/incidents/jobs/incident.queue.js';

const SYSTEM_USER_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

const _getAutoCloseCutoffDate = () => {
  const staleAfterHours = Number(env.INCIDENT_AUTO_CLOSE_STALE_AFTER_HOURS);
  return new Date(Date.now() - staleAfterHours * 60 * 60 * 1000);
};

const _getAutoCloseBatchSize = () => {
  const batchSize = Number(env.INCIDENT_AUTO_CLOSE_BATCH_SIZE);
  return Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100;
};

const autoCloseStalePending = async () => {
  if (!env.INCIDENT_AUTO_CLOSE_ENABLED) {
    return { skipped: true, reason: 'disabled' };
  }

  if (!env.SYSTEM_USER_ID || env.SYSTEM_USER_ID === SYSTEM_USER_PLACEHOLDER) {
    return { skipped: true, reason: 'missing_system_user_id' };
  }

  const { IncidentsRepository } = await import('#modules/incidents/incidents.repository.js');
  const repo = new IncidentsRepository();

  const createdBefore = _getAutoCloseCutoffDate();
  const take = _getAutoCloseBatchSize();

  const candidates = await repo.findStalePendingIncidents({ createdBefore, take });

  if (candidates.length === 0) {
    return { skipped: true, reason: 'no_stale_pending' };
  }

  const resolvedAt = new Date();
  const notes = 'Auto-closed stale pending incident by maintenance job';

  let closedCount = 0;
  let skippedCount = 0;

  for (const candidate of candidates) {
    const incident = await repo.autoClosePendingWithStatusHistory(candidate.id, {
      changedBy: env.SYSTEM_USER_ID,
      notes,
      resolvedAt,
    });

    if (incident) {
      closedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return {
    closedCount,
    skippedCount,
    scannedCount: candidates.length,
  };
};

export const incidentProcessor = async (job) => {
  switch (job.name) {
    case INCIDENT_JOB_NAMES.AUTO_CLOSE_STALE_PENDING:
      return autoCloseStalePending();

    default:
      logger.warn(`[incidentProcessor] Unknown job name "${job.name}"`, { jobId: job.id });
      return { skipped: true, reason: 'unknown_job_name' };
  }
};
