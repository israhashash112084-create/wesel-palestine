import Joi from 'joi';

export const createSubscriptionSchema = Joi.object({
  areaLat: Joi.number().required(),
  areaLng: Joi.number().required(),
  radiusKm: Joi.number().min(1).max(100).default(10),
  incidentCategory: Joi.string().valid('all', 'accident', 'traffic', 'closure').default('all'),
});

export const updateSubscriptionSchema = Joi.object({
  areaLat: Joi.number(),
  areaLng: Joi.number(),
  radiusKm: Joi.number().min(1).max(100),
  incidentCategory: Joi.string().valid('all', 'accident', 'traffic', 'closure'),
});