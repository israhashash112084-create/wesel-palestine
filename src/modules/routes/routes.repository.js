import { prisma } from '#database/db.js';
import { CHECKPOINT_STATUSES, INCIDENT_STATUSES } from '#shared/constants/enums.js';

export class RoutesRepository {
  async findCache(cacheKey) {
    return await prisma.routeCache.findFirst({
      where: {
        cacheKey,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async saveCache({ cacheKey, fromLat, fromLng, toLat, toLng, responseData, expiresAt }) {
    await prisma.routeCache.upsert({
      where: { cacheKey },
      update: {
        responseData,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        cacheKey,
        fromLat,
        fromLng,
        toLat,
        toLng,
        responseData,
        expiresAt,
      },
    });
  }

  async incrementCacheHit(cacheKey) {
    await prisma.routeCache.update({
      where: { cacheKey },
      data: { hitCount: { increment: 1 } },
    });
  }

  async findActiveCheckpoints() {
    return await prisma.checkpoints.findMany({
      where: {
        status: {
          in: [CHECKPOINT_STATUSES.CLOSED, CHECKPOINT_STATUSES.SLOW],
        },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        status: true,
        areaName: true,
      },
    });
  }

  async findActiveIncidents() {
    return await prisma.incidents.findMany({
      where: {
        status: INCIDENT_STATUSES.VERIFIED,
        isVerified: true,
      },
      select: {
        id: true,
        type: true,
        severity: true,
        locationLat: true,
        locationLng: true,
        checkpointId: true,
        area: true,
      },
    });
  }

  async logApiCall({ service, endpoint, statusCode, responseTimeMs, isFallback, errorMessage }) {
    await prisma.externalApiLog.create({
      data: {
        service,
        endpoint,
        statusCode: statusCode ?? null,
        responseTimeMs: responseTimeMs ?? null,
        isFallback: isFallback ?? false,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  async saveRouteHistory(data) {
    return prisma.routeHistory.create({
      data: {
        userId: data.userId,

        fromLat: data.fromLat,
        fromLng: data.fromLng,
        toLat: data.toLat,
        toLng: data.toLng,

        distanceKm: data.distanceKm,
        baseDurationMinutes: data.baseDurationMinutes,
        finalDurationMinutes: data.finalDurationMinutes,
        totalDelayMinutes: data.totalDelayMinutes,

        isFallback: data.isFallback ?? false,
      },
    });
  }

  async findUserRouteHistory(userId, { skip, take }) {
    return prisma.routeHistory.findMany({
      where: { userId },

      orderBy: {
        createdAt: 'desc',
      },

      skip,
      take,
    });
  }

  async countUserRouteHistory(userId) {
    return prisma.routeHistory.count({
      where: { userId },
    });
  }

  async getUserStats(userId) {
    const [routeHistoryAgg, routeHistoryByFallback] = await Promise.all([
      prisma.routeHistory.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: {
          totalDelayMinutes: true,
          distanceKm: true,
        },
        _avg: {
          totalDelayMinutes: true,
          distanceKm: true,
        },
      }),
      prisma.routeHistory.groupBy({
        by: ['isFallback'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);

    return {
      counts: {
        routeQueries: routeHistoryAgg._count._all ?? 0,
      },
      routeHistory: {
        totalDelayMinutes: Number(routeHistoryAgg._sum.totalDelayMinutes ?? 0),
        totalDistanceKm: Number(routeHistoryAgg._sum.distanceKm ?? 0),
        avgDelayMinutes: Number(routeHistoryAgg._avg.totalDelayMinutes ?? 0),
        avgDistanceKm: Number(routeHistoryAgg._avg.distanceKm ?? 0),
        totalQueries: routeHistoryAgg._count._all ?? 0,
      },
      breakdowns: {
        routeHistoryByMode: routeHistoryByFallback.reduce(
          (acc, row) => {
            acc[row.isFallback ? 'fallback' : 'primary'] = row._count._all;
            return acc;
          },
          { primary: 0, fallback: 0 }
        ),
      },
    };
  }
}
