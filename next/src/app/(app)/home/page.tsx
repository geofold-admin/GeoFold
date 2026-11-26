'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Camera, Check, FolderPlus, MapPin, Smartphone, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useSync } from '@/lib/SyncContext'
import { buildReferences } from '@/lib/reference'
import { usePhotoUrl } from '@/lib/usePhotoUrl'
import type { ProjectResponse, SubscriptionMe, SurveyDetail, SurveyFeatureCollection, SurveyPhoto } from '@/lib/types'

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="center" style={{ minHeight: MAP_HEIGHT }}>Loading map…</div>,
})

/** Tall enough to read a survey area at a glance, capped so a big monitor still shows the panels below. */
const MAP_HEIGHT = 'clamp(360px, 62vh, 720px)'

/** How many captures the activity list shows. The rest are one click away on Records. */
const RECENT = 6

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** "12 min ago", "3 h ago", "2 d ago", then the date: precise where it is recent, plain where it is not. */
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const min = Math.round((Date.now() - then) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(0, Math.round(n / 1024))} KB`
}

/**
 * One figure, and what it is out of. The number sits alone in `.val` because the app's motion
 * layer counts plain integers up and leaves anything else untouched — a limit written into the
 * same element would switch that off, so it lives beside it.
 */
function Stat({ label, value, limit, note }: { label: string; value: number | null; limit?: number | null; note?: string }) {
  const pct = value != null && limit ? Math.min(100, Math.round((value / limit) * 100)) : null
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className="stat-fig">
        <span className="val">{value ?? '—'}</span>
        {limit != null ? <span className="of mono">/ {limit}</span> : null}
      </div>
      {pct != null ? (
        <div className={`bar${pct >= 90 ? ' warn' : ''}`} role="img" aria-label={`${pct}% of the limit used`}><span style={{ width: `${pct}%` }} /></div>
      ) : (
        <div className="stat-note">{note ?? ' '}</div>
      )}
    </div>
  )
}

function Usage({ label, used, limit, format }: { label: string; used: number; limit: number | null; format?: (n: number) => string }) {
  const show = format ?? ((n: number) => String(n))
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="ws-row">
      <div className="ws-line">
        <span>{label}</span>
        <span className="mono">{show(used)}{limit == null ? ' · no limit' : ` / ${show(limit)}`}</span>
      </div>
      {limit != null ? <div className={`bar${pct >= 90 ? ' warn' : ''}`}><span style={{ width: `${pct}%` }} /></div> : null}
    </div>
  )
}

function Thumb({ surveyId, photo }: { surveyId: string; photo: SurveyPhoto }) {
  const { url } = usePhotoUrl(surveyId, photo)
  if (!url) return <div className="sub-thumb-ph" />
  // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; nothing for the optimizer to cache
  return <img src={url} alt="" className="sub-thumb" loading="lazy" decoding="async" />
}

export default function HomePage() {
  const { pending, syncing, online } = useSync()
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [me, setMe] = useState<SubscriptionMe | null>(null)
  const [fc, setFc] = useState<SurveyFeatureCollection | null>(null)
  const [surveys, setSurveys] = useState<SurveyDetail[] | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    api<ProjectResponse[]>('/api/projects').then(setProjects).catch(() => setProjects([]))
    api<SubscriptionMe>('/api/subscriptions/me').then(setMe).catch(() => {})
    api<SurveyFeatureCollection>('/api/surveys/geojson')
      .then(setFc)
      .catch(() => setFc({ type: 'FeatureCollection', features: [] }))
    // Newest first, which is the order the activity list wants.
    api<SurveyDetail[]>('/api/surveys').then(setSurveys).catch(() => setSurveys([]))
    api<{ fullName?: string }>('/api/profile').then((p) => setName((p?.fullName ?? '').trim().split(/\s+/)[0] ?? '')).catch(() => {})
  }, [])

  const features = useMemo(() => fc?.features ?? [], [fc])
  const points = fc ? features.length : null
  const active = useMemo(() => (projects ?? []).filter((p) => !p.archivedAtUtc), [projects])

  const projectName = useMemo(() => {
    const names = new Map((projects ?? []).map((p) => [p.id, p.name]))
    return (id: string) => names.get(id) ?? 'Project'
  }, [projects])
  const refs = useMemo(() => buildReferences(surveys ?? [], projectName), [surveys, projectName])
  const recent = (surveys ?? []).slice(0, RECENT)

  // The newest capture per project, from the same feed the map draws.
  const lastByProject = useMemo(() => {
    const last = new Map<string, string>()
    for (const f of features) {
      const seen = last.get(f.properties.projectId)
      if (!seen || f.properties.capturedAtUtc > seen) last.set(f.properties.projectId, f.properties.capturedAtUtc)
    }
    return last
  }, [features])
  const latest = features.reduce<string | null>((max, f) => (!max || f.properties.capturedAtUtc > max ? f.properties.capturedAtUtc : max), null)
  const mostSurveys = Math.max(1, ...active.map((p) => p.surveyCount))

  const loaded = projects !== null && fc !== null
  const hasProject = active.length > 0
  const hasPoint = (points ?? 0) > 0
  // The three things that make a workspace useful, in the order they have to happen.
  const steps = [
    { done: hasProject, title: 'Create a project', body: 'A project holds one survey and the form its points are filled in with.', href: '/projects/new', cta: 'New project' },
    { done: hasPoint, title: 'Capture the first point', body: 'With the GeoFold app on a phone in the field. It is saved on the device first and synced when there is a signal.', href: '/download', cta: 'Get the app' },
    { done: false, title: 'Review and export', body: 'Every synced point lands in Records, where it can be filtered and exported to CSV or Excel with its photos.', href: '/surveys', cta: 'Open records' },
  ]

  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const summary = !loaded
    ? 'Loading your workspace…'
    : !hasProject
      ? 'Nothing here yet. Create a project, then capture its first point from the field.'
      : !hasPoint
        ? `${active.length} project${active.length === 1 ? '' : 's'} ready. No points captured yet.`
        : `${points} point${points === 1 ? '' : 's'} across ${active.length} project${active.length === 1 ? '' : 's'}. Last capture ${latest ? ago(latest) : '—'}.`

  return (
    <div className="dash">
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
        <div className="in hero-split">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Workspace · {today}</div>
            <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
            <p>{summary}</p>
          </div>
          <div className="hero-actions">
            <Link href="/projects/new" className="hero-btn solid"><FolderPlus size={16} /> New project</Link>
            <Link href="/download" className="hero-btn"><Smartphone size={16} /> Get the mobile app</Link>
          </div>
        </div>
      </div>

      {me?.frozen ? (
        <p className="error" style={{ marginBottom: 'var(--space-4)' }}>
          This workspace is read-only: Premium has expired and it holds more than the free plan allows. <Link href="/subscription">Renew or see what to archive</Link>. Your data stays safe and exportable.
        </p>
      ) : null}

      {!online || pending > 0 ? (
        <div className="notice" role="status">
          <span>
            {!online
              ? `You are offline.${pending > 0 ? ` ${pending} capture${pending === 1 ? ' is' : 's are'} saved on this device and will upload when the connection is back.` : ' Captures are saved on this device until the connection is back.'}`
              : syncing
                ? `Uploading ${pending} capture${pending === 1 ? '' : 's'} from this device…`
                : `${pending} capture${pending === 1 ? ' is' : 's are'} waiting on this device to upload.`}
          </span>
        </div>
      ) : null}

      <div className="stats four">
        <Stat label="Projects" value={me?.usage.projects ?? (projects ? active.length : null)} limit={me?.limits.maxProjects} note="No limit on this plan" />
        <Stat label="Survey points" value={points} note={latest ? `Last ${ago(latest)}` : 'None captured yet'} />
        <Stat label="Surveys today" value={me?.usage.surveysToday ?? null} limit={me?.limits.dailySurveys} note="No daily limit" />
        <Stat label="Photos today" value={me?.usage.photosToday ?? null} limit={me?.limits.dailyPhotos} note="No daily limit" />
      </div>

      {loaded && !hasPoint ? (
        <div className="panel">
          <div className="phead"><span>Getting started</span><span className="badge">{steps.filter((s) => s.done).length} of {steps.length} done</span></div>
          <ol className="steps">
            {steps.map((s, i) => {
              const next = !s.done && steps.slice(0, i).every((p) => p.done)
              return (
                <li key={s.title} className={s.done ? 'done' : next ? 'next' : ''}>
                  <span className="step-n">{s.done ? <Check size={13} /> : i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="step-t">{s.title}</div>
                    <div className="hint">{s.body}</div>
                  </div>
                  {next ? <Link href={s.href} className="btn-ghost">{s.cta}</Link> : null}
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      {/* The map has a full-width row of its own: it is the panel on this page worth reading in
          detail, and squeezed into a column beside Workspace it was a short strip. */}
      <div className="panel dash-map">
        <div className="phead">
          <span>Survey locations</span>
          <Link href="/map" className="phead-link">Open map <ArrowRight size={13} /></Link>
        </div>
        {fc === null ? (
          <div className="center" style={{ minHeight: MAP_HEIGHT }}>Loading…</div>
        ) : (
          <MapView features={features} height={MAP_HEIGHT} wheelZoom={false} />
        )}
      </div>

      <div className="dash-grid three">
        <div className="panel">
          <div className="phead">
            <span>Recent captures</span>
            <Link href="/surveys" className="phead-link">All records <ArrowRight size={13} /></Link>
          </div>
          {surveys === null ? (
            <div className="center" style={{ minHeight: 160 }}>Loading…</div>
          ) : recent.length === 0 ? (
            <div className="panel-empty">No captures yet. They appear here as soon as a point is synced.</div>
          ) : (
            <div className="rows">
              {recent.map((s) => (
                <Link key={s.id} href={`/surveys/${s.id}`} className="sub-row">
                  {s.photos.length > 0 ? <Thumb surveyId={s.id} photo={s.photos[0]} /> : <div className="sub-thumb-ph" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rec-ref">{refs.get(s.id) ?? s.id.slice(0, 8)}</div>
                    <div className="row-main">{projectName(s.projectId)}</div>
                    <div className="hint mono row-coord"><MapPin size={11} /> {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}{s.accuracyMeters != null ? ` ±${Math.round(s.accuracyMeters)} m` : ''}</div>
                  </div>
                  <div className="row-side">
                    <div className="hint">{ago(s.capturedAtUtc)}</div>
                    <div className="hint row-photos"><Camera size={12} /> {s.photos.length}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="phead">
            <span>Projects</span>
            <Link href="/projects" className="phead-link">All projects <ArrowRight size={13} /></Link>
          </div>
          {projects === null ? (
            <div className="center" style={{ minHeight: 160 }}>Loading…</div>
          ) : active.length === 0 ? (
            <div className="panel-empty">No projects yet. <Link href="/projects/new">Create your first one</Link>.</div>
          ) : (
            <div className="rows">
              {active.map((p) => {
                const last = lastByProject.get(p.id)
                return (
                  <Link key={p.id} href={`/projects/${p.id}`} className="sub-row proj-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-main">{p.name}</div>
                      <div className="hint">{last ? `Last capture ${ago(last)}` : 'No captures yet'}</div>
                      {/* Each project's share of the busiest one, so the list reads as a comparison. */}
                      <div className="bar share"><span style={{ width: `${Math.round((p.surveyCount / mostSurveys) * 100)}%` }} /></div>
                    </div>
                    <div className="row-side">
                      <div className="proj-n">{p.surveyCount}</div>
                      <div className="hint">survey{p.surveyCount === 1 ? '' : 's'}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="phead">
            <span>Workspace</span>
            {me ? <span className={`pill${me.premiumActive ? ' on' : ''}`}>{me.premiumActive ? 'Premium' : 'Free'}</span> : null}
          </div>
          {!me ? (
            <div className="center" style={{ minHeight: 160 }}>Loading…</div>
          ) : (
            <div className="ws">
              <p className="hint" style={{ margin: 0 }}>
                {me.premiumActive && me.premiumUntilUtc
                  ? `Premium until ${new Date(me.premiumUntilUtc).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`
                  : 'Free plan. Limits reset every day at 00:00 UTC.'}
              </p>
              <Usage label="Projects" used={me.usage.projects} limit={me.limits.maxProjects} />
              <Usage label="Surveys today" used={me.usage.surveysToday} limit={me.limits.dailySurveys} />
              <Usage label="Photos today" used={me.usage.photosToday} limit={me.limits.dailyPhotos} />
              <Usage label="Cloud storage" used={me.usage.storageBytes} limit={me.limits.storageBytes} format={bytes} />
              {me.limits.photosPerProject != null ? (
                <p className="hint" style={{ margin: 0 }}>Up to {me.limits.photosPerProject} photos per project. A point can carry several, and each one counts.</p>
              ) : null}
              <Link href="/subscription" className="btn-ghost ws-cta">{me.premiumActive ? 'Manage plan' : `Upgrade · ${me.offer.priceLabel} / ${me.offer.days} days`}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
