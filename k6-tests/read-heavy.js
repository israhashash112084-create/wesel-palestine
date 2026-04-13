import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000/api/v1';
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0ZWExNzcxLWNkZjAtNDEzMC1hZGM1LTZlZTViZmZlZjM5YSIsImVtYWlsIjoiYXNlZWxAdGVzdC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NzU4MTEyNjYsImV4cCI6MTc3NTgxMjE2Nn0.yylxwfv3RF06sz-LYe3OJqwZ1-y4VPhYONnwfG2wA-c';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '1m',  target: 20 },  // stay
    { duration: '10s', target: 0  },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.01'],
  },
};

const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

export default function () {
  // 1. List incidents
  const incidentsRes = http.get(`${BASE_URL}/incidents?page=1&limit=10`, { headers });
  check(incidentsRes, {
    'incidents list - status 200': (r) => r.status === 200,
    'incidents list - has data':   (r) => JSON.parse(r.body).success === true,
  });

  sleep(1);

  // 2. List checkpoints
  const checkpointsRes = http.get(`${BASE_URL}/checkpoints?page=1&limit=10`, { headers });
  check(checkpointsRes, {
    'checkpoints list - status 200': (r) => r.status === 200,
  });

  sleep(1);

  // 3. Nearby incidents
  const nearbyRes = http.get(
    `${BASE_URL}/incidents/nearby?lat=32.2211&lng=35.2544&radiusMeters=5000`,
    { headers }
  );
  check(nearbyRes, {
    'nearby incidents - status 200': (r) => r.status === 200,
  });

  sleep(1);
}