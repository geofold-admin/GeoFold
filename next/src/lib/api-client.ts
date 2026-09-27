import { DEMO_MODE, demoResponse } from './demo'

// Browser API client. Same-origin, so the Supabase cookie session is sent automatically — no
// bearer token, no base URL, no CORS. Short-circuits to sample data in demo mode.
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  /**
   * The parsed error body, when the server sent one.
   *
   * WHY THIS EXISTS. Some refusals carry data the caller must act on rather than merely display:
   * `invoice_pending` (409 from the checkout routes) includes the order id of the unpaid invoice
   * the buyer already holds, so the checkout can send them to it instead of showing a message
   * about a problem they cannot see. Flattening that into `message` would lose it.
   */
  readonly body?: Record<string, unknown>
  constructor(status: number, message: string, code?: string, body?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
  get isQuota() {
    return this.status === 403 && this.code === 'quota_exceeded'
  }
}

// Fire-and-forget wake-up so a cold-started backend boots while the user works.
export function warmBackend(): void {
  if (DEMO_MODE) return
  fetch('/api/health', { method: 'GET', keepalive: true }).catch(() => {})
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 180))
    return demoResponse<T>(path, options)
  }

  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })

  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new ApiError(401, 'Your session expired. Please sign in again.')
  }

  if (!res.ok) {
    let code: string | undefined
    let body: Record<string, unknown> | undefined
    let message = `Request failed (${res.status}).`
    try {
      const parsed = await res.json()
      body = parsed
      code = parsed.error
      message = parsed.message ?? (Array.isArray(parsed.errors) ? parsed.errors.join(', ') : message)
    } catch {
      // non-JSON body
    }
    throw new ApiError(res.status, message, code, body)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
