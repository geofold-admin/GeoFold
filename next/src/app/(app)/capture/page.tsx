'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, MapPin, RefreshCw, Check, CloudUpload } from 'lucide-react'
import { api, warmBackend } from '@/lib/api-client'
import { DEMO_MODE } from '@/lib/demo'
import { addItem } from '@/lib/outbox'
import { useSync } from '@/lib/SyncContext'
import { buildDetails, getPosition, watermarkPhoto } from '@/lib/capture'
import type { FormField, ProjectResponse } from '@/lib/types'

const PROJECTS_CACHE = 'geofold.projects'

function parseSchema(json: string): FormField[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function CapturePage() {
  const { pending, syncing, refresh, syncNow } = useSync()
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [projectId, setProjectId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pos, setPos] = useState<GeolocationPosition | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  // Desktop browsers often have no usable GPS, so the dashboard allows typing coordinates.
  const [manual, setManual] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    warmBackend()
    api<ProjectResponse[]>('/api/projects')
      .then((p) => {
        setProjects(p)
        localStorage.setItem(PROJECTS_CACHE, JSON.stringify(p))
        if (p.length === 1) setProjectId(p[0].id)
      })
      .catch(() => {
        const cached = localStorage.getItem(PROJECTS_CACHE)
        if (cached) setProjects(JSON.parse(cached))
        else setError('Could not load projects. Connect once to load them, then capture works offline.')
      })
  }, [])

  const fields = useMemo(() => {
    const project = projects?.find((p) => p.id === projectId)
    return project ? parseSchema(project.formSchema) : []
  }, [projects, projectId])

  const captureGps = async () => {
    setGpsBusy(true)
    setGpsError(null)
    try {
      if (DEMO_MODE) {
        setPos({ coords: { latitude: -0.037622, longitude: 111.283981, accuracy: 6 } } as GeolocationPosition)
        return
      }
      setPos(await getPosition())
    } catch (e) {
      setGpsError(e instanceof Error ? e.message : 'Could not get location.')
    } finally {
      setGpsBusy(false)
    }
  }

  const onPickPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
    if (f && !pos) captureGps()
  }

  // A typed coordinate has no measured precision, so accuracy stays null rather than
  // claiming 0 m — the column is nullable and the UI reads it back as "manual entry".
  const manualFix = useMemo(() => {
    if (!manual) return null
    const lat = Number(manualLat.trim())
    const lng = Number(manualLng.trim())
    const ok =
      manualLat.trim() !== '' && manualLng.trim() !== '' &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    return ok ? { lat, lng } : null
  }, [manual, manualLat, manualLng])

  const manualInvalid = manual && (manualLat.trim() !== '' || manualLng.trim() !== '') && !manualFix
  const fix = manual ? manualFix : pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null
  const accuracy = manual ? null : pos ? pos.coords.accuracy : null

  const canSave = Boolean(projectId && file && fix && !saving)

  const save = async () => {
    if (!file || !fix) return
    setError(null)
    setSaving(true)
    try {
      const capturedAtUtc = new Date().toISOString()
      const lat = fix.lat
      const lng = fix.lng
      const stamped = await watermarkPhoto(file, [`${lat.toFixed(6)}, ${lng.toFixed(6)}`, new Date(capturedAtUtc).toLocaleString()])
      const details = buildDetails(fields, values)
      if (note.trim()) details.catatan = note.trim()
      await addItem({
        id: crypto.randomUUID(), projectId,
        projectName: projects?.find((p) => p.id === projectId)?.name ?? '',
        latitude: lat, longitude: lng, accuracyMeters: accuracy, capturedAtUtc,
        detailsJson: JSON.stringify(details), photo: stamped,
        photoId: crypto.randomUUID(), status: 'pending', createdAt: Date.now(),
      })
      await refresh()
      void syncNow()
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the survey.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setFile(null); setPreviewUrl(null); setValues({}); setNote(''); setDone(false); setError(null)
    setPos(null); setManualLat(''); setManualLng('')
  }

  if (done) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--spruce-soft)', color: 'var(--spruce-ink)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><Check size={24} /></div>
          <div className="card-title" style={{ justifyContent: 'center' }}>Saved to your device</div>
          <p className="muted">{pending > 0 ? `${pending} survey${pending > 1 ? 's' : ''} syncing in the background. You can keep working, even offline.` : 'Uploaded.'}</p>
          <button onClick={reset} style={{ marginTop: 8 }}><Camera size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Capture another</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="page-head">
        <h1>Capture</h1>
        <p>Take a photo at a location, add a description, and save. Works offline.</p>
      </div>

      {(pending > 0 || syncing) && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          {syncing ? <span className="spinner" /> : <CloudUpload size={18} style={{ color: 'var(--spruce)' }} />}
          <span style={{ fontSize: 14 }}>{syncing ? 'Syncing…' : `${pending} waiting to sync`}</span>
          {!syncing && pending > 0 && <button className="ghost" onClick={() => void syncNow()} style={{ marginLeft: 'auto', padding: '6px 12px' }}>Sync now</button>}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <label>Project</label>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Select a project…</option>
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ marginTop: 16 }}>Photo</label>
        <label htmlFor="photo" style={{ display: 'block', border: '1px dashed var(--line-strong)', borderRadius: 'var(--radius)', padding: previewUrl ? 8 : 28, textAlign: 'center', cursor: 'pointer', color: 'var(--ink-2)', background: 'var(--surface-2)', margin: 0 }}>
          {previewUrl ? <img src={previewUrl} alt="Preview" style={{ width: '100%', borderRadius: 6, display: 'block' }} /> : (<><Camera size={26} style={{ opacity: 0.6 }} /><div style={{ marginTop: 6, fontSize: 14 }}>Tap to take a photo</div></>)}
        </label>
        <input id="photo" type="file" accept="image/*" capture="environment" onChange={onPickPhoto} style={{ display: 'none' }} />

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <label style={{ margin: 0 }}>Location</label>
          <button
            type="button"
            className="ghost"
            onClick={() => { setManual((m) => !m); setGpsError(null) }}
            style={{ padding: '5px 10px', fontSize: 12 }}
          >
            {manual ? 'Use GPS instead' : 'Enter manually'}
          </button>
        </div>

        {manual ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ marginTop: 4 }}>Latitude</label>
                <input inputMode="decimal" placeholder="-0.037622" value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
              </div>
              <div>
                <label style={{ marginTop: 4 }}>Longitude</label>
                <input inputMode="decimal" placeholder="111.283981" value={manualLng} onChange={(e) => setManualLng(e.target.value)} />
              </div>
            </div>
            {manualInvalid ? (
              <p className="error" style={{ marginTop: 10 }}>
                Enter decimal degrees: latitude between -90 and 90, longitude between -180 and 180.
              </p>
            ) : manualFix ? (
              <p className="hint" style={{ marginTop: 8 }}>
                <span className="coord">◎ {manualFix.lat.toFixed(6)}, {manualFix.lng.toFixed(6)}</span>
                <span style={{ marginLeft: 8 }}>entered manually, no accuracy recorded</span>
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>Decimal degrees, e.g. -0.037622 / 111.283981.</p>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapPin size={18} style={{ color: 'var(--accent)' }} />
            <div style={{ flex: 1 }}>
              {pos ? <span className="coord">◎ {pos.coords.latitude.toFixed(6)}, {pos.coords.longitude.toFixed(6)} ±{Math.round(pos.coords.accuracy)}m</span>
                : gpsError ? <span className="error" style={{ background: 'none', border: 'none', padding: 0 }}>{gpsError}</span>
                : <span className="hint">Location not captured yet</span>}
            </div>
            <button type="button" className="ghost" onClick={captureGps} disabled={gpsBusy} style={{ padding: '7px 12px' }}>
              <RefreshCw size={15} style={{ verticalAlign: -3, marginRight: 5 }} /> {gpsBusy ? 'Locating…' : pos ? 'Update' : 'Get GPS'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Description</div>
        <label>Catatan</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deskripsi lokasi / kondisi / keterangan…" />
        {fields.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {fields.map((f) => (
            <div key={f.key}>
              <label>{f.label ?? f.key}{f.required && <span style={{ color: 'var(--danger)' }}> *</span>}</label>
              {f.type.toLowerCase() === 'boolean' || f.type.toLowerCase() === 'bool' ? (
                <input type="checkbox" checked={Boolean(values[f.key])} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))} style={{ width: 'auto' }} />
              ) : (
                <input type={f.type.toLowerCase() === 'number' || f.type.toLowerCase() === 'integer' ? 'number' : f.type.toLowerCase() === 'date' ? 'date' : 'text'} value={String(values[f.key] ?? '')} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
          </div>
        )}
      </div>

      <button onClick={save} disabled={!canSave} style={{ width: '100%', padding: 13 }}>
        {saving ? <><span className="spinner" style={{ marginRight: 8 }} /> Saving…</> : 'Save survey'}
      </button>
      {!fix && file && (
        <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
          {manual ? 'Enter a latitude and longitude to save.' : 'Waiting for location…'}
        </p>
      )}
    </div>
  )
}
