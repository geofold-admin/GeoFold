// Generate an EC P-256 keypair, a JWKS (public), and real ES256 JWTs.
// Used ONLY for load testing: the backend verifies these against a local JWKS
// stub, exercising the EXACT same ES256 verification path as prod. The prod
// signing key is inaccessible, so this is the honest way to measure the path.
const crypto = require('crypto');
const fs = require('fs');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

// Export public key as JWK (for the JWKS endpoint the backend fetches)
const pubJwk = publicKey.export({ format: 'jwk' });
const kid = 'test-kid-0001';
const jwks = {
  keys: [{
    kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y,
    alg: 'ES256', use: 'sig', kid,
  }],
};

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signToken(sub, email, expSeconds) {
  const header = { alg: 'ES256', typ: 'JWT', kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    email,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + expSeconds,
    user_metadata: { name: 'Load Test' },
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = Buffer.from(`${h}.${p}`);
  const sig = crypto.sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${b64url(sig)}`;
}

// 60 STABLE users (one identity each) — realistic: the same user hits the API
// repeatedly, so the 60s user cache is actually exercised.
const tokens = [];
for (let i = 0; i < 60; i++) {
  const sub = crypto.randomUUID();
  tokens.push({ sub, email: `loadtest+${i}@geofold.sayba.id`, token: signToken(sub, `loadtest+${i}@geofold.sayba.id`, 7200) });
}

const dir = require('path').join(__dirname, 'jwks-test');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(`${dir}/jwks.json`, JSON.stringify(jwks, null, 2));
fs.writeFileSync(`${dir}/tokens.json`, JSON.stringify(tokens, null, 2));
fs.writeFileSync(`${dir}/private.pem`, privateKey.export({ type: 'pkcs8', format: 'pem' }));
console.log('Generated keypair, JWKS, and', tokens.length, 'ES256 tokens');
console.log('kid:', kid);
console.log('sample token length:', tokens[0].token.length);
