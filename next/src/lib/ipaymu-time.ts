/**
 * iPaymu's clock, parsed honestly.
 *
 * The gateway reports deadlines in WIB (UTC+7) as "YYYY-MM-DD HH:mm:ss" — no offset, no zone
 * marker. `new Date(that)` parses it in whatever zone the code happens to run in: the server runs
 * in UTC on Vercel, the browser runs wherever the buyer is, and BOTH were wrong by seven hours in
 * the same direction. A QRIS code that had already lapsed was treated as live for another seven,
 * which is exactly why the checkout kept handing back a QR the gateway had already killed.
 *
 * This module is deliberately dependency-free so the client and the server parse the same string
 * the same way. ISO strings that DO carry their own zone — the demo data, the database's UTC
 * columns — are passed through untouched.
 */

/** WIB is UTC+7, year-round: Indonesia has no daylight saving. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Parse a deadline string to epoch milliseconds.
 *
 * `YYYY-MM-DD HH:mm:ss` and `YYYY-MM-DDTHH:mm:ss` (seconds and fraction optional) are read as
 * WIB. Anything else — `...Z`, `...+07:00` — is left to `Date.parse`, which honours the offset
 * the string carries. Returns NaN for anything unparseable, and every caller treats that as
 * "unknown", never as "valid".
 */
export function parseIpaymuDeadline(value: unknown): number {
  if (typeof value !== 'string') return NaN
  const s = value.trim()
  if (!s) return NaN
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/)
  if (m) {
    const [, y, mo, d, h, mi, se] = m
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? '0')) - WIB_OFFSET_MS
  }
  return Date.parse(s)
}
