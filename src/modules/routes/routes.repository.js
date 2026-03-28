import { prisma } from '#database/db.js';
import { TRAFFIC_STATUSES, INCIDENT_STATUSES } from '#shared/constants/enums.js';

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
    return await prisma.checkpoint.findMany({
      where: {
        status: {
          in: [TRAFFIC_STATUSES.CLOSED, TRAFFIC_STATUSES.SLOW],
        },
      },
      select: {
        id:        true,
        name:      true,
        latitude:  true,
        longitude: true,
        status:    true,
        city:  true,
      },
    });
  }


  async findActiveIncidents() {
    return await prisma.incident.findMany({
      where: {
        status:     INCIDENT_STATUSES.VERIFIED,
       // isVerified: true,
      },
      select: {
        id:           true,
        type:         true,
        severity:     true,
        locationLat:  true,
        locationLng:  true,
        checkpointId: true,
        area:         true,   
      },
    });
  }


  async logApiCall({ service, endpoint, statusCode, responseTimeMs, isFallback, errorMessage }) {
    await prisma.externalApiLog.create({
      data: {
        service,
        endpoint,
        statusCode:     statusCode     ?? null,
        responseTimeMs: responseTimeMs ?? null,
        isFallback:     isFallback     ?? false,
        errorMessage:   errorMessage   ?? null,
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

async findCheckpointsByArea() {
  return prisma.checkpoint.findMany({
    where: {
      status: {
        in: [TRAFFIC_STATUSES.CLOSED, TRAFFIC_STATUSES.SLOW],
      },
    },
    select: {
      status: true,
      city: true,
    },
  });
}

async findIncidentsByArea() {
  return prisma.incident.findMany({
    where: {
      status: INCIDENT_STATUSES.VERIFIED,
    },
    select: {
      severity: true,
      area: true,
    },
  });
}
}