export const CHECKPOINT_STATUSES = {
  OPEN:    'open',
  CLOSED:  'closed',
  SLOW:    'slow',
  UNKNOWN: 'unknown',
};

export const INCIDENT_TYPES = {
  CLOSURE:           'closure',
  DELAY:             'delay',
  ACCIDENT:          'accident',
  MILITARY_ACTIVITY: 'military_activity',
  WEATHER_HAZARD:    'weather_hazard',
  ROAD_DAMAGE:       'road_damage',
  PROTEST:           'protest',
  CONSTRUCTION:      'construction',
  OTHER:             'other',
};

export const INCIDENT_STATUSES = {
  PENDING:  'pending',
  VERIFIED: 'verified',
  RESOLVED: 'resolved',
  CLOSED:   'closed',
};

export const INCIDENT_SEVERITIES = {
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
};

export const REPORT_STATUSES = {
  PENDING:  'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const MODERATION_ACTIONS = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const VOTE_VALUES = {
  UP:   'up',
  DOWN: 'down',
};

export const DUPLICATE_DETECTION = {
  RADIUS_METERS:  500,
  TIME_WINDOW_MS: 2 * 60 * 60 * 1000, 
};

export const CONFIDENCE_THRESHOLDS = {
  AUTO_REJECT_BELOW:  0.20,
  AUTO_VERIFY_ABOVE:  0.70,
};

export const USER_DUPLICATE_PREVENTION = {
  RADIUS_METERS:  500,
  TIME_WINDOW_MS: 60 * 60 * 1000, 
};

export const REPORT_RATE_LIMIT = {
  MAX_REPORTS:    5,
  WINDOW_SECONDS: 5 * 60, 
};

