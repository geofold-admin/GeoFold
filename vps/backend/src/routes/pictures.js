const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const pool = require('../db');
const { requireAuth } = require('../auth');
const { enqueue, stats: queueStats } = require('../imageQueue');
const { get, set, delPrefix, stats: cacheStats } = require('../cache');

const router = express.Router();
const STORAGE_DIR = process.env.STORAGE_PATH || '/app/storage/pictures';
const TEMP_DIR = '/tmp/uploads';

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 35 * 1024 * 1024 }
});

const QUOTAS = {
  free: 10 * 1024 * 1024,   // 10 MB per account
  pro: 500 * 1024 * 1024    // 500 MB per account
};

// --- Upload ---
router.post('/upload', requireAuth, upload.single('picture'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No picture file provided' });

  const tempPath = req.file.path;
  const pictureId = crypto.randomUUID();
  const webpFilename = `${pictureId}.webp`;
  const targetPath = path.join(STORAGE_DIR, webpFilename);
  const originalName = req.file.originalname || 'image';

  try {
    // Convert to WebP inside the serialised queue
    await enqueue(() =>
      sharp(tempPath)
        .webp({ quality: 82 })
        .toFile(targetPath)
    );

    const webpStats = fs.statSync(targetPath);
    const newSizeBytes = webpStats.size;

    // Check cumulative quota
    const userTier = req.user.tier === 'pro' && req.user.isPro ? 'pro' : 'free';
    const quotaBytes = QUOTAS[userTier];

    const { rows: sumRows } = await pool.query(
      'SELECT COALESCE(SUM(size_bytes), 0) AS total_used FROM pictures WHERE user_id = $1',
      [req.user.id]
    );
    const currentUsedBytes = parseInt(sumRows[0].total_used, 10);

    if (currentUsedBytes + newSizeBytes > quotaBytes) {
      fs.unlinkSync(targetPath);
      const quotaMb = (quotaBytes / (1024 * 1024)).toFixed(0);
      const usedMb = (currentUsedBytes / (1024 * 1024)).toFixed(2);
      return res.status(403).json({
        error: `Storage quota exceeded. ${userTier.toUpperCase()} tier allows ${quotaMb}MB (currently used: ${usedMb}MB). Upgrade to Pro for 500MB.`,
        tier: userTier,
        usedBytes: currentUsedBytes,
        quotaBytes
      });
    }

    // Record in DB
    const { rows } = await pool.query(
      `INSERT INTO pictures (user_id, filename, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, original_name, mime_type, size_bytes, created_at`,
      [req.user.id, webpFilename, originalName, 'image/webp', newSizeBytes]
    );

    // Invalidate user's picture list cache
    delPrefix(`pics:user:${req.user.id}:`);

    const picture = rows[0];
    const hostUrl = process.env.BACKEND_URL || 'https://api.geofold.sayba.id';
    picture.viewUrl = `${hostUrl}/api/pictures/view/${picture.filename}`;
    picture.downloadUrl = `${hostUrl}/api/pictures/download/${picture.filename}`;

    res.status(201).json({
      success: true,
      picture,
      storage: {
        tier: userTier,
        usedBytes: currentUsedBytes + newSizeBytes,
        quotaBytes,
        percentUsed: (((currentUsedBytes + newSizeBytes) / quotaBytes) * 100).toFixed(2) + '%'
      }
    });
  } catch (err) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    console.error('Upload / conversion error:', err);
    res.status(400).json({ error: 'Image processing failed: ' + err.message });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

// --- Download (PNG on-the-fly, serialised) ---
router.get('/download/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(STORAGE_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Picture not found' });
  }

  try {
    const { rows } = await pool.query('SELECT original_name FROM pictures WHERE filename = $1', [filename]);
    const baseName = rows[0]?.original_name
      ? path.parse(rows[0].original_name).name
      : path.parse(filename).name;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}.png"`);

    await enqueue(() =>
      sharp(filePath)
        .png()
        .pipe(res)
    );
  } catch (err) {
    console.error('PNG streaming error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download conversion failed' });
  }
});

// --- View (native WebP, direct file — no queue needed) ---
router.get('/view/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(STORAGE_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Picture not found' });
  }

  res.setHeader('Content-Type', 'image/webp');
  res.sendFile(filePath);
});

// --- List with caching ---
router.get('/', requireAuth, async (req, res) => {
  try {
    const userTier = req.user.tier === 'pro' && req.user.isPro ? 'pro' : 'free';
    const quotaBytes = QUOTAS[userTier];

    const cacheKey = `pics:user:${req.user.id}:${userTier}`;
    const cached = get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const { rows } = await pool.query(
      'SELECT id, filename, original_name, mime_type, size_bytes, created_at FROM pictures WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    const hostUrl = process.env.BACKEND_URL || 'https://api.geofold.sayba.id';
    const pictures = rows.map(p => ({
      ...p,
      viewUrl: `${hostUrl}/api/pictures/view/${p.filename}`,
      downloadUrl: `${hostUrl}/api/pictures/download/${p.filename}`
    }));

    const totalUsedBytes = pictures.reduce((sum, p) => sum + parseInt(p.size_bytes, 10), 0);

    const response = {
      tier: userTier,
      isPro: req.user.isPro,
      storage: {
        usedBytes: totalUsedBytes,
        usedMb: (totalUsedBytes / (1024 * 1024)).toFixed(2),
        quotaBytes,
        quotaMb: (quotaBytes / (1024 * 1024)).toFixed(0),
        percentUsed: ((totalUsedBytes / quotaBytes) * 100).toFixed(2) + '%'
      },
      count: pictures.length,
      pictures
    };

    // Cache for 30 seconds (short, but coalesces burst reads)
    set(cacheKey, response, 30000);

    res.json(response);
  } catch (err) {
    console.error('List pictures error:', err);
    res.status(500).json({ error: 'Failed to list pictures' });
  }
});

// --- Delete (invalidates cache) ---
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM pictures WHERE id = $1 AND user_id = $2 RETURNING filename',
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Picture not found or not owned by you' });
    }

    const filePath = path.join(STORAGE_DIR, rows[0].filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    delPrefix(`pics:user:${req.user.id}:`);

    res.json({ success: true, deleted: rows[0].filename });
  } catch (err) {
    console.error('Delete picture error:', err);
    res.status(500).json({ error: 'Failed to delete picture' });
  }
});

// --- Internal: queue/cache stats ---
router.get('/_stats', (req, res) => {
  res.json({
    imageQueue: queueStats(),
    cache: cacheStats()
  });
});

module.exports = router;