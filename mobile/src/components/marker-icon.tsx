import { Image } from 'expo-image';
import { View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

import type { MarkerIconName, MarkerStyle } from '@/lib/settings';

/**
 * The local marker library (spec 1.2): every shape a survey point can be drawn with, plus a
 * surveyor's own uploaded picture. One component draws all of them so the map, the settings
 * preview and the project screen can never disagree about what a marker looks like.
 *
 * Shapes carry a white keyline so they stay visible on both the pale street map and satellite
 * imagery — the reason the original teardrop pin had one.
 */

const STROKE = '#ffffff';

function Shape({ icon, color }: { icon: MarkerIconName; color: string }) {
  switch (icon) {
    case 'pin':
      return (
        <>
          <Path
            d="M16 30C16 30 5.5 18.6 5.5 11.8a10.5 10.5 0 0121 0C26.5 18.6 16 30 16 30Z"
            fill={color}
            stroke={STROKE}
            strokeWidth={2}
          />
          <Circle cx={16} cy={11.8} r={3.6} fill={STROKE} />
        </>
      );
    case 'circle':
      return <Circle cx={16} cy={16} r={10} fill={color} stroke={STROKE} strokeWidth={2.5} />;
    case 'square':
      return <Rect x={6.5} y={6.5} width={19} height={19} rx={3} fill={color} stroke={STROKE} strokeWidth={2.5} />;
    case 'diamond':
      return <Polygon points="16,3.5 28.5,16 16,28.5 3.5,16" fill={color} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round" />;
    case 'triangle':
      return <Polygon points="16,4 28.5,27 3.5,27" fill={color} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round" />;
    case 'star':
      return (
        <Polygon
          points="16,3 19.6,11.6 28.8,12.3 21.8,18.4 23.9,27.4 16,22.6 8.1,27.4 10.2,18.4 3.2,12.3 12.4,11.6"
          fill={color}
          stroke={STROKE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      );
    case 'flag':
      return (
        <>
          <Path d="M8 30V3" stroke={STROKE} strokeWidth={4.5} strokeLinecap="round" />
          <Path d="M8 30V3" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M9 4H26L22 10L26 16H9Z" fill={color} stroke={STROKE} strokeWidth={2} strokeLinejoin="round" />
        </>
      );
    case 'tree':
      return (
        <>
          <Rect x={13.5} y={19} width={5} height={10} rx={1.5} fill="#7a5233" stroke={STROKE} strokeWidth={1.5} />
          <Circle cx={16} cy={13} r={10} fill={color} stroke={STROKE} strokeWidth={2.2} />
        </>
      );
    case 'house':
      return <Path d="M16 4L28 14V28H4V14Z" fill={color} stroke={STROKE} strokeWidth={2.4} strokeLinejoin="round" />;
    case 'drop':
      return (
        <Path
          d="M16 3C16 3 6.5 14 6.5 20a9.5 9.5 0 0019 0C25.5 14 16 3 16 3Z"
          fill={color}
          stroke={STROKE}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      );
    case 'camera':
      return (
        <>
          <Rect x={3.5} y={9} width={25} height={18} rx={4} fill={color} stroke={STROKE} strokeWidth={2.2} />
          <Path d="M11 9L13 5.5H19L21 9" fill={color} stroke={STROKE} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={16} cy={18} r={5} fill="none" stroke={STROKE} strokeWidth={2.2} />
        </>
      );
    case 'cross':
      return (
        <Path
          d="M12.5 4H19.5V12.5H28V19.5H19.5V28H12.5V19.5H4V12.5H12.5Z"
          fill={color}
          stroke={STROKE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      );
  }
}

/** Where the marker's geographic point sits on its artwork: the tip for pins and flags. */
export function markerAnchor(style: MarkerStyle): 'bottom' | 'center' {
  if (style.kind === 'icon' && (style.icon === 'pin' || style.icon === 'flag')) return 'bottom';
  return 'center';
}

/** A colour that stands for the marker at low zoom, where it is drawn as a plain dot. */
export function markerColor(style: MarkerStyle, fallback: string): string {
  return style.kind === 'icon' ? style.color : fallback;
}

export function MarkerIcon({
  style,
  size = 32,
  pending = false,
  pendingColor = '#a06700',
}: {
  style: MarkerStyle;
  size?: number;
  /** Still on the device: drawn with a small badge so it reads as "not uploaded yet". */
  pending?: boolean;
  pendingColor?: string;
}) {
  const badge = pending ? (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: Math.round(size * 0.36),
        height: Math.round(size * 0.36),
        borderRadius: size,
        backgroundColor: pendingColor,
        borderWidth: 1.5,
        borderColor: '#fff',
      }}
    />
  ) : null;

  if (style.kind === 'image') {
    return (
      <View style={{ width: size, height: size }}>
        <Image
          source={{ uri: style.uri }}
          style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#fff' }}
          contentFit="cover"
        />
        {badge}
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Shape icon={style.icon} color={style.color} />
      </Svg>
      {badge}
    </View>
  );
}
