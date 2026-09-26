'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Camera } from 'lucide-react'
import { api } from '@/lib/api-client'
import type { ProjectResponse, SubscriptionMe, SurveyFeatureCollection } from '@/lib/types'

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="center" style={{ minHeight: '42vh' }}>Loading map…</div>,
})

const THUMBS = [
  { bg: '#2c5a46', line: '#5e9a6b' },
  { bg: '#b4633a', line: '#d89a6e' },
  { bg: '#3e7c86', line: '#7fb8c0' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [me, setMe] = useState<SubscriptionMe | null>(null)
  const [fc, setFc] = useState<SurveyFeatureCollection | null>(null)

  useEffect(() => {
    api<ProjectResponse[]>('/api/projects').then(setProjects).catch(() => setProjects([]))
    api<SubscriptionMe>('/api/subscriptions/me').then(setMe).catch(() => {})
    api<SurveyFeatureCollection>('/api/surveys/geojson')
      .then(setFc)
      .catch(() => setFc({ type: 'FeatureCollection', features: [] }))
  }, [])

  const features = fc?.features ?? []
  const points = features.length

  return (
    <div>
      <div className="hero">
        <svg className="contour" viewBox="0 0 800 240" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="#eaf1e9" strokeWidth="1.4">
            <path d="M-20 70 C120 20 240 110 400 70 560 30 680 120 820 70" />
            <path d="M-20 110 C120 60 240 150 400 110 560 70 680 160 820 110" />
            <path d="M-20 150 C120 100 240 190 400 150 560 110 680 200 820 150" />
            <path d="M-20 190 C120 140 240 230 400 190 560 150 680 240 820 190" />
            <path d="M-20 30 C120 -10 240 70 400 30 560 -10 680 80 820 30" />
          </g>
        </svg>
        <div className="in">
          <div className="eyebrow">Field survey</div>
          <h1>{greeting()}, surveyor</h1>
          <p>Your projects and where they sit on the ground. Capture from the field, review here.</p>
          <div className="coordbar mono">◎ {points} survey point{points === 1 ? '' : 's'} mapped</div>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="accent" style={{ background: 'var(--spruce)' }} />
          <div className="lbl"><span className="sdot" style={{ background: 'var(--spruce)' }} />Projects</div>
          <div className="val">{me?.usage.projects ?? projects?.length ?? '—'}</div>
        </div>
        <div className="stat">
          <span className="accent" style={{ background: 'var(--ochre)' }} />
          <div className="lbl"><span className="sdot" style={{ background: 'var(--ochre)' }} />Surveys today</div>
          <div className="val">{me?.usage.surveysToday ?? '—'}</div>
        </div>
        <div className="stat">
          <span className="accent" style={{ background: 'var(--sky)' }} />
          <div className="lbl"><span className="sdot" style={{ background: 'var(--sky)' }} />Photos today</div>
          <div className="val">{me?.usage.photosToday ?? '—'}</div>
        </div>
      </div>

      <div className="panel">
        <div className="phead">
          <span className="card-title" style={{ margin: 0 }}>Survey locations</span>
          <span className="badge accent">{points} points</span>
        </div>
        {fc === null ? (
          <div className="center" style={{ minHeight: '42vh' }}>Loading…</div>
        ) : (
          <MapView features={features} height="46vh" />
        )}
      </div>

      <div className="row" style={{ margin: '22px 0 12px' }}>
        <h1 style={{ fontSize: 18 }}>Projects</h1>
        <Link href="/capture"><button><Camera size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> New capture</button></Link>
      </div>
      {projects?.length === 0 && (
        <div className="empty">No projects yet. <Link href="/projects/new">Create your first one</Link>.</div>
      )}
      <div className="pcard-grid">
        {projects?.map((p, i) => {
          const t = THUMBS[i % THUMBS.length]
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="pcard lift">
              <div className="thumb">
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <rect width="44" height="44" fill={t.bg} />
                  <g fill="none" stroke={t.line} strokeWidth="1.4">
                    <path d="M-4 26 C10 18 22 30 48 20" /><path d="M-4 34 C10 26 22 38 48 28" />
                  </g>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                <div className="hint mono" style={{ marginTop: 2 }}>{p.surveyCount} surveys</div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
