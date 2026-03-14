import { NotFoundError } from '#shared/utils/errors.js';

export class IncidentsService {
  constructor(incidentsRepository) {
    this.repo = incidentsRepository;
  }

  async getAllIncidents() {
    return this.repo.findMany();
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

  async updateIncident(id, body) {
    const existingIncident = await this.repo.findById(id);
    if (!existingIncident) {
      throw new NotFoundError('Incident not found');
    }

    const updatedIncident = await this.repo.update(id, {
      severity: body.severity,
      description: body.description,
      trafficStatus: body.trafficStatus,
      locationLat: body.locationLat,
      locationLng: body.locationLng,
      type: body.type,
    });

    return updatedIncident;
  }
}
