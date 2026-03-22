import Joi from 'joi';
import { TRAFFIC_STATUSES } from '#shared/constants/enums.js';

const trafficStatuses = Object.values(TRAFFIC_STATUSES);

const latitudeBounds = Joi.number().min(31.2).max(32.6).messages({
  'number.min': 'Latitude must be within the West Bank boundaries [31.2, 32.6]',
  'number.max': 'Latitude must be within the West Bank boundaries [31.2, 32.6]',
});

const longitudeBounds = Joi.number().min(34.9).max(35.6).messages({
  'number.min': 'Longitude must be within the West Bank boundaries [34.9, 35.6]',
  'number.max': 'Longitude must be within the West Bank boundaries [34.9, 35.6]',
});

export const listCheckpointsSchema = Joi.object({
  status: Joi.string()
    .valid(...trafficStatuses)
    .optional(),
  search: Joi.string().trim().min(1).max(100).optional(),
  minLat: latitudeBounds.optional(),
  maxLat: latitudeBounds.greater(Joi.ref('minLat')).optional().messages({
    'number.greater': 'maxLat must be greater than minLat',
  }),
  minLng: longitudeBounds.optional(),
  maxLng: longitudeBounds.greater(Joi.ref('minLng')).optional().messages({
    'number.greater': 'maxLng must be greater than minLng',
  }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid('createdAt', 'name', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const checkpointIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const createCheckpointSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Checkpoint name must be at least 2 characters',
    'string.max': 'Checkpoint name must not exceed 100 characters',
    'any.required': 'Checkpoint name is required',
  }),
  areaName: Joi.string().max(100).optional().messages({
    'string.max': 'Area name must not exceed 100 characters',
  }),
  description: Joi.string().max(1000).optional().messages({
    'string.max': 'Description must not exceed 1000 characters',
  }),
  latitude: latitudeBounds.required().messages({
    'any.required': 'Latitude is required',
  }),
  longitude: longitudeBounds.required().messages({
    'any.required': 'Longitude is required',
  }),
  status: Joi.string()
    .valid(...trafficStatuses)
    .optional('unknown'),
});
