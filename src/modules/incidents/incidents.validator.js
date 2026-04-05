import Joi from 'joi';
import { INCIDENT_TYPES } from '#shared/constants/enums.js';
import { INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
import { TRAFFIC_STATUSES } from '#shared/constants/enums.js';
import { INCIDENT_STATUSES } from '#shared/constants/enums.js';
import { REPORT_STATUSES } from '#shared/constants/enums.js';
import {
  pageQuerySchema,
  limitQuerySchema,
  sortOrderQuerySchema,
  positiveIntegerIdSchema,
  latitudeSchema,
  longitudeSchema,
} from '#shared/utils/query-validator.js';

const incidentTypes = Object.values(INCIDENT_TYPES);
const incidentSeverities = Object.values(INCIDENT_SEVERITIES);
const trafficStatuses = Object.values(TRAFFIC_STATUSES);
const incidentStatuses = Object.values(INCIDENT_STATUSES);
const reportStatuses = Object.values(REPORT_STATUSES);

const locationLatSchema = latitudeSchema.messages({
  'any.required': 'Location latitude is required',
});

const locationLngSchema = longitudeSchema.messages({
  'any.required': 'Location longitude is required',
});

export const createIncidentSchema = Joi.object({
  checkpointId: positiveIntegerIdSchema.optional(),
  locationLat: locationLatSchema.required(),
  locationLng: locationLngSchema.required(),
  area: Joi.string().max(100).optional(),
  road: Joi.string().max(255).optional(),
  city: Joi.string().max(255).optional(),
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
  checkpointId: positiveIntegerIdSchema.optional(),
  reportedBy: positiveIntegerIdSchema.optional(),
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
  changedBy: positiveIntegerIdSchema.optional(),
  oldStatus: Joi.string()
    .valid(...incidentStatuses)
    .optional(),
  newStatus: Joi.string()
    .valid(...incidentStatuses)
    .optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().greater(Joi.ref('fromDate')).optional().messages({
    'date.greater': 'toDate must be greater than fromDate',
  }),
  page: pageQuerySchema,
  limit: limitQuerySchema,
  sortBy: Joi.string().valid('changedAt').default('changedAt'),
  sortOrder: sortOrderQuerySchema,
});

export const incidentReportsQuerySchema = Joi.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  sortBy: Joi.string().valid('createdAt', 'severity', 'status').default('createdAt'),
  sortOrder: sortOrderQuerySchema,
  status: Joi.string()
    .valid(...reportStatuses)
    .optional(),
  type: Joi.string()
    .valid(...incidentTypes)
    .optional(),
});

export const nearbyIncidentsSchema = Joi.object({
  lat: latitudeSchema.required().messages({
    'any.required': 'Latitude is required',
  }),
  lng: longitudeSchema.required().messages({
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
