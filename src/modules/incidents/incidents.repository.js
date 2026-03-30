import { prisma, prismaTransaction } from '#database/db.js';
import {
  findNearestCandidateWithinRadiusMeters,
  getBoundingBoxByRadiusMeters,
} from '#shared/utils/geo.js';
import { toCountMap } from '#shared/utils/count-map.js';
import { INCIDENT_STATUSES, TRAFFIC_STATUSES } from '#shared/constants/enums.js';

const DUPLICATE_RADIUS_METERS = 500;
const GLOBAL_DUPLICATE_WINDOW_MS = 2 * 60 * 60 * 1000;
const USER_DUPLICATE_WINDOW_MS = 60 * 60 * 1000;

export class IncidentsRepository {
  _baseSelect() {
    return {
      id: true,
      checkpointId: true,
      reportedBy: true,
      moderatedBy: true,
      locationLat: true,
      locationLng: true,
      area: true,
      road: true,
      city: true,
      type: true,
      status: true,
      severity: true,
      description: true,
      trafficStatus: true,
      moderatedAt: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
      checkpoint: {
        select: {
          id: true,
          name: true,
          area: true,
        },
      },
      reporter: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      moderator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    };
  }

  _nearbyCandidateSelect() {
    return {
      id: true,
      locationLat: true,
      locationLng: true,
      severity: true,
      createdAt: true,
    };
  }

  _buildWhere({
    type,
    severity,
    trafficStatus,
    checkpointId,
    reportedBy,
    status,
    fromDate,
    toDate,
    minLat,
    maxLat,
    minLng,
    maxLng,
  }) {
    const where = {};

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (trafficStatus) where.trafficStatus = trafficStatus;
    if (checkpointId) where.checkpointId = checkpointId;
    if (reportedBy) where.reportedBy = reportedBy;
    if (status) where.status = status;

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    if (minLat !== undefined || maxLat !== undefined) {
      where.locationLat = {};
      if (minLat !== undefined) where.locationLat.gte = minLat;
      if (maxLat !== undefined) where.locationLat.lte = maxLat;
    }

    if (minLng !== undefined || maxLng !== undefined) {
      where.locationLng = {};
      if (minLng !== undefined) where.locationLng.gte = minLng;
      if (maxLng !== undefined) where.locationLng.lte = maxLng;
    }

    return where;
  }

  async create(data) {
    const incident = await prisma.incident.create({
      data: {
        ...(data.checkpointId && {
          checkpoint: {
            connect: { id: data.checkpointId },
          },
        }),
        reporter: {
          connect: { id: data.reportedBy },
        },
        ...(data.moderatedBy && {
          moderator: {
            connect: { id: data.moderatedBy },
          },
        }),
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        area: data.area,
        road: data.road ?? null,
        city: data.city ?? null,
        type: data.type,
        severity: data.severity,
        description: data.description,
        trafficStatus: data.trafficStatus,
        status: data.status,
        moderatedAt: data.moderatedAt,
      },
      select: this._baseSelect(),
    });

    return incident;
  }

  async findMany({
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
  }) {
    const where = this._buildWhere({
      type,
      severity,
      trafficStatus,
      checkpointId,
      reportedBy,
      fromDate,
      toDate,
    });

    const { incidents, total } = await prismaTransaction(async (tx) => {
      const incidents = await tx.incident.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        select: this._baseSelect(),
      });

      const total = await tx.incident.count({ where });

      return { incidents, total };
    });

    return { incidents, total };
  }

  async findNearbyCandidates({ lat, lng, radiusMeters, type, severity, trafficStatus, status }) {
    const { minLat, maxLat, minLng, maxLng } = getBoundingBoxByRadiusMeters(lat, lng, radiusMeters);

    const where = this._buildWhere({
      type,
      severity,
      trafficStatus,
      status,
      minLat,
      maxLat,
      minLng,
      maxLng,
    });

    const incidents = await prisma.incident.findMany({
      where,
      select: this._nearbyCandidateSelect(),
    });

    return incidents;
  }

  async findByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }

    const incidents = await prisma.incident.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      select: this._baseSelect(),
    });

    const byId = new Map(incidents.map((incident) => [incident.id, incident]));

    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  async findById(id) {
    const incident = await prisma.incident.findUnique({
      where: { id },
      select: this._baseSelect(),
    });

    return incident;
  }

  async findStalePendingIncidents({ createdBefore, take }) {
    return prisma.incident.findMany({
      where: {
        status: INCIDENT_STATUSES.PENDING,
        createdAt: {
          lte: createdBefore,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take,
      select: {
        id: true,
      },
    });
  }

  async autoClosePendingWithStatusHistory(id, { changedBy, notes, resolvedAt }) {
    return prismaTransaction(async (tx) => {
      const current = await tx.incident.findUnique({
        where: { id },
        select: {
          status: true,
          trafficStatus: true,
          resolvedAt: true,
        },
      });

      if (!current || current.status !== INCIDENT_STATUSES.PENDING) {
        return null;
      }

      const closeAt = resolvedAt ?? new Date();

      const incident = await tx.incident.update({
        where: { id },
        data: {
          status: INCIDENT_STATUSES.CLOSED,
          trafficStatus: TRAFFIC_STATUSES.CLOSED,
          resolvedAt: closeAt,
        },
        select: this._baseSelect(),
      });

      await tx.incidentStatusHistory.create({
        data: {
          incidentId: id,
          changedBy,
          oldStatus: INCIDENT_STATUSES.PENDING,
          newStatus: INCIDENT_STATUSES.CLOSED,
          notes,
          oldValues: {
            status: current.status,
            trafficStatus: current.trafficStatus,
            resolvedAt: current.resolvedAt ?? null,
          },
          newValues: {
            status: INCIDENT_STATUSES.CLOSED,
            trafficStatus: TRAFFIC_STATUSES.CLOSED,
            resolvedAt: closeAt,
          },
        },
      });

      return incident;
    });
  }

  async findUserDuplicateIncident({
    reportedBy,
    locationLat,
    locationLng,
    type,
    severity,
    checkpointId,
    excludeId = null,
  }) {
    const createdAfter = new Date(Date.now() - USER_DUPLICATE_WINDOW_MS);

    const { minLat, maxLat, minLng, maxLng } = getBoundingBoxByRadiusMeters(
      locationLat,
      locationLng,
      DUPLICATE_RADIUS_METERS
    );

    const where = {
      reportedBy,
      type,
      severity,
      status: {
        in: [INCIDENT_STATUSES.PENDING, INCIDENT_STATUSES.VERIFIED],
      },
      createdAt: { gte: createdAfter },
      locationLat: {
        gte: minLat,
        lte: maxLat,
      },
      locationLng: {
        gte: minLng,
        lte: maxLng,
      },
      ...(checkpointId !== undefined ? { checkpointId: checkpointId ?? null } : {}),
      ...(excludeId !== null ? { id: { not: excludeId } } : {}),
    };

    const candidates = await prisma.incident.findMany({
      where,
      select: this._baseSelect(),
    });

    const nearest = findNearestCandidateWithinRadiusMeters({
      originLat: locationLat,
      originLng: locationLng,
      candidates,
      radiusMeters: DUPLICATE_RADIUS_METERS,
      getLat: (candidate) => candidate.locationLat,
      getLng: (candidate) => candidate.locationLng,
    });

    return nearest?.candidate ?? null;
  }

  async findNearbyDuplicateIncident({
    locationLat,
    locationLng,
    type,
    severity,
    checkpointId,
    excludeId = null,
  }) {
    const createdAfter = new Date(Date.now() - GLOBAL_DUPLICATE_WINDOW_MS);

    const { minLat, maxLat, minLng, maxLng } = getBoundingBoxByRadiusMeters(
      locationLat,
      locationLng,
      DUPLICATE_RADIUS_METERS
    );

    const where = {
      type,
      severity,
      status: {
        in: [INCIDENT_STATUSES.PENDING, INCIDENT_STATUSES.VERIFIED],
      },
      createdAt: { gte: createdAfter },
      locationLat: {
        gte: minLat,
        lte: maxLat,
      },
      locationLng: {
        gte: minLng,
        lte: maxLng,
      },
      ...(checkpointId !== undefined ? { checkpointId: checkpointId ?? null } : {}),
      ...(excludeId !== null ? { id: { not: excludeId } } : {}),
    };

    const candidates = await prisma.incident.findMany({
      where,
      select: this._baseSelect(),
    });

    const nearest = findNearestCandidateWithinRadiusMeters({
      originLat: locationLat,
      originLng: locationLng,
      candidates,
      radiusMeters: DUPLICATE_RADIUS_METERS,
      getLat: (candidate) => candidate.locationLat,
      getLng: (candidate) => candidate.locationLng,
    });

    return nearest?.candidate ?? null;
  }

  async update(id, data) {
    const updatedIncident = await prisma.incident.update({
      where: { id },
      data: {
        severity: data.severity,
        description: data.description,
        trafficStatus: data.trafficStatus,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        type: data.type,
      },
      select: this._baseSelect(),
    });

    return updatedIncident;
  }

  async updateWithStatusHistory(id, data) {
    const existingIncident = await prisma.incident.findUnique({
      where: { id },
      select: {
        status: true,
      },
    });

    const oldStatus = data.oldStatus ?? existingIncident?.status;
    const newStatus = data.newStatus ?? data.status ?? existingIncident?.status;

    const [updatedIncident] = await prisma.$transaction([
      prisma.incident.update({
        where: { id },
        data: {
          severity: data.severity,
          description: data.description,
          status: data.status,

          ...(data.moderatedBy && {
            moderator: {
              connect: { id: data.moderatedBy },
            },
          }),

          moderatedAt: data.moderatedAt ?? null,
          trafficStatus: data.trafficStatus,
          locationLat: data.locationLat,
          locationLng: data.locationLng,
          type: data.type,
          resolvedAt: data.resolvedAt,
        },
        select: this._baseSelect(),
      }),
      prisma.incidentStatusHistory.create({
        data: {
          incidentId: id,
          changedBy: data.changedBy,
          oldStatus,
          newStatus,
          notes: data.notes,
          oldValues: data.oldValues,
          newValues: data.newValues,
        },
      }),
    ]);

    return updatedIncident;
  }

  async findStatusHistory(
    incidentId,
    { changedBy, oldStatus, newStatus, fromDate, toDate, skip, take, sortBy, sortOrder }
  ) {
    const where = {
      incidentId,
      ...(changedBy ? { changedBy } : {}),
      ...(oldStatus ? { oldStatus } : {}),
      ...(newStatus ? { newStatus } : {}),
      ...(fromDate || toDate
        ? {
            changedAt: {
              ...(fromDate ? { gte: new Date(fromDate) } : {}),
              ...(toDate ? { lte: new Date(toDate) } : {}),
            },
          }
        : {}),
    };

    const { records, total } = await prismaTransaction(async (tx) => {
      const records = await tx.incidentStatusHistory.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        select: {
          id: true,
          oldStatus: true,
          newStatus: true,
          notes: true,
          oldValues: true,
          newValues: true,
          changedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      const total = await tx.incidentStatusHistory.count({
        where,
      });

      return { records, total };
    });

    return {
      history: records,
      total,
    };
  }

  async getUserReportedStats(userId) {
    const [reportedIncidentsByStatus, incidentsReported] = await Promise.all([
      prisma.incident.groupBy({
        by: ['status'],
        where: { reportedBy: userId },
        _count: { _all: true },
      }),
      prisma.incident.count({ where: { reportedBy: userId } }),
    ]);

    return {
      counts: {
        incidentsReported,
      },
      breakdowns: {
        reportedIncidentsByStatus: toCountMap(reportedIncidentsByStatus, 'status'),
      },
    };
  }

  async getUserModerationStats(userId) {
    const [moderatedIncidentsByStatus, incidentsModerated] = await Promise.all([
      prisma.incident.groupBy({
        by: ['status'],
        where: { moderatedBy: userId },
        _count: { _all: true },
      }),
      prisma.incident.count({ where: { moderatedBy: userId } }),
    ]);

    return {
      counts: {
        incidentsModerated,
      },
      breakdowns: {
        moderatedIncidentsByStatus: toCountMap(moderatedIncidentsByStatus, 'status'),
      },
    };
  }
}
