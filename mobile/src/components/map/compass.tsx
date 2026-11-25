import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { CompassNeedle } from '../icons';
import { MapButton } from '../ui';

/**
 * The map's compass (spec 2.1).
 *
 * MapLibre's built-in compass sits in the top-right corner, which is exactly where the sync button
 * is — and the full-width top bar holding that button swallowed every touch over it, so the compass
 * could be neither seen nor pressed. This replaces it with a button in the map's own control column,
 * below the sync button: always visible, always pressable, and showing north even when the map is
 * not rotated, so it reads as an instrument rather than a hint that only appears mid-gesture.
 *
 * The bearing arrives on every frame of a rotate gesture. It goes through a tiny external store so
 * only this button re-renders for it — not the map, its markers, or the screen around it.
 */

let bearing = 0;
const listeners = new Set<() => void>();

export function publishBearing(next: number): void {
  // Sub-degree changes are invisible on a 24-pt needle and would re-render for nothing.
  if (Math.abs(next - bearing) < 0.5) return;
  bearing = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => bearing;

export function CompassButton({ onPress }: { onPress: () => void }) {
  const value = useSyncExternalStore(subscribe, read, read);
  return (
    <MapButton onPress={onPress} label={`Compass, bearing ${Math.round(value)} degrees. Tap to face north.`}>
      <View style={{ transform: [{ rotate: `${-value}deg` }] }}>
        <CompassNeedle size={26} />
      </View>
    </MapButton>
  );
}
