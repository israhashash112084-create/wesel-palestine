import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { UserRoles } from '#shared/constants/roles.js';
import { REPORT_STATUSES } from '#shared/constants/enums.js';
import { IncidentsService } from '#modules/incidents/incidents.service.js';
import { IncidentsRepository } from '#modules/incidents/incidents.repository.js';
import { env } from '#config/env.js';

const MIN_VOTES_REQUIRED = 4;
const AUTO_VERIFY_ABOVE = 0.7;
const AUTO_REJECT_BELOW = 0.3;

const incidentsRepository = new IncidentsRepository();
const incidentsService = new IncidentsService(incidentsRepository);

const systemUser = () => ({ id: env.SYSTEM_USER_ID });

export class ReportsService {
  constructor(reportsRepository) {
    this.repo = reportsRepository;
  }
  _isModerator(userInfo) {
    return userInfo?.role === UserRoles.MODERATOR || userInfo?.role === UserRoles.ADMIN;
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

    const isModerator = this._isModerator(userInfo);
    const isOwner = userInfo.id === report.userId;

    if (isModerator || isOwner || report.status === REPORT_STATUSES.VERIFIED) {
      return {};
    }

    return {
      voteGuide: {
        step1: `Then vote: ${voteUrl}`,
      },
    };
  }
  async submitReport(body, userId) {
    const { locationLat, locationLng, area, type, severity, description } = body;
    const userDuplicate = await this.repo.findUserDuplicateReport({
      userId,
      locationLat,
      locationLng,
      type,
    });

    if (userDuplicate) {
      throw new ConflictError(
        `You already submitted a similar report (#${userDuplicate.id}) in this area`
      );
    }

    const duplicate = await this.repo.findNearbyDuplicate({
      locationLat,
      locationLng,
      type,
    });

    const incidentId = duplicate
      ? ((await this.repo.findById(duplicate.id))?.incidentId ?? null)
      : ((
          await this._createIncidentFromReport({
            userId,
            locationLat,
            locationLng,
            area,
            type,
            severity,
            description,
          })
        )?.id ?? null);

    const report = await this.repo.create({
      userId,
      locationLat,
      locationLng,
      area,
      type,
      severity,
      description,
      duplicateOf: duplicate ? duplicate.id : null,
      incidentId,
    });

    if (duplicate) {
      await this.repo.incrementReportConfidenceScore(duplicate.id, 1);
    }

    return {
      report,
      editUrl: `PUT /api/v1/reports/${report.id}`,
      message: duplicate
        ? `Your report has been received and linked to an existing report (#${duplicate.id}) in the same area. Thank you for confirming!`
        : 'Your report has been successfully submitted and is now pending review. Thank you!',
    };
  }
  async retrieveReports(filters, userInfo) {
    const { type, area, page, limit, sortBy, sortOrder } = filters;
    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);
    const isModerator = this._isModerator(userInfo);

    let statusFilter;
    if (filters.status) {
      if (!isModerator && filters.status !== REPORT_STATUSES.PENDING) {
        throw new ForbiddenError('You are not allowed to view reports with this status');
      }
      statusFilter = filters.status;
    } else {
      statusFilter = isModerator ? undefined : { in: [REPORT_STATUSES.PENDING] };
    }
    const { reports, total } = await this.repo.findMany({
      status: statusFilter,
      type,
      area,
      skip,
      take,
      sortBy,
      sortOrder,
    });
    const reportsWithVoteInfo = reports.map((report) => ({
      ...report,
      ...this._buildVoteInfo(report, userInfo),
    }));
    return {
      reports: reportsWithVoteInfo,
      pagination: buildPaginationMeta(total),
    };
  }
  async getReport(id, userInfo) {
    const report = await this._findReportOrThrow(id);
    const isModerator = this._isModerator(userInfo);
    const isOwner = userInfo?.id === report.userId;

    if (!isModerator && !isOwner) {
      if (report.status !== REPORT_STATUSES.PENDING || report.duplicateOf !== null) {
        throw new NotFoundError('Report');
      }
    }
    const response = { ...report };
    if (report.status === REPORT_STATUSES.REJECTED && isOwner) {
      response.rejectReason = report.rejectReason;
    } else if (report.status !== REPORT_STATUSES.REJECTED) {
      delete response.rejectReason;
    }
    if (!isModerator && !isOwner && report.status === REPORT_STATUSES.PENDING) {
      Object.assign(response, this._buildVoteInfo(report, userInfo));
    }

    return response;
  }
  async voteOnReport(reportId, userId, vote) {
    const report = await this._findReportOrThrow(reportId);
    if (report.userId === userId) throw new ForbiddenError('You cannot vote on your own report');
    if (report.duplicateOf !== null) {
      throw new BadRequestError(
        `This is a duplicate report. Please vote on the original report (#${report.duplicateOf})`
      );
    }
    if (report.status !== REPORT_STATUSES.PENDING) {
      throw new BadRequestError(`Cannot vote on a report with status: ${report.status}`);
    }
    const userDuplicate = await this.repo.findUserDuplicateForReport(reportId, userId);
    if (userDuplicate) {
      throw new ForbiddenError(
        `You already submitted a duplicate report (#${userDuplicate.id}) for this report. Your confirmation already counts`
      );
    }

    const { isNew, previousVote, currentVote } = await this.repo.upsertVote(reportId, userId, vote);
    const scoreChange = this._calcScoreChange(isNew, previousVote, currentVote);
    if (scoreChange !== 0) {
      const newScore = Math.max(0, report.confidenceScore + scoreChange);
      await this.repo.update(reportId, { confidenceScore: newScore });
    }
    await this._checkAutoDecision(report);
    return {
      message: isNew ? 'Vote submitted successfully' : 'Vote updated successfully',
      vote: currentVote,
      reportId,
    };
  }
  async _checkAutoDecision(report) {
    const { upCount, total } = await this.repo.getVoteCounts(report.id);
    if (total < MIN_VOTES_REQUIRED) return;
    const upRatio = upCount / total;
    if (upRatio >= AUTO_VERIFY_ABOVE) {
      const reason = `Auto-verified: ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
      await this._approveReport(report.id, report, systemUser, reason);
    } else if (upRatio < AUTO_REJECT_BELOW) {
      const reason = `Auto-rejected: only ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
      await this._rejectReport(report.id, report, systemUser, reason);
    }
  }
  async _createIncidentFromReport(report) {
    const incident = await incidentsService.createIncident(
      { id: report.userId },
      {
        locationLat: report.locationLat,
        locationLng: report.locationLng,
        area: report.area,
        type: report.type,
        severity: report.severity,
        description: report.description,
        checkpointId: null,
        trafficStatus: null,
      }
    );

    return incident;
  }
  async updateReport(reportId, body, userId) {
    const report = await this._findReportOrThrow(reportId);
    if (report.userId !== userId) {
      throw new ForbiddenError('You can only edit your own reports');
    }
    if (report.status !== REPORT_STATUSES.PENDING) {
      throw new BadRequestError(
        `Cannot edit a report with status: ${report.status}. Only pending reports can be edited`
      );
    }
    const { locationLat, locationLng, area, type, severity, description } = body;
    const newDuplicate = await this.repo.findNearbyDuplicate({
      locationLat,
      locationLng,
      type,
      excludeId: reportId,
    });
    const newDuplicateOf = newDuplicate ? newDuplicate.id : null;
    if (report.duplicateOf !== newDuplicateOf) {
      if (report.duplicateOf) {
        await this.repo.incrementReportConfidenceScore(report.duplicateOf, -1);
      }
      if (newDuplicateOf) {
        await this.repo.incrementReportConfidenceScore(newDuplicateOf, 1);
      }
    }
    const updatedReport = await this.repo.update(reportId, {
      locationLat,
      locationLng,
      area: area ?? null,
      type,
      severity,
      description,
      duplicateOf: newDuplicateOf,
    });

    return {
      report: updatedReport,
      message: newDuplicateOf
        ? `Report updated and linked to existing report (#${newDuplicateOf}) in the same area`
        : 'Report updated successfully',
    };
  }
  async moderateReport(reportId, body, moderatorId) {
    const report = await this._findReportOrThrow(reportId);
    if (report.duplicateOf !== null) {
      throw new BadRequestError(
        `This is a duplicate report. Moderate the original report (#${report.duplicateOf}) instead`
      );
    }
    if (report.status === REPORT_STATUSES.VERIFIED) {
      throw new BadRequestError(
        'Cannot moderate a verified report. The report has already been verified and an incident has been created'
      );
    }

    if (report.status === REPORT_STATUSES.REJECTED && body.action === 'reject') {
      throw new BadRequestError('Report is already rejected');
    }

    if (body.action === 'approve') {
      await this._approveReport(reportId, report, moderatorId, body.reason ?? null);
      return { message: 'Report approved and incident approved successfully' };
    }

    await this._rejectReport(reportId, report, moderatorId, body.reason);
    return { message: 'Report rejected successfully' };
  }
  async _findReportOrThrow(id) {
    const report = await this.repo.findById(id);
    if (!report) throw new NotFoundError('Report');
    return report;
  }
  _calcScoreChange(isNew, previousVote, currentVote) {
    if (isNew) return currentVote === 'up' ? 1 : -1;
    if (previousVote !== currentVote) return currentVote === 'up' ? 2 : -2;
    return 0;
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
      await incidentsService.verifyIncident(report.incidentId, actor, reason ?? 'Auto-verified');
    }

    await this.repo.increaseReportOwnersScore(reportId);
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
      await incidentsService.rejectIncident(report.incidentId, actor);
    }

    await this.repo.decreaseReportOwnersScore(reportId);
  }
}
