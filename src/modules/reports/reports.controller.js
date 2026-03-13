
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
    retrieveReports = async (req, res) => {
        const result = await this.reportsService.retrieveReports(req.query, req.userInfo);
        res.status(200).json({
            success: true,
            data: result,
        });
    };
    getReport = async (req, res) => {
        const result = await this.reportsService.getReport(parseInt(req.params.id, 10), req.userInfo);
        res.status(200).json({
            success: true,
            data: result,
        });
    };
    voteOnReport = async (req, res, next) => {
    try {
      const result = await this.reportsService.voteOnReport(
        parseInt(req.params.id, 10),
        req.userInfo.id,
        req.body.vote
      );
      res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
  };
    
}