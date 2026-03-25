import { logger } from '#shared/utils/logger.js';

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

const USER_AGENT = 'WaselPalestine/1.0 (wasel-palestine@dev.local)';
const geoCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const fetchNominatim = async (baseUrl, params, lang) => {
  try {
    params.set('format', 'json');
    params.set('addressdetails', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': lang,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(`[geocoding] Nominatim returned ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('[geocoding] Nominatim request timed out');
    } else {
      logger.error('[geocoding] Nominatim request failed', { error: err.message });
    }
    return null;
  }
};
/**
 * @param {object} data
 * @returns {string}
 */
const buildFullAddressString = (data) => {
  if (!data) return '';

  const parts = [];

  if (data.display_name) parts.push(data.display_name);

  if (data.address) {
    parts.push(...Object.values(data.address).filter((v) => typeof v === 'string' && v.length > 0));
  }

  return parts.join(', ');
};

/**
 * @param {object} address
 * @returns {string|null}
 */
const extractPrimaryName = (address) => {
  if (!address) return null;

  return (
    address.road ??
    address.suburb ??
    address.quarter ??
    address.village ??
    address.town ??
    address.city_district ??
    address.city ??
    address.municipality ??
    address.county ??
    address.state ??
    null
  );
};
/**

 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ en: string, ar: string, primaryEn: string|null, primaryAr: string|null }>}
 */
export const reverseGeocodeBilingual = async (lat, lng) => {
  const cacheKey = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;

  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const buildParams = () => {
    const p = new URLSearchParams();
    p.set('lat', String(lat));
    p.set('lon', String(lng));
    p.set('zoom', '14');
    return p;
  };

  const [enData, arData] = await Promise.all([
    fetchNominatim(NOMINATIM_REVERSE_URL, buildParams(), 'en'),
    fetchNominatim(NOMINATIM_REVERSE_URL, buildParams(), 'ar'),
  ]);

  const result = {
    en: buildFullAddressString(enData),
    ar: buildFullAddressString(arData),
    primaryEn: extractPrimaryName(enData?.address) ?? enData?.display_name ?? null,
    primaryAr: extractPrimaryName(arData?.address) ?? arData?.display_name ?? null,
  };

  geoCache.set(cacheKey, { value: result, ts: Date.now() });

  logger.info('[geocoding] Reverse geocoded', {
    lat,
    lng,
    primaryEn: result.primaryEn,
    primaryAr: result.primaryAr,
  });

  return result;
};
/**
 * @param {string} placeName
 * @returns {Promise<{ lat: number, lng: number, displayName: string, placeType: string }|null>}
 */
export const forwardGeocode = async (placeName) => {
  const cacheKey = `forward:${placeName.trim().toLowerCase()}`;

  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const isArabic = /[\u0600-\u06FF]/.test(placeName);

  const params = new URLSearchParams();
  params.set('q', placeName.trim());
  params.set('countrycodes', 'ps');
  params.set('limit', '1');
  params.set('viewbox', '34.9,32.6,35.6,31.2');
  params.set('bounded', '1');

  const data = await fetchNominatim(NOMINATIM_SEARCH_URL, params, isArabic ? 'ar' : 'en');
  const results = Array.isArray(data) ? data : [];

  if (!results.length) {
    logger.info(`[geocoding] No results for "${placeName}"`);
    geoCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }

  const best = results[0];
  const result = {
    lat: parseFloat(best.lat),
    lng: parseFloat(best.lon),
    displayName: best.display_name,
    placeType: best.type ?? best.class ?? 'unknown',
  };

  geoCache.set(cacheKey, { value: result, ts: Date.now() });

  logger.info('[geocoding] Forward geocoded', {
    input: placeName,
    displayName: result.displayName,
    placeType: result.placeType,
  });

  return result;
};
/**
 * @param {string} area
 * @param {{ en: string, ar: string }} geocoded
 * @returns {boolean}
 */
export const areaMatchesLocation = (area, geocoded) => {
  const normalized = area.trim().toLowerCase();

  const inEn = geocoded.en?.toLowerCase().includes(normalized) ?? false;
  const inAr = geocoded.ar?.includes(area.trim()) ?? false;

  return inEn || inAr;
};
