import { prisma } from '#database/db.js';

export class RouteCacheRepository {
  async invalidateCachesByCheckpointOrArea({ checkpointId, area }) {
    const normalizedArea = area?.trim().toLowerCase();

    const conditions = [];

    if (typeof checkpointId === 'number') {
  conditions.push({
    checkpointsIds: {
      has: checkpointId,
    },
  });
}

    if (normalizedArea) {
      conditions.push({
        areas: {
          has: normalizedArea,
        },
      });
    }

    if (!conditions.length) {
      return { count: 0 };
    }

    return prisma.routeCache.deleteMany({
      where: {
        OR: conditions,
      },
    });
  }
}
