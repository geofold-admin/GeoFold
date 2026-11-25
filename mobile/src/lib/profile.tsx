import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from './api';
import { useAuth } from './auth';
import { DEMO_MODE } from './config';

/**
 * Mandatory profile + terms consent, mirroring the web app's /onboarding gate.
 *
 * The web has gated its whole shell behind this since the consent flow was added; the mobile app
 * did not, so a surveyor who signed up on a phone used the service with an empty profile and
 * `AgreedTermsAtUtc` left null. That acceptance is the legal record of the Terms and Privacy
 * Policy, and a record captured on only one of two clients is not a record.
 *
 * Both clients write the same fields through `PUT /api/profile`, so the server stays the single
 * arbiter of what "complete" means.
 */

export interface Profile {
  fullName: string;
  whatsappNumber: string;
  domicile: string;
  gender: string;
  occupation: string;
  completed: boolean;
}

export interface ProfileInput {
  fullName: string;
  whatsappNumber: string;
  domicile: string;
  gender: string;
  occupation: string;
  agreedTerms: boolean;
}

/** What one settled load produced, tagged with the user it belongs to. */
interface Loaded {
  forUser: string;
  profile: Profile | null;
  complete: boolean;
  error: string | null;
}

interface ProfileValue {
  /** Null until the first load settles. */
  profile: Profile | null;
  loading: boolean;
  /** True once the server says the profile is complete — the gate the navigator reads. */
  complete: boolean;
  /** Set when the check could not reach the server; the onboarding screen offers a retry. */
  error: string | null;
  reload: () => void;
  save: (input: ProfileInput) => Promise<void>;
}

const ProfileContext = createContext<ProfileValue>({
  profile: null,
  loading: true,
  complete: false,
  error: null,
  reload: () => {},
  save: async () => {},
});

export const useProfile = () => useContext(ProfileContext);

/**
 * Ceiling on the profile check.
 *
 * The navigator holds the splash screen until this settles, so a request that never returns is a
 * permanently frozen app — the same trap `lib/auth` already guards `getSession` against, for the
 * same reason. `fetch` on React Native has no default timeout, and a captive portal or a dead
 * network will hang it indefinitely rather than failing.
 */
const PROFILE_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Cached per user so a completed profile does not need the network on every cold start — a
 * surveyor opening the app in the field with no signal must not be sent back to a form they
 * already filled in. Only the completed flag is cached; the values themselves are always fetched.
 */
const cacheKey = (userId: string) => `geofold.profile.complete.${userId}`;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Bumping this re-runs the effect for the same user — that is what the retry button does.
  const [attempt, setAttempt] = useState(0);

  // Demo mode has no server to ask and no real person to hold to an agreement; signed-out has
  // nothing to check. Both are derived rather than written by an effect, so the provider never
  // sets state synchronously during render or on mount.
  const needsFetch = !DEMO_MODE && !!userId;
  const settled = needsFetch && loaded?.forUser === userId;

  useEffect(() => {
    if (!needsFetch || !userId) return;

    let cancelled = false;

    // Everything below runs after an await, so no state is set synchronously in the effect body.
    const run = async () => {
      // A cached "complete" short-circuits the network entirely.
      let cachedComplete = false;
      try {
        cachedComplete = (await AsyncStorage.getItem(cacheKey(userId))) === '1';
      } catch {
        // A broken cache is not a reason to block anyone; fall through to the network.
      }
      if (cancelled) return;

      if (cachedComplete) {
        setLoaded({ forUser: userId, profile: null, complete: true, error: null });
        // Still refresh in the background so the Profile screen shows current values.
        try {
          const p = await withTimeout(api<Profile>('/api/profile'), PROFILE_TIMEOUT_MS);
          if (!cancelled) setLoaded({ forUser: userId, profile: p, complete: p.completed, error: null });
        } catch {
          // Offline with a known-good profile: keep them working.
        }
        return;
      }

      try {
        const p = await withTimeout(api<Profile>('/api/profile'), PROFILE_TIMEOUT_MS);
        if (cancelled) return;
        setLoaded({ forUser: userId, profile: p, complete: p.completed, error: null });
        if (p.completed) await AsyncStorage.setItem(cacheKey(userId), '1').catch(() => {});
      } catch {
        if (cancelled) return;
        // Could not reach the server. Do not let anyone through on a failed check — but say so, so
        // the onboarding screen can offer a retry instead of looking like a broken form.
        setLoaded({
          forUser: userId,
          profile: null,
          complete: false,
          error: 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.',
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [needsFetch, userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const save = useCallback(
    async (input: ProfileInput) => {
      await api<{ ok: true }>('/api/profile', { method: 'PUT', body: input });
      if (!userId) return;
      setLoaded({
        forUser: userId,
        profile: { ...input, completed: true },
        complete: true,
        error: null,
      });
      await AsyncStorage.setItem(cacheKey(userId), '1').catch(() => {});
    },
    [userId],
  );

  const value = useMemo<ProfileValue>(
    () => ({
      profile: settled ? loaded.profile : null,
      loading: needsFetch && !settled,
      complete: needsFetch ? (settled ? loaded.complete : false) : DEMO_MODE,
      error: settled ? loaded.error : null,
      reload,
      save,
    }),
    [needsFetch, settled, loaded, reload, save],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
