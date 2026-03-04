import { ValidationError } from '#shared/utils/errors.js';

/**
 * Middleware factory for Joi schema validation.
 * Validates req.body against the provided schema.
 *
 * Express 5 will forward thrown errors to the global error handler.
 *
 * Usage:
 *   router.post('/incidents', authenticate, validateRequestBody(createIncidentSchema), controller.create);
 *
 * @param {import('joi').ObjectSchema} schema - Joi schema to validate against.
 */

export const validateRequestBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details.map((d) => d.message).join(', '));
    }
    req.body = value;
    next();
  };
};

/**
 * Middleware factory for validating request headers.
 * @param {import('joi').ObjectSchema} schema - Joi schema to validate headers.
 *
 * Usage: router.get('/protected-route', authenticate, validateRequestHeaders(headersSchema), controller.protectedRoute);
 */

export const validateRequestHeaders = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.headers);
    if (error) {
      throw new ValidationError(error.details.map((d) => d.message).join(', '));
    }
    next();
  };
};
