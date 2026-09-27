'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CreditCard, LogOut } from 'lucide-react'
import { useSync } from '@/lib/SyncContext'
import { useAuth } from '@/lib/AuthContext'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { DEMO_MODE } from '@/lib/demo'
import { navItems } from './navItems'

// Rendered on mobile only (CSS hides on desktop): a sticky top bar + a fixed bottom tab bar.
export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { pending } = useSync()
  const { exitDemo } = useAuth()

  const signOut = async () => {
    if (DEMO_MODE) exitDemo()
    else await createSupabaseBrowserClient().auth.signOut()
    router.replace('/login')
  }

  return (
    <>
      <header className="mobile-top">
        <div className="brand" style={{ padding: 0, height: 'auto', border: 0, fontSize: 17 }}>
          <span className="mark" style={{ width: 24, height: 24 }}>G</span>GeoFold
        </div>
        <div className="actions">
          <Link href="/subscription" aria-label="Subscription" className={`theme-toggle${pathname.startsWith('/subscription') ? ' active' : ''}`} style={{ display: 'grid', placeItems: 'center' }}><CreditCard size={16} /></Link>
          <button className="ghost" onClick={signOut} aria-label="Sign out" style={{ padding: '7px 10px' }}><LogOut size={16} /></button>
        </div>
      </header>

      <nav className="mobile-bottom">
        {navItems.filter((i) => i.bottom).map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'active' : ''}>
            <Icon />
            {short}
            {href === '/capture' && pending > 0 && <span className="dot" />}
          </Link>
        ))}
      </nav>
    </>
  )
}
