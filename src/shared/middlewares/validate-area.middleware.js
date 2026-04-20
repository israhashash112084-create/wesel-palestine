import { BadRequestError } from '#shared/utils/errors.js';
import { logger } from '#shared/utils/logger.js';
import { INCIDENT_TYPES } from '#shared/constants/enums.js';
import {
  reverseGeocodeComponents,
  areaMatchesLocation,
} from '#integrations/geocoding/geocoding.service.js';

export const validateAreaLocation = async (req, _res, next) => {
  if (
    req.body?.type === INCIDENT_TYPES.CHECKPOINT_STATUS_UPDATE ||
    (req.body?.checkpointId !== undefined && req.body?.proposedCheckpointStatus !== undefined)
  ) {
    return next();
  }

  const loc = req.body?.location ?? {
    latitude: req.body?.latitude ?? req.body?.locationLat,
    longitude: req.body?.longitude ?? req.body?.locationLng,
    area: req.body?.area,
  };

  const { latitude, longitude, area } = loc;

  if (latitude === undefined || longitude === undefined || area === undefined) {
    return next();
  }

  const geocoded = await reverseGeocodeComponents(Number(latitude), Number(longitude));

  if (!geocoded) {
    logger.warn('[validateAreaLocation] Geocoding unavailable — skipping area check', {
      latitude,
      longitude,
      area,
    });
    return next();
  }

  const displayName = [geocoded.city, geocoded.area, geocoded.road].filter(Boolean).join(', ');
  const isMatch = areaMatchesLocation(area, displayName);

  if (!isMatch) {
    logger.info('[validateAreaLocation] Area mismatch', {
      provided: area,
      detected: displayName,
      latitude,
      longitude,
    });

    throw new BadRequestError(
      `Area "${area}" does not match the provided coordinates. ` +
        `Detected area: ${displayName || 'unknown'}`
    );
  }

  return next();
};
