import { prisma, prismaTransaction } from '#database/db.js';
import { getBoundingBoxByRadiusMeters } from '#shared/utils/geo.js';

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
          areaName: true,
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
      select: this._baseSelect(),
    });

    return incidents;
  }

  async findById(id) {
    const incident = await prisma.incident.findUnique({
      where: { id },
      select: this._baseSelect(),
    });

    return incident;
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
    const updatedIncident = await prismaTransaction(async (tx) => {
      const incident = await tx.incident.update({
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
      });

      await tx.incidentStatusHistory.create({
        data: {
          incidentId: id,
          changedBy: data.changedBy,
          oldStatus: data.oldStatus,
          newStatus: data.trafficStatus ?? data.oldStatus,
          notes: data.notes,
          oldValues: data.oldValues,
          newValues: data.newValues,
        },
      });

      return incident;
    });
    return updatedIncident;
  }

  async findStatusHistory(incidentId, { skip, take, sortBy, sortOrder }) {
    const { records, total } = await prismaTransaction(async (tx) => {
      const records = await tx.incidentStatusHistory.findMany({
        where: { incidentId },
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
        where: { incidentId },
      });

      return { records, total };
    });

    return {
      history: records,
      total,
    };
  }
}
