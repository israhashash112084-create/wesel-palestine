import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000/api/v1';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'aseel@test.com', password: '12345678' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const token = JSON.parse(res.body).data.accessToken;
  return { token };
}

export const options = {
  stages: [
    { duration: '30s', target: 15 },
    { duration: '1m',  target: 15 },
    { duration: '10s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.05'],
  },
};

const CHECKPOINT_IDS = [1, 2, 3];
const STATUSES = ['open', 'closed', 'slow'];

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const checkpointId = CHECKPOINT_IDS[Math.floor(Math.random() * CHECKPOINT_IDS.length)];
  const proposedStatus = STATUSES[Math.floor(Math.random() * STATUSES.length)];

  const body = JSON.stringify({
    checkpointId,
    proposedCheckpointStatus: proposedStatus,
  });

  const res = http.post(`${BASE_URL}/reports`, body, { headers });

    console.log(res.status, res.body); 
  
    check(res, {
    'submit report - status 201': (r) => r.status === 201,
    'submit report - success': (r) => {
      try { return JSON.parse(r.body).success === true; }
      catch { return false; }
    },
  });

  sleep(2);
}