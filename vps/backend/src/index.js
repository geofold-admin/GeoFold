require('dotenv').config();
const express = require('express');
const cors = require('cors');
const paymentRoutes = require('./routes/payment');
const picturesRoutes = require('./routes/pictures');
const storageRoutes = require('./routes/storage');
const { requireAuth, requirePro } = require('./auth');

const app = express();
app.use(cors({ origin: '*' }));

// Request timing middleware (all routes) — logs structured JSON per request
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const statusCode = res.statusCode;
    const method = req.method;
    const path = req.originalUrl;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    // Log slow requests (>= 250ms) to stderr for grep, all requests to stdout at debug level
    if (durationMs >= 250) {
      console.error(JSON.stringify({
        level: 'slow',
        t: new Date().toISOString(),
        method,
        path,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip
      }));
    } else {
      console.log(JSON.stringify({
        t: new Date().toISOString(),
        method,
        path,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip
      }));
    }
  });
  next();
});

// Raw storage router (mount before general json parser)
app.use('/api/storage', storageRoutes);

// JSON body parser for other routes
app.use(express.json());

// Routes
app.use('/api/payment', paymentRoutes);
app.use('/api/pictures', picturesRoutes);

// User profile & tier info
app.get('/api/user/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      supabase_id: req.user.supabase_id,
      email: req.user.email,
      name: req.user.name,
      tier: req.user.tier,
      pro_expires_at: req.user.pro_expires_at,
      isPro: req.user.isPro
    }
  });
});

// Pro Feature Gate Example
app.get('/api/feature/pro-tool', requireAuth, requirePro, (req, res) => {
  res.json({ message: 'Pro access confirmed: Advanced GeoFold tools unlocked', user: req.user.email });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Backend running on port ' + port));
