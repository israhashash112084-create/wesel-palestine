import Joi from 'joi';
import { INCIDENT_TYPES } from '#shared/constants/enums.js';

const VALID_TYPES = Object.values(INCIDENT_TYPES);

export const createReportSchema = Joi.object({
    locationLat: Joi.number()
        .min(31.2)
        .max(32.6)
        .required()
        .messages({
            'number.min': 'Location must be within the West Bank boundaries',
            'number.max': 'Location must be within the West Bank boundaries',
            'any.required': 'locationLat is required',
        }),

    locationLng: Joi.number()
        .min(34.9)
        .max(35.6)
        .required()
        .messages({
            'number.min': 'Location must be within the West Bank boundaries',
            'number.max': 'Location must be within the West Bank boundaries',
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
});
export const listReportsSchema = Joi.object({
    status: Joi.string().valid('pending', 'verified', 'rejected').optional(),
    type: Joi.string().valid(...VALID_TYPES).optional(),
    area: Joi.string().max(255).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'confidenceScore').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

