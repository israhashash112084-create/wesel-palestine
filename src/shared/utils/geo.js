/**
 * Haversine formula — straight-line distance in km between two points.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {number} 
 */
export const haversine = (from, to) => {
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


// ─── Route Geometry Helpers ──────────────────────────────

export const routePassesNearPoint = (
  geometry,
  pointLat,
  pointLng,
  thresholdKm = 1.5
) => {
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
