import { BadRequestError, NotFoundError } from '#shared/utils/errors.js';

export class IncidentsService {
  constructor(incidentsRepository) {
    this.repo = incidentsRepository;
  }

  _toComparableValue(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
      return value.toString();
    }

    return value;
  }

  _buildAuditDiff(existingIncident, body) {
    const updatableFields = [
      'severity',
      'description',
      'trafficStatus',
      'locationLat',
      'locationLng',
      'type',
    ];

    const oldValues = {};
    const newValues = {};

    for (const field of updatableFields) {
      if (body[field] === undefined) {
        continue;
      }

      const oldValue = this._toComparableValue(existingIncident[field]);
      const newValue = this._toComparableValue(body[field]);

      if (oldValue !== newValue) {
        oldValues[field] = oldValue;
        newValues[field] = newValue;
      }
    }

    return { oldValues, newValues };
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

  async updateIncident(id, body, userInfo) {
    const existingIncident = await this.repo.findById(id);
    if (!existingIncident) {
      throw new NotFoundError('Incident not found');
    }

    const { oldValues, newValues } = this._buildAuditDiff(existingIncident, body);

    if (Object.keys(newValues).length === 0) {
      throw new BadRequestError('No changes detected in update payload');
    }

    const updatedIncident = await this.repo.updateWithStatusHistory(id, {
      severity: body.severity,
      description: body.description,
      trafficStatus: body.trafficStatus,
      locationLat: body.locationLat,
      locationLng: body.locationLng,
      type: body.type,
      oldStatus: existingIncident.trafficStatus,
      changedBy: userInfo.id,
      notes: body.notes,
      oldValues,
      newValues,
    });

    return updatedIncident;
  }
}
