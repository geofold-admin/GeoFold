// Runtime configuration. Expo inlines anything prefixed EXPO_PUBLIC_ at build time, so these are
// public values only — the service-role key and the database password stay on the server.

const raw = (v: string | undefined) => (v ?? '').trim();

export const SUPABASE_URL = raw(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = raw(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

/** Origin of the GeoFold server (the Next.js app). No trailing slash. */
export const API_BASE_URL = raw(process.env.EXPO_PUBLIC_API_BASE_URL).replace(/\/+$/, '');

/**
 * Recognises a value that was filled in with an example rather than a real credential.
 *
 * 'placeholder' is in this list because the server's own env file ships
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key` — the real key lives only in the deployment
 * environment. Copying that file's values across sets all three variables to something non-empty,
 * which used to switch DEMO_MODE off while leaving Supabase unusable: an app that looks live and
 * fails every sign-in, which is strictly worse than staying in demo mode. The web app's proxy
 * makes the same check for the same reason.
 */
const isPlaceholder = (v: string) =>
  !v ||
  v.startsWith('<') ||
  v.includes('your-') ||
  v.toLowerCase().includes('placeholder') ||
  v.toLowerCase().includes('example.com') ||
  v === 'changeme';

/**
 * Mirrors the web app's demo mode: with no real Supabase key configured the whole app runs on
 * sample data and a simulated sync, so it can be opened and reviewed without any backend.
 */
export const DEMO_MODE =
  isPlaceholder(SUPABASE_URL) || isPlaceholder(SUPABASE_ANON_KEY) || isPlaceholder(API_BASE_URL);
