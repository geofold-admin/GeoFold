/**
 * Single source of truth for the operator's legal + contact details.
 *
 * Payment gateways (iPaymu, Midtrans) verify a merchant by opening the public site and checking
 * that a real business is behind it: a reachable email, a reachable phone, and a physical address.
 * Every page that has to show those details reads them from here, so there is exactly one place to
 * correct and no page can drift out of step with another.
 *
 * Filled in 2026-09-07. If any of it changes, change it here and nowhere else.
 */

export const BUSINESS = {
  /** Trading name shown in the UI. */
  brand: 'GeoFold',

  /** Legal entity that owns the service and receives payments. Must match the name on the
   *  gateway's merchant account and on the bank account settlements go to. */
  legalName: 'Sayba Arc',

  /** Legal form, if any — e.g. 'PT', 'CV', or 'Perorangan' (sole trader). */
  legalForm: 'Perorangan',

  /** Registered business address, as supplied by the operator 2026-09-07. A verifier reads this
   *  off the contact page, so it must stay in step with the address on the merchant account. */
  address: {
    line1: 'Jl. 28 Oktober',
    line2: 'Siantan Hulu, Kec. Jongkat',
    city: 'Kota Pontianak',
    province: 'Kalimantan Barat',
    postcode: '78241',
    country: 'Indonesia',
  },

  /** Business phone. Must be answerable — verifiers do call. */
  phone: '+62 877-2191-6495',
  /** Same number, digits only, for tel: and wa.me links. */
  phoneHref: '+6287721916495',
  /** WhatsApp number in wa.me form (digits, no +). Leave '' if WhatsApp is not offered. */
  whatsapp: '6287721916495',

  email: {
    /** General enquiries and the address printed on the contact page. */
    general: 'sayba.help@gmail.com',
    /** Support, billing and refund requests. Can be the same address. */
    support: 'sayba.help@gmail.com',
    /** Where refund requests are read. Can be the same address. */
    billing: 'sayba.help@gmail.com',
  },

  /** Canonical public origin, no trailing slash. */
  site: 'https://geofold.sayba.id',

  /** Local business hours, shown on the contact page. */
  hours: {
    id: 'Senin–Jumat, 09.00–17.00 WIB (kecuali hari libur nasional)',
    en: 'Monday–Friday, 09:00–17:00 WIB (excluding Indonesian public holidays)',
  },

  /** Target first-response time for support and refund requests. */
  responseTime: { id: '1 hari kerja', en: '1 business day' },

  /** Tax id, if registered. Shown on the contact page when set — leave '' to hide the row. */
  npwp: '',
} as const

/**
 * The Android builds offered on /download.
 *
 * `url` is where the APK is actually hosted. It is not served from this app: Vercel is not a file
 * host and the builds are ~180 MB, well past Supabase Storage's 50 MB per-file limit on the free
 * plan. A GitHub release asset (2 GB limit, free) is the intended home.
 *
 * ⚠️ Leave `url` empty until a build is really published there. The page detects the empty string
 * and tells the visitor how to request the file instead of offering a link that 404s — a dead
 * download link on a page a payment gateway is verifying is worse than no link.
 */
export const APP_DOWNLOADS = [
  {
    id: 'standard',
    name: 'GeoFold',
    packageName: 'app.geofold.mobile',
    summary: {
      id: 'Aplikasi survei lapangan. Ini yang dibutuhkan sebagian besar pengguna.',
      en: 'The field survey app. This is the one most people want.',
    },
    size: '~178 MB',
    url: '',
  },
  {
    id: 'drone',
    name: 'GeoFold Drone (DJI MSDK V5)',
    packageName: 'app.geofold.drone',
    summary: {
      id: 'Seluruh aplikasi survei ditambah layar drone untuk armada DJI enterprise dan Mini 3 ke atas.',
      en: 'The whole survey app plus the drone screen, for DJI enterprise aircraft and Mini 3 upwards.',
    },
    size: '~193 MB',
    url: '',
  },
  {
    id: 'drone-v4',
    name: 'GeoFold Drone V4 (DJI MSDK V4)',
    packageName: 'app.geofold.drone.v4',
    summary: {
      id: 'Untuk armada DJI generasi lama, termasuk Mavic Mini, yang tidak didukung MSDK V5.',
      en: 'For the older DJI consumer fleet, including the Mavic Mini, which MSDK V5 does not support.',
    },
    size: '~179 MB',
    url: '',
  },
] as const

/** Minimum Android version the builds run on — read off the built APK's manifest
 *  (uses-sdk minSdkVersion=24), not assumed. */
export const ANDROID_MIN = '7.0 (API 24)'

/** Address as a single line, for meta tags and structured data. */
export const ADDRESS_ONE_LINE = [
  BUSINESS.address.line1,
  BUSINESS.address.line2,
  BUSINESS.address.city,
  BUSINESS.address.province,
  BUSINESS.address.postcode,
  BUSINESS.address.country,
]
  .filter(Boolean)
  .join(', ')

/** The name to print wherever the contracting party has to be identified. */
export const OPERATOR = BUSINESS.legalForm
  ? `${BUSINESS.legalName} (${BUSINESS.legalForm})`
  : BUSINESS.legalName
