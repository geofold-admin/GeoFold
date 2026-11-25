import NetInfo from '@react-native-community/netinfo';

import { hasResponse, readResponse, saveResponse } from './api-cache';
import { API_BASE_URL, DEMO_MODE } from './config';
import { demoResponse } from './demo';
import { storedSession, supabase } from './supabase';

/**
 * API client for the GeoFold server.
 *
 * The web client is same-origin and rides on the Supabase cookie session. A native app has no
 * cookie jar, so it authenticates with `Authorization: Bearer <access_token>` — the server's
 * `getUserId()` accepts either.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** 403 raised by a plan limit rather than by a permission problem. */
  get isQuota() {
    return this.status === 403 && this.code === 'quota_exceeded';
  }

  /** No connection, and no copy of this answer saved on the phone to fall back on. */
  get isOffline() {
    return this.code === 'offline';
  }
}

const NO_SAVED_COPY =
  "You're offline, and this hasn't been saved on this phone yet. It loads once you're back online.";
const OFFLINE = "You're offline. This loads once you're back online.";
const OFFLINE_WRITE = "You're offline. Try again once you're back online.";

/** How long a GET with a saved copy waits for the server before showing that copy instead. */
const SAVED_COPY_WAIT_MS = 12_000;

/** Statuses meaning the server could not be reached, not that it refused the request. */
const UNREACHABLE = new Set([502, 503, 504]);

/**
 * False only when the phone has no network at all (airplane mode, no signal). Android's "internet
 * reachable" probe is not trusted here, because some networks block it while the GeoFold API works
 * fine. A network that is up but leads nowhere is handled by the stall timer in `api` instead.
 */
async function hasNetwork(): Promise<boolean> {
  try {
    return (await NetInfo.fetch()).isConnected !== false;
  } catch {
    return true;
  }
}

export async function accessToken(): Promise<string | null> {
  if (DEMO_MODE) return 'demo';
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /**
   * GET only. By default every answer is saved on the phone, and that copy is returned when there
   * is no connection. Pass 'none' for answers that are useless later, such as short-lived signed
   * URLs, or that must come from the server, such as a form about to be edited.
   */
  cache?: 'none';
}

/**
 * Calls the GeoFold API. Every GET goes to the server first and keeps a copy of what it returns.
 * When the phone is offline, the server is unreachable, or the request stalls, the call returns
 * that copy instead, so the map, the projects and the capture forms keep working in the field.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET';

  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 180));
    // The body has to reach the demo store, or writes look accepted and then vanish.
    return demoResponse<T>(path, method, options.body);
  }

  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token ?? null;
  // Signed in, but the access token ran out while there was no connection to refresh it (see
  // `storedSession`). A request without a token would earn a 401, and a 401 signs the surveyor
  // out, so in this state nothing goes to the server.
  const stranded = auth.session ? null : await storedSession();
  // Copies are kept per account, so a shared phone never shows one surveyor another's projects.
  const owner =
    method === 'GET' && options.cache !== 'none' ? ((auth.session ?? stranded)?.user?.id ?? null) : null;

  const savedCopy = async (): Promise<T> => {
    const saved = owner ? await readResponse<T>(owner, path) : null;
    if (!saved) throw new ApiError(0, owner ? NO_SAVED_COPY : OFFLINE, 'offline');
    return saved.data;
  };

  if (stranded) {
    if (method === 'GET') return savedCopy();
    throw new ApiError(0, OFFLINE_WRITE, 'offline');
  }

  // No network at all: answer from the phone immediately instead of waiting for the request to fail.
  if (owner && !(await hasNetwork())) return savedCopy();

  // With a copy to fall back on, a request that stalls (a signal too weak to carry it, or Wi-Fi
  // with no internet behind it) gives way to that copy rather than leaving a spinner up. The timer
  // covers only the wait for the response headers; a slow download of a large body is left alone.
  const controller = new AbortController();
  const outer = options.signal;
  const forwardAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  outer?.addEventListener('abort', forwardAbort);
  const stall = owner && hasResponse(owner, path) ? setTimeout(() => controller.abort(), SAVED_COPY_WAIT_MS) : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (e) {
    // A cancellation by the caller is not a connectivity problem; let it through as it was.
    if (outer?.aborted) throw e;
    if (method === 'GET') return savedCopy();
    throw e;
  } finally {
    if (stall) clearTimeout(stall);
    outer?.removeEventListener('abort', forwardAbort);
  }

  // The server is down or restarting: a saved copy beats an error page. With no copy, the request
  // falls through and reports the status as before.
  if (owner && UNREACHABLE.has(res.status) && hasResponse(owner, path)) return savedCopy();

  if (res.status === 401) {
    // The refresh token is gone or revoked. Clearing the session sends the router back to /login.
    await supabase.auth.signOut();
    throw new ApiError(401, 'Your session expired. Please sign in again.');
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      code = body.error;
      message = body.message ?? (Array.isArray(body.errors) ? body.errors.join(', ') : message);
    } catch {
      // non-JSON body — keep the generic message
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  if (!owner) return (await res.json()) as T;

  const raw = await res.text();
  const data = JSON.parse(raw) as T;
  saveResponse(owner, path, raw);
  return data;
}

/** Fire-and-forget wake-up so a cold-started server boots while the surveyor is still typing. */
export function warmBackend(): void {
  if (DEMO_MODE) return;
  fetch(`${API_BASE_URL}/api/health`).catch(() => {});
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
