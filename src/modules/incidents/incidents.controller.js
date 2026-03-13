export class IncidentsController {
  constructor(incidentService) {
    this.incidentService = incidentService;
  }

  getAllIncidents = async (req, res) => {
    const incidents = await this.incidentService.getAllIncidents(req.userInfo);
    res.status(200).json({ success: true, data: incidents });
  };
}
