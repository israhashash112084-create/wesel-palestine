import Joi from 'joi';

export const pageQuerySchema = Joi.number().integer().min(1).default(1);
export const limitQuerySchema = Joi.number().integer().min(1).max(100).default(10);
export const sortOrderQuerySchema = Joi.string().valid('asc', 'desc').default('desc');
export const positiveIntegerIdSchema = Joi.number().integer().positive().required();

export const latitudeSchema = Joi.number().min(31.2).max(32.6).messages({
  'number.base': 'latitude must be a number',
  'number.min': 'latitude must be within West Bank boundaries [31.2, 32.6]',
  'number.max': 'latitude must be within West Bank boundaries [31.2, 32.6]',
});

export const longitudeSchema = Joi.number().min(34.9).max(35.6).messages({
  'number.base': 'longitude must be a number',
  'number.min': 'longitude must be within West Bank boundaries [34.9, 35.6]',
  'number.max': 'longitude must be within West Bank boundaries [34.9, 35.6]',
});

export const locationInputSchema = Joi.object({
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  area: Joi.string().min(2).max(255).trim().optional().messages({
    'string.min': 'area must be at least 2 characters',
  }),
  city: Joi.string().min(1).max(255).trim().optional(),
  road: Joi.string().min(1).max(255).trim().allow(null, '').optional(),
})
  .custom((value, helpers) => {
    const hasLat = value.latitude !== undefined;
    const hasLng = value.longitude !== undefined;
    const hasCoords = hasLat || hasLng;

    const hasArea = typeof value.area === 'string' && value.area.trim().length > 0;
    const hasCity = typeof value.city === 'string' && value.city.trim().length > 0;
    const hasRoad = typeof value.road === 'string' && value.road.trim().length > 0;
    const hasText = hasArea || hasCity || hasRoad;

    if (hasCoords && hasText) {
      return helpers.error('any.invalid', {
        message: 'location must be either coordinates or text location, not both',
      });
    }

    if (hasCoords) {
      if (!hasLat || !hasLng) {
        return helpers.error('any.invalid', {
          message: 'latitude and longitude must be provided together',
        });
      }
      return value;
    }

    if (hasText) {
      if (!hasArea || !hasCity) {
        return helpers.error('any.invalid', {
          message: 'text location must include area and city',
        });
      }
      return value;
    }

    return helpers.error('any.invalid', {
      message: 'location must contain either coordinates or text location',
    });
  })
  .messages({
    'any.invalid': '{{#message}}',
  });
