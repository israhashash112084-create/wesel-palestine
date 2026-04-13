import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000/api/v1';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'aseel@test.com', password: '12345678' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return { token: JSON.parse(res.body).data.accessToken };
}

export const options = {
  stages: [
    { duration: '10s', target: 5   },  // normal
    { duration: '10s', target: 100 },  // spike!
    { duration: '30s', target: 100 },  // stay high
    { duration: '10s', target: 5   },  // back to normal
    { duration: '10s', target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed:   ['rate<0.10'],
  },
};

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const res = http.get(`${BASE_URL}/incidents?page=1&limit=10`, { headers });
  check(res, { 'spike - status 200': (r) => r.status === 200 });

  sleep(1);
}