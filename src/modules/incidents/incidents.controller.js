export class IncidentsController {
  constructor(incidentService) {
    this.incidentService = incidentService;
  }

  getAllIncidents = async (req, res) => {
    const incidents = await this.incidentService.getAllIncidents(req.userInfo);
    res.status(200).json({ success: true, data: incidents });
  };

  createIncident = async (req, res) => {
    const result = await this.incidentService.createIncident(req.userInfo, req.body);
    res.status(201).json({ success: true, data: result });
  };
}
