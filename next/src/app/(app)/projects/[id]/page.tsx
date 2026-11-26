'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Pencil, Camera, MapPin } from 'lucide-react'
import { api } from '@/lib/api-client'
import { buildReferences } from '@/lib/reference'
import { usePhotoUrl } from '@/lib/usePhotoUrl'
import type { FormField, ProjectResponse, SurveyDetail, SurveyPhoto } from '@/lib/types'

function parseSchema(json: string): FormField[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function SubThumb({ surveyId, photo }: { surveyId: string; photo: SurveyPhoto }) {
  const { url } = usePhotoUrl(surveyId, photo)
  if (!url) return <div className="sub-thumb-ph" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="sub-thumb" loading="lazy" decoding="async" />
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [surveys, setSurveys] = useState<SurveyDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<ProjectResponse>(`/api/projects/${id}`).then(setProject).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load project.'))
    api<SurveyDetail[]>(`/api/surveys?projectId=${id}`).then(setSurveys).catch(() => setSurveys([]))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!project) return <p className="muted">Loading…</p>

  const fields = parseSchema(project.formSchema)
  const refs = surveys ? buildReferences(surveys, () => project.name) : new Map<string, string>()
  const recent = (surveys ?? []).slice(0, 5)

  return (
    <div>
      <Link href="/projects" className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ArrowLeft size={14} /> Projects
      </Link>
      <div className="page-head" style={{ marginTop: 10 }}>
        <div className="row">
          <h1>{project.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge accent">{project.surveyCount} surveys</span>
            <Link href={`/projects/${project.id}/edit`}>
              <button className="ghost" style={{ padding: '7px 12px' }}><Pencil size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Edit</button>
            </Link>
          </div>
        </div>
        {project.description && <p>{project.description}</p>}
      </div>

      <div className="card">
        <div className="card-title">Survey form</div>
        {fields.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>No fields defined yet. These are the questions a surveyor fills in at each point.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Field</th><th style={{ fontWeight: 500 }}>Label</th><th style={{ fontWeight: 500 }}>Type</th><th style={{ fontWeight: 500 }}>Required</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.key} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '9px 0', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{f.key}</td>
                  <td>{f.label ?? '—'}</td>
                  <td className="muted">{f.type}</td>
                  <td>{f.required ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="card-title" style={{ marginBottom: 0 }}>Recent submissions</span>
          {(surveys?.length ?? 0) > 0 && <Link href="/surveys" className="hint">View all</Link>}
        </div>
        {surveys === null ? (
          <p className="muted" style={{ marginBottom: 0 }}>Loading…</p>
        ) : surveys.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>No submissions yet. Points for this project are captured with the <Link href="/download">GeoFold mobile app</Link>.</p>
        ) : (
          <div className="subs">
            {recent.map((s) => (
              <Link key={s.id} href={`/surveys/${s.id}`} className="sub-row">
                {s.photos.length > 0 ? <SubThumb surveyId={s.id} photo={s.photos[0]} /> : <div className="sub-thumb-ph" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rec-ref">{refs.get(s.id) ?? s.id.slice(0, 8)}</div>
                  <div className="coord mono" style={{ marginTop: 3 }}><MapPin size={12} /> {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="hint mono">{new Date(s.capturedAtUtc).toLocaleDateString()}</div>
                  <div className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3 }}><Camera size={12} /> {s.photos.length}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
