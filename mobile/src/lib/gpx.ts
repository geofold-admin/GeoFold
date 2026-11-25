import type { TrackPoint } from './tracker';

/**
 * GPX 1.1 for a GPS logger track — the format every GPS tool, Google Earth and Strava-likes read,
 * and the natural way to hand one route to someone without a GIS.
 */

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toGpx(name: string, points: TrackPoint[]): string {
  const pts = points
    .map(([lng, lat, t, , alt]) => {
      const ele = alt != null && Number.isFinite(alt) ? `<ele>${alt.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}">${ele}<time>${new Date(t).toISOString()}</time></trkpt>`;
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GeoFold" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escape(name)}</name></metadata>`,
    '  <trk>',
    `    <name>${escape(name)}</name>`,
    '    <trkseg>',
    pts,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}
