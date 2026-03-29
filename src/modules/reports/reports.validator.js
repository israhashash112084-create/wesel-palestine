import Joi from 'joi';
import {
  INCIDENT_TYPES,
  REPORT_STATUSES,
  INCIDENT_SEVERITIES,
  TRAFFIC_STATUSES,
} from '#shared/constants/enums.js';
import { locationInputSchema } from '#shared/utils/query-validator.js';

const VALID_SEVERITIES = Object.values(INCIDENT_SEVERITIES);
const VALID_TYPES = Object.values(INCIDENT_TYPES);
const VALID_STATUSES = Object.values(REPORT_STATUSES);
const VALID_TRAFFIC_STATUSES = Object.values(TRAFFIC_STATUSES);

const CHECKPOINT_TYPE = INCIDENT_TYPES.CHECKPOINT_STATUS_UPDATE;

const type = Joi.string()
  .valid(...VALID_TYPES)
  .messages({
    'any.only': `type must be one of: ${VALID_TYPES.join(', ')}`,
    'any.required': 'type is required',
  });

const severity = Joi.string()
  .valid(...VALID_SEVERITIES)
  .messages({
    'any.only': `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
    'any.required': 'severity is required',
  });

const description = Joi.string().min(10).max(1000).messages({
  'string.min': 'description must be at least 10 characters',
  'string.max': 'description must not exceed 1000 characters',
  'any.required': 'description is required',
});

const checkpointId = Joi.number().integer().min(1).messages({
  'number.base': 'checkpointId must be a number',
  'number.integer': 'checkpointId must be an integer',
  'number.min': 'checkpointId must be a positive integer',
});

const proposedCheckpointStatus = Joi.string()
  .valid(...VALID_TRAFFIC_STATUSES)
  .messages({
    'any.only': `proposedCheckpointStatus must be one of: ${VALID_TRAFFIC_STATUSES.join(', ')}`,
  });
export const ReportSchema = Joi.object({
  location: locationInputSchema.optional(),

  type: type.optional(),
  severity: severity.optional(),
  description: description.optional(),

  checkpointId: checkpointId.optional(),
  proposedCheckpointStatus: proposedCheckpointStatus.optional(),
})
  .custom((value, helpers) => {
    const isCheckpointType = value.type === CHECKPOINT_TYPE;
    const hasCheckpointFields =
      value.checkpointId !== undefined || value.proposedCheckpointStatus !== undefined;
    const isCheckpointReport = isCheckpointType || hasCheckpointFields;

    if (isCheckpointReport) {
      if (value.checkpointId === undefined || value.proposedCheckpointStatus === undefined) {
        return helpers.error('any.invalid', {
          message:
            'checkpointId and proposedCheckpointStatus are both required for checkpoint reports',
        });
      }

      if (value.location !== undefined) {
        return helpers.error('any.invalid', {
          message: 'location is not allowed for checkpoint status reports',
        });
      }

      value.type = CHECKPOINT_TYPE;
      value.severity = value.severity ?? INCIDENT_SEVERITIES.LOW;
      value.description = value.description ?? 'Checkpoint status update report';
      return value;
    }

    if (!value.location) {
      return helpers.error('any.invalid', {
        message: 'location is required for standard reports',
      });
    }

    if (value.type === undefined) {
      return helpers.error('any.invalid', { message: 'type is required' });
    }

    if (value.severity === undefined) {
      return helpers.error('any.invalid', { message: 'severity is required' });
    }

    if (value.description === undefined) {
      return helpers.error('any.invalid', { message: 'description is required' });
    }

    return value;
  })
  .messages({ 'any.invalid': '{{#message}}' });

export const updateReportSchema = Joi.object({
  location: locationInputSchema.optional(),
  type: type.optional(),
  severity: severity.optional(),
  description: description.optional(),
  checkpointId: checkpointId.optional(),
  proposedCheckpointStatus: proposedCheckpointStatus.optional(),
})
  .min(1)
  .custom((value, helpers) => {
    const isCheckpointType = value.type === CHECKPOINT_TYPE;
    const hasCheckpointFields =
      value.checkpointId !== undefined || value.proposedCheckpointStatus !== undefined;

    if (hasCheckpointFields && value.type !== undefined && !isCheckpointType) {
      return helpers.error('any.invalid', {
        message: 'checkpointId / proposedCheckpointStatus are only allowed for checkpoint reports',
      });
    }

    if (isCheckpointType || hasCheckpointFields) {
      if (value.checkpointId === undefined || value.proposedCheckpointStatus === undefined) {
        return helpers.error('any.invalid', {
          message:
            'Both checkpointId and proposedCheckpointStatus are required when updating a checkpoint report',
        });
      }

      if (value.location !== undefined) {
        return helpers.error('any.invalid', {
          message: 'location is not allowed when updating a checkpoint report',
        });
      }

      value.type = CHECKPOINT_TYPE;
      value.severity = value.severity ?? INCIDENT_SEVERITIES.LOW;
    }

    return value;
  })
  .messages({
    'object.min': 'At least one field must be provided for update',
    'any.invalid': '{{#message}}',
  });

export const listReportsSchema = Joi.object({
  status: Joi.string()
    .valid(...VALID_STATUSES)
    .optional(),
  type: Joi.string()
    .valid(...VALID_TYPES)
    .optional(),
  area: Joi.string().max(255).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid('createdAt', 'confidenceScore').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const voteReportSchema = Joi.object({
  vote: Joi.string().valid('up', 'down').required().messages({
    'any.only': 'vote must be either up or down',
    'any.required': 'vote is required',
  }),
});

export const reportIdSchema = Joi.object({
  id: Joi.number().integer().min(1).required().messages({
    'number.base': 'Report ID must be a number',
    'number.integer': 'Report ID must be an integer',
    'number.min': 'Report ID must be a positive integer',
    'any.required': 'Report ID is required',
  }),
});

export const moderateReportSchema = Joi.object({
  action: Joi.string().valid('approve', 'reject').required().messages({
    'any.only': 'action must be either approved or rejected',
    'any.required': 'action is required',
  }),

  reason: Joi.when('action', {
    is: 'reject',
    then: Joi.string().min(5).max(500).required().messages({
      'string.min': 'reason must be at least 5 characters',
      'string.max': 'reason must not exceed 500 characters',
      'any.required': 'reason is required when rejecting a report',
    }),
    otherwise: Joi.string().min(5).max(500).optional(),
  }),
});
