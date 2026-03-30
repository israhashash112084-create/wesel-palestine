import { REPORT_STATUSES } from '#shared/constants/enums.js';
import { logger } from '#shared/utils/logger.js';
import { JOB_NAMES } from '#modules/reports/jobs/report.queue.js';

export const reportProcessor = async (job) => {
  switch (job.name) {
    case JOB_NAMES.AUTO_REJECT:
      return handleAutoReject(job);

    default:
      logger.warn(`[reportProcessor] Unknown job name "${job.name}"`, { jobId: job.id });
      return { skipped: true, reason: 'unknown_job_name' };
  }
};

const handleAutoReject = async (job) => {
  const { reportId } = job.data;

  logger.info(`[auto-reject] Checking report #${reportId}`);

  const { ReportsRepository } = await import('#modules/reports/reports.repository.js');
  const { ReportsService } = await import('#modules/reports/reports.service.js');
  const { IncidentsRepository } = await import('#modules/incidents/incidents.repository.js');
  const { IncidentsService } = await import('#modules/incidents/incidents.service.js');
  const { CheckpointsRepository } = await import('#modules/checkpoints/checkpoints.repository.js');
  const { CheckpointsService } = await import('#modules/checkpoints/checkpoints.service.js');

  const repo = new ReportsRepository();
  const incidentsService = new IncidentsService(new IncidentsRepository());
  const checkpointsService = new CheckpointsService(new CheckpointsRepository());
  const service = new ReportsService(repo, {
    incidentsService,
    checkpointsService,
  });

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
  await service._rejectReport(reportId, report, null, reason);

  logger.info(`[auto-reject] Report #${reportId} rejected`);
  return { rejected: true, reportId };
};
