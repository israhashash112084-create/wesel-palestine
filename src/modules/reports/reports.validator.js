import Joi from 'joi';
import { INCIDENT_TYPES, REPORT_STATUSES,INCIDENT_SEVERITIES } from '#shared/constants/enums.js';
const VALID_SEVERITIES = Object.values(INCIDENT_SEVERITIES);
const VALID_TYPES = Object.values(INCIDENT_TYPES);
const VALID_STATUSES = Object.values(REPORT_STATUSES);
export const ReportSchema = Joi.object({
    locationLat: Joi.number()
        .min(31.2)
        .max(32.6)
        .required()
        .messages({
            'number.min': 'locationLat out of range: must be between 31.2 and 32.6 (West Bank boundaries)',
            'number.max': 'locationLat out of range: must be between 31.2 and 32.6 (West Bank boundaries)',
            'any.required': 'locationLat is required',
        }),

    locationLng: Joi.number()
        .min(34.9)
        .max(35.6)
        .required()
        .messages({
            'number.min': 'locationLng out of range: must be between 34.9 and 35.6 (West Bank boundaries)',
            'number.max': 'locationLng out of range: must be between 34.9 and 35.6 (West Bank boundaries)',
            'any.required': 'locationLng is required',
        }),

    area: Joi.string().max(255).optional(),

    type: Joi.string()
        .valid(...VALID_TYPES)
        .required()
        .messages({
            'any.only': `type must be one of: ${VALID_TYPES.join(', ')}`,
            'any.required': 'type is required',
        }),

    description: Joi.string()
        .min(10)
        .max(1000)
        .required()
        .messages({
            'string.min': 'description must be at least 10 characters',
            'string.max': 'description must not exceed 1000 characters',
            'any.required': 'description is required',
        }),
    severity: Joi.string()
        .valid(...VALID_SEVERITIES).required()
        .messages({
            'any.only': `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
            'any.required': 'severity is required',
        }),
});

export const listReportsSchema = Joi.object({
    status: Joi.string().valid(...VALID_STATUSES).optional(),
    type: Joi.string().valid(...VALID_TYPES).optional(),
    area: Joi.string().max(255).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'confidenceScore').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
export const voteReportSchema = Joi.object({
    vote: Joi.string()
        .valid('up', 'down').required()
        .messages({
            'any.only': 'vote must be either up or down',
            'any.required': 'vote is required',
        }),
});
export const reportIdSchema = Joi.object({
    id: Joi.number().integer().min(1).required()
        .messages({
            'number.base': 'Report ID must be a number',
            'number.integer': 'Report ID must be an integer',
            'number.min': 'Report ID must be a positive integer',
            'any.required': 'Report ID is required',
        }),
});
export const moderateReportSchema = Joi.object({
  action: Joi.string()
    .valid('approve', 'reject').required()
    .messages({
      'any.only':     'action must be either approve or reject',
      'any.required': 'action is required',
    }),

  reason: Joi.when('action', {
    is:        'reject',
    then:      Joi.string().min(5).max(500).required().messages({
      'string.min':   'reason must be at least 5 characters',
      'string.max':   'reason must not exceed 500 characters',
      'any.required': 'reason is required when rejecting a report',
    }),
    otherwise: Joi.string().min(5).max(500).optional(),
  }),
});
