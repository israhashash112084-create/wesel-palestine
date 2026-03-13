import { prisma } from '#database/db.js';

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

  async findMany() {
    const incidents = await prisma.incidents.findMany({
      orderBy: { createdAt: 'desc' },
      select: this._baseSelect(),
    });

    return incidents.map((incident) => this._removeNullValues(incident));
  }

  async findByReportedBy(userId) {
    const where = { reportedBy: userId };

    const incidents = await prisma.incidents.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: this._baseSelect(),
    });

    return incidents.map((incident) => this._removeNullValues(incident));
  }
}
