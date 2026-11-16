'use client'

import { useEffect, useState } from 'react'
import { api } from './api-client'
import type { SurveyPhoto } from './types'

/**
 * The address to show one survey photo from.
 *
 * Survey lists and records now arrive with a signed `viewUrl` on each photo, so this is normally
 * that value and costs nothing. It asks the API only when the link is missing — sample data, or a
 * response from a server that has not been deployed with the new field yet.
 */
export function usePhotoUrl(surveyId: string, photo: Pick<SurveyPhoto, 'id' | 'viewUrl'>): { url: string | null; failed: boolean } {
  const [fetched, setFetched] = useState<{ id: string; url: string | null; failed: boolean } | null>(null)
  const ready = photo.viewUrl ?? null

  useEffect(() => {
    if (ready) return
    let alive = true
    api<{ url: string }>(`/api/surveys/${surveyId}/photos/${photo.id}/url`)
      .then((r) => alive && setFetched({ id: photo.id, url: r.url, failed: false }))
      .catch(() => alive && setFetched({ id: photo.id, url: null, failed: true }))
    return () => { alive = false }
  }, [ready, surveyId, photo.id])

  if (ready) return { url: ready, failed: false }
  // An answer for a different photo is not an answer for this one.
  if (fetched?.id !== photo.id) return { url: null, failed: false }
  return { url: fetched.url, failed: fetched.failed }
}
