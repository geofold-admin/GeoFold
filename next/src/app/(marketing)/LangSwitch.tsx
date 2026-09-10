'use client'

import { useState, type ReactNode } from 'react'
import type { Locale } from '@/lib/i18n'

/**
 * Indonesian/English switch for the compliance pages.
 *
 * Both languages are rendered on the server and one is hidden with `hidden` rather than swapped
 * out, so the full text of both is always present in the delivered HTML. That matters here: a
 * payment gateway's verification team reads these pages, and anything that only appears after a
 * click is something they can miss.
 *
 * WHY THIS IS NOT THE SITE-WIDE LANGUAGE CONTROL. The nav's toggle sets a cookie and re-renders
 * on the server, so only the chosen language is in the HTML. That is right for marketing copy and
 * wrong for a legal document, for the reason above. So the two coexist: this switch decides which
 * of the two already-present documents is visible, and `initial` seeds it from the site language
 * so a visitor reading the site in English does not land on the Indonesian terms and have to
 * hunt for the toggle.
 *
 * Indonesian remains the version that governs — `initial` changes which one is shown first, not
 * which one is authoritative. The pages themselves say so in their own text.
 */
export function LangSwitch({
  id,
  en,
  initial = 'id',
}: {
  id: ReactNode
  en: ReactNode
  initial?: Locale
}) {
  const [lang, setLang] = useState<Locale>(initial)

  return (
    <>
      <div className="mk-lang" role="group" aria-label="Bahasa / Language">
        <button
          type="button"
          onClick={() => setLang('id')}
          aria-pressed={lang === 'id'}
          className={lang === 'id' ? 'on' : undefined}
        >
          Bahasa Indonesia
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          aria-pressed={lang === 'en'}
          className={lang === 'en' ? 'on' : undefined}
        >
          English
        </button>
      </div>
      <div lang="id" hidden={lang !== 'id'}>{id}</div>
      <div lang="en" hidden={lang !== 'en'}>{en}</div>
    </>
  )
}
