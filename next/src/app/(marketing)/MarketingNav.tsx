'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { chrome, type Locale } from '@/lib/i18n'
import { LangToggle, ThemeToggle } from './NavControls'

/**
 * The marketing header.
 *
 * Stays a client component because it marks the current route with aria-current, which needs
 * usePathname. The locale is resolved on the server and handed down as a prop rather than read
 * again here — one source of truth per request, and the labels are already correct in the HTML.
 */
export function MarketingNav({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const c = chrome[locale]

  const links = [
    { href: '/', label: c.nav.home },
    { href: '/product', label: c.nav.product },
    { href: '/pricing', label: c.nav.pricing },
    { href: '/download', label: c.nav.download },
    { href: '/faq', label: c.nav.faq },
    { href: '/about', label: c.nav.about },
    { href: '/contact', label: c.nav.contact },
  ]

  return (
    <nav className="mk-nav" aria-label={c.a11y.nav}>
      <Link href="/" className="mk-wordmark">
        Geofold
      </Link>

      <div className="mk-nav-links">
        {links.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </div>

      <div className="mk-nav-tools">
        <LangToggle locale={locale} label={c.a11y.language} />
        <ThemeToggle label={c.a11y.theme} />
        <Link href="/login" className="mk-portal">
          {c.nav.portal} ↗
        </Link>
      </div>
    </nav>
  )
}
