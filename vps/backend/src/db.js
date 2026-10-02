const { Pool } = require('pg');

// Tuned for 1 vCPU / 1 GB RAM.
// A large pool just causes context-switching contention on one core;
// 8 is plenty and leaves headroom for admin/psql sessions.
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: parseInt(process.env.DB_POOL_MAX || '8', 10),
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 15000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error:', err.message);
});

module.exports = pool;
