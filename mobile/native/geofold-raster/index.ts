/**
 * Intentionally empty.
 *
 * Native-only: the Kotlin and Swift register the Expo module `GeofoldRaster`, and the JS that talks
 * to it is `src/lib/pdf-render.ts` in the app, which loads it with `requireOptionalNativeModule` so
 * a build without it still starts.
 */
export {};
