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
    { duration: '1m',  target: 10 },  // ramp up
    { duration: '8m',  target: 10 },  // sustained load
    { duration: '1m',  target: 0  },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const res = http.get(`${BASE_URL}/incidents?page=1&limit=10`, { headers });
  check(res, { 'soak - status 200': (r) => r.status === 200 });

  sleep(1);
}