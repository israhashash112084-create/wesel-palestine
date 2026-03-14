import { prisma, prismaTransaction } from '#database/db.js';

export class IncidentsRepository {
  _baseSelect() {
    return {
      id: true,
      checkpointId: true,
      reportedBy: true,
      VerifiedBy: true,
      locationLat: true,
      locationLng: true,
      area: true,
      type: true,
      severity: true,
      description: true,
      trafficStatus: true,
      verifiedAt: true,
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
      verifier: {
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
    const cleaned = this._removeNullValues(record);

    if (Object.hasOwn(cleaned, 'VerifiedBy')) {
      cleaned.verifiedBy = cleaned.VerifiedBy;
      delete cleaned.VerifiedBy;
    }

    return cleaned;
  }

  async create(data) {
    const incident = await prisma.incidents.create({
      data: {
        checkpointId: data.checkpointId,
        reportedBy: data.reportedBy,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        area: data.area,
        type: data.type,
        severity: data.severity,
        description: data.description,
        trafficStatus: data.trafficStatus,
      },
      select: this._baseSelect(),
    });

    return this._normalizeRecord(incident);
  }

  async findMany() {
    const incidents = await prisma.incidents.findMany({
      orderBy: { createdAt: 'desc' },
      select: this._baseSelect(),
    });

    return incidents.map((incident) => this._normalizeRecord(incident));
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
          trafficStatus: data.trafficStatus,
          locationLat: data.locationLat,
          locationLng: data.locationLng,
          type: data.type,
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
