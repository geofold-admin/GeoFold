'use client'

import { useEffect, useState } from 'react'
import { CloudUpload, Cloud, CloudOff } from 'lucide-react'
import { useSync } from '@/lib/SyncContext'

/**
 * SYNC STATUS — the field app's answer to "is my work safe?".
 *
 * WHY THIS EXISTS AT ALL. The client's document makes it a requirement rather than a decoration:
 * "Karena ini aplikasi lapangan, elemen UX wajib mengindikasikan status sinkronisasi. Contoh:
 * Warna abu-abu (#9CA3AF) saat status titik antre/offline, dan GEOFOLD Blue (#014AB5) saat
 * berhasil tersinkron."
 *
 * The reasoning behind that requirement is worth spelling out, because it decides the whole
 * design of this component. A surveyor in the field has exactly one fear — losing a day's work —
 * and the app either answers it or does not. Before this, the only signal was a badge count on
 * one nav item, which said "three things are waiting" and nothing about whether they were moving.
 * "Waiting" and "stuck" are the same number and different feelings.
 *
 * THE FOUR STATES, and why there are four rather than two:
 *
 *   1. offline        — the browser reports no connection. Nothing is moving. Grey, and the
 *                       count is what the user must carry in their head, so it is shown.
 *   2. syncing        — a sync is in flight. Blue, animated. This is the state that answers the
 *                       fear, so it is the loudest.
 *   3. pending        — online, queue non-empty, not currently syncing. This is the state that
 *                       used to be indistinguishable from being stuck, so it is the one that
 *                       needs the honest word: the queue is not empty, it is just not its turn.
 *   4. synced         — queue empty. Blue, quiet. The brief's example maps "berhasil tersinkron"
 *                       to the brand blue and "antre/offline" to grey, and that is the split
 *                       implemented here.
 *
 * THE COLOUR IS NOT THE ONLY CARRIER. Grey-vs-blue is a hue difference, and roughly one man in
 * twelve reads it differently. Every state also changes its icon and its text, so the meaning
 * survives both a colourblind reader and a monochrome screenshot.
 *
 * THE CLOCK IS DELIBERATELY NOT SHOWN LIVE. "Last synced 4 minutes ago" would need a re-render
 * every minute to stay true, and a timestamp that is silently stale is worse than none. The
 * readout instead says what happened, not when: the queue depth is the number the user acts on.
 */
export function SyncStatus() {
  const { pending, syncing, online, lastSyncAt } = useSync()

  /* A relative age, but computed on demand rather than on a timer. The value only needs to be
     right at the moment the user looks, and `lastSyncAt` changing already re-renders us. */
  const [, force] = useState(0)
  useEffect(() => {
    /* One cheap nudge a minute, only while mounted, so a screen left open overnight does not
       claim a sync happened "just now" at breakfast. The component is small and this is the only
       timer in it. */
    const t = setInterval(() => force((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const state: 'offline' | 'syncing' | 'pending' | 'synced' = !online
    ? 'offline'
    : syncing
      ? 'syncing'
      : pending > 0
        ? 'pending'
        : 'synced'

  const text = {
    offline: pending > 0 ? `Offline · ${pending} waiting` : 'Offline · saved to device',
    syncing: pending > 0 ? `Syncing ${pending}…` : 'Syncing…',
    pending: `${pending} waiting to sync`,
    synced: lastSyncAt ? 'All synced' : 'Ready',
  }[state]

  const Icon = { offline: CloudOff, syncing: CloudUpload, pending: CloudUpload, synced: Cloud }[state]

  return (
    <span className="sync-status" data-state={state} role="status" aria-live="polite">
      <Icon size={14} aria-hidden="true" />
      <span>{text}</span>
    </span>
  )
}
