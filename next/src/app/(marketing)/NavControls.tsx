'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/lib/i18n'

/**
 * The nav's one control: language.
 *
 * THE THEME BUTTON IS GONE, and it was removed rather than hidden. The site now has a single
 * theme — the corporate palette in paper.css — so a control that switched between two of them
 * would be switching between a design and a design that no longer exists. Removing it here also
 * removes the pre-paint script in the root layout, the `data-theme` attribute, and the ~90 lines
 * of dark-mode overrides across four stylesheets: one design, one place to change it.
 *
 * See NavControls' history for why the marketing header had its own toggle rather than reusing
 * components/ThemeToggle: a state-based icon is wrong in the first frame on a cold paint. That
 * reasoning still applies to any future stateful control added here.
 */

/**
 * Language: a two-state segmented control.
 *
 * The chosen language is written to a cookie and the page is re-rendered on the server, rather
 * than swapped on the client. Every string then arrives already translated in the HTML — which
 * is what the compliance pages need (a verifier must be able to read the whole document without
 * running scripts) and what a crawler sees.
 *
 * `useTransition` keeps the old text on screen while the server round-trip happens instead of
 * blanking the page, and marks the control busy so a second click cannot race the first.
 */
export function LangToggle({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const choose = (next: Locale) => {
    if (next === locale) return
    /* SameSite=Lax so it survives a normal navigation from an external link; no Secure flag
       because localhost is plain http in development and the attribute would drop the cookie
       there. It carries a display preference, not a credential. */
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div className="mk-lang-seg" role="group" aria-label={label} data-pending={pending || undefined}>
      {(['id', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={locale === code}
          className={locale === code ? 'on' : undefined}
          /* The label is always in its own language — "EN" should not be translated into
             Indonesian, and someone who cannot read the current language needs to recognise the
             one they want. */
          lang={code}
        >
          {code === 'id' ? 'ID' : 'EN'}
        </button>
      ))}
    </div>
  )
}
