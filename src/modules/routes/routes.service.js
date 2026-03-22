/* eslint-disable camelcase */
import crypto from 'crypto';
import { getOsrmRoutes, getOsrmRouteViaWaypoint } from '#integrations/routing/osrm.client.js';
import { getWeather } from '#integrations/weather/weather.client.js';
import { API_SERVICES, CHECKPOINT_STATUSES, INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
import { BadRequestError } from '#shared/utils/errors.js';
import { haversine, routePassesNearPoint } from '#shared/utils/geo.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { generateDetourWaypoints } from '#shared/utils/detour.js';
import { logger } from '#shared/utils/logger.js';

const CACHE_TTL_CLEAR_MS = 60 * 60 * 1000;
const CACHE_TTL_INCIDENT_MS = 10 * 60 * 1000;

const DELAY_CHECKPOINT = {
  [CHECKPOINT_STATUSES.CLOSED]: 20,
  [CHECKPOINT_STATUSES.SLOW]: 10,
};

const DELAY_INCIDENT = {
  [INCIDENT_SEVERITIES.CRITICAL]: 30,
  [INCIDENT_SEVERITIES.HIGH]: 20,
  [INCIDENT_SEVERITIES.MEDIUM]: 10,
  [INCIDENT_SEVERITIES.LOW]: 5,
};

const DELAY_WEATHER = 10;
const AVERAGE_SPEED_KMH = 60;

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
    [...avoidAreas]
      .map((a) => a.trim().toLowerCase())
      .sort()
      .join(','),
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

const _findDetourRoute = async (from, to, checkpointsToAvoid) => {
  if (!checkpointsToAvoid.length) return null;

  const candidates = [];

  for (const cp of checkpointsToAvoid) {
    const offsets = [8, 12];

    for (const offset of offsets) {
      const waypoints = generateDetourWaypoints(from, to, cp, offset);

      for (const waypoint of waypoints) {
        console.log(`testing waypoint with offset ${offset}km:`, waypoint);

        try {
          const result = await getOsrmRouteViaWaypoint(from, waypoint, to);

          console.log('route via waypoint succeed');

          const isClean = !checkpointsToAvoid.some((avoidedCp) =>
            routePassesNearPoint(
              result.geometry,
              Number(avoidedCp.latitude),
              Number(avoidedCp.longitude),
              1.5
            )
          );

          if (isClean) {
            logger.debug('clean route found');
            candidates.push(result);
          } else {
            console.log('route still passes checkpoint');
          }
        } catch (err) {
          console.log('waypoint failed:', waypoint, err.message);
          continue;
        }
      }
    }
  }

  if (!candidates.length) return null;

  return candidates.sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
};
export class RoutesService {
  constructor(routesRepository) {
    this.routesRepository = routesRepository;
  }

  async estimateRoute({ from, to, avoid_checkpoints, avoid_areas, include_geometry }, userId) {
    if (from.lat === to.lat && from.lng === to.lng) {
      throw new BadRequestError('Origin and destination cannot be the same');
    }

    const cacheKey = _buildCacheKey(from, to, avoid_checkpoints, avoid_areas);
    const cached = await this.routesRepository.findCache(cacheKey);
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

    let distanceKm, durationMinutes, geometry, isFallback;
    isFallback = false;
    let avoidanceWarning = null;
    let selectedGeometry = null;

    /*const checkpointsOnRoute = allCheckpoints.filter((cp) => {
      const distFromRoute = Math.min(
        distanceBetween(from.lat, from.lng, Number(cp.latitude), Number(cp.longitude)),
        distanceBetween(to.lat,   to.lng,   Number(cp.latitude), Number(cp.longitude))
      );
      return distFromRoute <= 15;
    });*/

    /*const incidentsOnRoute = allIncidents.filter((inc) => {
      const distFromRoute = Math.min(
        distanceBetween(from.lat, from.lng, Number(inc.locationLat), Number(inc.locationLng)),
        distanceBetween(to.lat,   to.lng,   Number(inc.locationLat), Number(inc.locationLng))
      );
      return distFromRoute <= 20;
    });*/

    /*try {
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
    }*/
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    /*try {
    const osrm = await getOsrmRoutes(from, to);
    console.log('ORSM route count:',osrm.routes.length);//
    
    const checkpointsToAvoid = allCheckpoints.filter((cp) =>
    avoid_checkpoints.includes(cp.id)
  );*/

    /*const validRoutes = osrm.routes.filter((route) => {
    const passesAvoidedCheckpoint = checkpointsToAvoid.some((cp) =>
      routePassesNearPoint(
        route.geometry,
        Number(cp.latitude),
        Number(cp.longitude),
        1.5
      )
    );


    return !passesAvoidedCheckpoint;
  });*/ ///////////////////////// هاد الكود رح أرجعه --بس مؤقتا بدي اعدله عشان الطباعة

    /*
  const validRoutes = osrm.routes.filter((route, index) => {/////////////////
  const matchedCheckpoints = checkpointsToAvoid.filter((cp) =>
    routePassesNearPoint(
      route.geometry,
      Number(cp.latitude),
      Number(cp.longitude),
      1.5
    )
  );

  console.log(
    `Route ${index + 1}: distance=${route.distanceKm} km, duration=${route.durationMinutes} min`
  );

  if (matchedCheckpoints.length > 0) {
    console.log(
      `Route ${index + 1} passes avoided checkpoints:`,
      matchedCheckpoints.map((cp) => `${cp.id} - ${cp.name}`)
    );
  } else {
    console.log(`Route ${index + 1} avoids all selected checkpoints`);
  }

  return matchedCheckpoints.length === 0;
});/////////////////////

  if (avoid_checkpoints?.length > 0 && osrm.routes.length === 1) {//
    avoidanceWarning = 'OSRM did not return alternative routes for the selected path';
    }else if (avoid_checkpoints?.length > 0 && osrm.routes.length > 1 && validRoutes.length === 0) {
    avoidanceWarning = 'No alternative route found that fully avoids selected checkpoints';}//

  const selectedRoute =
    validRoutes.length > 0
      ? validRoutes.sort((a, b) => a.durationMinutes - b.durationMinutes)[0]
      : osrm.routes[0];

  
  distanceKm = selectedRoute.distanceKm;
  durationMinutes = selectedRoute.durationMinutes;
  geometry = selectedRoute.geometry;
  selectedGeometry=selectedRoute.geometry;//
  console.log('Selected route geometry points count:', selectedGeometry?.coordinates?.length);//

  await this.routesRepository.logApiCall({
    service: API_SERVICES.OSRM,
    endpoint: `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
    statusCode: 200,
    responseTimeMs: osrm.responseTimeMs,
    isFallback: false,
  });

} catch {
  distanceKm = haversine(from, to);
  durationMinutes = parseFloat(((distanceKm / AVERAGE_SPEED_KMH) * 60).toFixed(2));
  geometry = null;
  isFallback = true;
  selectedGeometry=null;//

  await this.routesRepository.logApiCall({
    service: API_SERVICES.OSRM,
    endpoint: `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
    statusCode: null,
    responseTimeMs: null,
    isFallback: true,
    errorMessage: 'OSRM unavailable — using Haversine fallback',
  });
}*/

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    try {
      const osrm = await getOsrmRoutes(from, to);
      console.log('OSRM route count:', osrm.routes.length);

      const checkpointsToAvoid = allCheckpoints.filter((cp) => avoid_checkpoints.includes(cp.id));

      const validRoutes = osrm.routes.filter((route, index) => {
        const matchedCheckpoints = checkpointsToAvoid.filter((cp) =>
          routePassesNearPoint(route.geometry, Number(cp.latitude), Number(cp.longitude), 1.5)
        );

        console.log(
          `Route ${index + 1}: distance=${route.distanceKm} km, duration=${route.durationMinutes} min`
        );

        if (matchedCheckpoints.length > 0) {
          console.log(
            `Route ${index + 1} passes avoided checkpoints:`,
            matchedCheckpoints.map((cp) => `${cp.id} - ${cp.name}`)
          );
        } else {
          console.log(`Route ${index + 1} avoids all selected checkpoints`);
        }

        return matchedCheckpoints.length === 0;
      });

      let selectedRoute =
        validRoutes.length > 0
          ? validRoutes.sort((a, b) => a.durationMinutes - b.durationMinutes)[0]
          : null;

      // Plan B
      if (!selectedRoute && checkpointsToAvoid.length > 0) {
        console.log('trying palne B (detour)...');
        const detourRoute = await _findDetourRoute(from, to, checkpointsToAvoid);

        if (detourRoute) {
          selectedRoute = detourRoute;
          avoidanceWarning = 'Using detour route to avoid selected checkpoint';
        }
      }

      // fallback
      if (!selectedRoute) {
        selectedRoute = osrm.routes[0];

        if (avoid_checkpoints?.length > 0) {
          if (osrm.routes.length === 1) {
            avoidanceWarning =
              'OSRM did not return alternative routes, and no detour route was found';
          } else {
            avoidanceWarning =
              'No alternative or detour route found that fully avoids selected checkpoints';
          }
        }
      }

      distanceKm = selectedRoute.distanceKm;
      durationMinutes = selectedRoute.durationMinutes;
      geometry = selectedRoute.geometry;
      selectedGeometry = selectedRoute.geometry;

      console.log('Selected route geometry points count:', selectedGeometry?.coordinates?.length);

      await this.routesRepository.logApiCall({
        service: API_SERVICES.OSRM,
        endpoint: `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
        statusCode: 200,
        responseTimeMs: osrm.responseTimeMs,
        isFallback: false,
      });
    } catch (err) {
      console.log('ERROR inside ORSM try block:', err.message);
      distanceKm = haversine(from, to);
      durationMinutes = parseFloat(((distanceKm / AVERAGE_SPEED_KMH) * 60).toFixed(2));
      geometry = null;
      isFallback = true;
      selectedGeometry = null;

      await this.routesRepository.logApiCall({
        service: API_SERVICES.OSRM,
        endpoint: `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
        statusCode: null,
        responseTimeMs: null,
        isFallback: true,
        errorMessage: 'OSRM unavailable — using Haversine fallback',
      });
    }
    const checkpointsOnRoute = allCheckpoints.filter((cp) => {
      if (!selectedGeometry) return false;

      const passes = routePassesNearPoint(
        selectedGeometry,
        Number(cp.latitude),
        Number(cp.longitude),
        1.5
      );

      if (passes) {
        //
        console.log('Checkpoint ON ROUTE:', cp.id, cp.name);
      } ///

      return passes;
    });

    const incidentsOnRoute = allIncidents.filter((inc) => {
      if (!selectedGeometry) return false;

      return routePassesNearPoint(
        selectedGeometry,
        Number(inc.locationLat),
        Number(inc.locationLng),
        2
      );
    });

    let weather = null;
    const midpoint = {
      lat: (from.lat + to.lat) / 2,
      lng: (from.lng + to.lng) / 2,
    };

    try {
      weather = await getWeather(midpoint);

      await this.routesRepository.logApiCall({
        service: API_SERVICES.OPENWEATHERMAP,
        endpoint: `/weather?lat=${midpoint.lat}&lon=${midpoint.lng}`,
        statusCode: 200,
        responseTimeMs: weather.responseTimeMs,
        isFallback: false,
      });
    } catch {
      await this.routesRepository.logApiCall({
        service: API_SERVICES.OPENWEATHERMAP,
        endpoint: `/weather?lat=${midpoint.lat}&lon=${midpoint.lng}`,
        statusCode: null,
        responseTimeMs: null,
        isFallback: true,
        errorMessage: 'Weather API unavailable',
      });
    }

    let totalDelayMinutes = 0;
    const factors = [];
    const warnings = [];

    if (avoidanceWarning) warnings.push(avoidanceWarning);

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
      const isAvoidedArea = _isAreaAvoided(cp.areaName, avoid_areas);
      const isAvoided = isAvoidedCheckpoint || isAvoidedArea;
      const delay = isAvoided ? 0 : (DELAY_CHECKPOINT[cp.status] ?? 0);

      totalDelayMinutes += delay;

      factors.push({
        type: 'checkpoint',
        name: cp.name,
        status: cp.status,
        area: cp.areaName ?? null,
        delayMinutes: delay,
        avoided: isAvoided,
        avoidedBy: isAvoidedCheckpoint ? 'checkpoint' : isAvoidedArea ? 'area' : null,
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
      const delay = isAvoidedArea ? 0 : (DELAY_INCIDENT[inc.severity] ?? 0);

      totalDelayMinutes += delay;

      factors.push({
        type: 'incident',
        incidentType: inc.type,
        severity: inc.severity,
        area: inc.area ?? null,
        delayMinutes: delay,
        avoided: isAvoidedArea,
        avoidedBy: isAvoidedArea ? 'area' : null,
      });
    }

    if (weather?.isHazardous) {
      totalDelayMinutes += DELAY_WEATHER;
      factors.push({
        type: 'weather',
        condition: weather.condition,
        description: weather.description,
        delayMinutes: DELAY_WEATHER,
      });
      warnings.push(`Hazardous weather: ${weather.description}`);
    }

    const hasIncidents =
      incidentsOnRoute.length > 0 ||
      checkpointsOnRoute.some((cp) => cp.status === CHECKPOINT_STATUSES.CLOSED);

    const ttl = hasIncidents ? CACHE_TTL_INCIDENT_MS : CACHE_TTL_CLEAR_MS;
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
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
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

      isFallback: responseData.summary.isFallback,
    });

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
