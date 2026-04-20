/* eslint-disable camelcase */
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  buildCheckpointReportPayload,
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
    { duration: '30s', target: 15 },
    { duration: '2m', target: 15 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'avg<1200'],
    expected_throttle_rate: ['rate<0.18'],
    business_reject_rate: ['rate<0.12'],
    server_error_rate: ['rate<0.02'],
    transport_failure_rate: ['rate<0.01'],
    report_submit_duration: ['p(95)<2600'],
  },
  tags: {
    test_type: 'write-heavy',
  },
};

export default function (setupData) {
  const session = getSession(setupData, 'reports');
  const headers = jsonHeaders(session.token);
  const payload = chance(0.7)
    ? buildStandardReportPayload(setupData.fixtures)
    : buildCheckpointReportPayload(setupData.fixtures);

  const response = http.post(`${BASE_URL}/reports`, JSON.stringify(payload), {
    headers,
    tags: {
      endpoint: 'report-submit',
      report_shape: payload.location ? 'standard' : 'checkpoint',
    },
  });

  recordResponse('report_submit', response, { throttleStatuses: [429], businessStatuses: [409] });

  check(response, {
    'report submit returns accepted status': (res) =>
      res.status === 201 || res.status === 409 || res.status === 429,
    'report submit successful payload when created': (res) => {
      if (res.status !== 201) {
        return true;
      }

      return safeJson(res.body)?.success === true;
    },
  });

  sleep(sleepRange(1.8, 2.8));
}

export function handleSummary(data) {
  return buildSummary(data, 'write-heavy', ['auth_login', 'report_submit']);
}
