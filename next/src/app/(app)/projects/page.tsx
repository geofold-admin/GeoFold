'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api-client'
import type { ProjectResponse } from '@/lib/types'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<ProjectResponse[]>('/api/projects').then(setProjects).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects.'))
  }, [])

  return (
    <div>
      <div className="page-head">
        <div className="row">
          <h1>Projects</h1>
          <Link href="/projects/new"><button><Plus size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> New project</button></Link>
        </div>
        <p>Each project is a separate survey: its own points, photos and form.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <div className="empty">No projects yet. Create your first one.</div>}

      {projects?.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} className="list-row">
          <div>
            <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.name}</div>
            {p.description && <div className="hint">{p.description}</div>}
          </div>
          <span className="badge accent">{p.surveyCount} surveys</span>
        </Link>
      ))}
    </div>
  )
}
