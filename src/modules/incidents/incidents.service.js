import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '#shared/utils/errors.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { INCIDENT_STATUSES, TRAFFIC_STATUSES } from '#shared/constants/enums.js';
import { UserRoles } from '#shared/constants/roles.js';
import { distanceBetween, kilometersToMeters } from '#shared/utils/geo.js';
import { logger } from '#shared/utils/logger.js';

export class IncidentsService {
  constructor(incidentsRepository, alertsService) {
    this.repo = incidentsRepository;
    this.alertsService = alertsService;
  }

  _formatLog(action, stage, context = {}) {
    return `[incidents.service] ${action} ${stage} ${JSON.stringify(context)}`;
  }

  async _withLogging(action, context, operation) {
    try {
      return await operation();
    } catch (error) {
      const failureContext = {
        ...context,
        error: error.message,
        statusCode: error?.statusCode,
      };

      // Expected operational conflicts are informative, not system failures.
      if (error instanceof ConflictError) {
        logger.info(this._formatLog(action, 'failure', failureContext));
      } else if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
        logger.warn(this._formatLog(action, 'failure', failureContext));
      } else {
        logger.error(this._formatLog(action, 'failure', failureContext));
      }

      throw error;
    }
  }

  async getUserStats(userId, role) {
    return this._withLogging('getUserStats', { userId, role }, async () => {
      const baseStats = await this.repo.getUserReportedStats(userId);

      if (role !== UserRoles.MODERATOR && role !== UserRoles.ADMIN) {
        return baseStats;
      }

      const moderationStats = await this.repo.getUserModerationStats(userId);

      return {
        counts: {
          ...baseStats.counts,
          ...moderationStats.counts,
        },
        breakdowns: {
          ...baseStats.breakdowns,
          ...moderationStats.breakdowns,
        },
      };
    });
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
      'area',
      'road',
      'city',
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
      road: body.road,
      city: body.city,
      type: body.type,
      severity: body.severity,
      description: body.description,
      trafficStatus: body.trafficStatus,
      ...overrides,
    };
  }

  async getAllIncidents(filters) {
    return this._withLogging(
      'getAllIncidents',
      {
        page: filters.page,
        limit: filters.limit,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      },
      async () => {
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
    );
  }

  _severityRank(severity) {
    const rank = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    return rank[severity] ?? 0;
  }

  _sortNearbyIncidents(incidents, { sortBy, sortOrder }) {
    const direction = sortOrder === 'desc' ? -1 : 1;

    return incidents.sort((a, b) => {
      if (sortBy === 'createdAt') {
        return direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }

      if (sortBy === 'severity') {
        return direction * (this._severityRank(a.severity) - this._severityRank(b.severity));
      }

      return direction * (a.distanceMeters - b.distanceMeters);
    });
  }

  async getNearbyIncidents(filters) {
    return this._withLogging(
      'getNearbyIncidents',
      {
        lat: filters.lat,
        lng: filters.lng,
        radiusMeters: filters.radiusMeters ?? 500,
        page: filters.page,
        limit: filters.limit,
      },
      async () => {
        const {
          lat,
          lng,
          radiusMeters = 500,
          type,
          severity,
          trafficStatus,
          status,
          page,
          limit,
          sortBy,
          sortOrder,
        } = filters;

        const centerLat = Number(lat);
        const centerLng = Number(lng);
        const searchRadiusMeters = Number(radiusMeters);

        const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

        const candidates = await this.repo.findNearbyCandidates({
          lat: centerLat,
          lng: centerLng,
          radiusMeters: searchRadiusMeters,
          type,
          severity,
          trafficStatus,
          status,
        });

        const strictNearby = candidates
          .map((incident) => {
            const incidentLat = Number(incident.locationLat);
            const incidentLng = Number(incident.locationLng);
            const distanceMeters = kilometersToMeters(
              distanceBetween(centerLat, centerLng, incidentLat, incidentLng)
            );

            return {
              ...incident,
              distanceMeters: Math.round(distanceMeters),
            };
          })
          .filter((incident) => incident.distanceMeters <= searchRadiusMeters);

        const sortedIncidents = this._sortNearbyIncidents(strictNearby, { sortBy, sortOrder });
        const paginatedIncidents = sortedIncidents.slice(skip, skip + take);

        return {
          incidents: paginatedIncidents,
          pagination: buildPaginationMeta(sortedIncidents.length),
        };
      }
    );
  }

  async getIncidentById(id) {
    return this._withLogging('getIncidentById', { incidentId: id }, async () => {
      const incident = await this.repo.findById(id);

      if (!incident) {
        throw new NotFoundError('Incident not found');
      }

      return incident;
    });
  }

  async createVerifiedIncident(adminInfo, body) {
    return this._withLogging(
      'createVerifiedIncident',
      { actorId: adminInfo?.id, actorRole: adminInfo?.role },
      async () => {
        // TODO: Implement a more robust duplicate detection mechanism that considers both location and time proximity, as well as incident type and severity.

        const moderatedAt = new Date();

        const incident = await this.repo.create(
          this._buildIncidentCreatePayload(adminInfo, body, {
            status: INCIDENT_STATUSES.VERIFIED, // Automatically mark as verified when created by a moderator/admin
            moderatedAt,
            moderatedBy: adminInfo.id,
          })
        );

        if (this.alertsService) {
          await this.alertsService.handleNewIncident(incident);
        }

        logger.info(
          this._formatLog('createVerifiedIncident', 'success', {
            incidentId: incident.id,
            actorId: adminInfo?.id,
            actorRole: adminInfo?.role,
            status: incident.status,
          })
        );

        return incident;
      }
    );
  }

  async createIncident(userInfo, body) {
    return this._withLogging(
      'createIncident',
      { actorId: userInfo?.id, actorRole: userInfo?.role },
      async () => {
        // TODO: Implement a more robust duplicate detection mechanism
        const incident = await this.repo.create(
          this._buildIncidentCreatePayload(userInfo, body, {
            status: INCIDENT_STATUSES.PENDING,
          })
        );

        logger.info(
          this._formatLog('createIncident', 'success', {
            incidentId: incident.id,
            actorId: userInfo?.id,
            actorRole: userInfo?.role,
            status: incident.status,
          })
        );

        return incident;
      }
    );
  }

  async updateIncident(id, body, userInfo) {
    return this._withLogging(
      'updateIncident',
      { incidentId: id, actorId: userInfo?.id, actorRole: userInfo?.role },
      async () => {
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
          area: body.area,
          road: body.road,
          city: body.city,
          type: body.type,
          oldStatus: existingIncident.status,
          newStatus: existingIncident.status,
          changedBy: userInfo.id,
          notes: body.notes,
          oldValues,
          newValues,
        });
      }
    );
  }

  async closeIncident(id, userInfo) {
    return this._withLogging(
      'closeIncident',
      { incidentId: id, actorId: userInfo?.id, actorRole: userInfo?.role },
      async () => {
        const existingIncident = await this.repo.findById(id);

        if (!existingIncident) {
          throw new NotFoundError('Incident not found');
        }

        if (existingIncident.status === INCIDENT_STATUSES.CLOSED) {
          throw new ConflictError('Incident is already closed');
        }

        const incident = await this.repo.updateWithStatusHistory(id, {
          status: INCIDENT_STATUSES.CLOSED,
          trafficStatus: TRAFFIC_STATUSES.CLOSED,
          resolvedAt: new Date(),
          oldStatus: existingIncident.status,
          newStatus: INCIDENT_STATUSES.CLOSED,
          changedBy: userInfo.id,
          notes: 'Closed incident',
          oldValues: { status: existingIncident.status },
          newValues: { status: INCIDENT_STATUSES.CLOSED },
        });

        logger.info(
          this._formatLog('closeIncident', 'success', {
            incidentId: incident.id,
            actorId: userInfo?.id,
            actorRole: userInfo?.role,
            status: incident.status,
          })
        );

        return incident;
      }
    );
  }

  async getIncidentReports(incidentId) {
    return this._withLogging('getIncidentReports', { incidentId }, async () => {
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
    });
  }
  async verifyIncident(id, userInfo, notes = 'Verified incident') {
    return this._withLogging(
      'verifyIncident',
      { incidentId: id, actorId: userInfo?.id, actorRole: userInfo?.role },
      async () => {
        const incident = await this._moderateIncident(
          id,
          INCIDENT_STATUSES.VERIFIED,
          userInfo,
          notes
        );

        if (this.alertsService) {
          await this.alertsService.handleNewIncident(incident);
        }

        logger.info(
          this._formatLog('verifyIncident', 'success', {
            incidentId: incident.id,
            actorId: userInfo?.id,
            actorRole: userInfo?.role,
            status: incident.status,
          })
        );

        return incident;
      }
    );
  }

  async rejectIncident(id, userInfo, notes = 'Reject incident') {
    return this._withLogging(
      'rejectIncident',
      { incidentId: id, actorId: userInfo?.id, actorRole: userInfo?.role },
      async () => {
        const incident = await this._moderateIncident(
          id,
          INCIDENT_STATUSES.REJECTED,
          userInfo,
          notes
        );

        logger.info(
          this._formatLog('rejectIncident', 'success', {
            incidentId: incident.id,
            actorId: userInfo?.id,
            actorRole: userInfo?.role,
            status: incident.status,
          })
        );

        return incident;
      }
    );
  }

  async _moderateIncident(id, newStatus, userInfo, notes) {
    const existingIncident = await this.repo.findById(id);
    if (!existingIncident) throw new NotFoundError('Incident not found');

    if (!userInfo?.id) {
      throw new ForbiddenError('Authentication required to moderate incident');
    }

    if (existingIncident.status === INCIDENT_STATUSES.CLOSED)
      throw new ConflictError('Closed incidents cannot be modified');

    if (existingIncident.status === newStatus)
      throw new ConflictError(`Incident is already ${newStatus}`);

    const now = new Date();
    const actorId = userInfo?.id ?? null;

    return this.repo.updateWithStatusHistory(id, {
      status: newStatus,
      moderatedAt: now,
      moderatedBy: actorId,
      trafficStatus: existingIncident.trafficStatus,
      oldStatus: existingIncident.status,
      newStatus,
      changedBy: actorId,
      notes,
      oldValues: {
        status: existingIncident.status,
        moderatedAt: existingIncident.moderatedAt ?? null,
        moderatedBy: existingIncident.moderatedBy ?? null,
      },
      newValues: {
        status: newStatus,
        moderatedAt: now,
        moderatedBy: actorId,
      },
    });
  }

  async getIncidentHistory(incidentId, filters) {
    return this._withLogging(
      'getIncidentHistory',
      {
        incidentId,
        page: filters.page,
        limit: filters.limit,
      },
      async () => {
        const incident = await this.repo.findById(incidentId);
        if (!incident) {
          throw new NotFoundError('Incident not found');
        }

        const { page, limit, sortBy, sortOrder } = filters;
        const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

        const { history, total } = await this.repo.findStatusHistory(incidentId, {
          skip,
          take,
          sortBy,
          sortOrder,
        });

        return {
          incidentId: Number(incidentId),
          history,
          pagination: buildPaginationMeta(total),
        };
      }
    );
  }
}
