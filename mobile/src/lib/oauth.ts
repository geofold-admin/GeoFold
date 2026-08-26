import type { Provider } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

// Web only: closes the popup once it lands back on the redirect page. No-op on native.
WebBrowser.maybeCompleteAuthSession();

// Google only (enabled in Supabase). Apple stays out until it's set up too, otherwise its button
// would error on tap.
export const OAUTH_PROVIDERS: readonly { id: Provider; label: string }[] = [
  { id: 'google', label: 'Google' },
];

/** Pull params from both the query string and the URL fragment. */
function readParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};

  const collect = (raw: string) => {
    for (const pair of raw.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      try {
        out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch {
        out[key] = value;
      }
    }
  };

  const hash = url.indexOf('#');
  if (hash !== -1) collect(url.slice(hash + 1));
  const query = url.indexOf('?');
  if (query !== -1) collect(url.slice(query + 1, hash === -1 ? undefined : hash));

  return out;
}

/**
 * Opens the provider's sign-in page in a native auth session and turns the result into a
 * Supabase session. Resolves false when the surveyor backs out of the browser sheet.
 *
 * Handles both flows so it works whichever the project is configured for: PKCE returns a
 * `?code` to exchange, the implicit flow returns tokens in the `#fragment`. Deliberately
 * does not set `flowType` on the shared client — that would also change how the email
 * confirmation links from signUp() are redeemed.
 *
 * `redirectTo` (geofold://auth/callback in a dev/production build) must be listed under
 * Authentication → URL Configuration → Redirect URLs in the Supabase dashboard.
 */
export async function signInWithProvider(provider: Provider): Promise<boolean> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Supabase did not return a sign-in URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  // 'cancel' (user dismissed) and 'dismiss' (closed programmatically) are both non-errors.
  if (result.type !== 'success') return false;

  const params = readParams(result.url);
  if (params.error_description || params.error) {
    throw new Error(params.error_description || params.error);
  }

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw new Error(exchangeError.message);
    return true;
  }

  if (params.access_token && params.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw new Error(sessionError.message);
    return true;
  }

  throw new Error('Sign-in finished but returned no credentials.');
}
