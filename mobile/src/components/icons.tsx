import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import { useColors } from '@/constants/theme';

/**
 * The app's icon set.
 *
 * Interface icons are drawn on one 24-unit grid in one stroke style — round caps and joins, no
 * fill — using the geometry of Lucide (lucide.dev, v1.69). They used to come from seven different
 * boxes (7, 12, 14, 16, 17, 19, 20 and 24 units) with seven stroke weights, and the tab bar and
 * camera glyphs were assembled out of bordered Views, so no two of them quite matched.
 *
 * The stroke is set in screen pixels rather than grid units (Lucide's "absolute stroke width"): an
 * 18-point row icon and a 24-point tab icon carry the same weight of line instead of the small one
 * thinning to a hairline. Icons cropped to their own bounds (chevrons, close, plus) keep the size
 * their call sites were laid out for.
 *
 * The map's own instruments stay hand-drawn — compass needle, placement crosshair and the
 * point/line/polygon glyphs — because a stock set has nothing that says the same thing.
 *
 * Lucide is ISC-licensed — Copyright (c) 2026 Lucide Icons and Contributors. Permission to use,
 * copy, modify, and/or distribute this software for any purpose with or without fee is hereby
 * granted, provided that the above copyright notice and this permission notice appear in all
 * copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO
 * THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
 */

type IconProps = { color?: string; size?: number };

/**
 * The shared frame. `size` is the rendered height; `box` is the viewBox, `[x, y, w, h]`, which
 * defaults to the full 24-unit grid and is cropped for glyphs that must sit tight to their bounds.
 */
function Glyph({
  size,
  color,
  box = [0, 0, 24, 24],
  children,
}: {
  size: number;
  color: string;
  box?: [number, number, number, number];
  children: ReactNode;
}) {
  const [x, y, w, h] = box;
  // 2 px at 24 and above, never under 1.5 px however small the icon is drawn.
  const px = Math.min(2, Math.max(1.5, size / 12));
  return (
    <Svg width={(size * w) / h} height={size} viewBox={`${x} ${y} ${w} ${h}`}>
      <G
        fill="none"
        stroke={color}
        strokeWidth={(px * h) / size}
        strokeLinecap="round"
        strokeLinejoin="round">
        {children}
      </G>
    </Svg>
  );
}

/* ── navigation ─────────────────────────────────────────────────────────── */

export function Chevron({ color, size = 13 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink75} box={[7, 4, 10, 16]}>
      <Path d="m9 18 6-6-6-6" />
    </Glyph>
  );
}

/** Back, in the Android idiom: an arrow rather than a chevron. */
export function BackChevron({ color, size = 22 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink}>
      <Path d="m12 19-7-7 7-7" />
      <Path d="M19 12H5" />
    </Glyph>
  );
}

export function Close({ color = '#fff', size = 14 }: IconProps) {
  return (
    <Glyph size={size} color={color} box={[5, 5, 14, 14]}>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </Glyph>
  );
}

/** `size` is the width here, as it always was for the check — it sits inside fixed-size ticks. */
export function Check({ color = '#fff', size = 10 }: IconProps) {
  return (
    <Glyph size={(size * 13) / 18} color={color} box={[3, 5, 18, 13]}>
      <Path d="M20 6 9 17l-5-5" />
    </Glyph>
  );
}

export function Search({ color, size = 17 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink55} box={[2, 2, 20, 20]}>
      <Path d="m21 21-4.34-4.34" />
      <Circle cx={11} cy={11} r={8} />
    </Glyph>
  );
}

export function PlusIcon({ color, size = 16 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30} box={[3, 3, 18, 18]}>
      <Path d="M5 12h14" />
      <Path d="M12 5v14" />
    </Glyph>
  );
}

/* ── tab bar ────────────────────────────────────────────────────────────── */

export function MapIcon({ color, size = 24 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <Path d="M15 5.764v15" />
      <Path d="M9 3.236v15" />
    </Glyph>
  );
}

export function FolderIcon({ color, size = 24 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Glyph>
  );
}

export function UserIcon({ color, size = 24 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M17.925 20.056a6 6 0 0 0-11.851.001" />
      <Circle cx={12} cy={11} r={4} />
      <Circle cx={12} cy={12} r={10} />
    </Glyph>
  );
}

/* ── capture & sync ─────────────────────────────────────────────────────── */

/** The camera on the capture buttons, drawn white for the accent FAB. */
export function CameraGlyph({ size = 28, color = '#fff' }: IconProps) {
  return (
    <Glyph size={size} color={color}>
      <Path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <Circle cx={12} cy={13} r={3} />
    </Glyph>
  );
}

/** A bolt — the camera's torch, for culverts, crawl spaces and dusk. */
export function TorchIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <Glyph size={size} color={color}>
      <Path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Glyph>
  );
}

/** Cloud with an upward arrow — sync and backup, wherever the outbox is the subject. */
export function Cloud({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M12 13v8" />
      <Path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <Path d="m8 17 4-4 4 4" />
    </Glyph>
  );
}

/** Struck-through cloud — no connection, working from what is saved on the phone. */
export function CloudOffIcon({ color, size = 16 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057" />
      <Path d="M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78" />
      <Path d="m2 2 20 20" />
    </Glyph>
  );
}

/** Cloud with a downward arrow — offline maps. */
export function DownloadIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M12 13v8l-4-4" />
      <Path d="m12 21 4-4" />
      <Path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284" />
    </Glyph>
  );
}

/* ── map controls ───────────────────────────────────────────────────────── */

export function LayersIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <Path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <Path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </Glyph>
  );
}

/** "Use my GPS position" — a located target. */
export function GpsIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Line x1={2} x2={5} y1={12} y2={12} />
      <Line x1={19} x2={22} y1={12} y2={12} />
      <Line x1={12} x2={12} y1={2} y2={5} />
      <Line x1={12} x2={12} y1={19} y2={22} />
      <Circle cx={12} cy={12} r={7} />
      <Circle cx={12} cy={12} r={3} />
    </Glyph>
  );
}

/** Ruler for the measure tool. */
export function RulerIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
      <Path d="m14.5 12.5 2-2" />
      <Path d="m11.5 9.5 2-2" />
      <Path d="m8.5 6.5 2-2" />
      <Path d="m17.5 15.5 2-2" />
    </Glyph>
  );
}

/** Survey grid overlay — a 3x3 quadrat lattice, the shape of the overlay it toggles. */
export function SurveyGridIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Rect width={18} height={18} x={3} y={3} rx={2} />
      <Path d="M3 9h18" />
      <Path d="M3 15h18" />
      <Path d="M9 3v18" />
      <Path d="M15 3v18" />
    </Glyph>
  );
}

/** Corner brackets — zoom to fit. */
export function FitIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    </Glyph>
  );
}

export function UndoIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M9 14 4 9l5-5" />
      <Path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </Glyph>
  );
}

export function RedoIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="m15 14 5-5-5-5" />
      <Path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
    </Glyph>
  );
}

/** A route between two stops — the GPS logger. */
export function TrackIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Circle cx={6} cy={19} r={3} />
      <Path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <Circle cx={18} cy={5} r={3} />
    </Glyph>
  );
}

/** Map pin — marker and label settings. */
export function MapPinIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <Circle cx={12} cy={10} r={3} />
    </Glyph>
  );
}

/* ── data ───────────────────────────────────────────────────────────────── */

/** Arrow out of a tray — export. */
export function ExportIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M12 3v12" />
      <Path d="m17 8-5-5-5 5" />
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </Glyph>
  );
}

/** Arrow into a tray — import. */
export function ImportIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M12 15V3" />
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="m7 10 5 5 5-5" />
    </Glyph>
  );
}

/** A folder with sync arrows — moving a project's data in or out. */
export function FolderSyncIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5" />
      <Path d="M12 10v4h4" />
      <Path d="m12 14 1.535-1.605a5 5 0 0 1 8 1.5" />
      <Path d="M22 22v-4h-4" />
      <Path d="m22 18-1.535 1.605a5 5 0 0 1-8-1.5" />
    </Glyph>
  );
}

/** A framed picture — map overlays. */
export function ImageIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Rect width={18} height={18} x={3} y={3} rx={2} ry={2} />
      <Circle cx={9} cy={9} r={2} />
      <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Glyph>
  );
}

export function TrashIcon({ color, size = 16 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.danger}>
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M3 6h18" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Glyph>
  );
}

export function EyeIcon({ color, size = 18, off = false }: IconProps & { off?: boolean }) {
  const C = useColors();
  const ink = color ?? C.ink46;
  return off ? (
    <Glyph size={size} color={ink}>
      <Path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <Path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <Path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <Path d="m2 2 20 20" />
    </Glyph>
  ) : (
    <Glyph size={size} color={ink}>
      <Path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <Circle cx={12} cy={12} r={3} />
    </Glyph>
  );
}

export function GearIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <Circle cx={12} cy={12} r={3} />
    </Glyph>
  );
}

export function DroneIcon({ color, size = 20 }: IconProps) {
  const C = useColors();
  return (
    <Glyph size={size} color={color ?? C.ink30}>
      <Path d="M10 10 7 7" />
      <Path d="m10 14-3 3" />
      <Path d="m14 10 3-3" />
      <Path d="m14 14 3 3" />
      <Path d="M14.205 4.139a4 4 0 1 1 5.439 5.863" />
      <Path d="M19.637 14a4 4 0 1 1-5.432 5.868" />
      <Path d="M4.367 10a4 4 0 1 1 5.438-5.862" />
      <Path d="M9.795 19.862a4 4 0 1 1-5.429-5.873" />
      <Rect x={10} y={8} width={4} height={8} rx={1} />
    </Glyph>
  );
}

/* ── map instruments (hand-drawn) ───────────────────────────────────────── */

/** Crosshair for the tap-to-pick map mode and the measure tool's centre-point placement. */
export function CrosshairIcon({ color, size = 24 }: IconProps) {
  const C = useColors();
  const ink = color ?? C.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8} stroke={ink} strokeWidth={1.6} fill="none" />
      <Circle cx={12} cy={12} r={2.5} fill={ink} />
      <Line x1={12} y1={0} x2={12} y2={5} stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={12} y1={19} x2={12} y2={24} stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={0} y1={12} x2={5} y2={12} stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={19} y1={12} x2={24} y2={12} stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Compass rose needle: red north half, ink south half. Rotated by the caller to the bearing. */
export function CompassNeedle({ size = 24 }: { size?: number }) {
  const C = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="12,2 15.5,12 8.5,12" fill="#e5484d" />
      <Polygon points="12,22 15.5,12 8.5,12" fill={C.ink46} />
      <Circle cx={12} cy={12} r={1.6} fill={C.raised} />
    </Svg>
  );
}

export function PointIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  const ink = color ?? C.ink30;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={4} fill={ink} />
      <Circle cx={10} cy={10} r={7} stroke={ink} strokeWidth={1.4} fill="none" />
    </Svg>
  );
}

export function LineIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  const ink = color ?? C.ink30;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M3 16L8 7L12 12L17 4" stroke={ink} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={3} cy={16} r={1.8} fill={ink} />
      <Circle cx={8} cy={7} r={1.8} fill={ink} />
      <Circle cx={12} cy={12} r={1.8} fill={ink} />
      <Circle cx={17} cy={4} r={1.8} fill={ink} />
    </Svg>
  );
}

export function PolygonIcon({ color, size = 18 }: IconProps) {
  const C = useColors();
  const ink = color ?? C.ink30;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Polygon points="4,15 3,6 11,3 17,9 13,17" stroke={ink} strokeWidth={1.6} fill={ink} fillOpacity={0.18} strokeLinejoin="round" />
    </Svg>
  );
}

/** Solid dot for "recording" indicators. */
export function RecordDot({ color = '#e5484d', size = 10 }: IconProps) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}
