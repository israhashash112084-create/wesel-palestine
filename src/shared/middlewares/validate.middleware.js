import { ValidationError } from '#shared/utils/errors.js';

/** @type {ReadonlySet<string>} */
const VALID_LOCATIONS = Object.freeze(new Set(['body', 'headers', 'params', 'query']));

/**
 * Default Joi validation options applied to all `validateRequest` calls.
 *
 * @type {import('joi').ValidationOptions}
 *
 * @property {boolean} abortEarly - When `false`, collects **all** validation
 *   errors before returning instead of stopping at the first failure. This
 *   lets clients fix every issue in a single round-trip.
 *
 * @property {boolean} allowUnknown - When `false`, treats keys not defined
 *   in the schema as validation errors, preventing unexpected fields from
 *   reaching the application.
 *
 * @property {boolean} stripUnknown - When `true`, removes keys not defined
 *   in the schema from the validated value before it is written back to
 *   `req[location]`. Acts as a defence against mass-assignment by ensuring
 *   only whitelisted fields propagate through the request lifecycle.
 *
 * @see https://joi.dev/api/#anyvalidatevalue-options
 */
const validationOptions = {
  abortEarly: false,
  allowUnknown: false,
  stripUnknown: true,
};

/**
 * Middleware factory for Joi schema validation.
 * Validates and sanitizes `req[location]` against the provided schema,
 * stripping unknown fields and replacing the request data with the
 * validated (coerced) value.
 *
 * The factory throws at route-registration time on misconfiguration,
 * so errors surface immediately rather than on the first request.
 * Express 5 forwards thrown errors from the returned middleware to the
 * global error handler automatically.
 *
 * @param {import('joi').Schema} schema - Joi schema to validate against.
 * @param {'body'|'headers'|'params'|'query'} [location='body'] - Request property to validate.
 * @returns {import('express').RequestHandler}
 * @throws {TypeError} If `schema` is not a Joi schema or `location` is invalid.
 * @throws {ValidationError} (at request time) If validation fails.
 *
 * @example
 * router.post('/login', validateRequest(loginSchema), authController.login);
 * router.get('/protected', authenticate, validateRequest(headersSchema, 'headers'), controller.get);
 */
export const validateRequest = (schema, location = 'body') => {
  if (!schema || typeof schema.validate !== 'function') {
    throw new TypeError('validateRequest: first argument must be a valid Joi schema');
  }
  if (!VALID_LOCATIONS.has(location)) {
    throw new TypeError(
      `validateRequest: invalid location "${location}". Must be one of: ${[...VALID_LOCATIONS].join(', ')}`
    );
  }

  return (req, _res, next) => {
    const { error, value } = schema.validate(req[location], validationOptions);

    if (error) {
      throw new ValidationError(error.details.map((d) => d.message).join(', '));
    }

    if (
      req[location] !== null &&
      req[location] !== undefined &&
      typeof req[location] === 'object' &&
      value !== null &&
      value !== undefined &&
      typeof value === 'object'
    ) {
      Object.assign(req[location], value);
    } else {
      req[location] = value;
    }

    next();
  };
};
