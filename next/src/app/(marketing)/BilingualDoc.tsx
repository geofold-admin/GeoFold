import type { ReactNode } from 'react'
import type { Locale } from '@/lib/i18n'

/**
 * A legal document published in both languages, with the site's language deciding which one shows.
 *
 * REPLACES LangSwitch, WHICH WAS A SECOND LANGUAGE CONTROL. That component held the choice in its
 * own `useState`, so the page ended up with two toggles that could disagree: the nav said ID and
 * the chrome was Indonesian while the document below it was still in English, because a client
 * component's state does not re-initialise when the server re-renders around it. Seeding it from
 * the locale only fixed the first paint — the moment either control was touched they drifted, and
 * nothing brought them back into agreement. One language, one control.
 *
 * WHAT IS DELIBERATELY KEPT. Both versions are still rendered into the delivered HTML, with one
 * hidden rather than dropped. That is the whole reason the old component existed and the reason
 * this one is not simply `locale === 'id' ? id : en`: a payment gateway's verification team reads
 * these pages, and a document that only exists after a client-side state change is one they can
 * miss. Here the visible copy is chosen on the server, so the correct language is in the first
 * paint, and the other is still in the source for anyone who goes looking.
 *
 * Indonesian remains the governing version. This picks which one is shown, never which one rules;
 * the documents say so in their own text.
 */
export function BilingualDoc({
  locale,
  id,
  en,
}: {
  locale: Locale
  id: ReactNode
  en: ReactNode
}) {
  return (
    <>
      <div lang="id" hidden={locale !== 'id'}>
        {id}
      </div>
      <div lang="en" hidden={locale !== 'en'}>
        {en}
      </div>
    </>
  )
}
