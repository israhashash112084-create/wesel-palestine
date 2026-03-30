import { logger } from '#shared/utils/logger.js';

const USER_AGENT = 'wesel-palestine/1.0 (contact: support@wesel.ps)';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

const BOUNDARIES = {
  lat: { min: 31.2, max: 32.6 },
  lng: { min: 34.9, max: 35.6 },
};

const extractLocationComponents = (address = {}) => {
  const road =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.path ||
    address.cycleway ||
    null;

  const area =
    address.suburb ||
    address.neighbourhood ||
    address.quarter ||
    address.city_district ||
    address.district ||
    address.borough ||
    address.residential ||
    address.hamlet ||
    address.village ||
    null;

  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    null;

  return { road, area, city };
};

const _fetchReverse = async (lat, lng) => {
  try {
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'en');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(`[geocoding] Reverse geocoding failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const components = extractLocationComponents(data.address ?? {});

    logger.debug('[geocoding] Reverse geocoded', {
      lat,
      lng,
      components,
      rawAddress: data.address ?? null,
    });

    return components;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('[geocoding] Reverse geocoding timed out');
    } else {
      logger.error('[geocoding] Reverse geocoding failed', { error: err.message });
    }
    return null;
  }
};

const _fetchForward = async (query) => {
  try {
    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'ps');
    url.searchParams.set('accept-language', 'en');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(`[geocoding] Forward geocoding failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data?.length) {
      logger.warn('[geocoding] Forward geocoding: no results', { query });
      return null;
    }

    const result = data[0];
    const lat = Number(result.lat);
    const lng = Number(result.lon);

    if (
      lat < BOUNDARIES.lat.min ||
      lat > BOUNDARIES.lat.max ||
      lng < BOUNDARIES.lng.min ||
      lng > BOUNDARIES.lng.max
    ) {
      logger.warn('[geocoding] Forward geocoding: outside West Bank', { lat, lng, query });
      return null;
    }

    const components = extractLocationComponents(result.address ?? {});

    logger.debug('[geocoding] Forward geocoded', {
      query,
      lat,
      lng,
      components,
      rawAddress: result.address ?? null,
    });

    return {
      latitude: lat,
      longitude: lng,
      ...components,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('[geocoding] Forward geocoding timed out');
    } else {
      logger.error('[geocoding] Forward geocoding failed', { error: err.message });
    }
    return null;
  }
};

export const buildLocationQuery = (location = {}) => {
  const parts = [location.road, location.area, location.city]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean);

  return parts.join(', ');
};

export const normalizeLocation = async (location) => {
  if (!location || typeof location !== 'object') {
    throw new Error('location is required');
  }

  const hasCoordinates = location.latitude !== undefined && location.longitude !== undefined;

  const hasTextLocation =
    Boolean(location.area?.trim()) ||
    Boolean(location.city?.trim()) ||
    Boolean(location.road?.trim());

  if (hasCoordinates && hasTextLocation) {
    throw new Error('location must be either coordinates or text location, not both');
  }

  if (!hasCoordinates && !hasTextLocation) {
    throw new Error('location must include coordinates or text location');
  }

  if (hasCoordinates) {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new Error('latitude and longitude must be valid numbers');
    }

    if (
      latitude < BOUNDARIES.lat.min ||
      latitude > BOUNDARIES.lat.max ||
      longitude < BOUNDARIES.lng.min ||
      longitude > BOUNDARIES.lng.max
    ) {
      throw new Error('Coordinates must be within West Bank boundaries');
    }

    const reverse = await _fetchReverse(latitude, longitude);

    return {
      latitude,
      longitude,
      area: reverse?.area ?? null,
      road: reverse?.road ?? null,
      city: reverse?.city ?? null,
    };
  }

  const query = buildLocationQuery(location);

  if (!query) {
    throw new Error('Text location is empty');
  }

  const forward = await _fetchForward(query);

  if (!forward) {
    throw new Error('Could not resolve the provided location');
  }

  return {
    latitude: forward.latitude,
    longitude: forward.longitude,
    area: forward.area ?? null,
    road: forward.road ?? null,
    city: forward.city ?? null,
  };
};
