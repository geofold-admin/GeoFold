import * as Location from 'expo-location';

import { readJsonSync, writeJsonSync } from './kv';
import type { FormField } from './types';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

/**
 * Asks for foreground location permission and takes a high-accuracy fix.
 *
 * `getCurrentPositionAsync` with `BestForNavigation` can sit for a while under canopy, so the
 * caller shows a spinner and the surveyor can retry — an inaccurate point is worse than a slow one.
 */
export async function getFix(): Promise<Fix> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to record where a survey was taken.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Location services are turned off. Enable GPS and try again.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
    timestamp: position.timestamp,
  };
}

/**
 * Follows the position for as long as the viewfinder is up, so the fix a photo is saved with is the
 * one from the moment of the shutter — not from whenever the camera was opened. A surveyor fills
 * the form, walks to a better angle, waits for the canopy to open: a single fix taken on arrival is
 * metres stale by then, and nothing on screen says so.
 *
 * Resolves to the function that stops following. `onError` gets permission and service problems,
 * and any failure the watch reports later.
 */
export async function watchFix(onFix: (fix: Fix) => void, onError: (error: Error) => void): Promise<() => void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to record where a survey was taken.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Location services are turned off. Enable GPS and try again.');
  }

  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (position) =>
      onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        timestamp: position.timestamp,
      }),
    (reason) => onError(new Error(reason || 'Could not get a location fix.')),
  );
  return () => subscription.remove();
}

/**
 * How far a fix can be trusted. Under 10 m is what a phone gives with open sky and is fine for
 * asset and condition surveys; past 25 m the point can land on the wrong side of a road or in the
 * neighbouring parcel, which is worth a warning before it is saved. A typed position has no
 * accuracy and is not graded.
 */
export type FixQuality = 'good' | 'fair' | 'poor' | 'unknown';

export const POOR_ACCURACY_M = 25;

export function fixQuality(accuracy: number | null): FixQuality {
  if (accuracy == null) return 'unknown';
  if (accuracy <= 10) return 'good';
  if (accuracy <= POOR_ACCURACY_M) return 'fair';
  return 'poor';
}

/* ── the last capture's values ──────────────────────────────────────────── */

const LAST_VALUES = 'last-capture-values';

type LastValues = Record<string, Record<string, string | boolean>>;

/**
 * What the form held at the last capture saved in a project. Consecutive points share most of
 * their attributes — the same road, the same surface, the same owner — and retyping them at every
 * point is where field entries go wrong. The note is left out: it describes one point.
 */
export function lastValues(projectId: string): Record<string, string | boolean> | null {
  const saved = readJsonSync<LastValues>(LAST_VALUES)?.[projectId];
  return saved && Object.keys(saved).length ? saved : null;
}

export function rememberValues(projectId: string, values: Record<string, string | boolean>): void {
  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined));
  const store = readJsonSync<LastValues>(LAST_VALUES) ?? {};
  if (Object.keys(filled).length) store[projectId] = filled;
  else delete store[projectId];
  writeJsonSync(LAST_VALUES, store);
}

/** Coerces the form's string inputs into the JSON types the server's schema validator expects. */
export function buildDetails(
  fields: FormField[],
  values: Record<string, string | boolean>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    const type = field.type.toLowerCase();

    // An untouched switch is a recorded "no". Leaving it out made a *required* yes/no field fail
    // server validation on sync, long after the surveyor had left the point.
    if ((type === 'boolean' || type === 'bool') && value === undefined) {
      out[field.key] = false;
      continue;
    }
    if (value === undefined || value === '') continue;

    switch (type) {
      case 'number':
        // A decimal comma is what an Indonesian keyboard types; the server wants a JSON number.
        out[field.key] = Number(String(value).replace(',', '.'));
        break;
      case 'integer':
        out[field.key] = parseInt(String(value), 10);
        break;
      case 'boolean':
      case 'bool':
        out[field.key] = Boolean(value);
        break;
      default:
        out[field.key] = String(value);
    }
  }
  return out;
}

export function formatCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function formatAccuracy(accuracy: number | null): string {
  return accuracy == null ? '' : `±${Math.round(accuracy)}m`;
}

/** The lines burned into the photo — coordinates first, then when it was taken. */
export function stampLines(fix: Fix): string[] {
  return [
    `${formatCoords(fix.latitude, fix.longitude)} ${formatAccuracy(fix.accuracy)}`.trim(),
    new Date(fix.timestamp).toLocaleString(),
  ];
}
