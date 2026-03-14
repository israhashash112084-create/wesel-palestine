import Joi from 'joi';

const coordinateSchema = Joi.object({
  lat: Joi.number()
    .min(31.2)
    .max(32.6)
    .required()
    .messages({
      'number.min': 'Location must be within the West Bank boundaries',
      'number.max': 'Location must be within the West Bank boundaries',
      'any.required': 'lat is required',
    }),
  lng: Joi.number()
    .min(34.9)
    .max(35.6)
    .required()
    .messages({
      'number.min': 'Location must be within the West Bank boundaries',
      'number.max': 'Location must be within the West Bank boundaries',
      'any.required': 'lng is required',
    }),
});

export const estimateRouteSchema = Joi.object({
  from: coordinateSchema.required().messages({
    'any.required': 'from location is required',
  }),

  to: coordinateSchema.required().messages({
    'any.required': 'to location is required',
  }),

  avoid_checkpoints: Joi.array()
    .items(Joi.number().integer().positive())
    .default([]),

    include_geometry:  Joi.boolean().default(true), 
});