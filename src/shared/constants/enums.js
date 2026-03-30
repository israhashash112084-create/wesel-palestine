export const TRAFFIC_STATUSES = {
  OPEN: 'open',
  CLOSED: 'closed',
  SLOW: 'slow',
  UNKNOWN: 'unknown',
};

export const INCIDENT_TYPES = {
  CLOSURE: 'closure',
  DELAY: 'delay',
  ACCIDENT: 'accident',
  MILITARY_ACTIVITY: 'military_activity',
  WEATHER_HAZARD: 'weather_hazard',
  ROAD_DAMAGE: 'road_damage',
  PROTEST: 'protest',
  CONSTRUCTION: 'construction',
  CHECKPOINT_STATUS_UPDATE: 'checkpoint_status_update',
  OTHER: 'other',
};

export const INCIDENT_STATUSES = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  CLOSED: 'closed',
};

export const INCIDENT_STATUS_TRANSITIONS = {
  [INCIDENT_STATUSES.PENDING]: [
    INCIDENT_STATUSES.VERIFIED,
    INCIDENT_STATUSES.REJECTED,
    INCIDENT_STATUSES.CLOSED,
  ],
  [INCIDENT_STATUSES.VERIFIED]: [INCIDENT_STATUSES.REJECTED, INCIDENT_STATUSES.CLOSED],
  [INCIDENT_STATUSES.REJECTED]: [INCIDENT_STATUSES.VERIFIED, INCIDENT_STATUSES.CLOSED],
  [INCIDENT_STATUSES.CLOSED]: [],
};

export const INCIDENT_SEVERITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

export const REPORT_STATUSES = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const MODERATION_ACTIONS = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const VOTE_VALUES = {
  UP: 'up',
  DOWN: 'down',
};

export const API_SERVICES = {
  OSRM: 'osrm',
  OPENWEATHERMAP: 'openweathermap',
};

export const CHECKPOINT_STATUSES = {
  OPEN: 'open',
  SLOW: 'slow',
  CLOSED: 'closed',
};
