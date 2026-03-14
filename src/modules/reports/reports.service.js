import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { UserRoles } from '#shared/constants/roles.js';
import { REPORT_STATUSES } from '#shared/constants/enums.js';
const MIN_VOTES_REQUIRED = 4;
const AUTO_VERIFY_ABOVE = 0.7;
const AUTO_REJECT_BELOW = 0.3;
const CHECKPOINT_TYPES_STATUS = {
    closure: 'closed',
    delay: 'slow',
};
export class ReportsService {

    constructor(reportsRepository) {
        this.repo = reportsRepository;
    }

    _isModerator(userInfo) {
        return (
            userInfo?.role === UserRoles.MODERATOR ||
            userInfo?.role === UserRoles.ADMIN
        );
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
            userId, locationLat, locationLng, type,
        });

        if (userDuplicate) {
            throw new ConflictError(
                `You already submitted a similar report (#${userDuplicate.id}) in this area`
            );
        }

        const duplicate = await this.repo.findNearbyDuplicate({
            locationLat, locationLng, type,
        });

        const report = await this.repo.create({
            userId, locationLat, locationLng,
            area, type, severity, description,
            duplicateOf: duplicate ? duplicate.id : null,
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

            if (filters.status === REPORT_STATUSES.REJECTED && !isModerator) {
                throw new ForbiddenError('You are not allowed to view rejected reports');
            }

            statusFilter = filters.status;

        } else {

            statusFilter = isModerator
                ? undefined
                : { in: [REPORT_STATUSES.PENDING, REPORT_STATUSES.VERIFIED] };
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

        const report = await this.repo.findById(id);

        if (!report)
            throw new NotFoundError('Report');

        const isModerator = this._isModerator(userInfo);
        const isOwner = userInfo?.id === report.userId;

        if (
            report.status === REPORT_STATUSES.REJECTED &&
            !isModerator &&
            !isOwner
        ) {
            throw new NotFoundError('Report');
        }

        const response = { ...report };

        if (report.status === REPORT_STATUSES.REJECTED && isOwner) {
            response.rejectReason = report.rejectReason;
        }

        if (
            !isModerator &&
            !isOwner &&
            report.status === REPORT_STATUSES.PENDING
        ) {
            Object.assign(response, this._buildVoteInfo(report, userInfo));
        }

        return response;
    }
    async voteOnReport(reportId, userId, vote) {
        const report = await this.repo.findById(reportId);
        if (!report) throw new NotFoundError('Report');
        if (report.userId === userId)
            throw new ForbiddenError('You cannot vote on your own report');
        if (report.duplicateOf !== null) {
            throw new BadRequestError(
                `This is a duplicate report. Please vote on the original report (#${report.duplicateOf})`
            );
        }
        if (report.status !== REPORT_STATUSES.PENDING) {
            throw new BadRequestError(`Cannot vote on a report with status: ${report.status}`);
        }

        const { isNew, previousVote, currentVote } = await this.repo.upsertVote(
            reportId, userId, vote
        );
        let scoreChange = 0;
        if (isNew) {
            scoreChange = currentVote === 'up' ? 1 : -1;
        } else if (previousVote !== currentVote) {
            scoreChange = currentVote === 'up' ? 2 : -2;
        }
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
        const { upCount, downCount, total } = await this.repo.getVoteCounts(report.id);
        if (total < MIN_VOTES_REQUIRED) return;
        const upRatio = upCount / total;
        if (upRatio >= AUTO_VERIFY_ABOVE) {
            const verifyReason = `Auto-verified: ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
            await this.repo.update(report.id, {
                status: 'verified',
                moderatedAt: new Date(),
            });
            await this.repo.createAuditLog({
                reportId: report.id,
                moderatorId: null,
                action: 'approved',
                reason: verifyReason
            });
            await this._createIncidentFromReport(report);
        } else if (upRatio < AUTO_REJECT_BELOW) {
            const rejectReason = `Auto-rejected: only ${upCount}/${total} upvotes (${Math.round(upRatio * 100)}%)`;
            await this.repo.update(report.id, {
                status: 'rejected',
                rejectReason,
                moderatedAt: new Date(),
            });

            await this.repo.createAuditLog({
                reportId: report.id,
                moderatorId: null,
                action: 'rejected',
                reason: rejectReason,
            });
        }
    }
    async _createIncidentFromReport(report) {
        let checkpointId = null;
        const newCheckpointStatus = CHECKPOINT_TYPES_STATUS[report.type];
        if (newCheckpointStatus) {
            const checkpoint = await this.repo.findNearestCheckpoint({
                locationLat: report.locationLat,
                locationLng: report.locationLng,
            });

            if (checkpoint) {
                checkpointId = checkpoint.id;
                await this.repo.updateCheckpointStatus(checkpoint.id, newCheckpointStatus);
            }
        }
        await this.repo.createIncident({
            checkpointId,
            reportedBy: report.userId,
            locationLat: report.locationLat,
            locationLng: report.locationLng,
            area: report.area,
            type: report.type,
            severity: report.severity,
            description: report.description,
        });
    }
    async updateReport(reportId, body, userId) {
        const report = await this.repo.findById(reportId);
        if (!report) throw new NotFoundError('Report');
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
}
