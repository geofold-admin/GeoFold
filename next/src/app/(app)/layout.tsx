'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireProfile } from '@/components/RequireProfile'
import { SyncProvider } from '@/lib/SyncContext'
import { Sidebar } from '@/components/Sidebar'
import { MobileNav } from '@/components/MobileNav'
import { AppMotion } from '@/components/AppMotion'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireProfile>
      <SyncProvider>
        <div className="shell">
          <Sidebar />
          <div className="content">
            <MobileNav />
            {/* The app's motion layer. Mounted once here rather than per page; it re-runs on
                navigation via its own pathname dependency. See the header of AppMotion.tsx for
                why the app gets a deliberately smaller dose of motion than the marketing site. */}
            <AppMotion />
            <div className="container">{children}</div>
          </div>
        </div>
      </SyncProvider>
      </RequireProfile>
    </RequireAuth>
  )
}
