import Joi from 'joi';

export const pageQuerySchema = Joi.number().integer().min(1).default(1);

export const limitQuerySchema = Joi.number().integer().min(1).max(100).default(10);

export const sortOrderQuerySchema = Joi.string().valid('asc', 'desc').default('desc');

export const positiveIntegerIdSchema = Joi.number().integer().positive().required();
