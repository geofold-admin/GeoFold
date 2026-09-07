'use client'

import { useState, type ReactNode } from 'react'

/**
 * Indonesian/English switch for the compliance pages.
 *
 * Both languages are rendered on the server and one is hidden with `hidden` rather than swapped
 * out, so the full text of both is always present in the delivered HTML. That matters here: a
 * payment gateway's verification team reads these pages, and anything that only appears after a
 * click is something they can miss. Indonesian is the default because they read Indonesian.
 */
export function LangSwitch({ id, en }: { id: ReactNode; en: ReactNode }) {
  const [lang, setLang] = useState<'id' | 'en'>('id')

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
