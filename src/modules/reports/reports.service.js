import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { UserRoles } from '#shared/constants/roles.js';
import { INCIDENT_TYPES, REPORT_STATUSES } from '#shared/constants/enums.js';
import { normalizeLocation, buildLocationQuery } from '#shared/utils/location-normalizer.js';
import { env } from '#config/env.js';
import { scheduleAutoReject } from '#modules/reports/jobs/report.queue.js';
import { checkAreaReportLimit } from '#shared/middlewares/rate-limit.middleware.js';
import redisClient from '#shared/utils/radis.js';
import { logger } from '#shared/utils/logger.js';

const MIN_VOTES_REQUIRED = 4;
const AUTO_VERIFY_ABOVE = 0.7;
const AUTO_REJECT_BELOW = 0.3;
const CACHE_TTL_LIST = 120;
const CACHE_TTL_SINGLE = 180;
const CACHE_VERSION_KEY = 'reports:list:version';

const systemUser = () => ({ id: env.SYSTEM_USER_ID });

const _cacheKey = {
  list: (filters, version) => `reports:list:v${version}:${JSON.stringify(filters)}`,
  single: (id, scope) => `reports:single:${id}:${scope}`,
};

const _getCache = async (key) => {
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

const _setCache = async (key, value, ttl) => {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    /* best-effort */
  }
};

const _getListCacheVersion = async () => {
  try {
    const version = await redisClient.get(CACHE_VERSION_KEY);
    return version ?? '1';
  } catch {
    return '1';
  }
};

const _invalidateReportCache = async (reportId) => {
  try {
    await redisClient.del(
      _cacheKey.single(reportId, 'anon'),
      _cacheKey.single(reportId, 'auth'),
      _cacheKey.single(reportId, 'mod')
    );

    await redisClient.incr(CACHE_VERSION_KEY);
  } catch {
    /* best-effort */
  }
};

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

  async submitReport(body, userInfo) {
    if (this._isCheckpointStatusInput(body)) {
      const payload = await this._normalizeCheckpointReportInput(body);
      return this._persistReport(payload, userInfo);
    }

    const normalizedLocation = await this._resolveLocation(body.location);

    const payload = {
      ...body,
      locationLat: normalizedLocation.latitude,
      locationLng: normalizedLocation.longitude,
      area: normalizedLocation.area,
      road: normalizedLocation.road,
      city: normalizedLocation.city,
    };

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

    if (area) {
      await checkAreaReportLimit(userId, area);
    }

    const userDuplicate = await this.repo.findUserDuplicateReport({
      userId,
      locationLat,
      locationLng,
      type,
      area,
      checkpointId,
      proposedCheckpointStatus,
    });

    if (userDuplicate) {
      throw new ConflictError(`You already submitted a similar report (#${userDuplicate.id})`);
    }

    const duplicate = await this.repo.findNearbyDuplicate({
      locationLat,
      locationLng,
      type,
      area,
      checkpointId,
      proposedCheckpointStatus,
    });

    const incidentId = duplicate
      ? ((await this.repo.findById(duplicate.id))?.incidentId ?? null)
      : ((
          await this._createIncidentFromReport({
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
          })
        )?.id ?? null);

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
      duplicateOf: duplicate ? duplicate.id : null,
      incidentId,
    });

    if (duplicate) {
      await this.repo.incrementReportConfidenceScore(duplicate.id, 1);
    }

    if (!duplicate) {
      await scheduleAutoReject(report.id);
    }

    if (isModerator) {
      await this._approveReport(
        report.id,
        {
          ...report,
          incidentId,
          checkpointId: report.checkpointId ?? checkpointId ?? null,
          proposedCheckpointStatus:
            report.proposedCheckpointStatus ?? proposedCheckpointStatus ?? null,
        },
        userId,
        'Auto-verified because it was submitted by moderator/admin'
      );

      const verifiedReport = await this.repo.findById(report.id);
      await _invalidateReportCache(report.id);

      return {
        report: this._toReportSummary(verifiedReport, incidentId),
        editUrl: `PUT /api/v1/reports/${report.id}`,
        message: duplicate
          ? `Your report was linked to an existing report (#${duplicate.id}) and auto-verified.`
          : 'Report submitted successfully and auto-verified.',
      };
    }

    await _invalidateReportCache(report.id);

    return {
      report: this._toReportSummary(report, incidentId),
      editUrl: `PUT /api/v1/reports/${report.id}`,
      message: duplicate
        ? `Your report is linked to an existing report (#${duplicate.id}) in the same area. Thank you for confirming!`
        : 'Report submitted successfully and is pending review. Thank you!',
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

    const role = isModerator ? 'mod' : 'user';
    const version = await _getListCacheVersion();
    const cacheKey = _cacheKey.list({ ...filters, role }, version);
    const cached = await _getCache(cacheKey);
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

    await _setCache(cacheKey, result, CACHE_TTL_LIST);
    return result;
  }

  async getReport(id, userInfo) {
    const isModerator = this._isModerator(userInfo);
    const scope = isModerator ? 'mod' : userInfo ? 'auth' : 'anon';
    const cacheKey = _cacheKey.single(id, scope);

    const cached = await _getCache(cacheKey);
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

    await _setCache(cacheKey, response, CACHE_TTL_SINGLE);
    return response;
  }

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
      await this.repo.update(reportId, { confidenceScore: newScore });
    }

    await this._checkAutoDecision(report);
    await _invalidateReportCache(reportId);

    return {
      message: isNew ? 'Vote submitted' : 'Vote updated',
      vote: currentVote,
      reportId,
    };
  }

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
    if (this._isCheckpointStatusInput(body)) {
      const payload = await this._normalizeCheckpointReportInput(body);
      return this._persistReportUpdate(reportId, report, payload);
    }

    let resolvedLocation;

    if (body.location) {
      resolvedLocation = await this._resolveLocation(body.location);
    } else {
      resolvedLocation = {
        latitude: Number(report.locationLat),
        longitude: Number(report.locationLng),
        area: report.area,
        road: report.road,
        city: report.city,
      };
    }

    const payload = {
      locationLat: resolvedLocation.latitude,
      locationLng: resolvedLocation.longitude,
      area: resolvedLocation.area,
      road: resolvedLocation.road,
      city: resolvedLocation.city,
      type: body.type ?? report.type,
      severity: body.severity ?? report.severity,
      description: body.description ?? report.description,
      checkpointId: body.checkpointId ?? report.checkpointId ?? null,
      proposedCheckpointStatus:
        body.proposedCheckpointStatus ?? report.proposedCheckpointStatus ?? null,
    };

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

    const newDuplicate = await this.repo.findNearbyDuplicate({
      locationLat,
      locationLng,
      type,
      area,
      excludeId: reportId,
      checkpointId,
      proposedCheckpointStatus,
    });

    const newDuplicateOf = newDuplicate?.id ?? null;

    if (existingReport.duplicateOf !== newDuplicateOf) {
      if (existingReport.duplicateOf) {
        await this.repo.incrementReportConfidenceScore(existingReport.duplicateOf, -1);
      }
      if (newDuplicateOf) {
        await this.repo.incrementReportConfidenceScore(newDuplicateOf, 1);
      }
    }

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
      duplicateOf: newDuplicateOf,
    });

    await _invalidateReportCache(reportId);

    return {
      report: this._toReportSummary(updatedReport),
      message: newDuplicateOf
        ? `Report updated and linked to existing report (#${newDuplicateOf})`
        : 'Report updated successfully',
    };
  }

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
    if (report.status === REPORT_STATUSES.REJECTED && body.action === 'rejected') {
      throw new BadRequestError('Report is already rejected');
    }

    if (body.action === 'approved') {
      await this._approveReport(reportId, report, moderatorId, body.reason ?? null);
      return { message: 'Report approved and incident verified' };
    }

    await this._rejectReport(reportId, report, moderatorId, body.reason);
    return { message: 'Report rejected' };
  }

  async _findReportOrThrow(id) {
    const report = await this.repo.findById(id);
    if (!report) throw new NotFoundError('Report');
    return report;
  }

  async _approveReport(reportId, report, moderatorId, reason) {
    await this.repo.update(reportId, {
      status: 'verified',
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
      rejectReason: null,
    });

    await this.repo.createAuditLog({ reportId, moderatorId, action: 'approved', reason });

    await this.repo.updateMany(
      { duplicateOf: reportId },
      { status: 'verified', moderatedAt: new Date(), rejectReason: null }
    );

    if (report.incidentId) {
      const actor = moderatorId ? { id: moderatorId } : systemUser();
      await this.incidentsService.verifyIncident(
        report.incidentId,
        actor,
        reason ?? 'Verified via report'
      );
    }

    await this._applyCheckpointStatusFromReport(
      report,
      moderatorId ?? systemUser().id,
      reason ?? 'Status verified via report moderation'
    );

    await this.repo.increaseReportOwnersScore(reportId);
    await _invalidateReportCache(reportId);
  }

  async _rejectReport(reportId, report, moderatorId, reason) {
    await this.repo.update(reportId, {
      status: 'rejected',
      rejectReason: reason,
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
    });

    await this.repo.createAuditLog({ reportId, moderatorId, action: 'rejected', reason });

    await this.repo.updateMany(
      { duplicateOf: reportId },
      { status: 'rejected', rejectReason: reason, moderatedAt: new Date() }
    );

    if (report.incidentId) {
      const actor = moderatorId ? { id: moderatorId } : systemUser();
      await this.incidentsService.rejectIncident(report.incidentId, actor);
    }

    await this.repo.decreaseReportOwnersScore(reportId);
    await _invalidateReportCache(reportId);
  }

  async _checkAutoDecision(report) {
    const { upCount, total } = await this.repo.getVoteCounts(report.id);
    if (total < MIN_VOTES_REQUIRED) return;

    const upRatio = upCount / total;

    if (upRatio >= AUTO_VERIFY_ABOVE) {
      const reason = `Auto-verified: ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
      await this._approveReport(report.id, report, systemUser().id, reason);
    } else if (upRatio < AUTO_REJECT_BELOW) {
      const reason = `Auto-rejected: ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
      await this._rejectReport(report.id, report, systemUser().id, reason);
    }
  }

  async _createIncidentFromReport(report) {
    return this.incidentsService.createIncident(
      { id: report.userId },
      {
        locationLat: report.locationLat,
        locationLng: report.locationLng,
        area: report.area,
        road: report.road,
        city: report.city,
        type: report.type,
        severity: report.severity,
        description: report.description,
        checkpointId: report.checkpointId ?? null,
        trafficStatus: report.proposedCheckpointStatus ?? 'unknown',
      }
    );
  }
}
