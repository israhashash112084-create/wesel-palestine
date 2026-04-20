/* eslint-disable camelcase */
/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  buildCheckpointListQuery,
  buildIncidentListQuery,
  buildRoutePayload,
  buildSummary,
  getSession,
  jsonHeaders,
  recordResponse,
  safeJson,
  setupLoadTestData,
  sleepRange,
} from './lib/shared.js';

const SOAK_VUS = Number(__ENV.K6_SOAK_VUS || 12);
const SOAK_DURATION = __ENV.K6_SOAK_DURATION || '15m';

export function setup() {
  return setupLoadTestData();
}

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: SOAK_VUS,
      duration: SOAK_DURATION,
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3200', 'avg<850'],
    expected_throttle_rate: ['rate<0.03'],
    business_reject_rate: ['rate<0.02'],
    server_error_rate: ['rate<0.01'],
    transport_failure_rate: ['rate<0.01'],
    incidents_list_duration: ['p(95)<1000'],
    checkpoints_list_duration: ['p(95)<900'],
    route_estimate_duration: ['p(95)<3600'],
    alerts_my_duration: ['p(95)<900'],
  },
  tags: {
    test_type: 'soak',
  },
};

export default function (setupData) {
  const session = getSession(setupData);
  const headers = jsonHeaders(session.token);

  const incidentsResponse = http.get(
    `${BASE_URL}/incidents?${buildIncidentListQuery(setupData.fixtures)}`,
    {
      headers,
      tags: { endpoint: 'incidents-list', soak_phase: 'steady' },
    }
  );
  recordResponse('incidents_list', incidentsResponse);
  check(incidentsResponse, {
    'soak incidents list returns 200': (res) => res.status === 200,
    'soak incidents payload is successful': (res) => safeJson(res.body)?.success === true,
  });

  sleep(sleepRange(1.4, 2.2));

  const checkpointsResponse = http.get(`${BASE_URL}/checkpoints?${buildCheckpointListQuery()}`, {
    headers,
    tags: { endpoint: 'checkpoints-list', soak_phase: 'steady' },
  });
  recordResponse('checkpoints_list', checkpointsResponse);
  check(checkpointsResponse, {
    'soak checkpoints list returns 200': (res) => res.status === 200,
    'soak checkpoints payload is successful': (res) => safeJson(res.body)?.success === true,
  });

  sleep(sleepRange(1.2, 2.0));

  if (Math.random() < 0.2) {
    const routeResponse = http.post(
      `${BASE_URL}/routes/estimate`,
      JSON.stringify(buildRoutePayload(setupData.fixtures)),
      {
        headers,
        tags: { endpoint: 'route-estimate', soak_phase: 'steady' },
      }
    );
    recordResponse('route_estimate', routeResponse, {
      throttleStatuses: [429],
      businessStatuses: [],
    });
    check(routeResponse, {
      'soak route estimate returns success status': (res) =>
        res.status === 200 || res.status === 201,
      'soak route payload is successful': (res) => safeJson(res.body)?.success === true,
    });

    sleep(sleepRange(1.5, 2.5));
  }

  const alertsResponse = http.get(`${BASE_URL}/alerts`, {
    headers,
    tags: { endpoint: 'alerts-my', soak_phase: 'steady' },
  });
  recordResponse('alerts_my', alertsResponse);
  check(alertsResponse, {
    'soak my alerts returns 200': (res) => res.status === 200,
    'soak my alerts payload is successful': (res) => safeJson(res.body)?.success === true,
  });

  sleep(sleepRange(1.5, 2.5));
}

export function handleSummary(data) {
  return buildSummary(data, 'soak', [
    'auth_login',
    'incidents_list',
    'checkpoints_list',
    'route_estimate',
    'alerts_my',
  ]);
}
