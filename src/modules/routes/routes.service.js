import crypto from 'crypto';
import { getOsrmRoute } from '#integrations/routing/osrm.client.js';
import { getWeather } from '#integrations/weather/weather.client.js';
import { API_SERVICES, CHECKPOINT_STATUSES, INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
import { BadRequestError } from '#shared/utils/errors.js';
import { haversine, distanceBetween } from '#shared/utils/geo.js';
import { getPaginationParams } from '#shared/utils/pagination.js';

const CACHE_TTL_CLEAR_MS    = 60 * 60 * 1000;
const CACHE_TTL_INCIDENT_MS = 10 * 60 * 1000;

const DELAY_CHECKPOINT = {
  [CHECKPOINT_STATUSES.CLOSED]: 20,
  [CHECKPOINT_STATUSES.SLOW]:   10,
};

const DELAY_INCIDENT = {
  [INCIDENT_SEVERITIES.CRITICAL]: 30,
  [INCIDENT_SEVERITIES.HIGH]:     20,
  [INCIDENT_SEVERITIES.MEDIUM]:   10,
  [INCIDENT_SEVERITIES.LOW]:       5,
};

const DELAY_WEATHER       = 10;
const AVERAGE_SPEED_KMH   = 60;

/*const _haversine = (from, to) => {
  const R    = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
    Math.cos((to.lat  * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
};

const _distanceBetween = (lat1, lng1, lat2, lng2) =>
  _haversine({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });*/


const _normalizeArea = (value) => (value ?? '').trim().toLowerCase();

const _isAreaAvoided = (area, avoidAreas) =>
  avoidAreas.map(_normalizeArea).includes(_normalizeArea(area));

/*const _buildCacheKey = (from, to, avoidCheckpoints) => {
  const raw = `${from.lat},${from.lng}|${to.lat},${to.lng}|${[...avoidCheckpoints].sort().join(',')}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
};*/

const _buildCacheKey = (from, to, avoidCheckpoints, avoidAreas) => {
  const raw = [
    `${from.lat},${from.lng}`,
    `${to.lat},${to.lng}`,
    [...avoidCheckpoints].sort((a, b) => a - b).join(','),
    [...avoidAreas].map((a) => a.trim().toLowerCase()).sort().join(','),
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
};

const _formatRouteResponse = (data, fromCache = false) => ({
  summary: {
    ...data.summary,
    fromCache,
  },
  route: data.route,
  conditions: data.conditions,
  impact: data.impact,
});

export class RoutesService {

  constructor(routesRepository) {
    this.routesRepository = routesRepository;
  }

  async estimateRoute({ from, to, avoid_checkpoints ,avoid_areas, include_geometry }, userId) {

    if (from.lat === to.lat && from.lng === to.lng) {
      throw new BadRequestError('Origin and destination cannot be the same');
    }

    const cacheKey = _buildCacheKey(from, to, avoid_checkpoints, avoid_areas);
    const cached   = await this.routesRepository.findCache(cacheKey);
    if (cached) {
      await this.routesRepository.incrementCacheHit(cacheKey);
      //return { ...cached.responseData, fromCache: true };
      const formattedResponse = _formatRouteResponse(cached.responseData, true);

      await this.routesRepository.saveRouteHistory({
       userId,

       fromLat: from.lat,
       fromLng: from.lng,
       toLat: to.lat,
       toLng: to.lng,

       distanceKm: formattedResponse.summary.distanceKm,
       baseDurationMinutes: formattedResponse.summary.baseDurationMinutes,
       finalDurationMinutes: formattedResponse.summary.finalDurationMinutes,
       totalDelayMinutes: formattedResponse.summary.totalDelayMinutes,

       isFallback: formattedResponse.summary.isFallback,
     });

      return formattedResponse;
     //  return _formatRouteResponse(cached.responseData, true);
    }

    const [allCheckpoints, allIncidents] = await Promise.all([
      this.routesRepository.findActiveCheckpoints(),
      this.routesRepository.findActiveIncidents(),
    ]);

    const checkpointsOnRoute = allCheckpoints.filter((cp) => {
      const distFromRoute = Math.min(
        distanceBetween(from.lat, from.lng, Number(cp.latitude), Number(cp.longitude)),
        distanceBetween(to.lat,   to.lng,   Number(cp.latitude), Number(cp.longitude))
      );
      return distFromRoute <= 15;
    });

    const incidentsOnRoute = allIncidents.filter((inc) => {
      const distFromRoute = Math.min(
        distanceBetween(from.lat, from.lng, Number(inc.locationLat), Number(inc.locationLng)),
        distanceBetween(to.lat,   to.lng,   Number(inc.locationLat), Number(inc.locationLng))
      );
      return distFromRoute <= 20;
    });

    let distanceKm, durationMinutes, geometry, isFallback;
    isFallback = false;

    try {
      const osrm      = await getOsrmRoute(from, to);
      distanceKm      = osrm.distanceKm;
      durationMinutes = osrm.durationMinutes;
      geometry        = osrm.geometry;

      await this.routesRepository.logApiCall({
        service:        API_SERVICES.OSRM,
        endpoint:       `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
        statusCode:     200,
        responseTimeMs: osrm.responseTimeMs,
        isFallback:     false,
      });

    } catch {
      distanceKm      = haversine(from, to);
      durationMinutes = parseFloat(((distanceKm / AVERAGE_SPEED_KMH) * 60).toFixed(2));
      geometry        = null;
      isFallback      = true;

      await this.routesRepository.logApiCall({
        service:        API_SERVICES.OSRM,
        endpoint:       `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
        statusCode:     null,
        responseTimeMs: null,
        isFallback:     true,
        errorMessage:   'OSRM unavailable — using Haversine fallback',
      });
    }

    let weather = null;
    const midpoint = {
      lat: (from.lat + to.lat) / 2,
      lng: (from.lng + to.lng) / 2,
    };

    try {
      weather = await getWeather(midpoint);

      await this.routesRepository.logApiCall({
        service:        API_SERVICES.OPENWEATHERMAP,
        endpoint:       `/weather?lat=${midpoint.lat}&lon=${midpoint.lng}`,
        statusCode:     200,
        responseTimeMs: weather.responseTimeMs,
        isFallback:     false,
      });

    } catch {
      await this.routesRepository.logApiCall({
        service:        API_SERVICES.OPENWEATHERMAP,
        endpoint:       `/weather?lat=${midpoint.lat}&lon=${midpoint.lng}`,
        statusCode:     null,
        responseTimeMs: null,
        isFallback:     true,
        errorMessage:   'Weather API unavailable',
      });
    }

    let totalDelayMinutes = 0;
    const factors         = [];
    const warnings        = [];

    /*for (const cp of checkpointsOnRoute) {
      const isAvoided = avoid_checkpoints.includes(cp.id);
      const delay     = isAvoided ? 0 : (DELAY_CHECKPOINT[cp.status] ?? 0);

      totalDelayMinutes += delay;
      factors.push({
        type:         'checkpoint',
        name:         cp.name,
        status:       cp.status,
        delayMinutes: delay,
        avoided:      isAvoided,
      });

      if (!isAvoided && cp.status === CHECKPOINT_STATUSES.CLOSED) {
        warnings.push(`Checkpoint "${cp.name}" is closed`);
      }
    }*/

  for (const cp of checkpointsOnRoute) {
    const isAvoidedCheckpoint = avoid_checkpoints.includes(cp.id);
    const isAvoidedArea       = _isAreaAvoided(cp.areaName, avoid_areas);
    const isAvoided           = isAvoidedCheckpoint || isAvoidedArea;
    const delay               = isAvoided ? 0 : (DELAY_CHECKPOINT[cp.status] ?? 0);

    totalDelayMinutes += delay;

    factors.push({
     type:         'checkpoint',
     name:         cp.name,
     status:       cp.status,
     area:         cp.areaName ?? null,
     delayMinutes: delay,
     avoided:      isAvoided,
     avoidedBy:    isAvoidedCheckpoint ? 'checkpoint'
                : isAvoidedArea       ? 'area'
                : null,
  });

  if (!isAvoided && cp.status === CHECKPOINT_STATUSES.CLOSED) {
    warnings.push(`Checkpoint "${cp.name}" is closed`);
  }
}

    /*for (const inc of incidentsOnRoute) {
      const delay = DELAY_INCIDENT[inc.severity] ?? 0;
      totalDelayMinutes += delay;
      factors.push({
        type:         'incident',
        incidentType: inc.type,
        severity:     inc.severity,
        delayMinutes: delay,
      });
    }*/

    for (const inc of incidentsOnRoute) {
     const isAvoidedArea = _isAreaAvoided(inc.area, avoid_areas);
     const delay         = isAvoidedArea ? 0 : (DELAY_INCIDENT[inc.severity] ?? 0);

     totalDelayMinutes += delay;

     factors.push({
      type:         'incident',
      incidentType: inc.type,
      severity:     inc.severity,
      area:         inc.area ?? null,
      delayMinutes: delay,
      avoided:      isAvoidedArea,
      avoidedBy:    isAvoidedArea ? 'area' : null,
  });
}

    if (weather?.isHazardous) {
      totalDelayMinutes += DELAY_WEATHER;
      factors.push({
        type:         'weather',
        condition:    weather.condition,
        description:  weather.description,
        delayMinutes: DELAY_WEATHER,
      });
      warnings.push(`Hazardous weather: ${weather.description}`);
    }

    const hasIncidents = incidentsOnRoute.length > 0 ||
      checkpointsOnRoute.some((cp) => cp.status === CHECKPOINT_STATUSES.CLOSED);

    const ttl       = hasIncidents ? CACHE_TTL_INCIDENT_MS : CACHE_TTL_CLEAR_MS;
    const expiresAt = new Date(Date.now() + ttl);

    
    const finalDuration = parseFloat((durationMinutes + totalDelayMinutes).toFixed(2));
    const responseData = {
      summary: {
       distanceKm,
       baseDurationMinutes: parseFloat(durationMinutes.toFixed(2)),
       totalDelayMinutes,
       finalDurationMinutes: finalDuration,
       isFallback,
     },

      route: {
        from,
        to,
        geometry: include_geometry ? geometry : {},
     },

      conditions: {
        weather: weather
        ? {
          condition: weather.condition,
          description: weather.description,
        }
        : null,
       warnings,
     },

      impact: {
        counts: {
          checkpoints: factors.filter((f) => f.type === 'checkpoint').length,
          incidents: factors.filter((f) => f.type === 'incident').length,
          totalFactors: factors.length,
        },
       factors,
     },
  };
  

    await this.routesRepository.saveCache({
      cacheKey,
      fromLat:      from.lat,
      fromLng:      from.lng,
      toLat:        to.lat,
      toLng:        to.lng,
      responseData,
      expiresAt,
    });

  await this.routesRepository.saveRouteHistory({
    userId,

    fromLat: from.lat,
    fromLng: from.lng,
    toLat: to.lat,
    toLng: to.lng,

    distanceKm: responseData.summary.distanceKm,
    baseDurationMinutes: responseData.summary.baseDurationMinutes,
    finalDurationMinutes: responseData.summary.finalDurationMinutes,
    totalDelayMinutes: responseData.summary.totalDelayMinutes,

    isFallback: responseData.summary.isFallback,});

   // return { ...responseData, fromCache: false };
    return _formatRouteResponse(responseData, false);
  }

  async getRouteHistory(query, userId) {
   const { page, limit } = query;

   const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

   const [routes, total] = await Promise.all([
     this.routesRepository.findUserRouteHistory(userId, { skip, take }),
     this.routesRepository.countUserRouteHistory(userId),
  ]);

   const formattedRoutes = routes.map((route) => ({
     id: route.id,
     from: {
      lat: Number(route.fromLat),
      lng: Number(route.fromLng),
    },
     to: {
      lat: Number(route.toLat),
      lng: Number(route.toLng),
    },
     distanceKm: Number(route.distanceKm),
     baseDurationMinutes: Number(route.baseDurationMinutes),
     finalDurationMinutes: Number(route.finalDurationMinutes),
     totalDelayMinutes: route.totalDelayMinutes,
     isFallback: route.isFallback,
     createdAt: route.createdAt,
  }));

   return {
    routes: formattedRoutes,
    pagination: buildPaginationMeta(total),
    };
  }
}