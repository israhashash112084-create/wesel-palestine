import Joi from 'joi';

export const pageQuerySchema = Joi.number().integer().min(1).default(1);

export const limitQuerySchema = Joi.number().integer().min(1).max(100).default(10);

export const sortOrderQuerySchema = Joi.string().valid('asc', 'desc').default('desc');

export const positiveIntegerSchema = Joi.number().integer().positive();

export const positiveIntegerIdSchema = positiveIntegerSchema.required();

export const westBankLatitudeSchema = Joi.number().min(31.2).max(32.6).messages({
  'number.min': 'Latitude must be within the West Bank boundaries [31.2, 32.6]',
  'number.max': 'Latitude must be within the West Bank boundaries [31.2, 32.6]',
});

export const westBankLongitudeSchema = Joi.number().min(34.9).max(35.6).messages({
  'number.min': 'Longitude must be within the West Bank boundaries [34.9, 35.6]',
  'number.max': 'Longitude must be within the West Bank boundaries [34.9, 35.6]',
});
