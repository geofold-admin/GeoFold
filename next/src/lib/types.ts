export interface ProjectResponse {
  id: string
  name: string
  description: string | null
  formSchema: string
  createdAtUtc: string
  archivedAtUtc: string | null
  surveyCount: number
}

export interface SubscriptionMe {
  workspaceType: 'free' | 'premium'
  premiumActive: boolean
  premiumUntilUtc: string | null
  frozen: boolean
  limits: {
    maxProjects: number | null
    photosPerProject: number | null
    dailySurveys: number | null
    dailyPhotos: number | null
    /** Storage ceiling in bytes. Set on premium, null on free. */
    storageBytes: number | null
  }
  usage: { projects: number; surveysToday: number; photosToday: number; storageBytes: number }
  /** What the checkout will charge, resolved server-side. See api/subscriptions/me. */
  offer: {
    priceIdr: number
    priceLabel: string
    days: number
    storageBytes: number
    storageLabel: string
  }
}

export interface FormField {
  key: string
  label?: string
  type: string
  required?: boolean
}

export interface SurveyProperties {
  id: string
  projectId: string
  status: string
  capturedAtUtc: string
  syncedAtUtc: string
  accuracyMeters: number | null
  photoCount: number
  detailsJson: string | null
}

export interface SurveyFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: SurveyProperties
  }>
}

export interface SurveyPhoto {
  id: string
  uploadStatus: string
  latitude: number
  longitude: number
  capturedAtUtc: string
}

export interface SurveyDetail {
  id: string
  projectId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  capturedAtUtc: string
  syncedAtUtc: string
  detailsJson: string | null
  status: string
  photos: SurveyPhoto[]
}

export interface InitiatePhotoResponse {
  photoId: string
  uploadUrl: string
  storagePath: string
}
