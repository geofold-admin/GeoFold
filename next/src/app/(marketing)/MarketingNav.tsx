'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/download', label: 'Download' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export function MarketingNav() {
  const pathname = usePathname()

  return (
    <nav className="mk-nav">
      <Link href="/" className="mk-wordmark">Geofold</Link>
      <div className="mk-nav-links">
        {links.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </div>
      <Link href="/login" className="mk-portal">Portal ↗</Link>
    </nav>
  )
}
