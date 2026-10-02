const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { enqueue, stats: queueStats } = require('../imageQueue');

const router = express.Router();

const STORAGE_ROOT = process.env.STORAGE_PATH || '/app/storage/pictures';

function getTargetPath(relPath) {
  if (!relPath) return null;
  // Sanitize path to prevent directory traversal
  const clean = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '').replace(/\.[^/.]+$/, '');
  return path.join(STORAGE_ROOT, `${clean}.webp`);
}

// 1. Raw upload (PUT binary image, converts to WebP) — serialised
router.put('/raw', express.raw({ type: '*/*', limit: '35mb' }), async (req, res) => {
  const relPath = req.query.path || req.headers['x-storage-path'];
  if (!relPath) return res.status(400).json({ error: 'path query parameter required' });

  const targetPath = getTargetPath(relPath);
  if (!targetPath) return res.status(400).json({ error: 'invalid path' });

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    await enqueue(() =>
      sharp(req.body)
        .webp({ quality: 82 })
        .toFile(targetPath)
    );

    const stat = fs.statSync(targetPath);
    res.json({ ok: true, sizeBytes: stat.size, format: 'webp' });
  } catch (err) {
    console.error('Storage raw upload error:', err);
    res.status(400).json({ error: 'Image processing failed: ' + err.message });
  }
});

// 2. Info / Size / Exists (HEAD or GET info) — no queue
router.head('/raw', (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).end();
  const targetPath = getTargetPath(relPath);
  if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).end();

  const stat = fs.statSync(targetPath);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'image/webp');
  res.status(200).end();
});

router.get('/info', (req, res) => {
  const relPath = req.query.path;
  const targetPath = getTargetPath(relPath);
  if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).json({ exists: false });

  const stat = fs.statSync(targetPath);
  res.json({ exists: true, sizeBytes: stat.size });
});

// 3. Download (Converts WebP to PNG on-the-fly) — serialised
router.get('/download', (req, res) => {
  const relPath = req.query.path;
  const targetPath = getTargetPath(relPath);
  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const originalBase = path.parse(relPath).name;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalBase)}.png"`);

  enqueue(() =>
    sharp(targetPath)
      .png()
      .pipe(res)
  ).catch((err) => {
    console.error('PNG download conversion error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download conversion failed' });
  });
});

// 4. View (Native WebP) — direct file, no queue
router.get('/view', (req, res) => {
  const relPath = req.query.path;
  const targetPath = getTargetPath(relPath);
  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', 'image/webp');
  res.sendFile(targetPath);
});

// 5. Internal: queue stats
router.get('/_stats', (req, res) => {
  res.json({ imageQueue: queueStats() });
});

module.exports = router;