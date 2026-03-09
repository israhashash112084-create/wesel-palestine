
export class ReportsController {
    /**
    * @param {import('./reports.service.js').ReportsService} reportsService
    */
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    submitReport = async (req, res) => {
        const userId = req.userInfo.id;
        const result = await this.reportsService.submitReport(req.body, userId);
        res.status(201).json({
            success: true,
            data: result,
        });  
    };
}