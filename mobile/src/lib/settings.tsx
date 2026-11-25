import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ThemePreference } from '@/constants/theme';
import type { AreaUnitSetting, LengthUnitSetting } from './geometry';
import { readJsonSync, writeJsonSync } from './kv';

/**
 * Device-local preferences: how the map draws things and how measurements read.
 *
 * Deliberately not synced to the server — a marker colour or a unit is how *this* surveyor likes
 * to read *this* screen, not project data. Loaded synchronously (see `kv.ts`) so the first frame is
 * already in the chosen theme.
 */

export type LengthUnit = LengthUnitSetting;
export type AreaUnit = AreaUnitSetting;

/** The local icon library a marker can be drawn from. Drawn in `components/marker-icon.tsx`. */
export const MARKER_ICONS = [
  'pin',
  'circle',
  'square',
  'diamond',
  'triangle',
  'star',
  'flag',
  'tree',
  'house',
  'drop',
  'camera',
  'cross',
] as const;
export type MarkerIconName = (typeof MARKER_ICONS)[number];

export type MarkerStyle =
  | { kind: 'icon'; icon: MarkerIconName; color: string }
  /** A picture the surveyor supplied, copied into app storage (see `lib/marker-image.ts`). */
  | { kind: 'image'; uri: string };

/** Built-in label sources. A project form field is `field:<key>`. */
export const LABEL_BUILTINS = [
  { key: 'reference', label: 'Reference (KAMPUNG-001)' },
  { key: 'date', label: 'Capture date' },
  { key: 'time', label: 'Capture date & time' },
  { key: 'project', label: 'Project name' },
  { key: 'catatan', label: 'Catatan (note)' },
] as const;

export interface LabelStyle {
  enabled: boolean;
  /** Label source used where a project has no override of its own. */
  field: string;
  /** Per-project label source — a column of *that* project's form. */
  projectFields: Record<string, string>;
  textColor: string;
  /** The outline drawn around each glyph, which is what keeps text legible over imagery. */
  haloColor: string;
  /** Background box behind the label; null draws the text on the map with only its outline. */
  boxColor: string | null;
  size: number;
}

export interface ReminderSettings {
  enabled: boolean;
  /** Nudge once the oldest unsynced capture has waited this long. */
  syncAfterHours: number;
  /** Nudge to export a backup of project data this often. 0 turns it off. */
  backupEveryDays: number;
}

export interface Settings {
  theme: ThemePreference;
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  /** Default marker for survey points. */
  marker: MarkerStyle;
  /** Per-project markers, keyed by project id; these win over the default. */
  projectMarkers: Record<string, MarkerStyle>;
  labels: LabelStyle;
  reminders: ReminderSettings;
  /** Ceiling on MapLibre's tile cache, in MB — what keeps recently viewed ground usable offline. */
  tileCacheMb: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lengthUnit: 'auto',
  areaUnit: 'auto',
  marker: { kind: 'icon', icon: 'pin', color: '#0070bb' },
  projectMarkers: {},
  labels: {
    enabled: false,
    field: 'reference',
    projectFields: {},
    textColor: '#10171c',
    haloColor: '#ffffff',
    boxColor: '#ffffffd9',
    size: 11,
  },
  reminders: { enabled: true, syncAfterHours: 6, backupEveryDays: 7 },
  tileCacheMb: 200,
};

const KEY = 'settings';

/** Defaults filled in field by field, so a settings file from an older build gains new keys. */
function load(): Settings {
  const stored = readJsonSync<Partial<Settings>>(KEY) ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    labels: { ...DEFAULT_SETTINGS.labels, ...stored.labels },
    reminders: { ...DEFAULT_SETTINGS.reminders, ...stored.reminders },
    projectMarkers: { ...stored.projectMarkers },
  };
}

interface SettingsValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  updateLabels: (patch: Partial<LabelStyle>) => void;
  updateReminders: (patch: Partial<ReminderSettings>) => void;
  setProjectMarker: (projectId: string, marker: MarkerStyle | null) => void;
}

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  updateLabels: () => {},
  updateReminders: () => {},
  setProjectMarker: () => {},
});

export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  // Written from an effect rather than inside the state updaters: an updater has to stay a pure
  // function of the previous state.
  useEffect(() => {
    writeJsonSync(KEY, settings);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateLabels = useCallback((patch: Partial<LabelStyle>) => {
    setSettings((prev) => ({ ...prev, labels: { ...prev.labels, ...patch } }));
  }, []);

  const updateReminders = useCallback((patch: Partial<ReminderSettings>) => {
    setSettings((prev) => ({ ...prev, reminders: { ...prev.reminders, ...patch } }));
  }, []);

  const setProjectMarker = useCallback((projectId: string, marker: MarkerStyle | null) => {
    setSettings((prev) => {
      const projectMarkers = { ...prev.projectMarkers };
      if (marker) projectMarkers[projectId] = marker;
      else delete projectMarkers[projectId];
      return { ...prev, projectMarkers };
    });
  }, []);

  const value = useMemo(
    () => ({ settings, update, updateLabels, updateReminders, setProjectMarker }),
    [settings, update, updateLabels, updateReminders, setProjectMarker],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** The marker a project's points are drawn with: its own if it has one, the default otherwise. */
export function markerFor(settings: Settings, projectId: string | null | undefined): MarkerStyle {
  return (projectId && settings.projectMarkers[projectId]) || settings.marker;
}

/** The label source for a project's points. */
export function labelFieldFor(settings: Settings, projectId: string | null | undefined): string {
  return (projectId && settings.labels.projectFields[projectId]) || settings.labels.field;
}
