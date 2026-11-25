#!/usr/bin/env node
/**
 * Puts the DJI native module in place — or takes it away — before `expo prebuild`.
 *
 * Expo autolinks everything under `modules/`, unconditionally: a module sitting there is compiled
 * and packaged whether or not the app config asked for it. The DJI module pulls roughly a quarter
 * of a gigabyte of native libraries and forces the APK to arm64, so leaving it linked would inflict
 * both on the standard survey build for nothing.
 *
 * So `native/dji-msdk` is the source of truth — a path autolinking does not scan — and this script
 * copies it into `modules/` only for the drone variant, and removes it otherwise. `modules/` is
 * generated and gitignored; never edit anything in there.
 *
 *   node scripts/prepare-variant.js          # standard: remove it, then prebuild
 *   node scripts/prepare-variant.js drone    # drone: put it in place, then prebuild
 *
 * The prebuild is spawned from here rather than chained in the npm script so the variant
 * environment reaches it on Windows too — npm runs scripts through cmd, where a `VAR=x cmd` prefix
 * is not a thing.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/**
 * One native module per variant, and never two at once.
 *
 * V4 and V5 cannot share an APK — six native libraries collide by filename and both ship a class
 * called `com.cySdkyc.clx.Helper` — so `modules/` is cleared before anything is linked rather than
 * added to. The JS surface is shared: both modules register as the Expo module `DjiMsdk`, so
 * `native/dji-msdk/src/index.ts` and the Drone screen drive either one without knowing which.
 */
const MODULES = {
  drone: 'dji-msdk',
  'drone-v4': 'dji-v4',
};

/**
 * Modules every variant carries. `geofold-raster` rasterises GeoPDF pages for map overlays
 * (`src/lib/pdf-render.ts`); it is tiny and platform-only, so there is no reason to leave it out of
 * any build. Copied fresh each time like the DJI modules, so `native/` stays the one source.
 */
const ALWAYS = ['geofold-raster'];

const wanted = process.argv[2] || process.env.GEOFOLD_VARIANT || 'standard';
const moduleName = MODULES[wanted];

// Clear every known module, not just the one being replaced: switching from drone to drone-v4 must
// not leave the V5 module behind, and autolinking scans whatever is there.
for (const name of [...Object.values(MODULES), ...ALWAYS]) {
  fs.rmSync(path.join(root, 'modules', name), { recursive: true, force: true });
}

for (const name of ALWAYS) {
  const target = path.join(root, 'modules', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(path.join(root, 'native', name), target, { recursive: true });
}
console.log(`linked into modules/: ${ALWAYS.join(', ')}`);

if (moduleName) {
  const source = path.join(root, 'native', moduleName);
  const target = path.join(root, 'modules', moduleName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`variant: ${wanted} — ${moduleName} linked into modules/`);
} else {
  console.log('variant: standard — no DJI module linked');
}

/*
 * `--clean` only when the variant actually changed.
 *
 * It deletes `android/` outright, which forces a full C++ rebuild of React Native's native modules
 * — several minutes and a large memory spike, on a machine that has already failed builds on
 * out-of-memory. It also races anything holding a handle in there: a Gradle daemon still alive from
 * the previous build makes the delete fail with EBUSY.
 *
 * Switching variants genuinely needs it — the two produce different manifests, ABIs and native
 * module sets, and stale generated files would be silently mixed in. Rebuilding the *same* variant
 * does not.
 */
const stamp = path.join(root, 'android', '.geofold-variant');
const previous = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : null;
const needsClean = previous !== wanted;

if (!needsClean) console.log(`variant unchanged (${wanted}) — keeping android/, no --clean`);

const args = ['expo', 'prebuild', '--platform', 'android'];
if (needsClean) args.push('--clean');

const result = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GEOFOLD_VARIANT: moduleName ? wanted : '' },
});

// Written after the fact so a failed prebuild does not leave a stamp claiming success.
if (result.status === 0) {
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, wanted);
}

process.exit(result.status ?? 1);
