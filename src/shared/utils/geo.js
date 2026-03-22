/**
 * Haversine formula — straight-line distance in km between two points.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {number}
 */
export const haversine = (from, to) => {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
};

/**
 * Distance in km between two points given as separate lat/lng values.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in km
 */
export const distanceBetween = (lat1, lng1, lat2, lng2) =>
  haversine({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });

const _haversineRawKm = (from, to) => {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const kilometersToMeters = (kilometers) => kilometers * 1000;

export const metersToKilometers = (meters) => meters / 1000;

export const distanceBetweenMeters = (lat1, lng1, lat2, lng2) =>
  kilometersToMeters(_haversineRawKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }));

export const getBoundingBoxByRadiusMeters = (lat, lng, radiusMeters) => {
  const latDelta = radiusMeters / 111320;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusMeters / (111320 * Math.max(Math.abs(cosLat), 0.0001));

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
};

export const findNearestCandidateWithinRadiusMeters = ({
  originLat,
  originLng,
  candidates,
  radiusMeters,
  getLat,
  getLng,
}) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  let nearestCandidate = null;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateLat = Number(getLat(candidate));
    const candidateLng = Number(getLng(candidate));

    if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLng)) {
      continue;
    }

    const distanceMeters = distanceBetweenMeters(originLat, originLng, candidateLat, candidateLng);

    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters;
      nearestCandidate = candidate;
    }
  }

  if (!nearestCandidate || nearestDistanceMeters > radiusMeters) {
    return null;
  }

  return {
    candidate: nearestCandidate,
    distanceMeters: nearestDistanceMeters,
  };
};

// ─── Route Geometry Helpers ──────────────────────────────

export const routePassesNearPoint = (geometry, pointLat, pointLng, thresholdKm = 1.5) => {
  if (!geometry || geometry.type !== 'LineString' || !geometry.coordinates?.length) {
    return false;
  }

  for (const coord of geometry.coordinates) {
    const [lng, lat] = coord;

    const distance = distanceBetween(lat, lng, pointLat, pointLng);

    if (distance <= thresholdKm) {
      return true;
    }
  }

  return false;
};
