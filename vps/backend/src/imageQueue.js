// Serialised image-processing queue.
//
// sharp spawns libvips worker threads by default. On a single vCPU that
// thrashes the core and stalls the whole Node event loop. We pin
// concurrency to 1 and additionally serialise calls so at most one
// conversion is ever in flight — the rest wait in a bounded FIFO.
const sharp = require('sharp');

sharp.concurrency(1); // hard-pin libvips threads

const MAX_DEPTH = 30;
let depth = 0;
let tail = Promise.resolve();

function enqueue(task) {
  if (depth >= MAX_DEPTH) {
    return Promise.reject(new Error('Image queue full — server busy, retry shortly'));
  }
  depth++;
  const run = tail.then(() => task());
  // Keep the chain alive even if a task rejects
  tail = run.then(
    () => {},
    () => {}
  );
  return run.finally(() => {
    depth--;
  });
}

function stats() {
  return { depth, maxDepth: MAX_DEPTH };
}

module.exports = { enqueue, stats };
