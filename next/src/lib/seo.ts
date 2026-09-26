import type { Metadata } from 'next'
import { BUSINESS, LEGAL } from './business'
import type { Locale } from './i18n'

/**
 * The canonical origin, and the base every relative URL in metadata resolves against.
 *
 * WITHOUT THIS, Next.js writes `og:image` as a path (`/og.png`) rather than an absolute URL, and
 * every social crawler — WhatsApp, Facebook, X, LinkedIn — silently drops the preview card. It is
 * also the reason a shared link shows the raw URL instead of a card: no base, no image. Nothing
 * errors; the preview just quietly does not appear.
 */
export const SITE = BUSINESS.site

/**
 * The public pages, in the order they should be crawled.
 *
 * This is the ONE list. `sitemap.ts` and the footer both need the set of public URLs, and two
 * hand-maintained lists drift: a page gets added, the sitemap is updated, the footer is not (or
 * the reverse), and the difference is invisible until someone audits the site. Anything that is
 * not meant to be indexed — the OAuth callback, the iPaymu sandbox return page, the signed-in
 * app — is deliberately absent, and its absence here is what keeps it out of the sitemap.
 *
 * `priority` and `changeFrequency` are hints, not directives: Google treats them as weak signals
 * and ignores them more often than not. They are set honestly anyway, because a sitemap that
 * claims everything is 1.0 tells a crawler nothing.
 */
export const PUBLIC_PAGES = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/product', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/download', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/about', priority: 0.6, changeFrequency: 'yearly' as const },
  { path: '/contact', priority: 0.7, changeFrequency: 'yearly' as const },
  { path: '/support', priority: 0.6, changeFrequency: 'yearly' as const },
  { path: '/terms', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/privacy', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/refund-policy', priority: 0.4, changeFrequency: 'yearly' as const },
] as const

/** Everything a page needs to describe itself, in one call. */
export interface PageSeo {
  /** Page title WITHOUT the brand suffix; the helper appends it. */
  title: string
  description: string
  /** Route path, e.g. `/pricing`. Used for the canonical URL and the OG URL. */
  path: string
  locale: Locale
}

/**
 * Normalise a page title so the helper can own the brand suffix.
 *
 * The page dictionaries were written before this helper existed and put the brand in the title
 * themselves, in BOTH positions: the inner pages end with it (`About | GeoFold`, once the em
 * dashes were replaced) and the homepage LEADS with it (`GeoFold | Field surveys that never lose
 * a point`). Appending the brand unconditionally therefore produced two different bugs, and the
 * second was invisible until the title was read off the rendered page:
 *
 *     /about    About | GeoFold                     (correct)
 *     /         GeoFold, Field surveys ... | GeoFold (brand twice)
 *
 * So a LEADING brand is stripped as well as a trailing one, and the separator that follows it
 * goes with it. The result is a bare page title in every case, and `pageMetadata` appends exactly
 * one brand to it.
 */
function stripBrand(title: string): string {
  return title
    /* Leading brand, with the separator that followed it. The hyphen goes LAST in the class: in
       any other position it defines a range, and `–-` is out of order, which TypeScript rejects
       (TS1517) and which would silently mis-match at runtime. */
    .replace(/^\s*GeoFold\s*[|—–:,.-]\s*/i, '')
    /* Trailing brand, with the separator that preceded it. Same ordering rule. */
    .replace(/\s*[|—–.-]\s*GeoFold\s*$/i, '')
    .replace(/\s*[,:]\s*GeoFold\s*$/i, '')
    .trim()
}

/**
 * Build a page's metadata.
 *
 * WHY A HELPER AND NOT A `metadata` OBJECT PER PAGE. Eleven pages each wrote
 * `{ title, description }` by hand, which meant eleven chances to forget the canonical URL, the
 * OG image or the Twitter card, and every one of them did forget all three. Centralising it
 * means a new page gets the full set by existing, and a change (a new OG image, a different card
 * type) lands everywhere at once.
 *
 * THE TITLE SEPARATOR IS A PIPE, NOT AN EM DASH. Both are common, but `|` is the safer choice in
 * a `<title>`: it needs no escaping, it renders identically in every browser's tab strip and in
 * every search result, and it cannot be confused with a hyphen in a page's own words.
 */
export function pageMetadata({ title, description, path, locale }: PageSeo): Metadata {
  const url = `${SITE}${path === '/' ? '' : path}`
  const clean = stripBrand(title)
  const fullTitle = `${clean} | ${BUSINESS.brand}`

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: BUSINESS.brand,
      type: 'website',
      locale: locale === 'id' ? 'id_ID' : 'en_US',
      /* `alt` is not decoration: a crawler with images disabled, and a screen reader on a link
         preview, both read it instead of the picture. */
      images: [{ url: '/og.png', width: 1200, height: 630, alt: `${BUSINESS.brand}: ${title}` }],
    },
    twitter: {
      /* `summary_large_image` is what makes X show the wide card rather than a thumbnail. */
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ['/og.png'],
    },
  }
}

/**
 * The Organization node, shared by every page's JSON-LD.
 *
 * WHY IT IS WORTH SHIPPING. This is the machine-readable version of the trust panel in the
 * footer: who operates the service, how to reach them, where they are, and the registration
 * number. It is what a search engine reads to decide the site is a real business, and it is the
 * same set of facts a payment gateway's verification team checks by hand. One source
 * (`lib/business.ts`), two consumers.
 *
 * NO `aggregateRating`, NO `review`, NO `award`. Those are the fields that make rich results look
 * impressive and are the ones a fabricated value gets a manual action for. There are no real
 * reviews, so there is no rating — an absent field costs nothing and an invented one costs the
 * domain.
 */
export function organizationJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE}/#organization`,
    name: BUSINESS.brand,
    legalName: BUSINESS.legalName,
    url: SITE,
    logo: { '@type': 'ImageObject', url: `${SITE}/geofold-mark.svg` },
    image: `${SITE}/og.png`,
    email: BUSINESS.email.general,
    telephone: BUSINESS.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${BUSINESS.address.line1}, ${BUSINESS.address.line2}`,
      addressLocality: BUSINESS.address.city,
      addressRegion: BUSINESS.address.province,
      addressCountry: 'ID',
    },
    /* The parent is a real, verifiable entity with its own domain, so it is declared as a
       relationship rather than described in prose. */
    parentOrganization: { '@type': 'Organization', name: LEGAL.parent.name, url: LEGAL.parent.url },
    /* KBLI is an Indonesian business classification, not a schema.org field, so it rides along as
       an identifier rather than being forced into a property that does not mean this. */
    identifier: [
      { '@type': 'PropertyValue', name: 'NIB', value: LEGAL.nib },
      { '@type': 'PropertyValue', name: 'KBLI', value: LEGAL.kbli },
    ],
    ...(locale === 'id' ? { knowsLanguage: ['id', 'en'] } : { knowsLanguage: ['en', 'id'] }),
  }
}

/**
 * The SoftwareApplication node for the product itself.
 *
 * WHY `offers` IS BUILT FROM THE REAL PRICE. A structured-data price that disagrees with the
 * pricing page is the kind of mismatch that gets a merchant flagged, and hard-coding it here
 * would guarantee it drifts the next time the price changes. It reads the same constant the
 * checkout charges.
 *
 * NO `aggregateRating`. See the note above: there are no reviews to average.
 */
export function softwareJsonLd(input: {
  locale: Locale
  priceIdr: number
  storageLabel: string
  freeStorageLabel: string
}) {
  const { locale, priceIdr, storageLabel, freeStorageLabel } = input
  const id = locale === 'id'

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE}/#software`,
    name: BUSINESS.brand,
    applicationCategory: 'BusinessApplication',
    /* Android is what actually ships; the web app is the companion. */
    operatingSystem: 'Android 7.0+, Web',
    url: SITE,
    downloadUrl: `${SITE}/download`,
    publisher: { '@id': `${SITE}/#organization` },
    description: id
      ? `Aplikasi survei lapangan untuk Android: foto berkoordinat, pencatatan offline, dan ekspor XLSX/CSV. Gratis dengan penyimpanan ${freeStorageLabel}, atau ${storageLabel} pada paket Premium.`
      : `A field survey app for Android: geo-tagged photos, offline capture, and XLSX/CSV export. Free with ${freeStorageLabel} of storage, or ${storageLabel} on Premium.`,
    offers: [
      {
        '@type': 'Offer',
        name: id ? 'Gratis' : 'Free',
        price: '0',
        priceCurrency: 'IDR',
        description: id
          ? `Tiga proyek pertama tanpa biaya, penyimpanan ${freeStorageLabel}.`
          : `Your first three projects at no cost, ${freeStorageLabel} of storage.`,
      },
      {
        '@type': 'Offer',
        name: id ? 'Premium' : 'Premium',
        price: String(priceIdr),
        priceCurrency: 'IDR',
        description: id
          ? `Semua fitur, penyimpanan ${storageLabel}, ditagih per 30 hari.`
          : `Every feature, ${storageLabel} of storage, billed per 30 days.`,
      },
    ],
  }
}

/**
 * A FAQPage node, built from the questions the page actually renders.
 *
 * THE QUESTIONS COME FROM THE PAGE, NOT FROM HERE. Google requires that the markup matches what a
 * visitor can read on the page; answering a question in structured data that the page does not
 * show is a guideline violation, and it is the kind that earns a manual action rather than a
 * warning. So this takes the rendered pairs as input and never invents one.
 */
export function faqJsonLd(items: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

/** A breadcrumb trail. Every page here sits one level below the home page. */
export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.path === '/' ? '' : item.path}`,
    })),
  }
}
