'use client'

import { Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/lib/i18n'

/**
 * The two nav controls: language and theme.
 *
 * WHY NOT REUSE components/ThemeToggle. That one holds the current theme in React state seeded
 * to 'light' and corrects it in an effect, so a dark-mode visitor is served the wrong icon until
 * hydration finishes — on the app's own chrome that is behind a login and nobody sees it, but
 * this button is in the marketing header on a cold first paint. The version here renders BOTH
 * icons and lets CSS pick, keyed off the same `data-theme` attribute the pre-paint script in the
 * root layout has already written. No state, no effect, correct in the first frame.
 */
export function ThemeToggle({ label }: { label: string }) {
  const toggle = () => {
    const root = document.documentElement
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    try {
      localStorage.setItem('geofold-theme', next)
    } catch {
      /* Private mode, or site data blocked. The theme still applies for this page view; it just
         will not be remembered, which is a better outcome than the button throwing. */
    }
  }

  return (
    <button type="button" className="mk-theme-btn" onClick={toggle} aria-label={label} title={label}>
      <Sun size={15} strokeWidth={1.75} className="mk-icon-sun" aria-hidden="true" />
      <Moon size={15} strokeWidth={1.75} className="mk-icon-moon" aria-hidden="true" />
    </button>
  )
}

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
