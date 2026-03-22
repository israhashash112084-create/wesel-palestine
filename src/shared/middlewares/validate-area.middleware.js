import { BadRequestError } from '#shared/utils/errors.js';
import { logger } from '#shared/utils/logger.js';
import {
  reverseGeocodeBilingual,
  areaMatchesLocation,
} from '#integrations/geocoding/geocoding.service.js';
export const validateAreaLocation = async (req, _res, next) => {
  const { locationLat, locationLng, area } = req.body;

  const geocoded = await reverseGeocodeBilingual(locationLat, locationLng);

  if (!geocoded.en && !geocoded.ar) {
    logger.warn('[validateAreaLocation] Geocoding unavailable — skipping area check', {
      locationLat,
      locationLng,
      area,
    });
    return next();
  }

  const isMatch = areaMatchesLocation(area, geocoded);

  if (!isMatch) {
    const detectedArea = geocoded.primaryEn ?? geocoded.primaryAr ?? geocoded.en ?? geocoded.ar;

    logger.info('[validateAreaLocation] Area mismatch', {
      provided: area,
      primaryEn: geocoded.primaryEn,
      primaryAr: geocoded.primaryAr,
      locationLat,
      locationLng,
    });

    throw new BadRequestError(
      `Area "${area}" does not match the provided location. ` +
        `Based on the coordinates, the area appears to be: ${detectedArea}`
    );
  }

  next();
};
