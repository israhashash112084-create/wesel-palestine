/* eslint-disable camelcase */
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  buildCheckpointListQuery,
  buildCheckpointReportPayload,
  buildIncidentListQuery,
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
    { duration: '15s', target: 10 },
    { duration: '5s', target: 80 },
    { duration: '20s', target: 80 },
    { duration: '15s', target: 15 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<4500', 'avg<1400'],
    expected_throttle_rate: ['rate<0.30'],
    business_reject_rate: ['rate<0.12'],
    server_error_rate: ['rate<0.05'],
    transport_failure_rate: ['rate<0.02'],
    incidents_list_duration: ['p(95)<1400'],
    checkpoints_list_duration: ['p(95)<1300'],
    report_submit_duration: ['p(95)<3200'],
  },
  tags: {
    test_type: 'spike',
  },
};

export default function (setupData) {
  const incidentSession = getSession(setupData, 'incidents');
  const reportSession = getSession(setupData, 'reports');
  const incidentHeaders = jsonHeaders(incidentSession.token);
  const reportHeaders = jsonHeaders(reportSession.token);
  const roll = Math.random();

  if (roll < 0.5) {
    const response = http.get(
      `${BASE_URL}/incidents?${buildIncidentListQuery(setupData.fixtures)}`,
      {
        headers: incidentHeaders,
        tags: { endpoint: 'incidents-list', spike_phase: 'surge' },
      }
    );
    recordResponse('incidents_list', response);
    check(response, {
      'spike incidents list returns 200': (res) => res.status === 200,
      'spike incidents list payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else if (roll < 0.8) {
    const response = http.get(`${BASE_URL}/checkpoints?${buildCheckpointListQuery()}`, {
      headers: incidentHeaders,
      tags: { endpoint: 'checkpoints-list', spike_phase: 'surge' },
    });
    recordResponse('checkpoints_list', response);
    check(response, {
      'spike checkpoints list returns 200': (res) => res.status === 200,
      'spike checkpoints list payload is successful': (res) => safeJson(res.body)?.success === true,
    });
  } else {
    const payload = chance(0.6)
      ? buildStandardReportPayload(setupData.fixtures)
      : buildCheckpointReportPayload(setupData.fixtures);
    const response = http.post(`${BASE_URL}/reports`, JSON.stringify(payload), {
      headers: reportHeaders,
      tags: { endpoint: 'report-submit', spike_phase: 'surge' },
    });
    recordResponse('report_submit', response, { throttleStatuses: [429], businessStatuses: [409] });
    check(response, {
      'spike report submit accepted status': (res) =>
        res.status === 201 || res.status === 409 || res.status === 429,
    });
  }

  sleep(sleepRange(0.4, 1.0));
}

export function handleSummary(data) {
  return buildSummary(data, 'spike', [
    'auth_login',
    'incidents_list',
    'checkpoints_list',
    'report_submit',
  ]);
}
