/**
 * Intentionally empty.
 *
 * This module is native-only: its Kotlin registers as the Expo module `DjiMsdk`, and the JS that
 * talks to it lives in `native/dji-msdk/src/index.ts`, which the app reaches through the `@dji`
 * path alias. Both SDK variants share that one surface.
 *
 * It must not re-export from `../dji-msdk/src`: `scripts/prepare-variant.js` copies exactly one
 * module into `modules/` and clears the other, so from `modules/dji-v4/` that sibling does not
 * exist and the import fails to resolve.
 */
export {};
