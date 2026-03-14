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
        id:        true,
        name:      true,
        latitude:  true,
        longitude: true,
        status:    true,
      },
    });
  }


  async findActiveIncidents() {
    return await prisma.incidents.findMany({
      where: {
        status:     INCIDENT_STATUSES.VERIFIED,
        isVerified: true,
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
}