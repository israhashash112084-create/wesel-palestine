/* eslint-disable camelcase */
/* global __ENV */
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000/api/v1';
export const DEFAULT_PASSWORD = __ENV.K6_PASSWORD || 'Wesal@1234';
//export const DEFAULT_PASSWORD = __ENV.K6_PASSWORD || '12345678';


export const USER_POOL_SIZE = Number(__ENV.K6_USER_POOL_SIZE || 24);
export const MODERATOR_POOL_SIZE = Number(__ENV.K6_MODERATOR_POOL_SIZE || USER_POOL_SIZE);
//export const USER_POOL_SIZE = 1;
//export const MODERATOR_POOL_SIZE = 1;



const WEST_BANK_BOUNDS = {
  minLat: 31.2,
  maxLat: 32.6,
  minLng: 34.9,
  maxLng: 35.6,
};

const TRAFFIC_STATUSES = ['open', 'closed', 'slow', 'unknown'];
const INCIDENT_TYPES = [
  'closure',
  'delay',
  'accident',
  'military_activity',
  'weather_hazard',
  'road_damage',
  'construction',
  'other',
];
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'];

const OPERATION_LABELS = {
  auth_login: 'Auth login',
  incidents_list: 'Incidents list',
  incidents_nearby: 'Incidents nearby',
  checkpoints_list: 'Checkpoints list',
  checkpoints_nearby: 'Checkpoints nearby',
  route_estimate: 'Route estimate',
  report_submit: 'Report submit',
  alerts_my: 'My alerts',
};

const operationMetrics = {};
for (const key of Object.keys(OPERATION_LABELS)) {
  operationMetrics[key] = {
    duration: new Trend(`${key}_duration`, true),
    requests: new Counter(`${key}_requests`),
  };
}

const classificationMetrics = {
  successRate: new Rate('success_rate'),
  throttledRate: new Rate('expected_throttle_rate'),
  businessRejectRate: new Rate('business_reject_rate'),
  serverErrorRate: new Rate('server_error_rate'),
  transportFailureRate: new Rate('transport_failure_rate'),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function chance(probability) {
  return Math.random() < probability;
}

export function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function sleepRange(minSeconds, maxSeconds) {
  const duration = minSeconds + Math.random() * (maxSeconds - minSeconds);
  return duration;
}

function buildUserEmails(count = USER_POOL_SIZE) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return `k6.load.user${suffix}@test.com`;
  });
}
/*
function buildUserEmails(count = USER_POOL_SIZE) {
  return Array.from({ length: count }, () => 'aseel@test.com');
}*/


function buildModeratorEmails(count = MODERATOR_POOL_SIZE) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return `k6.load.mod${suffix}@test.com`;
    
  });
}



/*
function buildModeratorEmails(count = MODERATOR_POOL_SIZE) {
  return Array.from({ length: count }, () => 'aseel@test.com');
}*/

export function jsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function safeJson(body) {
  if (!body) return null;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalizeCheckpoint(item) {
  return {
    id: Number(item.id),
    name: item.name,
    city: item.city,
    area: item.area,
    status: item.status,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  };
}

function normalizeIncident(item) {
  return {
    id: Number(item.id),
    type: item.type,
    status: item.status,
    severity: item.severity,
    city: item.city,
    area: item.area,
    trafficStatus: item.trafficStatus,
    latitude: Number(item.locationLat),
    longitude: Number(item.locationLng),
  };
}

function extractArray(payload, collectionKey) {
  const parsed = safeJson(payload.body);
  if (!parsed || parsed.success !== true || !parsed.data) {
    return [];
  }

  return Array.isArray(parsed.data[collectionKey]) ? parsed.data[collectionKey] : [];
}

export function recordResponse(operationKey, response, options = {}) {
  const operation = operationMetrics[operationKey];
  if (!operation) {
    throw new Error(`Unknown operation key: ${operationKey}`);
  }

  operation.duration.add(response.timings.duration);
  operation.requests.add(1);

  const throttleStatuses = options.throttleStatuses || [429];
  const businessStatuses = options.businessStatuses || [409];
  const isTransportFailure = Boolean(response.error) || response.status === 0;
  const isThrottled = throttleStatuses.includes(response.status);
  const isBusinessReject = businessStatuses.includes(response.status);
  const isServerError = response.status >= 500;
  const isSuccess = response.status >= 200 && response.status < 300;

  classificationMetrics.successRate.add(isSuccess ? 1 : 0);
  classificationMetrics.throttledRate.add(isThrottled ? 1 : 0);
  classificationMetrics.businessRejectRate.add(isBusinessReject ? 1 : 0);
  classificationMetrics.serverErrorRate.add(isServerError ? 1 : 0);
  classificationMetrics.transportFailureRate.add(isTransportFailure ? 1 : 0);
}

function loginUser(email) {
  const payload = JSON.stringify({ email, password: DEFAULT_PASSWORD });
  const response = http.post(`${BASE_URL}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth-login' },
  });

  recordResponse('auth_login', response, { throttleStatuses: [], businessStatuses: [] });

  const body = safeJson(response.body);
  if (response.status !== 200 || !body?.data?.accessToken) {
    throw new Error(`Failed to login load-test user ${email}: ${response.status} ${response.body}`);
  }

  return {
    email,
    token: body.data.accessToken,
  };
}

function discoverCheckpoints(token) {
  const response = http.get(
    `${BASE_URL}/checkpoints?page=1&limit=100&sortBy=createdAt&sortOrder=desc`,
    {
      headers: jsonHeaders(token),
      tags: { endpoint: 'checkpoints-discovery' },
    }
  );

  const items = extractArray(response, 'checkpoints')
    .map(normalizeCheckpoint)
    .filter((item) => item.id);
  if (items.length === 0) {
    throw new Error('Checkpoint discovery returned no data. Seed the database before running k6.');
  }

  return items;
}

function discoverIncidents(token) {
  const response = http.get(
    `${BASE_URL}/incidents?page=1&limit=100&sortBy=createdAt&sortOrder=desc`,
    {
      headers: jsonHeaders(token),
      tags: { endpoint: 'incidents-discovery' },
    }
  );

  return extractArray(response, 'incidents')
    .map(normalizeIncident)
    .filter((item) => item.id);
}

function buildNearbyTargets(checkpoints, incidents) {
  const points = [...checkpoints, ...incidents]
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item) => ({
      latitude: item.latitude,
      longitude: item.longitude,
      city: item.city || 'West Bank',
      area: item.area || 'Operational Zone',
    }));

  if (points.length > 0) {
    return points;
  }

  return [
    { latitude: 32.2211, longitude: 35.2544, city: 'Nablus', area: 'Southern Bypass' },
    { latitude: 31.9322, longitude: 35.2054, city: 'Ramallah', area: 'North Link' },
  ];
}

function buildRoutePairs(checkpoints) {
  const pairs = [];
  for (let index = 0; index < checkpoints.length; index += 1) {
    const from = checkpoints[index];
    const to = checkpoints[(index + 3) % checkpoints.length];

    if (!from || !to || from.id === to.id) {
      continue;
    }

    pairs.push({
      from: { lat: from.latitude, lng: from.longitude },
      to: { lat: to.latitude, lng: to.longitude },
    });
  }

  return pairs.length > 0
    ? pairs
    : [{ from: { lat: 32.2211, lng: 35.2544 }, to: { lat: 31.95, lng: 35.15 } }];
}

export function setupLoadTestData() {
  // Incidents endpoints require MODERATOR/ADMIN authorization.
  const incidentSessions = buildModeratorEmails().map((email) => loginUser(email));
  // Reports submission should use non-moderator users so reports remain PENDING
  // during the test window (avoids moderator auto-approval paths).
  const reportSessions = buildUserEmails().map((email) => loginUser(email));

  const probeToken = incidentSessions[0].token;
  const checkpoints = discoverCheckpoints(probeToken);
  const incidents = discoverIncidents(probeToken);

  return {
    incidentSessions,
    reportSessions,
    fixtures: {
      checkpoints,
      incidents,
      nearbyTargets: buildNearbyTargets(checkpoints, incidents),
      routePairs: buildRoutePairs(checkpoints),
    },
  };
}

export function getSession(setupData, pool = 'incidents') {
  const sessions =
    pool === 'incidents' ? setupData.incidentSessions || [] : setupData.reportSessions || [];
  if (sessions.length === 0) {
    throw new Error('No authenticated load-test sessions available.');
  }

  const vuIndex = exec.vu.idInTest ? exec.vu.idInTest - 1 : 0;
  return sessions[vuIndex % sessions.length];
}

export function buildIncidentListQuery(fixtures) {
  const statuses = ['verified', 'pending', 'closed'];
  const severities = ['low', 'medium', 'high'];
  const limit = pickRandom([10, 15, 20]);
  const page = pickRandom([1, 1, 1, 2]);
  const params = [`page=${page}`, `limit=${limit}`, `status=${pickRandom(statuses)}`];

  if (chance(0.4)) {
    params.push(`severity=${pickRandom(severities)}`);
  }

  if (fixtures.incidents.length > 0 && chance(0.35)) {
    params.push(`type=${pickRandom(fixtures.incidents).type}`);
  }

  return params.join('&');
}

export function buildCheckpointListQuery() {
  const statuses = ['open', 'closed', 'slow', 'unknown'];
  const limit = pickRandom([10, 15, 20]);
  const page = pickRandom([1, 1, 2]);
  const params = [`page=${page}`, `limit=${limit}`, `sortBy=createdAt`, `sortOrder=desc`];

  if (chance(0.5)) {
    params.push(`status=${pickRandom(statuses)}`);
  }

  return params.join('&');
}

export function buildNearbyQuery(fixtures) {
  const anchor = pickRandom(fixtures.nearbyTargets);
  const latJitter = (Math.random() - 0.5) * 0.02;
  const lngJitter = (Math.random() - 0.5) * 0.02;

  return {
    lat: clamp(
      anchor.latitude + latJitter,
      WEST_BANK_BOUNDS.minLat,
      WEST_BANK_BOUNDS.maxLat
    ).toFixed(6),
    lng: clamp(
      anchor.longitude + lngJitter,
      WEST_BANK_BOUNDS.minLng,
      WEST_BANK_BOUNDS.maxLng
    ).toFixed(6),
    radiusMeters: pickRandom([1500, 2500, 5000, 8000]),
  };
}

export function buildRoutePayload(fixtures) {
  const pair = pickRandom(fixtures.routePairs);
  return {
    from: pair.from,
    to: pair.to,
    include_geometry: chance(0.75),
  };
}

export function buildCheckpointReportPayload(fixtures) {
  const checkpoint = pickRandom(fixtures.checkpoints);
  const statuses = TRAFFIC_STATUSES.filter((status) => status !== checkpoint.status);
  const vuId = exec.vu.idInTest || 0;
  const iteration = exec.scenario.iterationInTest || 0;

  return {
    checkpointId: checkpoint.id,
    proposedCheckpointStatus: pickRandom(statuses.length > 0 ? statuses : TRAFFIC_STATUSES),
    description: `k6 checkpoint update vu-${vuId} iter-${iteration} cp-${checkpoint.id}`,
  };
}

export function buildStandardReportPayload(fixtures) {
  const anchor = pickRandom(fixtures.nearbyTargets);
  const latitude = clamp(
    anchor.latitude + (Math.random() - 0.5) * 0.03,
    WEST_BANK_BOUNDS.minLat,
    WEST_BANK_BOUNDS.maxLat
  );
  const longitude = clamp(
    anchor.longitude + (Math.random() - 0.5) * 0.03,
    WEST_BANK_BOUNDS.minLng,
    WEST_BANK_BOUNDS.maxLng
  );
  const vuId = exec.vu.idInTest || 0;
  const iteration = exec.scenario.iterationInTest || 0;

  return {
    location: {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    },
    type: pickRandom(INCIDENT_TYPES),
    severity: pickRandom(INCIDENT_SEVERITIES),
    description: `k6 field report vu-${vuId} iter-${iteration} zone-${anchor.city}`,
  };
}

function metricValues(data, metricName) {
  return data.metrics[metricName]?.values || {};
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : 'n/a';
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'n/a';
}

function formatCount(value) {
  return Number.isFinite(value) ? `${Math.round(value)}` : '0';
}

function buildOperationSummary(data, operationKey) {
  const duration = metricValues(data, `${operationKey}_duration`);
  const requests = metricValues(data, `${operationKey}_requests`);

  return {
    operation: OPERATION_LABELS[operationKey],
    requests: Number(requests.count || 0),
    throughput: Number(requests.rate || 0),
    avg: Number(duration.avg || 0),
    p95: Number(duration['p(95)'] || 0),
  };
}

function textSummary(report) {
  const lines = [
    '',
    `k6 scenario: ${report.scenario}`,
    `avg response time: ${formatMs(report.overall.avgResponseTime)}`,
    `p95 latency: ${formatMs(report.overall.p95Latency)}`,
    `throughput: ${report.overall.throughput.toFixed(2)} req/s`,
    `total error rate: ${formatRate(report.overall.totalErrorRate)}`,
    `throttled rate (429): ${formatRate(report.classification.throttledRate)}`,
    `business reject rate (409): ${formatRate(report.classification.businessRejectRate)}`,
    `server error rate (5xx): ${formatRate(report.classification.serverErrorRate)}`,
    `transport failure rate: ${formatRate(report.classification.transportFailureRate)}`,
    '',
    'operation breakdown:',
  ];

  for (const operation of report.operations) {
    lines.push(
      `- ${operation.operation}: count=${formatCount(operation.requests)}, rps=${operation.throughput.toFixed(2)}, avg=${formatMs(operation.avg)}, p95=${formatMs(operation.p95)}`
    );
  }

  return `${lines.join('\n')}\n`;
}

export function buildSummary(data, scenario, operationKeys) {
  const report = {
    scenario,
    generatedAt: new Date().toISOString(),
    overall: {
      avgResponseTime: Number(metricValues(data, 'http_req_duration').avg || 0),
      p95Latency: Number(metricValues(data, 'http_req_duration')['p(95)'] || 0),
      throughput: Number(metricValues(data, 'http_reqs').rate || 0),
      totalErrorRate: Number(metricValues(data, 'http_req_failed').rate || 0),
    },
    classification: {
      successRate: Number(metricValues(data, 'success_rate').rate || 0),
      throttledRate: Number(metricValues(data, 'expected_throttle_rate').rate || 0),
      businessRejectRate: Number(metricValues(data, 'business_reject_rate').rate || 0),
      serverErrorRate: Number(metricValues(data, 'server_error_rate').rate || 0),
      transportFailureRate: Number(metricValues(data, 'transport_failure_rate').rate || 0),
    },
    operations: operationKeys.map((key) => buildOperationSummary(data, key)),
  };

  const summaryPath = __ENV.K6_SUMMARY_PATH || `k6-tests/${scenario}.summary.json`;
  return {
    stdout: textSummary(report),
    [summaryPath]: JSON.stringify(report, null, 2),
  };
}



/*
export function buildSummary(data, scenario, operationKeys) {
  const httpFailureRate = Number(metricValues(data, 'http_req_failed').rate || 0);
  const throttledRate = Number(metricValues(data, 'expected_throttle_rate').rate || 0);
  const businessRejectRate = Number(metricValues(data, 'business_reject_rate').rate || 0);

  const report = {
    scenario,
    generatedAt: new Date().toISOString(),
    overall: {
      avgResponseTime: Number(metricValues(data, 'http_req_duration').avg || 0),
      p95Latency: Number(metricValues(data, 'http_req_duration')['p(95)'] || 0),
      throughput: Number(metricValues(data, 'http_reqs').rate || 0),
      httpFailureRate,
      effectiveFailureRate: Math.max(0, httpFailureRate - throttledRate - businessRejectRate),
    },
    classification: {
      successRate: Number(metricValues(data, 'success_rate').rate || 0),
      throttledRate,
      businessRejectRate,
      serverErrorRate: Number(metricValues(data, 'server_error_rate').rate || 0),
      transportFailureRate: Number(metricValues(data, 'transport_failure_rate').rate || 0),
    },
    operations: operationKeys.map((key) => buildOperationSummary(data, key)),
  };

  const summaryPath = __ENV.K6_SUMMARY_PATH || `k6-tests/${scenario}.summary.json`;
  return {
    stdout: textSummary(report),
    [summaryPath]: JSON.stringify(report, null, 2),
  };
}

function textSummary(report) {
  const lines = [
    '',
    `k6 scenario: ${report.scenario}`,
    `avg response time: ${formatMs(report.overall.avgResponseTime)}`,
    `p95 latency: ${formatMs(report.overall.p95Latency)}`,
    `throughput: ${report.overall.throughput.toFixed(2)} req/s`,
    `http failure rate: ${formatRate(report.overall.httpFailureRate)}`,
    `effective failure rate (excluding 409/429): ${formatRate(report.overall.effectiveFailureRate)}`,
    `throttled rate (429): ${formatRate(report.classification.throttledRate)}`,
    `business reject rate (409): ${formatRate(report.classification.businessRejectRate)}`,
    `server error rate (5xx): ${formatRate(report.classification.serverErrorRate)}`,
    `transport failure rate: ${formatRate(report.classification.transportFailureRate)}`,
    '',
    'operation breakdown:',
  ];

  for (const operation of report.operations) {
    lines.push(
      `- ${operation.operation}: count=${formatCount(operation.requests)}, rps=${operation.throughput.toFixed(2)}, avg=${formatMs(operation.avg)}, p95=${formatMs(operation.p95)}`
    );
  }

  return `${lines.join('\n')}\n`;
}*/