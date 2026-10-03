// GeoFold VPS capacity test — realistic user flow, external machine.
//   k6 run -e TEST_IMG=$(cat testimg.b64) k6_script.js
//
// Ramp 1 -> 50 VUs (2m), hold (3m), ramp down (30s). Think time 5-10s per step.
// Thresholds are REPORTED, not aborting, so the first run completes and we
// learn where latency actually bends instead of dying at 1 VU.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { b64encode, b64decode } from 'k6/encoding';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE = 'https://api.geofold.sayba.id';
const TEST_IMAGE_B64 = __ENV.TEST_IMG || '';

const authFailRate = new Rate('auth_failures');
const uploadLatency = new Trend('upload_latency', true);
const viewLatency = new Trend('view_latency', true);
const downloadLatency = new Trend('download_latency', true);
const listLatency = new Trend('list_latency', true);

export const options = {
  scenarios: {
    realistic: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  // Reported thresholds — NO abortOnFail, so run 1 completes end-to-end.
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<500', 'p(99)<1000'],
    'auth_failures': ['rate<0.01'],
    'http_req_failed': ['rate<0.02'],
  },
};

// Deterministic valid UUID per (vu, iter) — users.supabase_id is uuid type.
function makeUuid(vu, iter) {
  const s = (vu * 1000000 + iter).toString(16).padEnd(32, '0');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

function makeToken(vu, iter) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' }), 'rawurl');
  const payload = b64encode(JSON.stringify({
    sub: makeUuid(vu, iter),
    aud: 'authenticated',
    role: 'authenticated',
    email: `k6-${vu}-${iter}@loadtest.local`,
    iat: now,
    exp: now + 7200,
  }), 'rawurl');
  return `${header}.${payload}.notarealsignature`;
}

export default function () {
  const token = makeToken(__VU, __ITER);
  const authHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const path = `k6/vu${__VU}-it${__ITER}`;

  // 1. Auth — local JWT verify + user upsert (cached 60s)
  let res = http.get(`${BASE}/api/user/me`, { headers: authHeaders, tags: { step: 'auth' } });
  authFailRate.add(res.status !== 200);
  check(res, { 'auth 200': (r) => r.status === 200 });
  sleep(5 + Math.random() * 5);

  // 2. Upload — Sharp conversion through the serialised queue
  const t0 = Date.now();
  res = http.put(`${BASE}/api/storage/raw?path=${path}`, b64decode(TEST_IMAGE_B64, 'rawstd'), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    tags: { step: 'upload' },
  });
  uploadLatency.add(Date.now() - t0);
  check(res, { 'upload ok': (r) => r.status === 200 || r.status === 201 });
  sleep(5 + Math.random() * 5);

  // 3. View — nested path, served by Caddy off disk (Node not involved)
  const t1 = Date.now();
  res = http.get(`${BASE}/api/pictures/view/${path}.webp`, { headers: authHeaders, tags: { step: 'view' } });
  viewLatency.add(Date.now() - t1);
  check(res, { 'view 200': (r) => r.status === 200 });
  sleep(5 + Math.random() * 5);

  // 4. Download — WebP -> PNG on the fly, serialised queue
  const t2 = Date.now();
  res = http.get(`${BASE}/api/storage/download?path=${path}`, { headers: authHeaders, tags: { step: 'download' } });
  downloadLatency.add(Date.now() - t2);
  check(res, { 'download 200': (r) => r.status === 200 });
  sleep(5 + Math.random() * 5);

  // 5. List — in-memory cache, 30s TTL
  const t3 = Date.now();
  res = http.get(`${BASE}/api/pictures/`, { headers: authHeaders, tags: { step: 'list' } });
  listLatency.add(Date.now() - t3);
  check(res, { 'list 200': (r) => r.status === 200 });
  sleep(5 + Math.random() * 5);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'k6-summary.json': JSON.stringify(data, null, 2),
  };
}
