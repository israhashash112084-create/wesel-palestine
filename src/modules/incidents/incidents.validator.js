import Joi from 'joi';
import { INCIDENT_TYPES } from '#shared/constants/enums.js';
import { INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
import { TRAFFIC_STATUSES } from '#shared/constants/enums.js';
import { INCIDENT_STATUSES } from '#shared/constants/enums.js';
import {
  pageQuerySchema,
  limitQuerySchema,
  sortOrderQuerySchema,
  positiveIntegerSchema,
  positiveIntegerIdSchema,
  westBankLatitudeSchema,
  westBankLongitudeSchema,
} from '#shared/utils/query-validator.js';

const incidentTypes = Object.values(INCIDENT_TYPES);
const incidentSeverities = Object.values(INCIDENT_SEVERITIES);
const trafficStatuses = Object.values(TRAFFIC_STATUSES);
const incidentStatuses = Object.values(INCIDENT_STATUSES);

const locationLatSchema = westBankLatitudeSchema.messages({
  'any.required': 'Location latitude is required',
});

const locationLngSchema = westBankLongitudeSchema.messages({
  'any.required': 'Location longitude is required',
});

export const createIncidentSchema = Joi.object({
  checkpointId: positiveIntegerSchema.optional(),
  locationLat: locationLatSchema.required(),
  locationLng: locationLngSchema.required(),
  area: Joi.string().max(100).optional(),
  type: Joi.string()
    .max(100)
    .required()
    .valid(...incidentTypes),
  severity: Joi.string()
    .valid(...incidentSeverities)
    .required(),
  description: Joi.string().max(255).optional(),
  trafficStatus: Joi.string()
    .valid(...trafficStatuses)
    .required(),
});

export const incidentIdParamSchema = Joi.object({
  id: positiveIntegerIdSchema,
});

export const updateIncidentBodySchema = Joi.object({
  severity: Joi.string()
    .valid(...incidentSeverities)
    .optional(),
  description: Joi.string().max(255).optional(),
  trafficStatus: Joi.string()
    .valid(...trafficStatuses)
    .optional(),
  locationLat: locationLatSchema.optional(),
  locationLng: locationLngSchema.optional(),
  type: Joi.string()
    .max(100)
    .optional()
    .valid(...incidentTypes),
  notes: Joi.string().max(500).optional(),
}).min(1);

export const listIncidentsSchema = Joi.object({
  type: Joi.string()
    .valid(...incidentTypes)
    .optional(),
  severity: Joi.string()
    .valid(...incidentSeverities)
    .optional(),
  trafficStatus: Joi.string()
    .valid(...trafficStatuses)
    .optional(),
  checkpointId: positiveIntegerSchema.optional(),
  reportedBy: positiveIntegerSchema.optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().greater(Joi.ref('fromDate')).optional().messages({
    'date.greater': 'toDate must be greater than fromDate',
  }),
  page: pageQuerySchema,
  limit: limitQuerySchema,
  sortBy: Joi.string().valid('createdAt', 'severity').default('createdAt'),
  sortOrder: sortOrderQuerySchema,
});

export const incidentHistoryQuerySchema = Joi.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  sortBy: Joi.string().valid('changedAt').default('changedAt'),
  sortOrder: sortOrderQuerySchema,
});

export const nearbyIncidentsSchema = Joi.object({
  lat: westBankLatitudeSchema.required().messages({
    'any.required': 'Latitude is required',
  }),
  lng: westBankLongitudeSchema.required().messages({
    'any.required': 'Longitude is required',
  }),
  radiusMeters: Joi.number().integer().min(1).max(50000).default(500),
  type: Joi.string()
    .valid(...incidentTypes)
    .optional(),
  severity: Joi.string()
    .valid(...incidentSeverities)
    .optional(),
  trafficStatus: Joi.string()
    .valid(...trafficStatuses)
    .optional(),
  status: Joi.string()
    .valid(...incidentStatuses)
    .optional(),
  page: pageQuerySchema,
  limit: Joi.number().integer().min(1).max(50).default(10),
  sortBy: Joi.string().valid('distance', 'createdAt', 'severity').default('distance'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});
