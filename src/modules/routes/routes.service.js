/* eslint-disable camelcase */
import crypto from 'crypto';
import { getOsrmRoutes, getOsrmRouteViaWaypoint } from '#integrations/routing/osrm.client.js';
import { getWeather } from '#integrations/weather/weather.client.js';
import { API_SERVICES, TRAFFIC_STATUSES, INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
import { BadRequestError } from '#shared/utils/errors.js';
import { haversine, routePassesNearPoint, routePassesThroughArea } from '#shared/utils/geo.js';
import { getPaginationParams } from '#shared/utils/pagination.js';
import { generateDetourWaypoints } from '#shared/utils/detour.js';
import { logger } from '#shared/utils/logger.js';
import { AREA_BOUNDARIES } from '#shared/constants/area-boundaries.js';

const CACHE_TTL_CLEAR_MS = 60 * 60 * 1000;
const CACHE_TTL_INCIDENT_MS = 10 * 60 * 1000;

const DELAY_CHECKPOINT = {
  [TRAFFIC_STATUSES.CLOSED]: 20,
  [TRAFFIC_STATUSES.SLOW]: 10,
};

const DELAY_INCIDENT = {
  [INCIDENT_SEVERITIES.CRITICAL]: 30,
  [INCIDENT_SEVERITIES.HIGH]: 20,
  [INCIDENT_SEVERITIES.MEDIUM]: 10,
  [INCIDENT_SEVERITIES.LOW]: 5,
};

const DELAY_WEATHER = 10;
const AVERAGE_SPEED_KMH = 60;

const _normalizeArea = (value) => (value ?? '').trim().toLowerCase();

const _isAreaAvoided = (area, avoidAreas = []) =>
  avoidAreas.map(_normalizeArea).includes(_normalizeArea(area));

const _resolveAreaBoxes = (avoidAreas = []) => {
  return avoidAreas
    .map((area) => {
      const key = _normalizeArea(area);
      const box = AREA_BOUNDARIES[key];
      if (!box) {
        console.log(`Unknown area: "${area}" — skipping`);
        return null;
      }
      return { name: key, box };
    })
    .filter(Boolean);
};

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

const _findDetourRouteForArea = async (from, to, areaBoxes) => {
  if (!areaBoxes.length) return null;

  const candidates = [];

  for (const { name, box } of areaBoxes) {
    const offsets = [0.1, 0.15, 0.2, 0.3]; //

    for (const offset of offsets) {
      const waypoints = [
        { lat: box.maxLat + offset, lng: (box.minLng + box.maxLng) / 2 }, // north
        { lat: box.minLat - offset, lng: (box.minLng + box.maxLng) / 2 }, // south
        { lat: (box.minLat + box.maxLat) / 2, lng: box.minLng - offset }, // west
        { lat: (box.minLat + box.maxLat) / 2, lng: box.maxLng + offset }, // east
      ];

      for (const waypoint of waypoints) {
        console.log(`testing area detour for "${name}" with offset ${offset}:`, waypoint);

        try {
          const result = await getOsrmRouteViaWaypoint(from, waypoint, to);

          console.log('area detour route via waypoint succeed');

          const passesAvoidedArea = areaBoxes.some(({ box: avoidBox }) =>
            routePassesThroughArea(result.geometry, avoidBox)
          );

          if (!passesAvoidedArea) {
            console.log(`clean route found avoiding area "${name}"`);
            candidates.push(result);
            //return result;//
          } else {
            console.log(`route still passes through area "${name}"`);
          }
        } catch (err) {
          console.log('area waypoint failed:', waypoint, err.message);
          continue;
        }
      }
    }
  }

  if (!candidates.length) return null;

  return candidates.sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
};

const _isRouteValid = (geometry, checkpointsToAvoid = [], areaBoxes = []) => {
  const passesCheckpoint = checkpointsToAvoid.some((cp) =>
    routePassesNearPoint(geometry, Number(cp.latitude), Number(cp.longitude), 1.5)
  );

  const passesArea = areaBoxes.some(({ box }) => routePassesThroughArea(geometry, box));

  return {
    isValid: !passesCheckpoint && !passesArea,
    passesCheckpoint,
    passesArea,
  };
};

export class RoutesService {
  constructor(routesRepository, deps) {
    this.routesRepository = routesRepository;
    this.checkpointsService = deps.checkpointsService;
    this.incidentsService = deps.incidentsService;
  }

  async estimateRoute(
    { from, to, avoid_checkpoints, avoid_areas, include_geometry },
    userId,
    options = {}
  ) {
    const { saveHistory = true } = options;

    if (from.lat === to.lat && from.lng === to.lng) {
      throw new BadRequestError('Origin and destination cannot be the same');
    }

    const cacheKey = _buildCacheKey(from, to, avoid_checkpoints, avoid_areas);
    const cached = await this.routesRepository.findCache(cacheKey);
    if (cached) {
      await this.routesRepository.incrementCacheHit(cacheKey);
      //return { ...cached.responseData, fromCache: true };
      const formattedResponse = _formatRouteResponse(cached.responseData, true);

      if (saveHistory) {
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
      }

      return formattedResponse;
      //  return _formatRouteResponse(cached.responseData, true);
    }

    /*const [allCheckpoints, allIncidents] = await Promise.all([
      this.checkpointsService.getActiveCheckpoints(),
      this.incidentsService.getActiveIncidents(),
    ]);*/

    const [allCheckpointsForRouting, activeCheckpoints, allIncidents] = await Promise.all([
      this.checkpointsService.getAllCheckpointsForRouting(),
      this.checkpointsService.getActiveCheckpoints(),
      this.incidentsService.getActiveIncidents(),
    ]);

    let distanceKm, durationMinutes, geometry, isFallback;
    isFallback = false;
    let avoidanceWarning = null;
    let selectedGeometry = null;

    const areaBoxes = _resolveAreaBoxes(avoid_areas);

    for (const { name, box } of areaBoxes) {
      const fromInside =
        from.lat >= box.minLat &&
        from.lat <= box.maxLat &&
        from.lng >= box.minLng &&
        from.lng <= box.maxLng;

      const toInside =
        to.lat >= box.minLat &&
        to.lat <= box.maxLat &&
        to.lng >= box.minLng &&
        to.lng <= box.maxLng;

      if (fromInside || toInside) {
        throw new BadRequestError(`Origin or destination is inside avoided area: ${name}`);
      }
    }

    try {
      const osrm = await getOsrmRoutes(from, to);
      console.log('OSRM route count:', osrm.routes.length);

      const checkpointsToAvoid = allCheckpointsForRouting.filter((cp) =>
        avoid_checkpoints.includes(cp.id)
      );

      const validRoutes = osrm.routes.filter((route, index) => {
        const matchedCheckpoints = checkpointsToAvoid.filter((cp) =>
          routePassesNearPoint(route.geometry, Number(cp.latitude), Number(cp.longitude), 1.5)
        );

        const matchedAreas = areaBoxes.filter(({ box }) =>
          routePassesThroughArea(route.geometry, box)
        );

        console.log(
          `Route ${index + 1}: distance=${route.distanceKm} km, duration=${route.durationMinutes} min`
        );

        if (matchedCheckpoints.length > 0) {
          console.log(
            `Route ${index + 1} passes avoided checkpoints:`,
            matchedCheckpoints.map((cp) => `${cp.id} - ${cp.name}`)
          );
        }
        if (matchedAreas.length > 0) {
          console.log(
            `Route ${index + 1} passes avoided areas:`,
            matchedAreas.map((a) => a.name)
          );
        }
        if (matchedCheckpoints.length === 0 && matchedAreas.length === 0) {
          console.log(`Route ${index + 1} avoids all selected checkpoints and areas`);
        }

        return matchedCheckpoints.length === 0 && matchedAreas.length === 0;
      });

      let selectedRoute =
        validRoutes.length > 0
          ? validRoutes.sort((a, b) => a.durationMinutes - b.durationMinutes)[0]
          : null;

      // Plan B
      if (!selectedRoute && checkpointsToAvoid.length > 0) {
        console.log('trying Plan B1 (checkpoint detour)...');

        const detourRoute = await _findDetourRoute(from, to, checkpointsToAvoid);

        if (detourRoute) {
          const validation = _isRouteValid(detourRoute.geometry, checkpointsToAvoid, areaBoxes);

          console.log('checkpoint detour validation:', {
            passesCheckpoint: validation.passesCheckpoint,
            passesArea: validation.passesArea,
            areaNames: areaBoxes.map((a) => a.name),
          });

          if (validation.isValid) {
            selectedRoute = detourRoute;
            avoidanceWarning =
              areaBoxes.length > 0
                ? 'Using detour route to avoid selected checkpoint and area'
                : 'Using detour route to avoid selected checkpoint';
          } else {
            if (validation.passesArea) {
              console.log('checkpoint detour route still passes avoided area');
            }
            if (validation.passesCheckpoint) {
              console.log('checkpoint detour route still passes avoided checkpoint');
            }
          }
        } else {
          console.log('checkpoint detour route not found');
        }
      }
      if (!selectedRoute && areaBoxes.length > 0) {
        console.log('trying Plan B2 (area detour)...');

        const areaDetourRoute = await _findDetourRouteForArea(from, to, areaBoxes);

        if (areaDetourRoute) {
          const validation = _isRouteValid(areaDetourRoute.geometry, checkpointsToAvoid, areaBoxes);

          console.log('area detour validation:', {
            passesCheckpoint: validation.passesCheckpoint,
            passesArea: validation.passesArea,
            areaNames: areaBoxes.map((a) => a.name),
          });

          if (validation.isValid) {
            selectedRoute = areaDetourRoute;
            avoidanceWarning =
              checkpointsToAvoid.length > 0
                ? 'Using detour route to avoid selected checkpoint and area'
                : 'Using detour route to avoid selected area';
          } else {
            if (validation.passesArea) {
              console.log('area detour route still passes avoided area');
            }
            if (validation.passesCheckpoint) {
              console.log('area detour route still passes avoided checkpoint');
            }
          }
        } else {
          console.log('area detour route not found');
        }
      }

      // fallback
      if (!selectedRoute) {
        selectedRoute = osrm.routes[0];

        if (avoid_checkpoints?.length > 0 || avoid_areas?.length > 0) {
          if (osrm.routes.length === 1) {
            avoidanceWarning =
              'OSRM did not return alternative routes for selected checkpoint/area, and no detour route was found';
          } else {
            avoidanceWarning =
              'No alternative or detour route found that fully avoids selected checkpoints/area';
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
    /*const checkpointsOnRoute = allCheckpoints.filter((cp) => {
    if (!selectedGeometry) return false;

   const passes = routePassesNearPoint(
    selectedGeometry,
    Number(cp.latitude),
    Number(cp.longitude),
    1.5
   );

   if (passes) {
    console.log('Checkpoint ON ROUTE:', cp.id, cp.name);
  }

  return passes;
   });*/

    const allCheckpointsOnRoute = allCheckpointsForRouting.filter((cp) => {
      if (!selectedGeometry) return false;

      const passes = routePassesNearPoint(
        selectedGeometry,
        Number(cp.latitude),
        Number(cp.longitude),
        1.5
      );

      if (passes) {
        console.log('Checkpoint ON ROUTE:', cp.id, cp.name, 'status:', cp.status);
      }

      return passes;
    });

    const checkpointsOnRoute = activeCheckpoints.filter((cp) => {
      if (!selectedGeometry) return false;

      return routePassesNearPoint(selectedGeometry, Number(cp.latitude), Number(cp.longitude), 1.5);
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
    const isAvoidedCheckpoint = avoid_checkpoints.includes(cp.id);
    const isAvoidedArea       = _isAreaAvoided(cp.city, avoid_areas);
    const isAvoided           = isAvoidedCheckpoint || isAvoidedArea;
    const delay               = isAvoided ? 0 : (DELAY_CHECKPOINT[cp.status] ?? 0);

    totalDelayMinutes += delay;

    factors.push({
     type:         'checkpoint',
     name:         cp.name,
     status:       cp.status,
     city:         cp.city ?? null,
     delayMinutes: delay,
     avoided:      isAvoided,
     avoidedBy:    isAvoidedCheckpoint ? 'checkpoint'
                : isAvoidedArea       ? 'area'
                : null,
  });

  if (!isAvoided && cp.status === TRAFFIC_STATUSES.CLOSED) {
    warnings.push(`Checkpoint "${cp.name}" is closed`);
  }
}*/

    for (const cp of checkpointsOnRoute) {
      const requestedAvoidByCheckpoint = avoid_checkpoints.includes(cp.id);
      const requestedAvoidByArea = _isAreaAvoided(cp.city, avoid_areas);

      const actuallyAvoided = false;
      const delay = DELAY_CHECKPOINT[cp.status] ?? 0;

      totalDelayMinutes += delay;

      factors.push({
        type: 'checkpoint',
        name: cp.name,
        status: cp.status,
        city: cp.city ?? null,
        delayMinutes: delay,
        avoided: actuallyAvoided,
        avoidedBy: null,
        requestedToAvoid: requestedAvoidByCheckpoint || requestedAvoidByArea,
        requestedAvoidBy: requestedAvoidByCheckpoint
          ? 'checkpoint'
          : requestedAvoidByArea
            ? 'area'
            : null,
      });

      if (cp.status === TRAFFIC_STATUSES.CLOSED) {
        warnings.push(`Checkpoint "${cp.name}" is closed`);
      }
    }

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
      checkpointsOnRoute.some((cp) => cp.status === TRAFFIC_STATUSES.CLOSED);

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

    //const checkpointsIds = checkpointsOnRoute.map((cp) => cp.id);
    const checkpointsIds = allCheckpointsOnRoute.map((cp) => cp.id);
    const areas = [
      ...checkpointsOnRoute.map((cp) => _normalizeArea(cp.city)).filter(Boolean),
      ...incidentsOnRoute.map((inc) => _normalizeArea(inc.area)).filter(Boolean),
    ];
    const uniqueAreas = [...new Set(areas)];

    await this.routesRepository.saveCache({
      cacheKey,
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
      responseData,
      expiresAt,
      checkpointsIds,
      areas: uniqueAreas,
    });

    if (saveHistory) {
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
    }

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

  async compareRoutes({ from, to, scenarios }, userId) {
    if (!scenarios || scenarios.length === 0) {
      throw new BadRequestError('Scenarios are required');
    }

    const results = [];

    for (const scenario of scenarios) {
      const result = await this.estimateRoute(
        {
          from,
          to,
          avoid_checkpoints: scenario.avoid_checkpoints ?? [],
          avoid_areas: scenario.avoid_areas ?? [],
          include_geometry: false,
        },
        userId,
        { saveHistory: false }
      );

      results.push({
        name: scenario.name ?? 'scenario',
        avoid_checkpoints: scenario.avoid_checkpoints ?? [],
        avoid_areas: scenario.avoid_areas ?? [],

        distanceKm: result.summary.distanceKm,
        baseDurationMinutes: result.summary.baseDurationMinutes,
        totalDelayMinutes: result.summary.totalDelayMinutes,
        finalDurationMinutes: result.summary.finalDurationMinutes,
        isFallback: result.summary.isFallback,

        warningCount: result.conditions?.warnings?.length ?? 0,
        warnings: result.conditions?.warnings ?? [],

        checkpointCount: result.impact?.counts?.checkpoints ?? 0,
        incidentCount: result.impact?.counts?.incidents ?? 0,
        totalFactors: result.impact?.counts?.totalFactors ?? 0,
      });
    }

    const sortedResults = [...results].sort(
      (a, b) => a.finalDurationMinutes - b.finalDurationMinutes
    );

    const best = sortedResults[0] ?? null;

    return {
      from,
      to,
      recommendedScenario: best
        ? {
            name: best.name,
            finalDurationMinutes: best.finalDurationMinutes,
            totalDelayMinutes: best.totalDelayMinutes,
            warningCount: best.warningCount,
          }
        : null,

      comparisons: sortedResults,
    };
  }

  async getAreasStatus() {
    const [checkpoints, incidents] = await Promise.all([
      this.checkpointsService.getCheckpointsByArea(),
      this.incidentsService.getIncidentsByArea(),
    ]);

    const areas = Object.keys(AREA_BOUNDARIES);
    const result = {};

    for (const area of areas) {
      const areaCheckpoints = checkpoints.filter((cp) => _normalizeArea(cp.city) === area);

      const areaIncidents = incidents.filter((inc) => _normalizeArea(inc.area) === area);

      const closedCheckpoints = areaCheckpoints.filter(
        (cp) => cp.status === TRAFFIC_STATUSES.CLOSED
      ).length;

      const criticalIncidents = areaIncidents.filter(
        (inc) =>
          inc.severity === INCIDENT_SEVERITIES.CRITICAL || inc.severity === INCIDENT_SEVERITIES.HIGH
      ).length;

      let status;
      if (closedCheckpoints >= 2 || criticalIncidents >= 2) {
        status = 'high_risk';
      } else if (closedCheckpoints === 1 || criticalIncidents === 1) {
        status = 'moderate_risk';
      } else if (areaCheckpoints.length >= 1 || areaIncidents.length >= 1) {
        status = 'low_risk';
      } else {
        status = 'clear';
      }

      result[area] = {
        status,
        checkpoints: areaCheckpoints.length,
        closedCheckpoints,
        incidents: areaIncidents.length,
        criticalIncidents,
      };
    }

    return result;
  }

  async getRouteHistoryStats(userId) {
    const [stats, fallbackCount, mostVisitedRoute] = await Promise.all([
      this.routesRepository.getUserRouteHistoryStats(userId),
      this.routesRepository.countUserFallbackRoutes(userId),
      this.routesRepository.findMostVisitedRoute(userId),
    ]);

    return {
      totalRoutes: stats._count.id ?? 0,
      totalDistanceKm: Number(stats._sum.distanceKm ?? 0),
      averageDelayMinutes: Number(stats._avg.totalDelayMinutes ?? 0),
      fallbackCount,
      mostVisitedRoute: mostVisitedRoute
        ? {
            from: {
              lat: Number(mostVisitedRoute.fromLat),
              lng: Number(mostVisitedRoute.fromLng),
            },
            to: {
              lat: Number(mostVisitedRoute.toLat),
              lng: Number(mostVisitedRoute.toLng),
            },
            count: mostVisitedRoute._count.id,
          }
        : null,
    };
  }

  async getActiveCheckpoints() {
    const checkpoints = await this.checkpointsService.getActiveCheckpoints();

    return checkpoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      status: cp.status,
      location: {
        lat: Number(cp.latitude),
        lng: Number(cp.longitude),
      },
      city: cp.city ?? null,
    }));
  }

  async getActiveIncidents() {
    const incidents = await this.incidentsService.getActiveIncidents();

    return incidents.map((inc) => ({
      id: inc.id,
      type: inc.type,
      severity: inc.severity,
      location: {
        lat: Number(inc.locationLat),
        lng: Number(inc.locationLng),
      },
      area: inc.area ?? null,
    }));
  }

  async getRouteById(id, userId) {
    const route = await this.routesRepository.findRouteById(Number(id), userId);

    if (!route) {
      throw new BadRequestError('Route not found');
    }

    return {
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
    };
  }

  async deleteRouteById(id, userId) {
    const deleted = await this.routesRepository.deleteRouteById(Number(id), userId);

    if (deleted.count === 0) {
      throw new BadRequestError('Route not found');
    }

    return {
      message: 'Route deleted successfully',
    };
  }
}
