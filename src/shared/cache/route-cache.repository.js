import { prisma } from '#database/db.js';

export class RouteCacheRepository {
 /* async invalidateCachesByCheckpointOrArea({ checkpointId, area }) {
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
  }*/
 async invalidateCachesByCheckpointOrArea({ checkpointId, area }) {
  const normalizedArea = area?.trim().toLowerCase();

  console.log('--- INVALIDATION START ---');
  console.log('RAW INPUT:', { checkpointId, area });
  console.log('NORMALIZED AREA:', normalizedArea);

  const conditions = [];

  if (typeof checkpointId === 'number') {
    console.log('ADDING CHECKPOINT CONDITION');
    conditions.push({
      checkpointsIds: {
        has: checkpointId,
      },
    });
  }

  if (normalizedArea) {
    console.log('ADDING AREA CONDITION');
    conditions.push({
      areas: {
        has: normalizedArea,
      },
    });
  }

  console.log('FINAL CONDITIONS:', JSON.stringify(conditions, null, 2));

  if (!conditions.length) {
    console.log('NO CONDITIONS → SKIPPING DELETE');
    return { count: 0 };
  }

  const result = await prisma.routeCache.deleteMany({
    where: {
      OR: conditions,
    },
  });

  console.log('DELETED ROWS COUNT:', result.count);
  console.log('--- INVALIDATION END ---');

  return result;
}
}