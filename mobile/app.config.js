const fs = require('fs');
const path = require('path');

const base = require('./app.base.json').expo;

/**
 * Three versions of the same app, from one codebase.
 *
 * `GEOFOLD_VARIANT` selects one. Every variant is the whole survey app — map, grid, projects,
 * gallery, capture, sync — and the drone ones add the aircraft screen on top, each under its own
 * package name so they install *alongside* each other rather than replacing anything. A surveyor
 * can carry all three, and a field team with no drone is not made to download a quarter of a
 * gigabyte of DJI libraries.
 *
 *   npm run prebuild             # standard survey app     → app.geofold.mobile
 *   npm run prebuild:drone       # DJI MSDK V5             → app.geofold.drone
 *   npm run prebuild:drone-v4    # DJI MSDK V4             → app.geofold.drone.v4
 *
 * **Why two drone builds.** V4 and V5 are different SDKs covering different aircraft, and they
 * cannot share an APK: six native libraries collide by filename and both ship a class called
 * `com.cySdkyc.clx.Helper`. V5 carries the enterprise and recent Mini airframes; V4 carries the
 * older consumer fleet, including the **Mavic Mini**, which V5 does not support at all. See
 * `DJI-SETUP.md` §1.
 *
 * Switching variants means re-running prebuild: they produce different manifests, different ABIs
 * and a different native module set, so one `android/` cannot serve two.
 */
/**
 * Which variant this config describes.
 *
 * `GEOFOLD_VARIANT` is set by `scripts/prepare-variant.js` when it spawns `expo prebuild`, so the
 * *manifest* always gets the right scheme and package. But gradle evaluates this file a second
 * time, from its own bundle task, in a plain environment where that variable is absent — and the
 * config it produces there is what gets embedded as `assets/app.config` and read back at runtime
 * by `Constants.expoConfig`.
 *
 * Without the fallback below those two disagree, and the app ends up with a manifest registering
 * `geofolddronev4://` while its JavaScript believes the scheme is `geofold://`. Nothing warns you:
 * the build succeeds, the app runs, and only OAuth breaks — `Linking.createURL()` hands Supabase a
 * redirect target no installed app claims, so the browser completes the sign-in and then sits on
 * the provider's page with nowhere to hand the result back to. Diagnosed 2026-09-07 by reading the
 * `redirect_to` out of the live intent.
 *
 * `android/.geofold-variant` is written by prepare-variant.js only after a prebuild succeeds, so
 * it is exactly the variant the current `android/` directory was generated for.
 */
function variantFromStamp() {
  try {
    return fs.readFileSync(path.join(__dirname, 'android', '.geofold-variant'), 'utf8').trim();
  } catch {
    return '';
  }
}

const variant = process.env.GEOFOLD_VARIANT || variantFromStamp();

const DRONE = {
  drone: {
    name: 'GeoFold Drone',
    slug: 'geofold-drone',
    scheme: 'geofolddrone',
    // The name the DJI App Key is bound to — a mismatch fails registration with an error that
    // reads like a network problem.
    package: 'app.geofold.drone',
    plugin: './plugins/with-dji-msdk',
  },
  'drone-v4': {
    name: 'GeoFold Drone V4',
    slug: 'geofold-drone-v4',
    scheme: 'geofolddronev4',
    // Its own package, so it sits beside the V5 build — and therefore its own App Key. The DJI
    // developer portal has one "Mobile SDK" app type covering both SDK generations; what a key is
    // bound to is the package name, so a second package needs a second app entry.
    package: 'app.geofold.drone.v4',
    plugin: './plugins/with-dji-v4',
  },
};

module.exports = () => {
  const drone = DRONE[variant];
  if (!drone) return { expo: base };

  return {
    expo: {
      ...base,
      name: drone.name,
      slug: drone.slug,
      scheme: drone.scheme,
      android: { ...base.android, package: drone.package },
      plugins: [...base.plugins, drone.plugin],
    },
  };
};
