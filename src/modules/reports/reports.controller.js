export class ReportsController {
  /**
   * @param {import('./reports.service.js').ReportsService} reportsService
   */
  constructor(reportsService) {
    this.reportsService = reportsService;
  }

  submitReport = async (req, res) => {
    const result = await this.reportsService.submitReport(req.body, req.userInfo);

    return res.status(201).json({
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

  voteOnReport = async (req, res) => {
    const result = await this.reportsService.voteOnReport(
      parseInt(req.params.id, 10),
      req.userInfo.id,
      req.body.vote
    );

    res.status(200).json({ success: true, data: result });
  };

  updateReport = async (req, res) => {
    const result = await this.reportsService.updateReport(
      parseInt(req.params.id, 10),
      req.body,
      req.userInfo.id
    );

    res.status(200).json({ success: true, data: result });
  };

  moderateReport = async (req, res) => {
    const result = await this.reportsService.moderateReport(
      parseInt(req.params.id, 10),
      req.body,
      req.userInfo.id
    );

    res.status(200).json({ success: true, data: result });
  };
}
