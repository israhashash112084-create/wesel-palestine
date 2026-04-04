import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { UserRoles } from '#shared/constants/roles.js';
import { INCIDENT_TYPES, REPORT_STATUSES, MODERATION_ACTIONS } from '#shared/constants/enums.js';
import { CheckpointsService } from '#modules/checkpoints/checkpoints.service.js';
import { CheckpointsRepository } from '#modules/checkpoints/checkpoints.repository.js';
import { IncidentsService } from '#modules/incidents/incidents.service.js';
import { IncidentsRepository } from '#modules/incidents/incidents.repository.js';
import { normalizeLocation, buildLocationQuery } from '#shared/utils/location-normalizer.js';
import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';
import { reportCache } from '#modules/reports/jobs/report.cache.js';
import {
  scheduleAutoReject,
  scheduleCreateIncident,
  scheduleCheckAutoDecision,
  scheduleScoreAdjustment,
  scheduleCacheInvalidation,
} from '#modules/reports/jobs/report.queue.js';
import {
  ensureAreaReportLimit,
  incrementAreaReportLimit,
} from '#shared/middlewares/rate-limit.middleware.js';
const MIN_VOTES_REQUIRED = 4;
const AUTO_VERIFY_ABOVE = 0.7;
const AUTO_REJECT_BELOW = 0.3;

const systemUser = () => ({ id: env.SYSTEM_USER_ID });

export class ReportsService {
  /**
   * @param {import('./reports.repository.js').ReportsRepository} reportsRepository
   * @param {{
   *  incidentsService: import('#modules/incidents/incidents.service.js').IncidentsService,
   *  checkpointsService: import('#modules/checkpoints/checkpoints.service.js').CheckpointsService,
   * }} deps
   */
  constructor(reportsRepository, deps) {
    this.repo = reportsRepository;
    this.incidentsService = deps.incidentsService;
    this.checkpointsService = deps.checkpointsService;
  }

  async getUserStats(userId) {
    return await this.repo.getUserStats(userId);
  }

  async getReportsByIncidentId(incidentId, filters = {}) {
    return this.repo.findByIncidentId(incidentId, filters);
  }

  _isModerator(userInfo) {
    return userInfo?.role === UserRoles.MODERATOR || userInfo?.role === UserRoles.ADMIN;
  }

  _isCheckpointStatusReport(report) {
    return report?.type === INCIDENT_TYPES.CHECKPOINT_STATUS_UPDATE;
  }

  _isCheckpointStatusInput(body) {
    return (
      body?.type === INCIDENT_TYPES.CHECKPOINT_STATUS_UPDATE ||
      (body?.checkpointId !== undefined && body?.proposedCheckpointStatus !== undefined)
    );
  }

  // ─── Formatters ────────────────────────────────────────────────────────────

  _toReportSummary(report, incidentIdOverride) {
    return {
      id: report.id,
      status: report.status,
      type: report.type,
      checkpointId: report.checkpointId ?? null,
      proposedCheckpointStatus: report.proposedCheckpointStatus ?? null,
      incidentId: incidentIdOverride ?? report.incidentId ?? null,
      duplicateOf: report.duplicateOf ?? null,
      locationLat: report.locationLat ?? null,
      locationLng: report.locationLng ?? null,
      area: report.area ?? null,
      road: report.road ?? null,
      city: report.city ?? null,
      createdAt: report.createdAt,
    };
  }

  _formatReportDetail(report) {
    return {
      id: report.id,
      type: report.type,
      severity: report.severity,
      status: report.status,
      description: report.description,
      createdAt: report.createdAt,
      confidenceScore: report.confidenceScore ?? 0,
      duplicateOf: report.duplicateOf ?? null,
      incidentId: report.incidentId ?? null,

      location: {
        latitude: report.locationLat ?? null,
        longitude: report.locationLng ?? null,
        area: report.area ?? null,
        road: report.road ?? null,
        city: report.city ?? null,
      },

      checkpointUpdate: report.checkpointId
        ? {
            proposedStatus: report.proposedCheckpointStatus ?? null,
            checkpoint: report.checkpoint ?? null,
          }
        : null,

      user: report.user ?? null,
      rejectReason: report.rejectReason ?? null,
    };
  }

  _buildVoteInfo(report, userInfo) {
    const voteUrl = `POST /api/v1/reports/${report.id}/vote`;

    if (!userInfo) {
      return {
        voteGuide: {
          step1: 'Login first: POST /api/v1/auth/login',
          step2: `Then vote: ${voteUrl}`,
        },
      };
    }

    if (this._isModerator(userInfo) || userInfo.id === report.userId) return {};
    if (report.status === REPORT_STATUSES.VERIFIED) return {};

    return { voteGuide: { step1: `Vote: ${voteUrl}` } };
  }

  _calcScoreChange(isNew, previousVote, currentVote) {
    if (isNew) return currentVote === 'up' ? 1 : -1;
    if (previousVote !== currentVote) return currentVote === 'up' ? 2 : -2;
    return 0;
  }

  async _resolveLocation(location) {
    let result;
    try {
      result = await normalizeLocation(location);
    } catch (err) {
      throw new BadRequestError(err.message);
    }

    logger.debug('[reports] Location resolved', { output: buildLocationQuery(result) });

    if (location.area && result.area) {
      const userArea = location.area.trim().toLowerCase();
      const resolvedArea = result.area.toLowerCase();
      if (!resolvedArea.includes(userArea) && !userArea.includes(resolvedArea)) {
        throw new BadRequestError(
          `Area "${location.area}" does not match the geocoded location. Detected area: "${result.area}"`
        );
      }
    }

    return result;
  }

  async _normalizeCheckpointReportInput(body) {
    const checkpoint = await this.checkpointsService.getCheckpointById(body.checkpointId);
    if (checkpoint.status === body.proposedCheckpointStatus) {
      throw new BadRequestError(
        'Proposed status matches the current checkpoint status. Choose a different status'
      );
    }

    return {
      ...body,
      type: INCIDENT_TYPES.CHECKPOINT_STATUS_UPDATE,
      severity: body.severity ?? 'low',
      description: body.description ?? 'Checkpoint status update report',
      locationLat: Number(checkpoint.latitude),
      locationLng: Number(checkpoint.longitude),
      area: checkpoint.area ?? null,
      road: checkpoint.road ?? null,
      city: checkpoint.city ?? null,
    };
  }

  async _applyCheckpointStatusFromReport(report, actorId, reason) {
    if (!this._isCheckpointStatusReport(report)) return;
    if (!report.checkpointId || !report.proposedCheckpointStatus) return;

    try {
      await this.checkpointsService.updateCheckpointStatus(
        report.checkpointId,
        {
          status: report.proposedCheckpointStatus,
          notes: reason ?? `Status updated from report #${report.id}`,
        },
        { id: actorId }
      );
    } catch (err) {
      if (
        err instanceof BadRequestError &&
        err.message === 'Checkpoint status is already set to the requested value'
      )
        return;
      throw err;
    }
  }

  async _applyDecision(rootReportId, { status, extraFields }, moderatorId, action, reason) {
    const moderationFields = {
      status,
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
      ...extraFields,
    };

    const rootUpdate = await this.repo.updateMany(
      { id: rootReportId, status: REPORT_STATUSES.PENDING },
      moderationFields
    );

    await this.repo.updateMany(
      { duplicateOf: rootReportId, status: REPORT_STATUSES.PENDING },
      moderationFields
    );

    const rootAfter = await this.repo.findById(rootReportId);

    if (!rootAfter) return false;

    const decisionApplied = rootUpdate.count > 0 || rootAfter.status === status;

    if (!decisionApplied) return false;

    await this.repo.createAuditLog({
      reportId: rootReportId,
      moderatorId,
      action,
      reason,
    });

    return true;
  }

  async _getRootReport(report) {
    let current = report;

    while (current?.duplicateOf != null) {
      current = await this.repo.findById(current.duplicateOf);

      if (!current) {
        throw new NotFoundError('Root report');
      }
    }

    return current;
  }

  async _approveReport(report, moderatorId, reason) {
    const rootReport = await this._getRootReport(report);

    const applied = await this._applyDecision(
      rootReport.id,
      { status: REPORT_STATUSES.VERIFIED, extraFields: { rejectReason: null } },
      moderatorId,
      MODERATION_ACTIONS.APPROVED,
      reason
    );

    if (!applied) return false;

    if (rootReport.incidentId) {
      const actor = moderatorId ? { id: moderatorId } : systemUser();
      await incidentsService.verifyIncident(
        rootReport.incidentId,
        actor,
        reason ?? 'Verified via report'
      );
    }

    await this._applyCheckpointStatusFromReport(
      rootReport,
      moderatorId ?? systemUser().id,
      reason ?? 'Status verified via report moderation'
    );

    await scheduleScoreAdjustment(rootReport.id, 'increase');
    await scheduleCacheInvalidation(rootReport.id);

    return true;
  }

  async _rejectReport(report, moderatorId, reason) {
    const rootReport = await this._getRootReport(report);

    const applied = await this._applyDecision(
      rootReport.id,
      { status: REPORT_STATUSES.REJECTED, extraFields: { rejectReason: reason } },
      moderatorId,
      MODERATION_ACTIONS.REJECTED,
      reason
    );

    if (!applied) return false;

    if (rootReport.incidentId) {
      const actor = moderatorId ? { id: moderatorId } : systemUser();
      await incidentsService.rejectIncident(rootReport.incidentId, actor);
    }

    await scheduleScoreAdjustment(rootReport.id, 'decrease');
    await scheduleCacheInvalidation(rootReport.id);

    return true;
  }

  async _checkAutoDecision(report) {
    const { upCount, total } = await this.repo.getVoteCounts(report.id);
    if (total < MIN_VOTES_REQUIRED) return;

    const upRatio = upCount / total;

    if (upRatio >= AUTO_VERIFY_ABOVE) {
      const reason = `Auto-verified: ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
      await this._approveReport(report, systemUser().id, reason);
    } else if (upRatio < AUTO_REJECT_BELOW) {
      const reason = `Auto-rejected: ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
      await this._rejectReport(report, systemUser().id, reason);
    }
  }

  async _findReportOrThrow(id) {
    const report = await this.repo.findById(id);
    if (!report) throw new NotFoundError('Report');
    return report;
  }

  async _resolveDuplicateContext({
    locationLat,
    locationLng,
    type,
    area,
    road,
    city,
    checkpointId,
    proposedCheckpointStatus,
    excludeId = null,
  }) {
    const duplicate = await this.repo.findNearbyDuplicate({
      locationLat,
      locationLng,
      type,
      area,
      city,
      road,
      excludeId,
      checkpointId,
      proposedCheckpointStatus,
    });

    const matchedReport = duplicate ? await this.repo.findById(duplicate.id) : null;
    const rootReport = matchedReport ? await this._getRootReport(matchedReport) : null;

    return {
      rootReportId: rootReport?.id ?? null,
      inheritedIncidentId: rootReport?.incidentId ?? null,
      inheritedStatus: rootReport?.status ?? REPORT_STATUSES.PENDING,
      inheritedRejectReason:
        rootReport?.status === REPORT_STATUSES.REJECTED
          ? (rootReport?.rejectReason ?? 'Rejected because the original report was rejected')
          : null,
    };
  }

  _buildIncidentPayload({ reportId, userId, payload }) {
    return {
      reportId,
      userId,
      locationLat: payload.locationLat,
      locationLng: payload.locationLng,
      area: payload.area,
      road: payload.road,
      city: payload.city,
      type: payload.type,
      severity: payload.severity,
      description: payload.description,
      checkpointId: payload.checkpointId ?? null,
      proposedCheckpointStatus: payload.proposedCheckpointStatus ?? null,
    };
  }

  async _buildReportPayloadFromInput(body, fallbackReport = null) {
    if (this._isCheckpointStatusInput(body)) {
      return this._normalizeCheckpointReportInput(body);
    }

    const resolvedLocation = body.location
      ? await this._resolveLocation(body.location)
      : {
          latitude: Number(fallbackReport.locationLat),
          longitude: Number(fallbackReport.locationLng),
          area: fallbackReport.area,
          road: fallbackReport.road,
          city: fallbackReport.city,
        };

    return {
      locationLat: resolvedLocation.latitude,
      locationLng: resolvedLocation.longitude,
      area: resolvedLocation.area,
      road: resolvedLocation.road,
      city: resolvedLocation.city,
      type: body.type ?? fallbackReport?.type,
      severity: body.severity ?? fallbackReport?.severity,
      description: body.description ?? fallbackReport?.description,
      checkpointId: body.checkpointId ?? fallbackReport?.checkpointId ?? null,
      proposedCheckpointStatus:
        body.proposedCheckpointStatus ?? fallbackReport?.proposedCheckpointStatus ?? null,
    };
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  async submitReport(body, userInfo) {
    const payload = await this._buildReportPayloadFromInput(body);
    return this._persistReport(payload, userInfo);
  }

  async _persistReport(payload, userInfo) {
    const userId = userInfo.id;
    const isModerator = this._isModerator(userInfo);

    const {
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
    } = payload;

    const userDuplicate = await this.repo.findUserDuplicateReport({
      userId,
      locationLat,
      locationLng,
      type,
      area,
      city,
      road,
      checkpointId,
      proposedCheckpointStatus,
    });

    if (userDuplicate) {
      throw new ConflictError(`You already submitted a similar report (#${userDuplicate.id})`);
    }

    if (area) {
      await ensureAreaReportLimit(userId, area);
    }

    const { rootReportId, inheritedIncidentId, inheritedStatus, inheritedRejectReason } =
      await this._resolveDuplicateContext({
        locationLat,
        locationLng,
        type,
        area,
        road,
        city,
        checkpointId,
        proposedCheckpointStatus,
      });

    const report = await this.repo.create({
      userId,
      locationLat,
      locationLng,
      area,
      road,
      city,
      type,
      severity,
      description,
      checkpointId: checkpointId ?? null,
      proposedCheckpointStatus: proposedCheckpointStatus ?? null,
      duplicateOf: rootReportId,
      incidentId: inheritedIncidentId,
      status: rootReportId ? inheritedStatus : undefined,
      rejectReason: rootReportId ? inheritedRejectReason : null,
    });

    if (area) {
      await incrementAreaReportLimit(userId, area);
    }

    if (rootReportId) {
      await this.repo.incrementReportConfidenceScore(rootReportId, 1);
    } else {
      await Promise.all([
        scheduleCreateIncident(
          this._buildIncidentPayload({
            reportId: report.id,
            userId,
            payload,
          })
        ),
        scheduleAutoReject(report.id),
      ]);
    }

    if (isModerator) {
      await this._approveReport(
        report,
        userId,
        'Auto-verified because it was submitted by moderator/admin'
      );

      const verifiedReport = await this.repo.findById(report.id);

      return {
        report: this._toReportSummary(verifiedReport, inheritedIncidentId),
        editUrl: `PUT /api/v1/reports/${report.id}`,
        message: rootReportId
          ? `Your report was linked to an existing report (#${rootReportId}) and auto-verified.`
          : 'Report submitted successfully and auto-verified.',
      };
    }

    return {
      report: this._toReportSummary(report, inheritedIncidentId),
      editUrl: `PUT /api/v1/reports/${report.id}`,
      message: rootReportId
        ? `Your report is linked to an existing report (#${rootReportId}) in the same area. Thank you for confirming!`
        : 'Report submitted successfully and is pending review. Thank you!',
    };
  }

  // ─── Retrieve ──────────────────────────────────────────────────────────────

  async retrieveReports(filters, userInfo) {
    const { type, area, page, limit, sortBy, sortOrder } = filters;
    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);
    const isModerator = this._isModerator(userInfo);

    let statusFilter;
    if (filters.status) {
      if (!isModerator && filters.status !== REPORT_STATUSES.PENDING) {
        throw new ForbiddenError('You are not allowed to filter by this status');
      }
      statusFilter = filters.status;
    } else {
      statusFilter = isModerator ? undefined : { in: [REPORT_STATUSES.PENDING] };
    }

    const scope = isModerator ? 'mod' : userInfo ? 'auth' : 'anon';
    const { cached, key } = await reportCache.getList(filters, scope);
    if (cached) return cached;

    const { reports, total } = await this.repo.findMany({
      status: statusFilter,
      type,
      area,
      skip,
      take,
      sortBy,
      sortOrder,
      includeDuplicates: isModerator,
    });

    const result = {
      reports: reports.map((r) => ({ ...r, ...this._buildVoteInfo(r, userInfo) })),
      pagination: buildPaginationMeta(total),
    };

    await reportCache.setList(key, result);
    return result;
  }

  async getReport(id, userInfo) {
    const isModerator = this._isModerator(userInfo);
    const scope = isModerator ? 'mod' : userInfo ? 'auth' : 'anon';
    const { cached, key } = await reportCache.getSingle(id, scope);
    if (cached) return cached;

    const report = await this._findReportOrThrow(id);
    const isOwner = userInfo?.id === report.userId;

    if (!isModerator && !isOwner) {
      if (report.status !== REPORT_STATUSES.PENDING || report.duplicateOf !== null) {
        throw new NotFoundError('Report');
      }
    }

    const response = this._formatReportDetail(report);

    if (report.status === REPORT_STATUSES.REJECTED && isOwner) {
      response.rejectReason = report.rejectReason;
    } else {
      delete response.rejectReason;
    }

    if (!isModerator && !isOwner && report.status === REPORT_STATUSES.PENDING) {
      Object.assign(response, this._buildVoteInfo(report, userInfo));
    }

    await reportCache.setSingle(key, response);
    return response;
  }

  // ─── Vote ──────────────────────────────────────────────────────────────────

  async voteOnReport(reportId, userId, vote) {
    const report = await this._findReportOrThrow(reportId);

    if (report.userId === userId) {
      throw new ForbiddenError('You cannot vote on your own report');
    }
    if (report.duplicateOf !== null) {
      throw new BadRequestError(
        `This is a duplicate report. Vote on the original (#${report.duplicateOf})`
      );
    }
    if (report.status !== REPORT_STATUSES.PENDING) {
      throw new BadRequestError(`Cannot vote on a report with status: ${report.status}`);
    }

    const userDuplicate = await this.repo.findUserDuplicateForReport(reportId, userId);
    if (userDuplicate) {
      throw new ForbiddenError(
        `You already submitted a duplicate report (#${userDuplicate.id}) — your confirmation already counts`
      );
    }

    const { isNew, previousVote, currentVote } = await this.repo.upsertVote(reportId, userId, vote);
    const scoreChange = this._calcScoreChange(isNew, previousVote, currentVote);

    if (scoreChange !== 0) {
      const newScore = Math.max(0, report.confidenceScore + scoreChange);

      const result = await this.repo.updateMany(
        { id: reportId, status: REPORT_STATUSES.PENDING },
        { confidenceScore: newScore }
      );

      if (result.count === 0) {
        throw new BadRequestError('Report is no longer pending');
      }
    }

    // Schedule auto-decision check as background job — non-blocking
    await scheduleCheckAutoDecision(reportId);
    await scheduleCacheInvalidation(reportId);

    return {
      message: isNew ? 'Vote submitted' : 'Vote updated',
      vote: currentVote,
      reportId,
    };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async updateReport(reportId, body, userId) {
    const report = await this._findReportOrThrow(reportId);

    if (report.userId !== userId) {
      throw new ForbiddenError('You can only edit your own reports');
    }

    if (report.status !== REPORT_STATUSES.PENDING) {
      throw new BadRequestError(
        `Cannot edit a ${report.status} report. Only pending reports can be edited`
      );
    }

    const payload = await this._buildReportPayloadFromInput(body, report);
    return this._persistReportUpdate(reportId, report, payload);
  }

  async _persistReportUpdate(reportId, existingReport, payload) {
    const {
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
    } = payload;

    const wasDuplicate = existingReport.duplicateOf != null;

    const oldRootReport =
      existingReport.duplicateOf != null
        ? await this.repo.findById(existingReport.duplicateOf)
        : null;

    const oldDuplicateRootId = oldRootReport?.id ?? null;

    const {
      rootReportId: newDuplicateRootId,
      inheritedIncidentId,
      inheritedStatus,
      inheritedRejectReason,
    } = await this._resolveDuplicateContext({
      locationLat,
      locationLng,
      type,
      area,
      road,
      city,
      checkpointId,
      proposedCheckpointStatus,
      excludeId: reportId,
    });

    const isNowDuplicate = newDuplicateRootId != null;

    if (oldDuplicateRootId !== newDuplicateRootId) {
      if (oldDuplicateRootId) {
        await this.repo.incrementReportConfidenceScore(oldDuplicateRootId, -1);
      }

      if (newDuplicateRootId) {
        await this.repo.incrementReportConfidenceScore(newDuplicateRootId, 1);
      }
    }

    let nextIncidentId;
    if (isNowDuplicate) {
      nextIncidentId = inheritedIncidentId;
    } else if (!wasDuplicate) {
      nextIncidentId = existingReport.incidentId ?? null;
    } else {
      nextIncidentId = null;
    }

    const nextStatus = isNowDuplicate ? inheritedStatus : REPORT_STATUSES.PENDING;
    const nextRejectReason = isNowDuplicate ? inheritedRejectReason : null;

    const updatedReport = await this.repo.update(reportId, {
      locationLat,
      locationLng,
      area: area ?? null,
      road: road ?? null,
      city: city ?? null,
      type,
      severity,
      description,
      checkpointId,
      proposedCheckpointStatus,
      duplicateOf: newDuplicateRootId,
      incidentId: nextIncidentId,
      status: nextStatus,
      rejectReason: nextRejectReason,
    });

    if (!wasDuplicate && !isNowDuplicate && updatedReport.incidentId) {
      await incidentsService.updateIncident(
        updatedReport.incidentId,
        {
          locationLat,
          locationLng,
          area: area ?? null,
          road: road ?? null,
          city: city ?? null,
          type,
          severity,
          description,
          trafficStatus:
            checkpointId && proposedCheckpointStatus ? proposedCheckpointStatus : undefined,
          notes: `Updated from report #${updatedReport.id}`,
        },
        { id: existingReport.userId }
      );
    }

    if (wasDuplicate && !isNowDuplicate) {
      await Promise.all([
        scheduleCreateIncident(
          this._buildIncidentPayload({
            reportId: updatedReport.id,
            userId: existingReport.userId,
            payload,
          })
        ),
        scheduleAutoReject(updatedReport.id),
      ]);
    }

    await scheduleCacheInvalidation(reportId);

    if (oldDuplicateRootId && oldDuplicateRootId !== reportId) {
      await scheduleCacheInvalidation(oldDuplicateRootId);
    }

    if (newDuplicateRootId && newDuplicateRootId !== reportId) {
      await scheduleCacheInvalidation(newDuplicateRootId);
    }

    return {
      report: this._toReportSummary(updatedReport),
      message: newDuplicateRootId
        ? `Report updated and linked to existing report (#${newDuplicateRootId})`
        : 'Report updated successfully',
    };
  }

  // ─── Moderate ──────────────────────────────────────────────────────────────

  async moderateReport(reportId, body, moderatorId) {
    const report = await this._findReportOrThrow(reportId);

    if (report.duplicateOf !== null) {
      throw new BadRequestError(
        `This is a duplicate. Moderate the original report (#${report.duplicateOf})`
      );
    }

    if (report.status === REPORT_STATUSES.VERIFIED) {
      throw new BadRequestError('Report is already verified');
    }

    if (report.status === REPORT_STATUSES.REJECTED && body.action === 'reject') {
      throw new BadRequestError('Report is already rejected');
    }
  

    if (body.action === 'approve') {
      const approved = await this._approveReport(report, moderatorId, body.reason ?? null);

      if (!approved) {
        throw new BadRequestError('Report is no longer pending');
      }

      return { message: 'Report approved and incident verified' };
    }

    const rejected = await this._rejectReport(report, moderatorId, body.reason);

    if (!rejected) {
      throw new BadRequestError('Report is no longer pending');
    }

    return { message: 'Report rejected' };
  }
}
