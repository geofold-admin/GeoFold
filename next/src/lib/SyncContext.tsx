'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { warmBackend } from './api-client'
import { pendingCount } from './outbox'
import { syncAll } from './sync-client'

interface SyncValue {
  pending: number
  syncing: boolean
  /**
   * THE CONNECTION STATE, and why it lives here rather than being read where it is shown.
   *
   * The client's document makes this a requirement, not a nicety: "Karena ini aplikasi lapangan,
   * elemen UX wajib mengindikasikan status sinkronisasi." A surveyor standing in a clearing with
   * one bar of signal cannot tell whether the app has stopped working or simply has nothing to
   * send — the two look identical, and the difference decides whether they keep working or walk
   * back to the truck.
   *
   * `navigator.onLine` is a weak signal (it means "an interface is up", not "the server answers"),
   * so it is the *floor* of what we know, not the whole of it. It is still worth surfacing,
   * because the case it does catch — radio off, no bars, aeroplane mode — is the common one in
   * the field. The stronger signal is `pending` plus `lastSyncAt`: if nothing is queued, the
   * connection state is not something the user needs to act on.
   */
  online: boolean
  /** Set once a sync attempt has completed, so the readout can distinguish "never tried" from
   *  "tried and it worked". Epoch millis, or null before the first attempt finishes. */
  lastSyncAt: number | null
  refresh: () => Promise<void>
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncValue>({ pending: 0, syncing: false, online: true, lastSyncAt: null, refresh: async () => {}, syncNow: async () => {} })
export const useSync = () => useContext(SyncContext)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  /* Seeded from the browser rather than assumed true: the app can be launched from a home-screen
     shortcut in aeroplane mode, and starting optimistic would show a blue "synced" dot for a
     second before correcting itself — the wrong story at the exact moment the user looks. */
  const [online, setOnline] = useState(true)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)

  const refresh = useCallback(async () => setPending(await pendingCount()), [])
  const syncNow = useCallback(async () => {
    setSyncing(true)
    try {
      await syncAll()
    } finally {
      setSyncing(false)
      setLastSyncAt(Date.now())
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    setOnline(navigator.onLine)
    warmBackend()
    void syncNow()
    const onOnline = () => { setOnline(true); void syncNow() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const t = setInterval(() => void syncNow(), 30000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(t)
    }
  }, [syncNow])

  return <SyncContext.Provider value={{ pending, syncing, online, lastSyncAt, refresh, syncNow }}>{children}</SyncContext.Provider>
}
