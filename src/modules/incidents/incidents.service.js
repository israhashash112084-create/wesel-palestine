import { UserRoles } from '#shared/constants/roles.js';

export class IncidentsService {
  constructor(incidentsRepository) {
    this.repo = incidentsRepository;
  }

  _isRegularUser(userInfo) {
    return userInfo?.role === UserRoles.USER;
  }

  async getAllIncidents(userInfo) {
    const isRegularUser = this._isRegularUser(userInfo);

    return isRegularUser ? this.repo.findByReportedBy(userInfo.id) : this.repo.findMany();
  }

  async createIncident(userInfo, body) {
    const incidentLocation = { lat: body.locationLat, lng: body.locationLng };

    // TODO: Implement a more robust duplicate detection mechanism that considers both location and time proximity, as well as incident type and severity.

    return this.repo.create({
      reportedBy: userInfo.id,
      checkpointId: body.checkpointId,
      locationLat: incidentLocation.lat,
      locationLng: incidentLocation.lng,
      area: body.area,
      type: body.type,
      severity: body.severity,
      description: body.description,
      trafficStatus: body.trafficStatus,
    });
  }
}
