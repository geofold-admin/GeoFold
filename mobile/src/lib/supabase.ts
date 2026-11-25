import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';

import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

const URL_IN_USE = DEMO_MODE ? 'https://demo.invalid' : SUPABASE_URL;

/**
 * Where the session is saved. This is supabase-js's own default, spelled out so `storedSession`
 * can read the same entry. Changing it would sign every surveyor out on update.
 */
const AUTH_STORAGE_KEY = `sb-${new URL(URL_IN_USE).hostname.split('.')[0]}-auth-token`;

// On native there is no browser URL to parse, and the session must persist across cold starts —
// hence AsyncStorage + detectSessionInUrl: false.
export const supabase = createClient(URL_IN_USE, DEMO_MODE ? 'demo-anon-key' : SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * The session as saved on the phone, read without the token refresh that `getSession` attempts.
 *
 * An access token lasts an hour. Past that, `getSession` tries to refresh it, and with no
 * connection the refresh fails and `getSession` answers null, although nobody signed out. The
 * saved entry is still there, because supabase-js keeps it through network errors and deletes it
 * only once the server has actually refused it. So this is how the app tells "offline" apart from
 * "signed out".
 */
export async function storedSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<Session> | null;
    return session &&
      typeof session.access_token === 'string' &&
      typeof session.refresh_token === 'string' &&
      typeof session.user?.id === 'string'
      ? (session as Session)
      : null;
  } catch {
    return null;
  }
}
