'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api-client'
import { parseDetails, labeledValues } from '@/lib/details'
import { parseSchema } from '@/lib/validation'
import { buildReferences } from '@/lib/reference'
import { usePhotoUrl } from '@/lib/usePhotoUrl'
import type { ProjectResponse, SurveyDetail, SurveyPhoto } from '@/lib/types'

function PhotoFull({ surveyId, photo }: { surveyId: string; photo: SurveyPhoto }) {
  const { url, failed } = usePhotoUrl(surveyId, photo)

  if (failed) return <div className="empty" style={{ padding: 24 }}>Foto tidak bisa dimuat.</div>
  if (!url) return <div className="rec-thumb-ph" style={{ width: '100%', height: 240 }} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Survey photo" className="detail-photo" />
}

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [survey, setSurvey] = useState<SurveyDetail | null>(null)
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [siblings, setSiblings] = useState<SurveyDetail[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api<SurveyDetail>(`/api/surveys/${id}`)
      .then((s) => {
        if (!alive) return
        setSurvey(s)
        api<ProjectResponse>(`/api/projects/${s.projectId}`).then((p) => alive && setProject(p)).catch(() => {})
        api<SurveyDetail[]>(`/api/surveys?projectId=${s.projectId}`).then((list) => alive && setSiblings(list)).catch(() => {})
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load record.'))
    return () => { alive = false }
  }, [id])

  const reference = useMemo(() => {
    if (!survey || !project) return survey ? survey.id.slice(0, 8) : ''
    const refs = buildReferences(siblings.length ? siblings : [survey], () => project.name)
    return refs.get(survey.id) ?? survey.id.slice(0, 8)
  }, [survey, project, siblings])

  const values = useMemo(() => {
    if (!survey) return []
    const fields = project ? parseSchema(project.formSchema).fields : []
    return labeledValues(parseDetails(survey.detailsJson), fields)
  }, [survey, project])

  if (error) return <p className="error">{error}</p>
  if (!survey) return <p className="muted">Loading…</p>

  const filled = values.filter((v) => v.value.trim() !== '')

  return (
    <div>
      <Link href="/surveys" className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ArrowLeft size={14} /> Records
      </Link>

      <div className="page-head" style={{ marginTop: 10 }}>
        <div className="row">
          <h1 className="mono" style={{ fontSize: 20 }}>{reference}</h1>
          <span className={`badge status-${survey.status.toLowerCase()}`}>{survey.status}</span>
        </div>
        <p>{project?.name ?? '—'} · {new Date(survey.capturedAtUtc).toLocaleString()}</p>
      </div>

      {survey.photos.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div className={`photo-grid${survey.photos.length > 1 ? ' many' : ''}`}>
            {survey.photos.map((p) => <PhotoFull key={p.id} surveyId={survey.id} photo={p} />)}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Location</div>
        <dl className="kv">
          <dt>Coordinates</dt>
          <dd className="mono">◎ {survey.latitude.toFixed(6)}, {survey.longitude.toFixed(6)}</dd>
          <dt>Accuracy</dt>
          <dd>{survey.accuracyMeters != null ? `±${Math.round(survey.accuracyMeters)} m` : '—'}</dd>
          <dt>Captured</dt>
          <dd>{new Date(survey.capturedAtUtc).toLocaleString()}</dd>
        </dl>
      </div>

      <div className="card">
        <div className="card-title">Submission</div>
        {filled.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>No field values were recorded for this survey.</p>
        ) : (
          <dl className="kv">
            {values.map((v) => (
              <div key={v.key} style={{ display: 'contents' }}>
                <dt>{v.label}</dt>
                <dd>{v.value.trim() || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
