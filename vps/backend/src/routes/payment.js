const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../auth');
const router = express.Router();

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

// 0. Transparent Egress Proxy for Next.js (bypasses Vercel dynamic IP limitations)
router.post('/proxy', express.json(), async (req, res) => {
  const start = Date.now();
  const { path: ipaymuPath, method = 'POST', body } = req.body;
  const va = process.env.IPAYMU_VA;
  const apiKey = process.env.IPAYMU_API_KEY;
  const isProduction = process.env.IPAYMU_ENV === 'production';
  const baseUrl = isProduction ? 'https://my.ipaymu.com' : 'https://sandbox.ipaymu.com';
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const bodyJson = JSON.stringify(body || {});
  const signature = signIpaymuRequest(va, apiKey, method, bodyJson);
  const timestamp = getTimestamp();

  try {
    const upstream = await axios({
      method,
      url: `${baseUrl}${ipaymuPath}`,
      data: bodyJson,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'va': va,
        'signature': signature,
        'timestamp': timestamp
      },
      timeout: 15000
    });

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
    const { amount = 35000, plan = 'monthly' } = req.body;
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
    const { trx_id, sid, status, reference_id } = req.body;
    console.log('Webhook callback received:', req.body);

    const isSuccess = (status || '').toLowerCase() === 'berhasil';

    if (isSuccess && reference_id) {
      // 1. Mark transaction successful
      const { rows } = await pool.query(
        'UPDATE transactions SET status = $1, trx_id = COALESCE($2, trx_id), updated_at = NOW() WHERE reference_id = $3 RETURNING user_id',
        ['success', trx_id, reference_id]
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
      responseBody: { ok: true, status, isSuccess },
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
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const { rows: logs } = await pool.query(
      `SELECT id, endpoint, method, status_code, request_ip, request_body, response_body, error_message, duration_ms, created_at
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