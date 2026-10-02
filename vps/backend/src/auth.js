const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function verifyHs256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
  if (signature !== expectedSig) return null;
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;
  return payload;
}

async function verifySupabaseToken(token) {
  // 1. Secret-based validation (fastest)
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    const verified = verifyHs256(token, secret);
    if (verified) return verified;
  }

  // 2. Supabase Auth API verification fallback
  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { data } = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY || ''
        }
      });
      if (data && data.id) {
        return {
          sub: data.id,
          email: data.email,
          user_metadata: data.user_metadata || {}
        };
      }
    } catch (e) {
      console.warn('Supabase API verification failed:', e.message);
    }
  }

  // 3. Fallback for local development / test mock tokens
  if (process.env.NODE_ENV !== 'production') {
    const decoded = decodeJwtPayload(token);
    if (decoded && decoded.sub) return decoded;
  }

  return null;
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
    // Sync Supabase user with local VPS database
    const { rows } = await pool.query(
      `INSERT INTO users (supabase_id, email, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (supabase_id)
       DO UPDATE SET email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, users.name)
       RETURNING *`,
      [supabaseId, email, name]
    );

    const user = rows[0];
    user.isPro = user.tier === 'pro' && (!user.pro_expires_at || new Date(user.pro_expires_at) > new Date());
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
      upgradeUrl: '/pricing'
    });
  }
  next();
}

module.exports = { requireAuth, requirePro, decodeJwtPayload };
