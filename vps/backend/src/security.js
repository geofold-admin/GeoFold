const crypto = require('crypto');

/**
 * Request authentication between the Next.js API (Vercel) and this backend.
 *
 * One shared secret, GEOFOLD_VPS_SECRET, set on both sides. Two keys are derived from it so a
 * leaked storage URL signature can never be replayed as a payment-proxy signature or vice versa.
 *
 *  - Storage URLs (`/api/storage/*`) carry `exp` + `sig`: an HMAC over method, object path and
 *    expiry, issued by the Next.js API only to the owner of the survey. Without one, the storage
 *    routes refuse — before this, anyone who knew or guessed a path could read *or overwrite* a
 *    survey photo, and anyone at all could upload.
 *  - The iPaymu egress proxy (`/api/payment/proxy`) requires a signed, timestamped request, so
 *    only the Next.js API can make calls with the merchant credentials.
 *
 * Fail closed: with no secret configured, protected routes answer 503 rather than run open.
 */

const SECRET = process.env.GEOFOLD_VPS_SECRET || '';

function subkey(purpose) {
  return crypto.createHmac('sha256', SECRET).update(`geofold:${purpose}`).digest();
}

function configured() {
  return SECRET.length >= 32;
}

/**
 * A short public tag of the secret (its own derived key, so it reveals nothing about the others).
 * The Next.js API shows the same tag on /api/health; deploy.sh compares the two so a deploy stops
 * when the VPS and Vercel hold different secrets — which would make every signature fail.
 */
function fingerprint() {
  return configured() ? subkey('fingerprint').toString('hex').slice(0, 12) : null;
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]+$/i.test(a)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/* ── storage URLs ───────────────────────────────────────────────────────── */

/** Longest validity accepted, whatever a URL claims — bounds the damage of a leaked link. */
const MAX_URL_TTL_SECONDS = 24 * 60 * 60;

function storageSignature(scope, objectPath, exp) {
  return crypto
    .createHmac('sha256', subkey('storage'))
    .update(`${scope}\n${objectPath}\n${exp}`)
    .digest('hex');
}

/**
 * Express middleware for a storage route. `scope` is 'PUT' for uploads and 'GET' for every read
 * (GET and HEAD). The signed path is the exact `path` value the client sent.
 */
function requireSignedUrl(scope) {
  return (req, res, next) => {
    if (!configured()) {
      return res.status(503).json({ error: 'storage_signing_not_configured' });
    }
    const objectPath = req.query.path || req.headers['x-storage-path'];
    const exp = Number(req.query.exp);
    const sig = req.query.sig;
    const now = Math.floor(Date.now() / 1000);

    if (!objectPath || !Number.isInteger(exp) || typeof sig !== 'string') {
      return res.status(401).json({ error: 'signed_url_required' });
    }
    if (exp < now) return res.status(403).json({ error: 'signed_url_expired' });
    if (exp - now > MAX_URL_TTL_SECONDS) return res.status(403).json({ error: 'signed_url_invalid' });
    if (!safeEqualHex(sig, storageSignature(scope, String(objectPath), exp))) {
      return res.status(403).json({ error: 'signed_url_invalid' });
    }
    next();
  };
}

/* ── payment proxy ──────────────────────────────────────────────────────── */

/** Clock skew tolerated between Vercel and this server, and the replay window. */
const PROXY_MAX_SKEW_SECONDS = 300;

function proxySignature(timestamp, rawBody) {
  return crypto
    .createHmac('sha256', subkey('payment-proxy'))
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

/** Body parser hook: keeps the exact bytes that were signed. */
function keepRawBody(req, _res, buf) {
  req.rawBody = buf.toString('utf8');
}

function requireProxySignature(req, res, next) {
  if (!configured()) {
    return res.status(503).json({ error: 'proxy_auth_not_configured' });
  }
  const ts = Number(req.headers['x-geofold-timestamp']);
  const sig = req.headers['x-geofold-signature'];
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || Math.abs(now - ts) > PROXY_MAX_SKEW_SECONDS || typeof sig !== 'string') {
    return res.status(401).json({ error: 'proxy_signature_required' });
  }
  if (typeof req.rawBody !== 'string' || !safeEqualHex(sig, proxySignature(ts, req.rawBody))) {
    return res.status(403).json({ error: 'proxy_signature_invalid' });
  }
  next();
}

module.exports = {
  configured,
  fingerprint,
  requireSignedUrl,
  requireProxySignature,
  keepRawBody,
  // Exported for tests.
  storageSignature,
  proxySignature,
};
