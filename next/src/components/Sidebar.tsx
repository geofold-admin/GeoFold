'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useSync } from '@/lib/SyncContext'
import { useAuth } from '@/lib/AuthContext'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { DEMO_MODE } from '@/lib/demo'
import { navItems } from './navItems'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { pending, syncing } = useSync()
  const { exitDemo } = useAuth()

  const signOut = async () => {
    if (DEMO_MODE) exitDemo()
    else await createSupabaseBrowserClient().auth.signOut()
    router.replace('/login')
  }

  return (
    <aside className="sidebar">
      {/* The mark, at 26px, on the panel's white ground — the same artwork the marketing chrome
          uses, and the reason the sidebar can carry the brand without a wordmark sized to shout. */}
      <div className="brand">
        <span className="mark">
          {/* eslint-disable-next-line @next/next/no-img-element -- the same traced SVG the
              marketing chrome loads; next/image would only add an optimizer round-trip. */}
          <img src="/geofold-mark.svg" alt="" width={578} height={429} />
        </span>
        GeoFold
      </div>
      <nav className="side-nav">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'active' : ''}>
            <Icon /> {label}
            {href === '/capture' && pending > 0 && (
              <span className="badge accent" style={{ marginLeft: 'auto' }}>{syncing ? '…' : pending}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="side-foot">
        <button className="ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={signOut}>
          <LogOut size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Sign out
        </button>
      </div>
    </aside>
  )
}
