import { ConflictError } from '#shared/utils/errors.js';

export class ReportsService {
    /**
     * @param {import('./reports.repository.js').ReportsRepository} reportsRepository
     */
    constructor(reportsRepository) {
        this.repo = reportsRepository;
    }

    /**
     * @param {object} body
     * @param {string} userId
     */
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
            userId, locationLat, locationLng,
            area, type, description,
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
}