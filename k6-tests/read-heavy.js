/* eslint-disable camelcase */
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  buildCheckpointListQuery,
  buildIncidentListQuery,
  buildNearbyQuery,
  buildRoutePayload,
  buildSummary,
  getSession,
  jsonHeaders,
  recordResponse,
  safeJson,
  setupLoadTestData,
  sleepRange,
} from './lib/shared.js';

export function setup() {
  return setupLoadTestData();
}

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2200', 'avg<700'],
    expected_throttle_rate: ['rate<0.01'],
    business_reject_rate: ['rate<0.01'],
    server_error_rate: ['rate<0.01'],
    transport_failure_rate: ['rate<0.01'],
    incidents_list_duration: ['p(95)<900'],
    checkpoints_list_duration: ['p(95)<900'],
    incidents_nearby_duration: ['p(95)<1400'],
    checkpoints_nearby_duration: ['p(95)<1400'],
    route_estimate_duration: ['p(95)<3500'],
  },
  tags: {
    test_type: 'read-heavy',
  },
};

export default function (setupData) {
  const session = getSession(setupData);
  const headers = jsonHeaders(session.token);
  const roll = Math.random();

  if (roll < 0.35) {
    const query = buildIncidentListQuery(setupData.fixtures);
    const response = http.get(`${BASE_URL}/incidents?${query}`, {
      headers,
      tags: { endpoint: 'incidents-list' },
    });
    recordResponse('incidents_list', response);
    check(response, {
      'incidents list returns 200': (res) => res.status === 200,
      'incidents list payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else if (roll < 0.6) {
    const query = buildCheckpointListQuery();
    const response = http.get(`${BASE_URL}/checkpoints?${query}`, {
      headers,
      tags: { endpoint: 'checkpoints-list' },
    });
    recordResponse('checkpoints_list', response);
    check(response, {
      'checkpoints list returns 200': (res) => res.status === 200,
      'checkpoints list payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else if (roll < 0.78) {
    const nearby = buildNearbyQuery(setupData.fixtures);
    const response = http.get(
      `${BASE_URL}/incidents/nearby?lat=${nearby.lat}&lng=${nearby.lng}&radiusMeters=${nearby.radiusMeters}`,
      {
        headers,
        tags: { endpoint: 'incidents-nearby' },
      }
    );
    recordResponse('incidents_nearby', response);
    check(response, {
      'incidents nearby returns 200': (res) => res.status === 200,
      'incidents nearby payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else if (roll < 0.9) {
    const nearby = buildNearbyQuery(setupData.fixtures);
    const response = http.get(
      `${BASE_URL}/checkpoints/nearby?lat=${nearby.lat}&lng=${nearby.lng}&radiusMeters=${nearby.radiusMeters}`,
      {
        headers,
        tags: { endpoint: 'checkpoints-nearby' },
      }
    );
    recordResponse('checkpoints_nearby', response);
    check(response, {
      'checkpoints nearby returns 200': (res) => res.status === 200,
      'checkpoints nearby payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else {
    const response = http.post(
      `${BASE_URL}/routes/estimate`,
      JSON.stringify(buildRoutePayload(setupData.fixtures)),
      {
        headers,
        tags: { endpoint: 'route-estimate' },
      }
    );
    recordResponse('route_estimate', response, { throttleStatuses: [429], businessStatuses: [] });
    check(response, {
      'route estimate returns success status': (res) => res.status === 200 || res.status === 201,
      'route estimate payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  }

  sleep(sleepRange(0.6, 1.4));
}

export function handleSummary(data) {
  return buildSummary(data, 'read-heavy', [
    'auth_login',
    'incidents_list',
    'checkpoints_list',
    'incidents_nearby',
    'checkpoints_nearby',
    'route_estimate',
  ]);
}
