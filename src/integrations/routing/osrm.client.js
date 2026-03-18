import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';

/**
 * Calls OSRM to get route distance and duration between two points.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {{ distanceKm: number, durationMinutes: number, geometry: object, responseTimeMs: number }}
 * @throws {Error} if OSRM request fails
 */
export const getOsrmRoutes = async (from, to) => {
  const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${env.OSRM_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=true`;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      logger.warn(`OSRM request failed with status ${response.status} for URL: ${url}`);
      throw new Error(`OSRM error: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error('OSRM returned no routes');
    }

    //const route = data.routes[0];

    return {
      routes: data.routes.map((route)=> ({
       distanceKm:      parseFloat((route.distance / 1000).toFixed(2)),
       durationMinutes: parseFloat((route.duration / 60).toFixed(2)),
       geometry:        route.geometry,
      })),
      responseTimeMs
    };

  } catch (error) {
    logger.warn(`OSRM request failed: ${error.message}`);
    throw error;
  }
};

//plane B
export const getOsrmRouteViaWaypoint = async (from, waypoint, to) => {
  const coordinates = `${from.lng},${from.lat};${waypoint.lng},${waypoint.lat};${to.lng},${to.lat}`;
  const url = `${env.OSRM_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      logger.warn(`OSRM waypoint request failed with status ${response.status} for URL: ${url}`);
      throw new Error(`OSRM error: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error('OSRM returned no routes');
    }

    const route = data.routes[0];

    return {
      distanceKm: parseFloat((route.distance / 1000).toFixed(2)),
      durationMinutes: parseFloat((route.duration / 60).toFixed(2)),
      geometry: route.geometry,
      responseTimeMs,
    };
  } catch (error) {
    logger.warn(
      `OSRM waypoint request failed for waypoint (${waypoint.lat},${waypoint.lng} ):${error.message}`);
    throw error;
  }
};