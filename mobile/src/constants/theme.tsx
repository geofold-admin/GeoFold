import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

/**
 * Palette from the "GeoFold mobile app prototype" Claude Design project, plus a dark counterpart.
 *
 * The design is authored in oklch(); React Native's color parser does not support that function,
 * so every light value here is the sRGB conversion of the design's token. Keep the oklch source in
 * the comment when changing one, so the two stay traceable to each other.
 *
 * The dark values keep the same *roles*, not the same lightness: every token was picked against
 * its real background with a contrast check (ink55 captions 6.7:1 on the surface, placeholder 4.9:1
 * on the input fill). The one role that cannot be shared is the accent. A blue dark enough for
 * white button text to clear 4.5:1 is too dark to read as link text on a near-black surface, and
 * the reverse — no single value does both — so dark mode splits it: `accent` for fills, which carry
 * white text, and `accentText` for blue *text*. In light mode the two are the same colour.
 */
export interface Palette {
  accent: string;
  accentText: string;
  accentTint: string;
  accentDark: string;

  ink: string;
  ink30: string;
  ink42: string;
  ink46: string;
  ink55: string;
  ink60: string;
  ink62: string;
  ink75: string;

  line80: string;
  line85: string;
  line88: string;
  line90: string;
  line92: string;
  bg95: string;
  bg96: string;
  bg98: string;
  surface: string;
  /** Floating controls over the map. The page surface in light mode, one step lifted in dark. */
  raised: string;

  neutralChip: string;
  warn: string;
  warnBg: string;
  ok: string;
  okBg: string;
  danger: string;
  dangerBg: string;

  mapBase: string;
  hatchA: string;
  hatchB: string;
  hatchInk: string;
  scrim: string;
}

export const LIGHT: Palette = {
  // Accent — oklch(0.52 0.16 241) / tint 0.95 0.028 / dark 0.40 0.16
  accent: '#0070bb',
  accentText: '#0070bb',
  accentTint: '#dff1ff',
  accentDark: '#004b94',

  // Text
  ink: '#10171c', // 0.20 0.014 240 — headings
  ink30: '#282f34', // body on light
  ink42: '#484e52', // chip label, inactive
  ink46: '#51595f', // secondary
  ink55: '#6b7379', // tertiary / captions
  ink60: '#7b8186', // inactive tab icon
  ink62: '#7f878e', // placeholder
  ink75: '#a8afb4', // chevrons

  // Lines & surfaces
  line80: '#babec1',
  line85: '#caced1',
  line88: '#d4d8db', // input border
  line90: '#dbdfe2', // card border
  line92: '#e2e5e8', // row divider
  bg95: '#eceff1', // segmented control track
  bg96: '#eff2f4', // page backdrop
  bg98: '#f7f9fa', // input fill
  surface: '#ffffff',
  raised: '#ffffff',

  // Status
  neutralChip: '#636a6f',
  warn: '#a06700',
  warnBg: '#fbecd9',
  ok: '#137738',
  okBg: '#e1f5e4',
  danger: '#ba3535',
  dangerBg: '#ffe7e4',

  // Map + photo placeholders
  mapBase: '#e4edef',
  hatchA: '#d2d8dd',
  hatchB: '#c5cbd0',
  hatchInk: '#50565a',
  scrim: 'rgba(0,0,0,0.4)',
};

export const DARK: Palette = {
  accent: '#2277c2', // white text on it: 4.7:1
  accentText: '#5aaef0', // on the surface: 7.4:1
  accentTint: '#163049',
  accentDark: '#8cc6f5',

  ink: '#eef2f5',
  ink30: '#d6dce1',
  ink42: '#bfc7cd',
  ink46: '#b0b9c0',
  ink55: '#97a1a9',
  ink60: '#8c969e',
  ink62: '#848e96',
  ink75: '#5f6970',

  line80: '#4a535a',
  line85: '#40484f',
  line88: '#3a4249',
  line90: '#333b41',
  line92: '#2c3338',
  bg95: '#252c32',
  bg96: '#1d2328',
  bg98: '#1b2126',
  surface: '#14191d',
  raised: '#1e252b',

  neutralChip: '#a7b0b7',
  warn: '#e3a547',
  warnBg: '#3a2c14',
  ok: '#4fc47d',
  okBg: '#16301f',
  danger: '#f07c73',
  dangerBg: '#3d1d1c',

  mapBase: '#1c2428',
  hatchA: '#2a3237',
  hatchB: '#323a40',
  hatchInk: '#a3acb3',
  scrim: 'rgba(0,0,0,0.6)',
};

/** Status pill styling, mirroring the design's statusMeta()/photoStatusMeta(). */
function statusFor(C: Palette) {
  return {
    pending: { label: 'Pending sync', color: C.warn, bg: C.warnBg },
    syncing: { label: 'Syncing', color: C.accentText, bg: C.accentTint },
    synced: { label: 'Synced', color: C.ok, bg: C.okBg },
    failed: { label: 'Failed', color: C.danger, bg: C.dangerBg },
    reviewed: { label: 'Reviewed', color: C.ok, bg: C.okBg },
    submitted: { label: 'Submitted', color: C.accentText, bg: C.accentTint },
    none: { label: 'Not started', color: C.neutralChip, bg: C.bg95 },
  } as const;
}

export type StatusMap = ReturnType<typeof statusFor>;
export type StatusKey = keyof StatusMap;

/**
 * The design specifies Roboto, which is the system face on Android — the platform it was drawn
 * for — so the system stack matches it exactly there without shipping a 1 MB font file. iOS falls
 * back to SF Pro.
 */
export const Fonts = {
  sans: Platform.select({ android: 'Roboto', default: 'System' })!,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })!,
};

export const Radius = { sm: 6, md: 10, lg: 12, xl: 14, sheet: 18, pill: 999 } as const;

/* ── theme context ───────────────────────────────────────────────────────── */

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Theme {
  C: Palette;
  STATUS: StatusMap;
  dark: boolean;
}

const LIGHT_THEME: Theme = { C: LIGHT, STATUS: statusFor(LIGHT), dark: false };
const DARK_THEME: Theme = { C: DARK, STATUS: statusFor(DARK), dark: true };

const ThemeContext = createContext<Theme>(LIGHT_THEME);

export function ThemeProvider({
  preference,
  children,
}: {
  preference: ThemePreference;
  children: ReactNode;
}) {
  // Follows the OS live under 'system' — Android re-renders this when the user flips dark mode.
  const scheme = useColorScheme();
  const dark = preference === 'dark' || (preference === 'system' && scheme === 'dark');
  const theme = dark ? DARK_THEME : LIGHT_THEME;

  // The root view's own background shows for a frame during navigation transitions and behind the
  // keyboard. Left white, dark mode flashes on every push.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.C.surface).catch(() => {});
  }, [theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useColors(): Palette {
  return useContext(ThemeContext).C;
}

/**
 * Theme-aware StyleSheet. Both sheets are built once, up front, so switching theme swaps a
 * reference instead of rebuilding styles — and nothing is created or cached during render.
 *
 *   const useStyles = makeStyles((C) => ({ root: { backgroundColor: C.surface } }));
 *   …
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (C: Palette) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const sheets = {
    light: StyleSheet.create(factory(LIGHT)),
    dark: StyleSheet.create(factory(DARK)),
  };
  return function useStyles(): T {
    return useContext(ThemeContext).dark ? sheets.dark : sheets.light;
  };
}
