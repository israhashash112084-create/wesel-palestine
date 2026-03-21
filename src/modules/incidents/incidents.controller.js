export class IncidentsController {
  constructor(incidentService) {
    this.incidentService = incidentService;
  }

  getAllIncidents = async (req, res) => {
    const incidents = await this.incidentService.getAllIncidents(req.query);
    res.status(200).json({ success: true, data: incidents });
  };

  getIncidentById = async (req, res) => {
    const { id } = req.params;
    const incident = await this.incidentService.getIncidentById(id);
    res.status(200).json({ success: true, data: incident });
  };

  createIncident = async (req, res) => {
    const result = await this.incidentService.createVerifiedIncident(req.userInfo, req.body);
    res.status(201).json({ success: true, data: result });
  };

  updateIncident = async (req, res) => {
    const { id } = req.params;
    const result = await this.incidentService.updateIncident(id, req.body, req.userInfo);
    res.status(200).json({ success: true, data: result });
  };

  closeIncident = async (req, res) => {
    const { id } = req.params;
    const result = await this.incidentService.closeIncident(id, req.userInfo);
    res.status(200).json({ success: true, data: result });
  };

  getIncidentReports = async (req, res) => {
    const { id } = req.params;
    const reports = await this.incidentService.getIncidentReports(id);
    res.status(200).json({ success: true, data: reports });
  };
}
