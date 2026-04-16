/* eslint-disable camelcase */
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  buildCheckpointListQuery,
  buildCheckpointReportPayload,
  buildIncidentListQuery,
  buildRoutePayload,
  buildStandardReportPayload,
  buildSummary,
  chance,
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
    http_req_duration: ['p(95)<2800', 'avg<850'],
    expected_throttle_rate: ['rate<0.10'],
    business_reject_rate: ['rate<0.08'],
    server_error_rate: ['rate<0.02'],
    transport_failure_rate: ['rate<0.01'],
    incidents_list_duration: ['p(95)<1000'],
    checkpoints_list_duration: ['p(95)<900'],
    report_submit_duration: ['p(95)<2600'],
    route_estimate_duration: ['p(95)<3500'],
  },
  tags: {
    test_type: 'mixed',
  },
};

export default function (setupData) {
  const incidentSession = getSession(setupData, 'incidents');
  const reportSession = getSession(setupData, 'reports');
  const incidentHeaders = jsonHeaders(incidentSession.token);
  const reportHeaders = jsonHeaders(reportSession.token);
  const roll = Math.random();

  if (roll < 0.45) {
    const response = http.get(
      `${BASE_URL}/incidents?${buildIncidentListQuery(setupData.fixtures)}`,
      {
        headers: incidentHeaders,
        tags: { endpoint: 'incidents-list', workload_mix: 'read' },
      }
    );
    recordResponse('incidents_list', response);
    check(response, {
      'mixed incidents list returns 200': (res) => res.status === 200,
      'mixed incidents list payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else if (roll < 0.7) {
    const response = http.get(`${BASE_URL}/checkpoints?${buildCheckpointListQuery()}`, {
      headers: incidentHeaders,
      tags: { endpoint: 'checkpoints-list', workload_mix: 'read' },
    });
    recordResponse('checkpoints_list', response);
    check(response, {
      'mixed checkpoints list returns 200': (res) => res.status === 200,
      'mixed checkpoints list payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else if (roll < 0.85) {
    const payload = chance(0.65)
      ? buildStandardReportPayload(setupData.fixtures)
      : buildCheckpointReportPayload(setupData.fixtures);
    const response = http.post(`${BASE_URL}/reports`, JSON.stringify(payload), {
      headers: reportHeaders,
      tags: {
        endpoint: 'report-submit',
        workload_mix: 'write',
      },
    });
    recordResponse('report_submit', response, { throttleStatuses: [429], businessStatuses: [409] });
    check(response, {
      'mixed report submit accepted status': (res) =>
        res.status === 201 || res.status === 409 || res.status === 429,
    });
  } else {
    const response = http.post(
      `${BASE_URL}/routes/estimate`,
      JSON.stringify(buildRoutePayload(setupData.fixtures)),
      {
        headers: incidentHeaders,
        tags: { endpoint: 'route-estimate', workload_mix: 'heavy-read' },
      }
    );
    recordResponse('route_estimate', response, { throttleStatuses: [429], businessStatuses: [] });
    check(response, {
      'mixed route estimate returns success status': (res) =>
        res.status === 200 || res.status === 201,
      'mixed route estimate payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  }

  sleep(sleepRange(1.0, 2.2));
}

export function handleSummary(data) {
  return buildSummary(data, 'mixed', [
    'auth_login',
    'incidents_list',
    'checkpoints_list',
    'report_submit',
    'route_estimate',
  ]);
}
