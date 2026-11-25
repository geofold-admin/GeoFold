// Wire shapes shared with the GeoFold server. Kept byte-identical to `next/src/lib/types.ts`
// so the mobile client and the web client can never drift apart.

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  formSchema: string;
  createdAtUtc: string;
  archivedAtUtc: string | null;
  surveyCount: number;
}

export interface FormField {
  key: string;
  label?: string;
  type: string;
  required?: boolean;
  /**
   * Choices for a `select` field. The server stores the schema JSON as given and only checks that
   * a select value is a string, so the options travel with the project without a server change.
   */
  options?: string[];
}

export interface SurveyPhoto {
  id: string;
  uploadStatus: string;
  latitude: number;
  longitude: number;
  capturedAtUtc: string;
}

export interface SurveyDetail {
  id: string;
  projectId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAtUtc: string;
  syncedAtUtc: string;
  detailsJson: string | null;
  status: string;
  photos: SurveyPhoto[];
}

export interface SurveyProperties {
  id: string;
  projectId: string;
  status: string;
  capturedAtUtc: string;
  syncedAtUtc: string;
  accuracyMeters: number | null;
  photoCount: number;
  detailsJson: string | null;
}

export interface SurveyFeatureCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: SurveyProperties;
  }[];
}

export interface InitiatePhotoResponse {
  photoId: string;
  uploadUrl: string;
  storagePath: string;
}

export interface SubscriptionMe {
  workspaceType: 'free' | 'premium';
  premiumActive: boolean;
  premiumUntilUtc: string | null;
  frozen: boolean;
  limits: {
    maxProjects: number | null;
    photosPerProject: number | null;
    dailySurveys: number | null;
    dailyPhotos: number | null;
  };
  usage: { projects: number; surveysToday: number; photosToday: number };
}

export function parseSchema(json: string | null | undefined): FormField[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as FormField[]) : [];
  } catch {
    return [];
  }
}
