'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'
import type { SurveyFeatureCollection } from '@/lib/types'

// Leaflet touches window, so load the map only on the client.
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="center" style={{ minHeight: '72vh' }}>Loading map…</div>,
})

export default function MapPage() {
  const [fc, setFc] = useState<SurveyFeatureCollection | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<SurveyFeatureCollection>('/api/surveys/geojson')
      .then(setFc)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load surveys.')
      })
  }, [])

  const features = fc?.features ?? []
  return (
    <div>
      <div className="page-head">
        <div className="row">
          <h1>Survey map</h1>
          <span className="badge accent">{features.length} points</span>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!error && fc === null && <div className="center" style={{ minHeight: '72vh' }}>Loading…</div>}
      {fc !== null && <MapView features={features} />}
      {fc !== null && features.length === 0 && !error && (
        <p className="muted">No surveys yet. Points will appear here once field data is synced.</p>
      )}
    </div>
  )
}
