/**
 * Geographic bounding boxes for West Bank areas.
 * Used to determine if a route passes through a specific area.
 *
 * Format:
 *   key:    lowercase area name (must match avoid_areas input after normalize)
 *   value:  { minLat, maxLat, minLng, maxLng }
 */
export const AREA_BOUNDARIES = {
  nablus: {
    minLat: 32.18,
    maxLat: 32.28,
    minLng: 35.20,
    maxLng: 35.32,
  },
  ramallah: {
    minLat: 31.88,
    maxLat: 31.95,
    minLng: 35.18,
    maxLng: 35.26,
  },
  jenin: {
    minLat: 32.44,
    maxLat: 32.50,
    minLng: 35.28,
    maxLng: 35.34,
  },
  tulkarm: {
    minLat: 32.30,
    maxLat: 32.34,
    minLng: 35.01,
    maxLng: 35.06,
  },
  qalqilya: {
    minLat: 32.17,
    maxLat: 32.21,
    minLng: 34.96,
    maxLng: 35.02,
  },
  salfit: {
    minLat: 32.07,
    maxLat: 32.12,
    minLng: 35.16,
    maxLng: 35.22,
  },
  jericho: {
    minLat: 31.83,
    maxLat: 31.88,
    minLng: 35.43,
    maxLng: 35.48,
  },
  bethlehem: {
    minLat: 31.68,
    maxLat: 31.73,
    minLng: 35.18,
    maxLng: 35.24,
  },
  hebron: {
    minLat: 31.51,
    maxLat: 31.57,
    minLng: 35.08,
    maxLng: 35.14,
  },
};
