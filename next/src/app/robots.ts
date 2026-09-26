import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/seo'

/**
 * robots.txt.
 *
 * WHAT IS DISALLOWED AND WHY. The signed-in app is not secret — every route under it redirects an
 * anonymous visitor to the sign-in page — but crawling it is pure cost: a bot spends its budget
 * following links into screens it can never see, and the pages it does index are empty shells.
 * The API is disallowed for the same reason plus one more: a crawler that issues GET requests
 * against endpoints expecting POST will fill the logs with noise that hides real errors.
 *
 * THE MARKETING SITE IS NOT DISALLOWED, and neither is anything a payment gateway's verification
 * team reads. `/terms`, `/privacy`, `/refund-policy`, `/contact` and `/faq` must stay crawlable:
 * a verifier that cannot reach them cannot approve the merchant account.
 *
 * THE SITEMAP LINE IS THE POINT OF THE FILE for everything else. Without it a crawler finds the
 * eleven public pages by following links, which works but is slower and can miss a page that is
 * only reachable from the footer.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          /* The signed-in app. `_next` is excluded so a bot does not waste its budget on build
             assets that are not pages. */
          '/login',
          '/reset',
          '/onboarding',
          '/map',
          '/projects',
          '/surveys',
          '/subscription',
          '/settings',
          '/_next/',
          /* A sandbox return page for the payment integration. It is a test artefact, not a page
             anyone should land on from a search result. */
          '/ipaymu-test',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
