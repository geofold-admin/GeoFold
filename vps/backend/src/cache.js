// Minimal in-memory TTL cache.
// Deliberately NOT Redis: on a 1 GB box the extra ~30-50 MB daemon
// costs more than it saves. Process-local is fine for a single backend.
const store = new Map();
const MAX_ENTRIES = 2000;

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.exp) {
    store.delete(key);
    return undefined;
  }
  return entry.val;
}

function set(key, val, ttlMs) {
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest insertion (Map preserves insertion order)
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { val, exp: Date.now() + ttlMs });
}

function del(key) {
  store.delete(key);
}

// Invalidate every key starting with a prefix (e.g. 'pics:user:5:')
function delPrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

function stats() {
  return { entries: store.size, max: MAX_ENTRIES };
}

module.exports = { get, set, del, delPrefix, stats };
