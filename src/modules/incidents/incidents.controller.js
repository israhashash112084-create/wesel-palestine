export class IncidentsController {
  constructor(incidentService) {
    this.incidentService = incidentService;
  }

  getAllIncidents = async (req, res) => {
    const incidents = await this.incidentService.getAllIncidents();
    res.status(200).json({ success: true, data: incidents });
  };

  createIncident = async (req, res) => {
    const result = await this.incidentService.createIncident(req.userInfo, req.body);
    res.status(201).json({ success: true, data: result });
  };

  updateIncident = async (req, res) => {
    const { id } = req.params;
    const result = await this.incidentService.updateIncident(id, req.body, req.userInfo);
    res.status(200).json({ success: true, data: result });
  };
}
