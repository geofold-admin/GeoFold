/**
 * Two languages for the marketing site: Indonesian and English.
 *
 * HOW THE LANGUAGE IS CHOSEN, in order:
 *   1. the `geofold-lang` cookie, if the visitor has picked one from the nav;
 *   2. otherwise the browser's own Accept-Language, which is what the brief asks for —
 *      an Indonesian-preferring browser gets Indonesian, everyone else gets English.
 *
 * WHY THE HEADER AND NOT THE IP. "Outside Indonesia, use English" is the intent, but geo-IP is
 * the wrong instrument for it: it misroutes Indonesians abroad, anyone on a VPN, and every
 * foreign consultant working in-country — exactly the people this product is sold to. The
 * browser's language list is what the visitor actually set, travels with them, and costs no
 * lookup. An Indonesian speaker in Jakarta and one in Sydney both get Indonesian, which is the
 * behaviour anyone would want.
 *
 * WHY SERVER-SIDE. Deciding on the client would mean serving one language and swapping it after
 * hydration — a visible flash, and a first paint that says the wrong thing to a crawler. Every
 * route already runs dynamically for the CSP nonce, so reading a header per request costs
 * nothing that was not already being paid.
 *
 * THIS MODULE IS CLIENT-SAFE ON PURPOSE. The nav is a client component (it marks the current
 * route with aria-current) and needs the labels and the cookie name from here, so nothing in this
 * file may reach for `next/headers` — importing it anywhere in a client graph fails the build
 * outright. Request-time resolution lives in ./i18n.server instead. Note that `tsc` will not
 * catch a regression here: the server/client boundary is the bundler's rule, not the type
 * system's, so this only shows up when the page is actually built.
 *
 * NOT next-intl / not routed locales. No /id and /en URL prefixes: the compliance pages are
 * already indexed and linked from a payment gateway's merchant record at their current paths,
 * and moving them to satisfy a language switch is not a trade worth making. One URL, content
 * negotiated.
 */

export type Locale = 'id' | 'en'

export const LOCALES: readonly Locale[] = ['id', 'en']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'geofold-lang'
/** A year: the choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return value === 'id' || value === 'en'
}

/**
 * Pick a locale from an Accept-Language header.
 *
 * Walks the tags in descending q-order and returns the first one we actually publish. Tags we do
 * not publish are skipped rather than treated as a miss, so `de-DE,de;q=0.9,en;q=0.5` still lands
 * on English instead of falling through to the default by accident — same answer here, but not
 * for a header that lists Indonesian third.
 *
 * `in` is checked alongside `id`: it is the deprecated ISO code for Indonesian and some older
 * Android builds still send it.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE

  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2)
      const quality = q === undefined ? 1 : Number.parseFloat(q)
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(quality) ? quality : 0 }
    })
    .filter((t) => t.tag.length > 0 && t.q > 0)
    /* Stable sort by q descending; ties keep the header's own order, which is its priority. */
    .sort((a, b) => b.q - a.q)

  for (const { tag } of tags) {
    if (tag === '*') return DEFAULT_LOCALE
    const base = tag.split('-')[0]
    if (base === 'id' || base === 'in') return 'id'
    if (base === 'en') return 'en'
  }

  return DEFAULT_LOCALE
}

/** Narrow a `{ id, en }` pair to the active language. */
export function t<T>(dict: Record<Locale, T>, locale: Locale): T {
  return dict[locale]
}

/**
 * Chrome that appears on every page. Page-specific copy lives beside its own page instead of
 * being collected here — a central dictionary of 900 strings is a file nobody can review, and
 * the whole point of these pages is that the wording gets checked against what the app does.
 */
export const chrome: Record<Locale, {
  nav: { home: string; product: string; pricing: string; download: string; faq: string; about: string; contact: string; portal: string }
  footer: { product: string; company: string; account: string; help: string; legal: string; features: string; pricing: string; download: string; about: string; contact: string; login: string; faq: string; support: string; terms: string; refund: string; privacy: string; rights: string }
  a11y: { theme: string; language: string; nav: string }
}> = {
  id: {
    nav: {
      home: 'Beranda',
      product: 'Produk',
      pricing: 'Harga',
      download: 'Unduh',
      faq: 'FAQ',
      about: 'Tentang',
      contact: 'Kontak',
      portal: 'Portal',
    },
    footer: {
      product: 'Produk',
      company: 'Perusahaan',
      account: 'Akun',
      help: 'Bantuan',
      legal: 'Legal',
      features: 'Fitur',
      pricing: 'Harga',
      download: 'Unduh aplikasi',
      about: 'Tentang',
      contact: 'Kontak',
      login: 'Masuk portal',
      faq: 'FAQ',
      support: 'Dukungan',
      terms: 'Syarat & Ketentuan',
      refund: 'Kebijakan Pengembalian Dana',
      privacy: 'Kebijakan Privasi',
      rights: 'Seluruh hak cipta dilindungi.',
    },
    a11y: {
      theme: 'Ganti tema terang atau gelap',
      language: 'Bahasa',
      nav: 'Navigasi utama',
    },
  },
  en: {
    nav: {
      home: 'Home',
      product: 'Product',
      pricing: 'Pricing',
      download: 'Download',
      faq: 'FAQ',
      about: 'About',
      contact: 'Contact',
      portal: 'Portal',
    },
    footer: {
      product: 'Product',
      company: 'Company',
      account: 'Account',
      help: 'Help',
      legal: 'Legal',
      features: 'Features',
      pricing: 'Pricing',
      download: 'Download app',
      about: 'About',
      contact: 'Contact',
      login: 'Portal login',
      faq: 'FAQ',
      support: 'Support',
      terms: 'Terms & Conditions',
      refund: 'Refund Policy',
      privacy: 'Privacy Policy',
      rights: 'All rights reserved.',
    },
    a11y: {
      theme: 'Toggle light or dark theme',
      language: 'Language',
      nav: 'Main navigation',
    },
  },
}
