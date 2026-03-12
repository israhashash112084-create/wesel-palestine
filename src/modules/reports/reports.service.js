import { ConflictError, NotFoundError, ForbiddenError } from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { UserRoles } from '#shared/constants/roles.js';
import { REPORT_STATUSES } from '#shared/constants/enums.js';

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

        return { voteUrl };
    }

    async submitReport(body, userId) {

        const { locationLat, locationLng, area, type, description } = body;

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
            userId,
            locationLat,
            locationLng,
            area,
            type,
            description,
            duplicateOf: duplicate ? duplicate.id : null,
        });

        if (duplicate) {
            await this.repo.incrementReportConfidenceScore(duplicate.id, 1);
        }

        return {
            report,
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
}