import Joi from 'joi';
import { TRAFFIC_STATUSES } from '#shared/constants/enums.js';
import {
  pageQuerySchema,
  limitQuerySchema,
  sortOrderQuerySchema,
  positiveIntegerIdSchema,
  westBankLatitudeSchema,
  westBankLongitudeSchema,
} from '#shared/utils/query-validator.js';

const trafficStatuses = Object.values(TRAFFIC_STATUSES);

const latitudeBounds = westBankLatitudeSchema;

const longitudeBounds = westBankLongitudeSchema;

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
  page: pageQuerySchema,
  limit: limitQuerySchema,
  sortBy: Joi.string().valid('createdAt', 'name', 'status').default('createdAt'),
  sortOrder: sortOrderQuerySchema,
});

export const checkpointIdParamSchema = Joi.object({
  id: positiveIntegerIdSchema,
});

export const createCheckpointSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Checkpoint name must be at least 2 characters',
    'string.max': 'Checkpoint name must not exceed 100 characters',
    'any.required': 'Checkpoint name is required',
  }),
  area: Joi.string().max(100).optional().messages({
    'string.max': 'Area name must not exceed 100 characters',
  }),
  road: Joi.string().max(255).optional().messages({
    'string.max': 'Road name must not exceed 255 characters',
  }),
  city: Joi.string().max(255).optional().messages({
    'string.max': 'City name must not exceed 255 characters',
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
    .optional()
    .default(TRAFFIC_STATUSES.UNKNOWN),
});

export const updateCheckpointSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Checkpoint name must be at least 2 characters',
    'string.max': 'Checkpoint name must not exceed 100 characters',
  }),
  area: Joi.string().max(100).optional().messages({
    'string.max': 'Area name must not exceed 100 characters',
  }),
  road: Joi.string().max(255).optional().messages({
    'string.max': 'Road name must not exceed 255 characters',
  }),
  city: Joi.string().max(255).optional().messages({
    'string.max': 'City name must not exceed 255 characters',
  }),
  description: Joi.string().max(1000).optional().messages({
    'string.max': 'Description must not exceed 1000 characters',
  }),
  latitude: latitudeBounds.optional(),
  longitude: longitudeBounds.optional(),
  status: Joi.string()
    .valid(...trafficStatuses)
    .optional(),
  notes: Joi.string().max(500).optional(),
})
  .and('latitude', 'longitude')
  .min(1)
  .messages({
    'object.and': 'latitude and longitude must be provided together',
    'object.min': 'At least one field must be provided for update',
  });

export const updateCheckpointStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...trafficStatuses)
    .required(),
  notes: Joi.string().max(500).optional(),
});

export const checkpointStatusHistoryQuerySchema = Joi.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  sortBy: Joi.string().valid('changedAt').default('changedAt'),
  sortOrder: sortOrderQuerySchema,
});
