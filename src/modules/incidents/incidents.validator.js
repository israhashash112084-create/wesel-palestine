import Joi from 'joi';
import { INCIDENT_TYPES } from '#shared/constants/enums.js';
import { INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
import { TRAFFIC_STATUSES } from '#shared/constants/enums.js';

const incidentTypes = Object.values(INCIDENT_TYPES);
const incidentSeverities = Object.values(INCIDENT_SEVERITIES);
const trafficStatuses = Object.values(TRAFFIC_STATUSES);

export const createIncidentSchema = Joi.object({
  checkpointId: Joi.number().integer().positive().optional(),
  locationLat: Joi.number().min(31.2).max(32.6).required().messages({
    'number.min': 'Lat Location must be within the West Bank boundaries [31.2, 32.6]',
    'number.max': 'Lat Location must be within the West Bank boundaries [31.2, 32.6]',
    'any.required': 'Location latitude is required',
  }),
  locationLng: Joi.number().min(34.9).max(35.6).required().messages({
    'number.min': 'Lng Location must be within the West Bank boundaries [34.9, 35.6]',
    'number.max': 'Lng Location must be within the West Bank boundaries [34.9, 35.6]',
    'any.required': 'Location longitude is required',
  }),
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

export const updateIncidentParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const updateIncidentBodySchema = Joi.object({
  severity: Joi.string()
    .valid(...incidentSeverities)
    .optional(),
  description: Joi.string().max(255).optional(),
  trafficStatus: Joi.string()
    .valid(...trafficStatuses)
    .optional(),
  locationLat: Joi.number().min(31.2).max(32.6).optional().messages({
    'number.min': 'Lat Location must be within the West Bank boundaries [31.2, 32.6]',
    'number.max': 'Lat Location must be within the West Bank boundaries [31.2, 32.6]',
    'any.required': 'Location latitude is required',
  }),
  locationLng: Joi.number().min(34.9).max(35.6).optional().messages({
    'number.min': 'Lng Location must be within the West Bank boundaries [34.9, 35.6]',
    'number.max': 'Lng Location must be within the West Bank boundaries [34.9, 35.6]',
    'any.required': 'Location longitude is required',
  }),
  type: Joi.string()
    .max(100)
    .optional()
    .valid(...incidentTypes),
}).min(1);
