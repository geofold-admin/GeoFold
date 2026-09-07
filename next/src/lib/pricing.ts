/**
 * What a premium period costs and how long it lasts — the one place that decides it.
 *
 * Kept out of `midtrans.ts` so the marketing, pricing, FAQ and refund pages can read the real
 * configured numbers without importing the payment client (and `node:crypto` with it). A price
 * quoted on a public page that disagrees with what the checkout charges is a consumer-protection
 * problem, so nothing here should be duplicated as a literal anywhere else.
 */

const asPositiveInt = (v: string | undefined, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Price of one premium period, in whole rupiah. */
export const PREMIUM_PRICE_IDR = asPositiveInt(process.env.PREMIUM_PRICE_IDR, 49000)

/** Days of premium granted per payment. */
export const PREMIUM_DAYS = asPositiveInt(process.env.PREMIUM_DAYS, 30)

/** 49000 → "Rp 49.000". Indonesian grouping, no decimals — rupiah has no subunit in practice. */
export function formatIdr(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(amount))}`
}

/** The headline price, formatted: "Rp 49.000". */
export const PREMIUM_PRICE_LABEL = formatIdr(PREMIUM_PRICE_IDR)
