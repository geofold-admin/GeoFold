import { cookies, headers } from 'next/headers'
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from './i18n'

/**
 * Request-time locale resolution. Server components only.
 *
 * Kept apart from ./i18n because that module is imported by the nav, which is a client
 * component: anything in a client import graph that touches `next/headers` fails the build.
 * Everything shareable — the type, the cookie name, the header parser, the chrome strings —
 * stays in ./i18n; only the two request APIs live here.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const chosen = store.get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  const h = await headers()
  return localeFromAcceptLanguage(h.get('accept-language'))
}
