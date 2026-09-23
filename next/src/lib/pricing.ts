/**
 * What a premium period costs, how long it lasts, and how much storage it carries — the one place
 * that decides it.
 *
 * Kept out of the gateway clients (`ipaymu.ts`, `midtrans.ts`) so the marketing, pricing, FAQ and
 * refund pages can read the real configured numbers without importing a payment client (and
 * `node:crypto` with it). A price quoted on a public page that disagrees with what the checkout
 * charges is a consumer-protection problem, so nothing here should be duplicated as a literal
 * anywhere else.
 *
 * Repriced 2026-09-14: Rp 35.000 for 30 days, every feature, 5 GB of cloud storage.
 */

const asPositiveInt = (v: string | undefined, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Price of one premium period, in whole rupiah. */
export const PREMIUM_PRICE_IDR = asPositiveInt(process.env.PREMIUM_PRICE_IDR, 35000)

/** Days of premium granted per payment. */
export const PREMIUM_DAYS = asPositiveInt(process.env.PREMIUM_DAYS, 30)

/**
 * Cloud storage included with plans, in megabytes:
 * - Free: 10 MB per account
 * - Pro: 500 MB per account
 */
export const FREE_STORAGE_MB = asPositiveInt(process.env.FREE_STORAGE_MB, 10)
export const FREE_STORAGE_BYTES = FREE_STORAGE_MB * 1024 * 1024
export const FREE_STORAGE_LABEL = `${FREE_STORAGE_MB} MB`

export const PREMIUM_STORAGE_MB = asPositiveInt(process.env.PREMIUM_STORAGE_MB, 500)
export const PREMIUM_STORAGE_BYTES = PREMIUM_STORAGE_MB * 1024 * 1024
export const PREMIUM_STORAGE_LABEL = `${PREMIUM_STORAGE_MB} MB`
export const PREMIUM_STORAGE_GB = PREMIUM_STORAGE_MB / 1024

/** 35000 → "Rp 35.000". Indonesian grouping, no decimals — rupiah has no subunit in practice. */
export function formatIdr(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(amount))}`
}

/** The headline price, formatted: "Rp 35.000". */
export const PREMIUM_PRICE_LABEL = formatIdr(PREMIUM_PRICE_IDR)

/** Bytes → "1,4 GB" / "820 MB" / "12 KB", for usage readouts. Indonesian decimal comma. */
export function formatBytes(bytes: number): string {
  const units: Array<[number, string, number]> = [
    [1024 ** 3, 'GB', 1],
    [1024 ** 2, 'MB', 0],
    [1024, 'KB', 0],
  ]
  for (const [size, unit, digits] of units) {
    if (bytes >= size) {
      const n = bytes / size
      return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(n)} ${unit}`
    }
  }
  return `${Math.max(0, Math.round(bytes))} B`
}
