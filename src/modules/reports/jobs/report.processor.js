import { REPORT_STATUSES } from '#shared/constants/enums.js';
import { logger } from '#shared/utils/logger.js';
import { JOB_NAMES } from '#modules/reports/jobs/report.queue.js';

export const reportProcessor = async (job) => {
  switch (job.name) {
    case JOB_NAMES.AUTO_REJECT:
      return handleAutoReject(job);

    case JOB_NAMES.CREATE_INCIDENT:
      return handleCreateIncident(job);

    case JOB_NAMES.CHECK_AUTO_DECISION:
      return handleCheckAutoDecision(job);

    case JOB_NAMES.SCORE_ADJUSTMENT:
      return handleScoreAdjustment(job);

    case JOB_NAMES.CACHE_INVALIDATION:
      return handleCacheInvalidation(job);

    default:
      logger.warn(`[reportProcessor] Unknown job name "${job.name}"`, { jobId: job.id });
      return { skipped: true, reason: 'unknown_job_name' };
  }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const _loadService = async () => {
  const { ReportsRepository } = await import('#modules/reports/reports.repository.js');
  const { ReportsService } = await import('#modules/reports/reports.service.js');
  const repo = new ReportsRepository();
  const service = new ReportsService(repo);
  return { repo, service };
};

// ─── Handlers ───────────────────────────────────────────────────────────────

const handleAutoReject = async (job) => {
  const { reportId } = job.data;
  logger.info(`[auto-reject] Checking report #${reportId}`);

  const { repo, service } = await _loadService();
  const report = await repo.findById(reportId);

  if (!report) {
    logger.warn(`[auto-reject] Report #${reportId} not found — skipping`);
    return { skipped: true, reason: 'not_found' };
  }

  if (report.status !== REPORT_STATUSES.PENDING) {
    logger.info(`[auto-reject] Report #${reportId} is "${report.status}" — skipping`);
    return { skipped: true, reason: 'already_moderated', status: report.status };
  }

  if (report.duplicateOf !== null) {
    logger.info(`[auto-reject] Report #${reportId} is a duplicate — skipping`);
    return { skipped: true, reason: 'is_duplicate' };
  }

  const reason = 'Auto-rejected: no moderator action within the review window';
  await service._rejectReport(report, null, reason);

  logger.info(`[auto-reject] Report #${reportId} rejected`);
  return { rejected: true, reportId };
};

const handleCreateIncident = async (job) => {
  const {
    reportId,
    userId,
    locationLat,
    locationLng,
    area,
    road,
    city,
    type,
    severity,
    description,
    checkpointId,
    proposedCheckpointStatus,
  } = job.data;
  logger.info(`[create-incident] Creating incident for report #${reportId}`);

  const { IncidentsService } = await import('#modules/incidents/incidents.service.js');
  const { IncidentsRepository } = await import('#modules/incidents/incidents.repository.js');
  const { ReportsRepository } = await import('#modules/reports/reports.repository.js');

  const incidentsService = new IncidentsService(new IncidentsRepository());
  const reportsRepo = new ReportsRepository();

  const incident = await incidentsService.createIncident(
    { id: userId },
    {
      locationLat,
      locationLng,
      area,
      road,
      city,
      type,
      severity,
      description,
      checkpointId: checkpointId ?? null,
      trafficStatus: proposedCheckpointStatus ?? 'unknown',
    }
  );

  if (incident?.id) {
    await reportsRepo.update(reportId, { incidentId: incident.id });
    logger.info(`[create-incident] Incident #${incident.id} linked to report #${reportId}`);
    return { incidentId: incident.id, reportId };
  }

  logger.warn(`[create-incident] Incident creation returned no id for report #${reportId}`);
  return { skipped: true, reason: 'no_incident_id', reportId };
};

const handleCheckAutoDecision = async (job) => {
  const { reportId } = job.data;
  logger.info(`[check-auto-decision] Checking report #${reportId}`);

  const { repo, service } = await _loadService();
  const report = await repo.findById(reportId);

  if (!report) {
    logger.warn(`[check-auto-decision] Report #${reportId} not found — skipping`);
    return { skipped: true, reason: 'not_found' };
  }

  if (report.status !== REPORT_STATUSES.PENDING) {
    return { skipped: true, reason: 'not_pending', status: report.status };
  }

  await service._checkAutoDecision(report);

  logger.info(`[check-auto-decision] Done for report #${reportId}`);
  return { checked: true, reportId };
};

const handleScoreAdjustment = async (job) => {
  const { reportId, action } = job.data;
  logger.info(`[score-adjustment] action="${action}" for report #${reportId}`);

  const { ReportsRepository } = await import('#modules/reports/reports.repository.js');
  const repo = new ReportsRepository();

  if (action === 'increase') {
    await repo.increaseReportOwnersScore(reportId);
  } else if (action === 'decrease') {
    await repo.decreaseReportOwnersScore(reportId);
  } else {
    logger.warn(`[score-adjustment] Unknown action "${action}" for report #${reportId}`);
    return { skipped: true, reason: 'unknown_action' };
  }

  logger.info(`[score-adjustment] Done — "${action}" for report #${reportId}`);
  return { adjusted: true, reportId, action };
};

const handleCacheInvalidation = async (job) => {
  const { reportId } = job.data;
  logger.info(`[cache-invalidation] Invalidating cache for report #${reportId}`);

  const { reportCache } = await import('#modules/reports/jobs/report.cache.js');
  await reportCache.invalidate(reportId);

  logger.info(`[cache-invalidation] Done for report #${reportId}`);
  return { invalidated: true, reportId };
};
