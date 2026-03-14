import { BadRequestError, NotFoundError } from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { INCIDENT_STATUSES } from '#shared/constants/enums.js';

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

  async getAllIncidents(filters) {
    const {
      type,
      severity,
      trafficStatus,
      checkpointId,
      reportedBy,
      fromDate,
      toDate,
      page,
      limit,
      sortBy,
      sortOrder,
    } = filters;

    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

    const { incidents, total } = await this.repo.findMany({
      type,
      severity,
      trafficStatus,
      checkpointId,
      reportedBy,
      fromDate,
      toDate,
      skip,
      take,
      sortBy,
      sortOrder,
    });

    return {
      incidents: incidents,
      pagination: buildPaginationMeta(total),
    };
  }

  async getIncidentById(id) {
    const incident = await this.repo.findById(id);
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }
    return incident;
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
      status: INCIDENT_STATUSES.VERIFIED, // Automatically mark as verified when created by a moderator/admin
      verifiedAt: new Date(),
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

  async closeIncident(id, userInfo) {
    const existingIncident = await this.repo.findById(id);
    if (!existingIncident) {
      throw new NotFoundError('Incident not found');
    }

    if (existingIncident.status === INCIDENT_STATUSES.CLOSED) {
      throw new BadRequestError('Incident is already closed');
    }

    const updatedIncident = await this.repo.updateWithStatusHistory(id, {
      status: INCIDENT_STATUSES.CLOSED,
      trafficStatus: INCIDENT_STATUSES.CLOSED,
      resolvedAt: new Date(),
      oldStatus: existingIncident.trafficStatus,
      changedBy: userInfo.id,
      notes: 'Closed incident',
      oldValues: { status: existingIncident.status },
      newValues: { status: INCIDENT_STATUSES.CLOSED },
    });

    return updatedIncident;
  }
}
