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
 * Opens the provider's sign-in page in a native auth session (Custom Tab / ASWebAuthenticationSession)
 * and turns the result into a Supabase session. Resolves false when the surveyor backs out.
 *
 * Uses the custom scheme (geofold://auth/callback) as redirectTo so the Custom Tab
 * receives the redirect back directly, giving us the code/tokens in the returned promise.
 * This avoids the broken handoff page → custom scheme redirect that Custom Tabs can't capture.
 */
export async function signInWithProvider(provider: Provider): Promise<boolean> {
  const returnUrl = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: returnUrl,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Supabase did not return a sign-in URL.');

  // Open in a native auth session (Custom Tab on Android, ASWebAuthenticationSession on iOS).
  // The redirectTo is our custom scheme, so the Custom Tab receives geofold://auth/callback?...
  // back and returns it to this promise. No handoff page, no race.
  const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl, {
    showInRecents: true,
    preferEphemeralSession: false,
  });

  if (result.type === 'success') {
    const url = result.url;
    const params = readParams(url);

    if (params.error || params.error_description) {
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

  // User cancelled or closed the browser sheet.
  return false;
}

/**
 * Turns a `geofold*://auth/callback?...` URL into a Supabase session.
 *
 * Split out from `signInWithProvider` because that function's promise is not the only way this URL
 * can arrive. While the browser sheet is in front, Android is free to recreate the activity — and
 * on aggressive OEM builds, to kill the process outright. Either way the awaiting promise is gone
 * by the time the redirect lands, and a sign-in that actually succeeded upstream is dropped on the
 * floor: the browser closes, the app comes back, and the surveyor is still signed out with nothing
 * on screen to say why. `lib/auth` also feeds every incoming deep link through here, so the result
 * survives the round trip regardless of what happened to the JS that started it.
 *
 * Safe to call with any URL: anything that is not an auth callback returns false without touching
 * the session.
 */
export async function completeAuthFromUrl(url: string): Promise<boolean> {
  if (!url.includes('auth/callback')) return false;

  const params = readParams(url);
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

  // A callback with neither a code nor tokens is a real failure, not a no-op — say so rather than
  // returning quietly and leaving the sign-in screen looking like nothing happened.
  throw new Error('Sign-in finished but returned no credentials.');
}