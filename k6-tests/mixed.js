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
    { duration: '30s', target: 20 },
    { duration: '1m',  target: 20 },
    { duration: '10s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.10'],
  },
};

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // 70% reads, 30% writes
  const rand = Math.random();

  if (rand < 0.7) {
    const res = http.get(`${BASE_URL}/checkpoints?page=1&limit=10`, { headers });
    check(res, { 'read - status 200': (r) => r.status === 200 });
  } else {
    const STATUSES = ['open', 'closed', 'slow'];
    const CHECKPOINT_IDS = [2, 3];
    const body = JSON.stringify({
      checkpointId: CHECKPOINT_IDS[Math.floor(Math.random() * CHECKPOINT_IDS.length)],
      proposedCheckpointStatus: STATUSES[Math.floor(Math.random() * STATUSES.length)],
    });
    const res = http.post(`${BASE_URL}/reports`, body, { headers });
    check(res, { 'write - status 201': (r) => r.status === 201 });
  }

  sleep(1);
}