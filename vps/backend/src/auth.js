const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

// ---------------------------------------------------------------------------
// Supabase JWT verification.
//
// This project signs access tokens with ES256 (asymmetric, EC P-256). The
// public key is published at /auth/v1/.well-known/jwks.json, so we can verify
// tokens LOCALLY with no network round-trip per request.
//
// Order of attempts:
//   1. Local asymmetric verification against the cached JWKS  (fast, ~0.1ms)
//   2. Legacy HS256 verification, only if SUPABASE_JWT_SECRET is set
//   3. Supabase Auth API lookup                               (slow fallback)
//   4. Unsigned dev tokens, ONLY if ALLOW_INSECURE_DEV_TOKENS=1 and not prod
// ---------------------------------------------------------------------------

let jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_TIMEOUT_MS = 5000;

function b64urlToBuf(s) {
  return Buffer.from(String(s), 'base64url');
}

function decodeJson(b64) {
  try {
    return JSON.parse(b64urlToBuf(b64).toString('utf8'));
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  return decodeJson(parts[1]);
}

async function getJwks(forceRefresh) {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  const isFresh = jwksCache.keys && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (isFresh && !forceRefresh) return jwksCache.keys;
  try {
    const { data } = await axios.get(`${url}/auth/v1/.well-known/jwks.json`, {
      timeout: JWKS_TIMEOUT_MS,
    });
    if (data && Array.isArray(data.keys)) {
      jwksCache = { keys: data.keys, fetchedAt: Date.now() };
      return data.keys;
    }
  } catch (e) {
    console.warn('[auth] JWKS fetch failed:', e.message);
  }
  return jwksCache.keys || null;
}

function jwkToKey(jwk) {
  try {
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return null;
  }
}

async function verifyAsymmetric(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (!header || !payload) return null;
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;

  const alg = header.alg;
  const hash = alg === 'ES256' ? 'sha256' : alg === 'RS256' ? 'RSA-SHA256' : null;
  if (!hash) return null;

  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = b64urlToBuf(parts[2]);

  const pick = (keys) => keys && keys.find((k) => !header.kid || k.kid === header.kid);
  let jwk = pick(await getJwks(false));
  if (!jwk) jwk = pick(await getJwks(true)); // key rotation: force one refresh
  if (!jwk) return null;

  const key = jwkToKey(jwk);
  if (!key) return null;

  try {
    const opts =
      alg === 'ES256'
        ? { key, dsaEncoding: 'ieee-p1363' } // JWT uses raw R||S, not DER
        : { key, padding: crypto.constants.RSA_PKCS1_PADDING };
    if (!crypto.verify(hash, data, opts, sig)) return null;
  } catch {
    return null;
  }

  return payload;
}

function verifyHs256(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const payload = decodeJson(p);
  if (!payload) return null;
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;
  return payload;
}

async function verifySupabaseToken(token) {
  // 1. Local asymmetric verification (ES256/RS256 via JWKS).
  const local = await verifyAsymmetric(token);
  if (local) return local;

  // 2. Legacy symmetric secret, if configured.
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    const verified = verifyHs256(token, secret);
    if (verified) return verified;
  }

  // 3. Opt-in only, never in production: unsigned dev/test tokens.
  //    Placed BEFORE the network call so load tests measure real local-verify
  //    latency instead of a doomed Supabase round-trip per fake token.
  if (process.env.ALLOW_INSECURE_DEV_TOKENS === '1' && process.env.NODE_ENV !== 'production') {
    const decoded = decodeJwtPayload(token);
    if (decoded && decoded.sub) return decoded;
  }

  // 4. Supabase Auth API (slow, network round-trip). Bounded by a timeout so a
  //    slow upstream cannot pile up requests on a single-vCPU box.
  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { data } = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY || '',
        },
        timeout: 5000,
      });
      if (data && data.id) {
        return { sub: data.id, email: data.email, user_metadata: data.user_metadata || {} };
      }
    } catch (e) {
      console.warn('[auth] Supabase API verification failed:', e.message);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// User row cache.
// Previously every authenticated request ran an INSERT ... ON CONFLICT (a write
// per request). We now read once, write only on change, and cache for 60s.
// ---------------------------------------------------------------------------
const USER_TTL_MS = 60 * 1000;
const USER_CACHE_MAX = 5000;
const userCache = new Map();

function cacheUser(supabaseId, user) {
  if (userCache.size >= USER_CACHE_MAX) userCache.clear();
  userCache.set(supabaseId, { user, exp: Date.now() + USER_TTL_MS });
}

function invalidateUserById(localId) {
  for (const [k, v] of userCache) {
    if (v.user && v.user.id === localId) userCache.delete(k);
  }
}

function clearUserCache() {
  userCache.clear();
}

async function upsertUser(supabaseId, email, name) {
  const { rows: found } = await pool.query('SELECT * FROM users WHERE supabase_id = $1', [supabaseId]);

  if (found[0]) {
    const user = found[0];
    if (user.email !== email || (name && user.name !== name)) {
      const { rows } = await pool.query(
        'UPDATE users SET email = $2, name = COALESCE($3, name) WHERE id = $1 RETURNING *',
        [user.id, email, name]
      );
      return rows[0];
    }
    return user;
  }

  const { rows } = await pool.query(
    `INSERT INTO users (supabase_id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (supabase_id)
     DO UPDATE SET email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, users.name)
     RETURNING *`,
    [supabaseId, email, name]
  );
  return rows[0];
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  const payload = await verifySupabaseToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired Supabase token' });
  }

  const supabaseId = payload.sub;
  const email = payload.email || `${supabaseId}@supabase.user`;
  const name = payload.user_metadata?.name || payload.user_metadata?.full_name || null;

  try {
    let user;
    const cached = userCache.get(supabaseId);
    if (cached && cached.exp > Date.now()) {
      user = cached.user;
    } else {
      user = await upsertUser(supabaseId, email, name);
      cacheUser(supabaseId, user);
    }

    user.isPro =
      user.tier === 'pro' && (!user.pro_expires_at || new Date(user.pro_expires_at) > new Date());
    req.user = user;
    next();
  } catch (err) {
    console.error('User sync error:', err);
    res.status(500).json({ error: 'Database sync failed' });
  }
}

function requirePro(req, res, next) {
  if (!req.user || !req.user.isPro) {
    return res.status(403).json({
      error: 'Pro subscription required',
      tier: req.user ? req.user.tier : 'free',
      upgradeUrl: '/pricing',
    });
  }
  next();
}

module.exports = {
  requireAuth,
  requirePro,
  decodeJwtPayload,
  invalidateUserById,
  clearUserCache,
};
