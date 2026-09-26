import type { MetadataRoute } from 'next'
import { PUBLIC_PAGES, SITE } from '@/lib/seo'

/**
 * The sitemap.
 *
 * WHY IT IS ONE URL PER PAGE AND NOT ONE PER LANGUAGE. The site serves Indonesian and English
 * from the SAME path by content negotiation (see lib/i18n.ts) — there is no /id and no /en. A
 * sitemap cannot list a URL twice, and `hreflang` pointing at two paths that do not exist would
 * be worse than no annotation at all, so each page is listed once and the crawler gets the
 * language its own Accept-Language asks for.
 *
 * `lastModified` is intentionally omitted rather than set to `new Date()`. A build timestamp is
 * not a modification date: it would tell a crawler that all eleven pages changed on every deploy,
 * which is false and is exactly the signal that teaches a crawler to ignore the field. The honest
 * options are a real per-page date or nothing, and there is no per-page date to read here.
 *
 * WHICH PAGES ARE MISSING, AND WHY THAT IS THE POINT. `/login`, `/reset`, `/onboarding`, the
 * whole signed-in app, `/auth/callback`, and `/ipaymu-test` are all reachable but deliberately
 * absent: they are either behind authentication or exist to serve a redirect, and indexing them
 * puts a sign-in form in search results where a product page should be.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: `${SITE}${page.path === '/' ? '' : page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}
