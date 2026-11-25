const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../auth');
const { requireProxySignature } = require('../security');
const router = express.Router();

/** The only iPaymu endpoints the Next.js API needs through the proxy (see next/src/lib/ipaymu.ts). */
const IPAYMU_PROXY_PATHS = new Set(['/api/v2/payment', '/api/v2/payment/direct', '/api/v2/transaction', '/api/v2/history']);

/** Pro price is decided here, never by the client — a caller-chosen amount let a Rp 1 checkout buy Pro. */
const PRO_PRICE_IDR = Math.round(Number(process.env.PRO_PRICE_IDR || 35000));

function ipaymuBaseUrl() {
  return process.env.IPAYMU_ENV === 'production' ? 'https://my.ipaymu.com' : 'https://sandbox.ipaymu.com';
}

function getTimestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function signIpaymuRequest(va, apiKey, method, bodyJson) {
  const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex');
  const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash}:${apiKey}`;
  return crypto.createHmac('sha256', apiKey).update(stringToSign, 'utf8').digest('hex');
}

/**
 * POST a merchant-signed request to iPaymu — and only to iPaymu. The URL is built with `new URL`
 * and its origin and path checked, so a crafted path such as "@other.host/x" cannot redirect the
 * signed request (and the merchant VA) to another server.
 */
async function ipaymuPost(ipaymuPath, body) {
  const baseUrl = ipaymuBaseUrl();
  const url = new URL(ipaymuPath, baseUrl);
  if (url.origin !== baseUrl || url.pathname !== ipaymuPath || url.search || url.hash) {
    throw new Error('invalid iPaymu path');
  }
  const va = process.env.IPAYMU_VA;
  const apiKey = process.env.IPAYMU_API_KEY;
  const bodyJson = JSON.stringify(body || {});
  return axios({
    method: 'POST',
    url: url.toString(),
    data: bodyJson,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'va': va,
      'signature': signIpaymuRequest(va, apiKey, 'POST', bodyJson),
      'timestamp': getTimestamp(),
    },
    timeout: 15000,
  });
}

async function recordLog({ endpoint, method, statusCode, requestIp, requestBody, responseBody, errorMessage, durationMs }) {
  try {
    await pool.query(
      `INSERT INTO api_logs (endpoint, method, status_code, request_ip, request_body, response_body, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        endpoint,
        method,
        statusCode,
        requestIp,
        requestBody ? JSON.stringify(requestBody) : null,
        responseBody ? JSON.stringify(responseBody) : null,
        errorMessage,
        durationMs
      ]
    );
  } catch (err) {
    console.error('[logger] Failed to write API log:', err.message);
  }
}

// 0. Egress proxy for the Next.js API (iPaymu allowlists this server's static IP, not Vercel's).
//
// Only the Next.js API may use it: every call must carry a signature made with GEOFOLD_VPS_SECRET
// (see ../security.js). It was open — anyone could make merchant-signed iPaymu calls through it.
router.post('/proxy', requireProxySignature, async (req, res) => {
  const start = Date.now();
  const { path: ipaymuPath, method = 'POST', body } = req.body || {};
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (String(method).toUpperCase() !== 'POST' || !IPAYMU_PROXY_PATHS.has(ipaymuPath)) {
    return res.status(400).json({ error: 'proxy_target_not_allowed' });
  }

  try {
    const upstream = await ipaymuPost(ipaymuPath, body);

    const duration = Date.now() - start;
    await recordLog({
      endpoint: `/api/payment/proxy -> ${ipaymuPath}`,
      method,
      statusCode: upstream.status,
      requestIp: clientIp,
      requestBody: body,
      responseBody: upstream.data,
      errorMessage: null,
      durationMs: duration
    });

    res.status(upstream.status).json(upstream.data);
  } catch (err) {
    const duration = Date.now() - start;
    const statusCode = err.response?.status || 500;
    const responseData = err.response?.data || { error: err.message };

    await recordLog({
      endpoint: `/api/payment/proxy -> ${ipaymuPath}`,
      method,
      statusCode,
      requestIp: clientIp,
      requestBody: body,
      responseBody: responseData,
      errorMessage: err.message,
      durationMs: duration
    });

    console.error('iPaymu proxy error:', responseData);
    res.status(statusCode).json(responseData);
  }
});

// 1. Direct Pro Subscription Checkout (Redirect Payment)
router.post('/create', requireAuth, async (req, res) => {
  const start = Date.now();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const plan = 'monthly';
    const amount = PRO_PRICE_IDR;
    const referenceId = 'ORDER-' + Date.now() + '-' + req.user.id;

    // Record pending transaction in VPS DB
    const { rows: trxRows } = await pool.query(
      'INSERT INTO transactions (user_id, reference_id, amount, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, referenceId, amount, 'pending']
    );

    const va = process.env.IPAYMU_VA;
    const apiKey = process.env.IPAYMU_API_KEY;
    const isProduction = process.env.IPAYMU_ENV === 'production';
    const baseUrl = isProduction ? 'https://my.ipaymu.com' : 'https://sandbox.ipaymu.com';

    const payload = {
      product: [`GeoFold Pro Subscription (${plan})`],
      qty: ['1'],
      price: [String(Math.round(amount))],
      description: ['Akses Pro GeoFold 30 hari, kuota penyimpanan 500 MB'],
      returnUrl: (process.env.FRONTEND_URL || 'https://geofold.sayba.id') + '/subscription?order=' + referenceId,
      cancelUrl: (process.env.FRONTEND_URL || 'https://geofold.sayba.id') + '/subscription?order=' + referenceId + '&cancelled=1',
      notifyUrl: (process.env.BACKEND_URL || 'https://api.geofold.sayba.id') + '/api/payment/notify',
      referenceId: referenceId,
      buyerName: req.user.name || 'GeoFold User',
      buyerEmail: req.user.email,
      expired: 24,
      feeDirection: 'MERCHANT'
    };

    const bodyJson = JSON.stringify(payload);
    const signature = signIpaymuRequest(va, apiKey, 'POST', bodyJson);
    const ts = getTimestamp();

    const response = await axios.post(`${baseUrl}/api/v2/payment`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'va': va,
        'signature': signature,
        'timestamp': ts
      }
    });

    const respData = response.data;
    if (respData && respData.Data) {
      const sessionId = respData.Data.SessionID || respData.Data.SessionId;
      const paymentUrl = respData.Data.Url;

      await pool.query(
        'UPDATE transactions SET sid = $1 WHERE id = $2',
        [sessionId, trxRows[0].id]
      );

      await recordLog({
        endpoint: '/api/payment/create',
        method: 'POST',
        statusCode: 200,
        requestIp: clientIp,
        requestBody: { plan, amount, user_id: req.user.id },
        responseBody: respData,
        errorMessage: null,
        durationMs: Date.now() - start
      });

      return res.json({
        success: true,
        referenceId,
        paymentUrl,
        sessionId,
        data: respData.Data
      });
    }

    await recordLog({
      endpoint: '/api/payment/create',
      method: 'POST',
      statusCode: response.status,
      requestIp: clientIp,
      requestBody: { plan, amount, user_id: req.user.id },
      responseBody: respData,
      errorMessage: 'No data in iPaymu response',
      durationMs: Date.now() - start
    });

    res.json(respData);
  } catch (err) {
    console.error('Payment create error:', err.response?.data || err.message);
    const statusCode = err.response?.status || 500;
    const errPayload = { error: 'Payment creation failed', details: err.response?.data || err.message };

    await recordLog({
      endpoint: '/api/payment/create',
      method: 'POST',
      statusCode,
      requestIp: clientIp,
      requestBody: req.body,
      responseBody: errPayload,
      errorMessage: err.message,
      durationMs: Date.now() - start
    });

    res.status(500).json(errPayload);
  }
});

// 2. iPaymu Webhook Callback
router.post('/notify', async (req, res) => {
  const start = Date.now();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const { trx_id, status } = req.body || {};
    console.log('Webhook callback received:', { trx_id, status });

    // The callback body is never trusted: anyone can POST "berhasil" here. What decides the
    // outcome is iPaymu's own answer to a merchant-signed transaction lookup.
    if (!trx_id) {
      await recordLog({
        endpoint: '/api/payment/notify', method: 'POST', statusCode: 400, requestIp: clientIp,
        requestBody: req.body, responseBody: null, errorMessage: 'missing trx_id', durationMs: Date.now() - start,
      });
      return res.status(400).send('trx_id required');
    }

    let trx;
    try {
      const lookup = await ipaymuPost('/api/v2/transaction', { transactionId: String(trx_id) });
      const d = (lookup.data && lookup.data.Data) || {};
      trx = {
        referenceId: d.ReferenceId == null ? '' : String(d.ReferenceId),
        status: Math.round(Number(d.Status)),
        amount: Math.round(Number(d.Amount)),
      };
    } catch (err) {
      // Could not verify right now: answer non-2xx so iPaymu retries later.
      console.error('Webhook verification lookup failed:', err.message);
      await recordLog({
        endpoint: '/api/payment/notify', method: 'POST', statusCode: 502, requestIp: clientIp,
        requestBody: req.body, responseBody: null, errorMessage: 'verification lookup failed: ' + err.message,
        durationMs: Date.now() - start,
      });
      return res.status(502).send('verification unavailable');
    }

    // iPaymu status 1 = berhasil, 6 = settled (same reading as next/src/lib/ipaymu.ts).
    const isSuccess = trx.status === 1 || trx.status === 6;

    if (isSuccess && trx.referenceId && Number.isFinite(trx.amount)) {
      // 1. Mark the transaction iPaymu confirmed — once, and only if it paid at least the price.
      const { rows } = await pool.query(
        "UPDATE transactions SET status = $1, trx_id = COALESCE($2, trx_id), updated_at = NOW() WHERE reference_id = $3 AND status <> 'success' AND amount <= $4 RETURNING user_id",
        ['success', String(trx_id), trx.referenceId, trx.amount]
      );

      // 2. Upgrade user to Pro (500MB storage, 30 days)
      if (rows[0] && rows[0].user_id) {
        await pool.query(
          "UPDATE users SET tier = 'pro', pro_expires_at = NOW() + INTERVAL '30 days' WHERE id = $1",
          [rows[0].user_id]
        );
        console.log('User upgraded to Pro:', rows[0].user_id);
      }
    }

    await recordLog({
      endpoint: '/api/payment/notify',
      method: 'POST',
      statusCode: 200,
      requestIp: clientIp,
      requestBody: req.body,
      responseBody: { ok: true, verifiedStatus: trx.status, referenceId: trx.referenceId, isSuccess },
      errorMessage: null,
      durationMs: Date.now() - start
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook processing error:', err);
    await recordLog({
      endpoint: '/api/payment/notify',
      method: 'POST',
      statusCode: 500,
      requestIp: clientIp,
      requestBody: req.body,
      responseBody: null,
      errorMessage: err.message,
      durationMs: Date.now() - start
    });
    res.status(500).send('Webhook processing error');
  }
});

// 3. Oversight & Inspection Endpoint (Latest API Logs & Transactions)
// Admin-only: requires a valid Supabase token (was publicly exposed)
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    // Never expose full request/response bodies (they carry iPaymu signatures).
    const { rows: logs } = await pool.query(
      `SELECT id, endpoint, method, status_code, request_ip, error_message, duration_ms, created_at
       FROM api_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const { rows: trxs } = await pool.query(
      `SELECT t.id, t.user_id, u.email, t.trx_id, t.reference_id, t.amount, t.status, t.created_at, t.updated_at
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC
       LIMIT 20`
    );

    const { rows: stats } = await pool.query(
      `SELECT 
         count(*) total_calls,
         count(*) FILTER (WHERE status_code >= 400) total_errors,
         round(avg(duration_ms)) avg_latency_ms
       FROM api_logs
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    );

    res.json({
      summary: stats[0] || {},
      transactions: trxs,
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;