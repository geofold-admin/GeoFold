'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { chrome, type Locale } from '@/lib/i18n'
import { LangToggle, ThemeToggle } from './NavControls'
import { LogoLockup } from '@/components/Logo'

/**
 * The marketing header.
 *
 * Stays a client component because it marks the current route with aria-current, which needs
 * usePathname, and because the mobile panel is state. The locale is resolved on the server and
 * handed down as a prop rather than read again here: one source of truth per request, and the
 * labels are already correct in the HTML.
 *
 * WHY THIS IS TWO LAYOUTS AND NOT ONE THAT WRAPS.
 *
 * The previous version kept the desktop row of seven links and let it wrap on narrow screens. It
 * worked, in the sense that nothing was hidden, and the comment defending it said so. What it cost
 * was measured rather than argued about: at 320px the sticky header stood 175px tall, 21% of an
 * 844px viewport, and because it is sticky that space was gone on EVERY screenful rather than only
 * the first. The headline began at y=254. The smallest tap target was 23px, under the 24px floor
 * in WCAG 2.5.8 and about half the 44px this project holds itself to.
 *
 * So below 900px the links move into a panel behind a LABELLED control. Labelled rather than a bare
 * hamburger: the antislop mobile rules call the bare icon out by name, because it assumes the
 * reader already knows what three lines mean and that anything sits behind them. The panel holds
 * every destination at a full-size tap target, so nothing is hidden, it is one tap away, and the
 * bar itself stays short so the content keeps the screen.
 *
 * The desktop row is unchanged. It was never the problem, and rewriting a working layout is how
 * regressions get in.
 */
export function MarketingNav({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const c = chrome[locale]
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const links = [
    { href: '/', label: c.nav.home },
    { href: '/product', label: c.nav.product },
    { href: '/pricing', label: c.nav.pricing },
    { href: '/download', label: c.nav.download },
    { href: '/faq', label: c.nav.faq },
    { href: '/about', label: c.nav.about },
    { href: '/contact', label: c.nav.contact },
  ]

  /* Close on navigation. Without this the panel stays open over the new page, which reads as the
     tap having done nothing. */
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  /* Escape closes and hands focus back to the control that opened it, so a keyboard user is never
     left with focus inside a panel that no longer exists. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /* A press anywhere outside closes it. pointerdown rather than click so it fires before the link
     under the finger navigates. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || toggleRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  /* Hold the page still behind the panel. The panel is not full height, so a page that scrolls
     underneath would let the reader drag the menu off screen. */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <nav className="mk-nav" aria-label={c.a11y.nav}>
      <Link href="/" className="mk-wordmark" aria-label="GeoFold: home">
        <LogoLockup size={26} />
      </Link>

      {/* Desktop row. Hidden below 900px by CSS. */}
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

        {/* The compact control, shown only below 900px. aria-expanded reflects real state and
            aria-controls points at the panel, so the relationship is announced rather than implied.
            The label changes with state so the next press is unambiguous. */}
        <button
          ref={toggleRef}
          type="button"
          className="mk-menu-btn"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? c.a11y.close : c.a11y.menu}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mk-menu-icon" data-open={open} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="mk-menu-label">{c.a11y.menu}</span>
        </button>
      </div>

      {/* The panel. `hidden` rather than only a class, so it leaves the accessibility tree and the
          tab order when closed even if a stylesheet fails to load. */}
      <div ref={panelRef} id={panelId} className="mk-menu-panel" data-open={open} hidden={!open}>
        <div className="mk-menu-inner">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="mk-menu-link"
              aria-current={pathname === href ? 'page' : undefined}
              tabIndex={open ? 0 : -1}
            >
              {label}
              <span aria-hidden="true">→</span>
            </Link>
          ))}
          <div className="mk-menu-foot">
            <LangToggle locale={locale} label={c.a11y.language} />
            <Link href="/login" className="mk-portal" tabIndex={open ? 0 : -1}>
              {c.nav.portal} ↗
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
