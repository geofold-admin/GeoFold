// GeoFold API load test — REAL ES256 tokens, real JWKS verification path.
//
// Uses 60 pre-generated ES256 tokens (one stable identity per user), so the
// backend's 60s user cache is exercised the way real traffic exercises it.
// The JWKS is served by a local stub that the test backend fetches — the
// verification code path is byte-for-byte the production one.
//
// Flow per iteration (realistic user journey + think time):
//   1. auth     GET  /api/user/me
//   2. list     GET  /api/pictures/
//   3. upload   PUT  /api/storage/raw?path=...      (Sharp → WebP)
//   4. view     GET  /api/pictures/view/...webp      (Caddy/static)
//   5. download GET  /api/storage/download?path=...  (PNG, cached after 1st)
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE = __ENV.BASE || 'http://127.0.0.1:8081';
const TOKENS = JSON.parse(open(__ENV.TOKENS || '/tmp/loadtest/jwks/tokens.json'));
// open() MUST be called in the init (global) scope — load the photo once.
const PHOTO = open(__ENV.PHOTO || '/tmp/loadtest/testimg.jpg', 'b');

const authT = new Trend('step_auth', true);
const listT = new Trend('step_list', true);
const uploadT = new Trend('step_upload', true);
const viewT = new Trend('step_view', true);
const downloadT = new Trend('step_download', true);
const errRate = new Rate('step_errors');
const timeouts = new Counter('socket_timeouts');

// Report-only thresholds: the ramp must COMPLETE so we get data at every level.
export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 150 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    step_errors: ['rate<0.99'], // report-only
  },
};

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

export default function () {
  // Stable identity per VU: reuse the same token across iterations so the
  // server-side 60s user cache behaves like real traffic.
  const u = TOKENS[(__VU - 1) % TOKENS.length];
  const h = authHeaders(u.token);
  const path = `loadtest/vu${__VU}/img${__ITER}`;

  group('auth', () => {
    const r = http.get(`${BASE}/api/user/me`, { headers: h, tags: { step: 'auth' } });
    authT.add(r.timings.duration);
    const ok = check(r, { 'auth 200': (x) => x.status === 200 });
    errRate.add(!ok);
    if (r.error_code) timeouts.add(1);
  });
  sleep(1);

  group('list', () => {
    const r = http.get(`${BASE}/api/pictures/`, { headers: h, tags: { step: 'list' } });
    listT.add(r.timings.duration);
    const ok = check(r, { 'list 200': (x) => x.status === 200 });
    errRate.add(!ok);
  });
  sleep(1);

  group('upload', () => {
    const r = http.put(`${BASE}/api/storage/raw?path=${path}`, PHOTO, {
      headers: { ...h, 'Content-Type': 'image/jpeg' },
      tags: { step: 'upload' },
    });
    uploadT.add(r.timings.duration);
    const ok = check(r, { 'upload 200': (x) => x.status === 200 });
    errRate.add(!ok);
  });
  sleep(1);

  group('view', () => {
    const r = http.get(`${BASE}/api/pictures/view/${path}.webp`, { headers: h, tags: { step: 'view' } });
    viewT.add(r.timings.duration);
    const ok = check(r, { 'view 200': (x) => x.status === 200 });
    errRate.add(!ok);
  });
  sleep(1);

  group('download', () => {
    const r = http.get(`${BASE}/api/storage/download?path=${path}`, { headers: h, tags: { step: 'download' } });
    downloadT.add(r.timings.duration);
    const ok = check(r, { 'download 200': (x) => x.status === 200 });
    errRate.add(!ok);
  });
  sleep(2);
}

export function handleSummary(data) {
  return {
    '/tmp/loadtest/k6-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
  };
}
