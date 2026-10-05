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

  /** Legal form, if any — e.g. 'PT', 'CV', or 'Perorangan' (sole trader).
   *
   *  EMPTIED 2026-09-30 at the client's request: "kata sayba arc (perorangan) ganti Menjadi
   *  Sayba Arc saja." The footer renders `OPERATOR` as `legalName (legalForm)` whenever this is
   *  non-empty, so clearing it is what turns "Sayba Arc (Perorangan)" into "Sayba Arc" — one
   *  value, one place, and the parentheses disappear from every page at once.
   *
   *  Note this is a PRESENTATION change only. The sole-trader status itself has not changed and
   *  is still what the merchant accounts are registered under; if a payment gateway ever needs
   *  the legal form printed, set this back to 'Perorangan' and it returns everywhere. */
  legalForm: '',

  /** Registered business address, as supplied by the operator. Corrected 2026-09-14 — the
   *  operator moved from Pontianak to Sintang. A verifier reads this off the contact page, so it
   *  must stay in step with the address on the iPaymu and Midtrans merchant accounts; update it
   *  there too, or verification fails on the mismatch rather than on anything being wrong.
   *
   *  ⚠️ `postcode` is deliberately empty: the operator gave the address without one, and a
   *  guessed postcode on a page a payment gateway verifies is worse than an absent one. Every
   *  consumer filters empty parts out, so the address renders correctly without it — but fill it
   *  in (Kec. Sintang is in the 786xx range) before submitting for merchant verification. */
  address: {
    line1: 'Dusun Lalang Baru',
    line2: 'Kec. Sintang',
    city: 'Kabupaten Sintang',
    province: 'Kalimantan Barat',
    postcode: '',
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
 * WHERE THE OPERATOR ACTUALLY WORKS, and the one place those coordinates are written.
 *
 * Used by two things that must never disagree: the hero's coordinate readout (which prints them
 * in degrees/minutes/seconds under a label that says what they are) and the globe in the argument
 * section (which marks the same point on the sphere). A coordinate in a marketing hero is a claim
 * that this company works in coordinates; a coordinate that is not the company's own is a lie
 * told in a monospace, and two coordinates on one page that differ is the same lie with a witness.
 *
 * Sintang, Kabupaten Sintang, West Kalimantan — the registered address in `address` above, which
 * moved here from Pontianak on 2026-09-14. If the address moves again, this moves with it.
 *
 * `decimal` is what the projection maths wants; `dms` is what a surveyor reads off a handheld.
 * Both are stated rather than derived at render time, because the conversion rounds and a rounded
 * coordinate printed to a tenth of a second implies an accuracy this is not claiming.
 */
export const SITE_LOCATION = {
  /** Decimal degrees, for the globe's projection. */
  lat: 0.0756,
  lon: 111.4954,
  /** Degrees / minutes / seconds, as a field instrument would display them. */
  dms: { lat: '0°04′32″ N', lon: '111°29′43″ E' },
  place: { id: 'Sintang, Kalimantan Barat', en: 'Sintang, West Kalimantan' },
} as const

/**
 * The operator's OSS registration, printed in the marketing footer as a trust seal.
 *
 * WHY IT IS HERE AND NOT IN THE PAGE. The footer is the one block a payment gateway's
 * verification team scrolls to on every page of the site, and the figures on it are the ones a
 * mismatch would be read as a red flag on. Keeping them beside the rest of the legal identity
 * means there is one file to correct and no page can quietly disagree with another.
 *
 * KBLI 60390 — "Aktivitas Situs Jejaring Sosial dan Distribusi Konten Lainnya" — covers a
 * platform that distributes content and sells premium access through it, which is what the
 * Premium plan does. It is the code the operator asked for and the one that matches the activity.
 * The client asked for it to be shown against the 2025 edition ("KBLI 2025") on 2026-XX; the
 * edition is carried in `kbliEdition` so the footer can say which year the code is read from
 * without the year being hard-coded into the label text in two languages.
 *
 * `ossUrl` points at the public OSS checker rather than a document. There is no per-NIB public
 * URL to link to, so the seal links to the tool where the number can actually be looked up —
 * a link that resolves is worth more than one that looks official and 404s.
 */
export const LEGAL = {
  /* CORRECTED at the client's request: the NIB on the footer was replaced with the current one.
     This is the number a payment gateway's verification team reads and checks against the OSS
     record, so it has to be the live one — an out-of-date NIB is read as a mismatch, not as a
     typo. It is read by the footer seal AND by the Organization structured data in lib/seo.ts,
     so both move together. */
  nib: '0509260000831',
  kbli: '60390',
  /** Which edition of the KBLI the code above is read from. Printed beside the code. */
  kbliEdition: '2025',
  kbliLabel: {
    id: 'Aktivitas Situs Jejaring Sosial dan Distribusi Konten Lainnya',
    en: 'Social Networking Sites and Other Content Distribution Activities',
  },
  ossUrl: 'https://oss.go.id/informasi/kbli-berdasarkan-kbli',
  /** The parent company this product is built and operated by. */
  parent: {
    name: 'SAYBA ARC',
    url: 'https://sayba.id',
  },
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
