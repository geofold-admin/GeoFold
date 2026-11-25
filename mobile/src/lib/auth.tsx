import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { clearResponses } from './api-cache';
import { DEMO_MODE } from './config';
import { completeAuthFromUrl } from './oauth';
import { storedSession, supabase } from './supabase';

const AUTH_CALLBACK_URL = Linking.createURL('auth/callback');

const DEMO_SESSION = { user: { email: 'demo@geofold.app' } } as unknown as Session;

interface AuthValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves true when the project requires email confirmation before the account can be used. */
  signUp: (
    email: string,
    password: string,
    profile: { name: string; org: string },
  ) => Promise<boolean>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Demo mode only: step into the sample-data session shown behind the sign-in screen. */
  enterDemo: () => void;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => false,
  verifyOtp: async () => {},
  signOut: async () => {},
  enterDemo: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Demo mode has nothing to restore, so it starts resolved and signed out — the sign-in screen is
  // meant to be visible, and "Continue" steps into the demo from there.
  const [loading, setLoading] = useState(!DEMO_MODE);

  // When a deep link with an auth callback arrives, the code exchange is in flight. We must NOT
  // clear `loading` until it settles, otherwise the login screen flashes briefly before the
  // session appears and the app navigates — which is the confusing behaviour this ref prevents.
  const authExchangeInFlight = useRef(false);

  useEffect(() => {
    if (DEMO_MODE) return;

    let cancelled = false;
    const settle = (next: Session | null) => {
      if (cancelled) return;
      setSession(next);
      // Only clear loading if no auth exchange is in flight. If one is, the deep-link handler
      // will clear loading once it finishes.
      if (!authExchangeInFlight.current) setLoading(false);
    };

    // Startup is held behind `loading` — the splash stays up until it clears — so this must clear
    // on every path. A rejected getSession (bad URL, wrong key) or one that simply never settles
    // (no route to the host, captive portal) would otherwise leave the app on the splash screen
    // forever, rendering nothing and logging nothing. Each of those falls back to the session
    // saved on the phone, so a surveyor who opens the app out of range is not sent to sign in.
    const fallback = () => void storedSession().then(settle);
    const timeout = setTimeout(fallback, 8000);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        // Offline with an access token past its hour: the refresh failed for want of a signal,
        // not because the account was signed out, so carry on with the saved session. supabase-js
        // keeps refreshing it and reports the fresh one through onAuthStateChange once a
        // connection is back.
        if (!data.session && isAuthRetryableFetchError(error)) fallback();
        else settle(data.session);
      })
      .catch(fallback)
      .finally(() => clearTimeout(timeout));

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // The first session is settled above. INITIAL_SESSION repeats it, except offline, where it
      // arrives as null because the token refresh failed. Applying that would send a surveyor who
      // is only out of range to the sign-in screen.
      if (event === 'INITIAL_SESSION') return;
      setSession(next);
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, []);

  /*
   * Catch the OAuth callback deep link even when nothing is awaiting it.
   *
   * `signInWithProvider` normally reads the result straight off `openAuthSessionAsync`. But the
   * browser sheet runs in another activity, and Android may recreate ours — or kill the process —
   * while it is in front. When that happens the awaiting promise no longer exists, the redirect
   * arrives as a fresh deep link, and an upstream-successful sign-in is silently lost: the app
   * reopens still signed out. Handling the URL here as well means the outcome does not depend on
   * the JS that started it having survived.
   *
   * `getInitialURL` covers the cold-start case (the link that launched us); the listener covers a
   * warm one. `completeAuthFromUrl` ignores anything that is not an auth callback, and
   * `exchangeCodeForSession` is idempotent enough that handling the same URL twice is harmless —
   * the second attempt fails and is swallowed, having already produced a session.
   */
  useEffect(() => {
    if (DEMO_MODE) return;

    let cancelled = false;
    const handle = (url: string | null) => {
      if (!url || cancelled) return;
      // Signal that an auth exchange is starting so the first effect doesn't prematurely
      // clear `loading` and flash the login screen.
      if (url.includes('auth/callback')) authExchangeInFlight.current = true;
      completeAuthFromUrl(url)
        .then((signedIn) => {
          authExchangeInFlight.current = false;
          // Session is now established — clear loading (in case the first effect's settle()
          // skipped it because we were in flight) and dismiss the browser.
          if (signedIn) {
            setLoading(false);
            WebBrowser.dismissBrowser().catch(() => {});
          }
        })
        .catch(() => {
          // A failed exchange leaves the surveyor on the sign-in screen, which is the honest
          // outcome; throwing out of a link handler would take the app down instead.
          authExchangeInFlight.current = false;
          setLoading(false);
        });
    };

    // Check the cold-start URL immediately — before the first effect's getSession can settle.
    void Linking.getInitialURL().then(handle).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (DEMO_MODE) {
      setSession(DEMO_SESSION);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(
      async (email: string, password: string, profile: { name: string; org: string }) => {
        if (DEMO_MODE) {
          setSession(DEMO_SESSION);
          return false;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: profile.name.trim(), organization: profile.org.trim() },
            emailRedirectTo: AUTH_CALLBACK_URL,
          },
        });
        if (error) throw new Error(error.message);
        // Projects with email confirmation on return a user but no session; the caller tells the
        // surveyor to go and confirm rather than dropping them on a screen that cannot load.
        return !data.session;
      },
      [],
    );

  const verifyOtp = useCallback(async (email: string, token: string) => {
    if (DEMO_MODE) {
      setSession(DEMO_SESSION);
      return;
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'signup',
    });
    if (error) throw new Error(error.message);
    if (data.session) setSession(data.session);
  }, []);

  const signOut = useCallback(async () => {
    if (DEMO_MODE) {
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
    // The offline copies of projects and points belong to the account that just left.
    clearResponses();
    setSession(null);
  }, []);

  const enterDemo = useCallback(() => setSession(DEMO_SESSION), []);

  const value = useMemo(
    () => ({ session, loading, signIn, signUp, verifyOtp, signOut, enterDemo }),
    [session, loading, signIn, signUp, verifyOtp, signOut, enterDemo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}