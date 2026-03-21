import { prisma, prismaTransaction } from '#database/db.js';

export class IncidentsRepository {
  _baseSelect() {
    return {
      id: true,
      checkpointId: true,
      reportedBy: true,
      moderadedBy: true,
      locationLat: true,
      locationLng: true,
      area: true,
      type: true,
      status: true,
      severity: true,
      description: true,
      trafficStatus: true,
      moderadeddAt: true,
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
      moderad: {
       select: {
       id: true,
       firstName: true,
       lastName: true,
  },
},
    };
  }

  _removeNullValues(record) {
    return Object.fromEntries(
      // eslint-disable-next-line no-unused-vars
      Object.entries(record).filter(([_, value]) => value !== null)
    );
  }

  _normalizeRecord(record) {
     return this._removeNullValues(record);
  }

  async create(data) {
    const incident = await prisma.incidents.create({
      data: {
        checkpointId: data.checkpointId,
        reportedBy: data.reportedBy,
        moderadedBy: data.moderadedBy,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        area: data.area,
        type: data.type,
        severity: data.severity,
        description: data.description,
        trafficStatus: data.trafficStatus,
        status: data.status,
        moderadeddAt: data.moderadeddAt,
      },
      select: this._baseSelect(),
    });

    return this._normalizeRecord(incident);
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
    const where = {};

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (trafficStatus) where.trafficStatus = trafficStatus;
    if (checkpointId) where.checkpointId = checkpointId;
    if (reportedBy) where.reportedBy = reportedBy;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const { incidents, total } = await prismaTransaction(async (tx) => {
      const incidents = await tx.incidents.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        select: this._baseSelect(),
      });

      const total = await tx.incidents.count({ where });

      return { incidents, total };
    });

    const cleanedIncidents = incidents.map((incident) => this._normalizeRecord(incident));

    return { incidents: cleanedIncidents, total };
  }

  async findById(id) {
    const incident = await prisma.incidents.findUnique({
      where: { id },
      select: this._baseSelect(),
    });

    return incident ? this._normalizeRecord(incident) : null;
  }

  async update(id, data) {
    const updatedIncident = await prisma.incidents.update({
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

    return this._normalizeRecord(updatedIncident);
  }

  async updateWithStatusHistory(id, data) {
    const updatedIncident = await prismaTransaction(async (tx) => {
      const incident = await tx.incidents.update({
        where: { id },
        data: {
          severity: data.severity,
          description: data.description,
          status: data.status,
          moderadedBy: data.moderadedBy,
          moderadeddAt: data.moderadeddAt,
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

    return this._normalizeRecord(updatedIncident);
  }
}
