/**
 * Where the main map was last looking. Written by the map on every settled pan or zoom; read by
 * screens that act on "this area" — downloading it for offline use, or dropping an image overlay
 * onto it — without having to own a map of their own.
 *
 * Module state rather than context: it changes on every pan, and nothing should re-render for it.
 */

export interface Viewport {
  /** `[west, south, east, north]`. */
  bounds: [number, number, number, number];
  zoom: number;
  center: [number, number];
}

let last: Viewport | null = null;

export function setLastViewport(viewport: Viewport): void {
  last = viewport;
}

export function getLastViewport(): Viewport | null {
  return last;
}

/**
 * One-shot camera requests from other screens ("zoom to this feature", "show this track").
 * The map consumes the request when it next comes into focus.
 */
export type FocusRequest =
  | { kind: 'bounds'; bounds: [number, number, number, number] }
  | { kind: 'point'; center: [number, number]; zoom?: number };

let pendingFocus: FocusRequest | null = null;
const listeners = new Set<() => void>();

export function requestMapFocus(request: FocusRequest): void {
  pendingFocus = request;
  listeners.forEach((l) => l());
}

export function takeMapFocus(): FocusRequest | null {
  const request = pendingFocus;
  pendingFocus = null;
  return request;
}

export function onMapFocusRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
