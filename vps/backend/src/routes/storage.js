const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const { enqueue, stats: queueStats } = require('../imageQueue');

const router = express.Router();

const STORAGE_ROOT = process.env.STORAGE_PATH || '/app/storage/pictures';

// PNG cache directory (derived PNGs in a flat hashed namespace).
// Size-capped so it can't fill the disk on a 20 GB VPS.
const PNG_CACHE_MAX_MB = parseInt(process.env.PNG_CACHE_MAX_MB || '500', 10);
const PNG_CACHE_DIR = path.join(STORAGE_ROOT, '_png_cache');

function ensureCacheDir() {
  if (!fs.existsSync(PNG_CACHE_DIR)) fs.mkdirSync(PNG_CACHE_DIR, { recursive: true });
}

function getTargetPath(relPath) {
  if (!relPath) return null;
  // Sanitize path to prevent directory traversal
  const clean = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '').replace(/\.[^/.]+$/, '');
  return path.join(STORAGE_ROOT, `${clean}.webp`);
}

// Cache key: hash of the full source path -> flat filename in _png_cache/.
// Avoids path conflicts and traversal in the cache dir.
function getPngCachePath(webpPath) {
  const rel = path.relative(STORAGE_ROOT, webpPath);
  const h = crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16);
  return path.join(PNG_CACHE_DIR, `${h}.png`);
}

function pngCacheIsFresh(webpPath, pngPath) {
  try {
    return fs.statSync(pngPath).mtimeMs >= fs.statSync(webpPath).mtimeMs;
  } catch {
    return false;
  }
}

function cacheDirSizeBytes() {
  try {
    let total = 0;
    for (const f of fs.readdirSync(PNG_CACHE_DIR)) {
      try { total += fs.statSync(path.join(PNG_CACHE_DIR, f)).size; } catch {}
    }
    return total;
  } catch {
    return 0;
  }
}

// Evict oldest files until under the size cap. Called after each conversion.
function evictIfNeeded() {
  const maxBytes = PNG_CACHE_MAX_MB * 1024 * 1024;
  let size = cacheDirSizeBytes();
  if (size <= maxBytes) return;
  try {
    const files = fs.readdirSync(PNG_CACHE_DIR)
      .map(f => ({ f, stat: fs.statSync(path.join(PNG_CACHE_DIR, f)) }))
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs); // oldest first
    for (const { f, stat } of files) {
      fs.unlinkSync(path.join(PNG_CACHE_DIR, f));
      size -= stat.size;
      if (size <= maxBytes) break;
    }
  } catch {}
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

    // Invalidate the derived PNG cache — source changed, cached PNG is stale.
    fs.rmSync(getPngCachePath(targetPath), { force: true });

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

// 3. Download (PNG). Resize happens at most once per image: the result is
//    cached on disk and served directly thereafter. Never re-resize the same
//    image twice. Cache is size-capped (default 500 MB) with LRU eviction.
router.get('/download', (req, res) => {
  const relPath = req.query.path;
  const targetPath = getTargetPath(relPath);
  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const originalBase = path.parse(relPath).name;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalBase)}.png"`);

  const pngPath = getPngCachePath(targetPath);

  // Fast path: cached PNG is up to date — zero CPU, no queue, just stream bytes.
  if (pngCacheIsFresh(targetPath, pngPath)) {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(pngPath);
  }

  // Slow path: convert once, atomically cache, then serve from disk.
  ensureCacheDir();
  enqueue(async () => {
    const tmp = `${pngPath}.${process.pid}.${Date.now()}.tmp`;
    await sharp(targetPath).png().toFile(tmp);
    fs.renameSync(tmp, pngPath); // atomic: readers never see a partial file
    evictIfNeeded(); // enforce size cap
    return pngPath;
  })
    .then((cached) => {
      if (res.headersSent) return;
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(cached);
    })
    .catch((err) => {
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

// 5. Internal: queue + cache stats
router.get('/_stats', (req, res) => {
  res.json({
    imageQueue: queueStats(),
    pngCache: {
      dir: PNG_CACHE_DIR,
      maxMb: PNG_CACHE_MAX_MB,
      currentBytes: cacheDirSizeBytes(),
    },
  });
});

module.exports = router;
