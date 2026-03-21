import { BadRequestError, NotFoundError } from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { INCIDENT_STATUSES } from '#shared/constants/enums.js';

export class IncidentsService {
  constructor(incidentsRepository, alertsService) {
    this.repo = incidentsRepository;
    this.alertsService = alertsService;
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

  _buildIncidentCreatePayload(userInfo, body, overrides = {}) {
    return {
      reportedBy: userInfo.id,
      checkpointId: body.checkpointId,
      locationLat: body.locationLat,
      locationLng: body.locationLng,
      area: body.area,
      type: body.type,
      severity: body.severity,
      description: body.description,
      trafficStatus: body.trafficStatus,
      ...overrides,
    };
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
      incidents,
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

  async createVerifiedIncident(userInfo, body) {
    // TODO: Implement a more robust duplicate detection mechanism
    const verifiedAt = new Date();

    const incident = await this.repo.create(
      this._buildIncidentCreatePayload(userInfo, body, {
        status: INCIDENT_STATUSES.VERIFIED,
        verifiedAt,
        verifiedBy: userInfo.id,
      })
    );

    if (this.alertsService) {
      await this.alertsService.handleNewIncident(incident);
    }

    return incident;
  }

  async createIncident(userInfo, body) {
    // TODO: Implement a more robust duplicate detection mechanism
    const incident = await this.repo.create(
      this._buildIncidentCreatePayload(userInfo, body, {
        status: INCIDENT_STATUSES.PENDING,
      })
    );

    if (this.alertsService) {
      await this.alertsService.handleNewIncident(incident);
    }

    return incident;
  }

  async verifyIncident(id, userInfo, notes = 'Verified incident') {
    const existingIncident = await this.repo.findById(id);

    if (!existingIncident) {
      throw new NotFoundError('Incident not found');
    }

    if (existingIncident.status === INCIDENT_STATUSES.CLOSED) {
      throw new BadRequestError('Closed incidents cannot be verified');
    }

    if (existingIncident.status === INCIDENT_STATUSES.VERIFIED) {
      throw new BadRequestError('Incident is already verified');
    }

    const verifiedAt = new Date();

    const incident = await this.repo.updateWithStatusHistory(id, {
  status: INCIDENT_STATUSES.VERIFIED,
  verifiedAt,
  verifiedBy: userInfo.id,
  trafficStatus: existingIncident.trafficStatus,
  oldStatus: existingIncident.trafficStatus,
  changedBy: userInfo.id,
  notes,
  oldValues: {
    status: existingIncident.status,
    verifiedAt: existingIncident.verifiedAt ?? null,
    verifiedBy: existingIncident.verifiedBy ?? null,
  },
  newValues: {
    status: INCIDENT_STATUSES.VERIFIED,
    verifiedAt,
    verifiedBy: userInfo.id,
  },
});

if (this.alertsService) {
  await this.alertsService.handleNewIncident(incident);
}

return incident;
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

    return this.repo.updateWithStatusHistory(id, {
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
  }

  async closeIncident(id, userInfo) {
    const existingIncident = await this.repo.findById(id);

    if (!existingIncident) {
      throw new NotFoundError('Incident not found');
    }

    if (existingIncident.status === INCIDENT_STATUSES.CLOSED) {
      throw new BadRequestError('Incident is already closed');
    }

    return this.repo.updateWithStatusHistory(id, {
      status: INCIDENT_STATUSES.CLOSED,
      trafficStatus: INCIDENT_STATUSES.CLOSED,
      resolvedAt: new Date(),
      oldStatus: existingIncident.trafficStatus,
      changedBy: userInfo.id,
      notes: 'Closed incident',
      oldValues: { status: existingIncident.status },
      newValues: { status: INCIDENT_STATUSES.CLOSED },
    });
  }

  async getIncidentReports(incidentId) {
    const incident = await this.repo.findById(incidentId);

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    return [
      {
        id: 'report1',
        incidentId,
        reportedBy: 'user1',
      },
    ];
  }
}