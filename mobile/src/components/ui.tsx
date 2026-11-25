import type { ComponentType, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChevron, Chevron } from './icons';
import { Fonts, Radius, makeStyles, useColors, useTheme, type StatusKey } from '@/constants/theme';

/* ── layout ─────────────────────────────────────────────────────────────── */

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 } : null;

  if (!scroll) {
    return <View style={[styles.screen, pad, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[pad, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/** Detail-screen header: 40px back target, 16/500 title, hairline rule. */
export function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.headerBack} hitSlop={6} accessibilityLabel="Back">
          <BackChevron />
        </Pressable>
      ) : (
        <View style={{ width: 12 }} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

/** Tab-screen header: 26/700 title over a 13px subtitle. */
export function TabTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const styles = useStyles();
  return (
    <View style={{ paddingTop: 20, paddingBottom: 12 }}>
      <Text style={styles.tabTitle}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { marginTop: 4 }]}>{subtitle}</Text> : null}
    </View>
  );
}

/* ── controls ───────────────────────────────────────────────────────────── */

export function Chip({
  label,
  active,
  onPress,
  small,
  floating,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
  /** Over the map: lifted with the same shadow as the map's other controls, so it reads on any basemap. */
  floating?: boolean;
}) {
  const styles = useStyles();
  const C = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        small ? styles.chipSmall : null,
        floating ? styles.chipFloating : null,
        {
          backgroundColor: active ? C.accent : floating ? C.raised : C.surface,
          borderColor: active ? C.accent : floating ? C.raised : C.line88,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Text style={[styles.chipText, small ? { fontSize: 12 } : null, { color: active ? '#fff' : C.ink42 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusPill({ status, label }: { status: StatusKey; label?: string }) {
  const styles = useStyles();
  const { STATUS } = useTheme();
  const meta = STATUS[status] ?? STATUS.none;
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Text style={[styles.pillText, { color: meta.color }]}>{label ?? meta.label}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'subtle' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const C = useColors();
  const inactive = disabled || busy;
  const palette = {
    primary: { bg: C.accent, fg: '#fff', border: C.accent },
    outline: { bg: 'transparent', fg: C.ink30, border: C.line90 },
    subtle: { bg: C.bg95, fg: C.ink30, border: C.bg95 },
    danger: { bg: 'transparent', fg: C.danger, border: C.line90 },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' ? { paddingVertical: 16, borderRadius: Radius.lg } : null,
        size === 'sm' ? { paddingVertical: 9, paddingHorizontal: 12 } : null,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {busy ? <ActivityIndicator size="small" color={palette.fg} style={{ marginRight: 8 }} /> : null}
      <Text
        style={[
          styles.buttonText,
          size === 'lg' ? { fontSize: 16 } : null,
          size === 'sm' ? { fontSize: 13 } : null,
          { color: palette.fg },
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { invalid?: boolean }) {
  const styles = useStyles();
  const C = useColors();
  const { invalid, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={C.ink62}
      {...rest}
      style={[
        styles.input,
        props.multiline ? styles.inputMultiline : null,
        invalid ? { borderColor: C.danger } : null,
        style,
      ]}
    />
  );
}

export function Field({
  label,
  required,
  error,
  hint,
  ...props
}: TextInputProps & { label?: string; required?: boolean; error?: string | null; hint?: string }) {
  const styles = useStyles();
  const C = useColors();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={{ color: C.danger }}> *</Text> : null}
        </Text>
      ) : null}
      <Input {...props} invalid={!!error} />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** A labelled group of controls that isn't a text input — chips, a switch — with the same frame. */
export function FieldFrame({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const C = useColors();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={{ color: C.danger }}> *</Text> : null}
      </Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Segmented control — the design's Sign in / Create account switch. */
export function Segmented({
  options,
  value,
  onChange,
  small,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  small?: boolean;
}) {
  const styles = useStyles();
  const C = useColors();
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, small ? { paddingVertical: 7 } : null, active ? { backgroundColor: C.accent } : null]}>
            <Text style={[styles.segmentText, small ? { fontSize: 13 } : null, { color: active ? '#fff' : C.ink46 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── containers ─────────────────────────────────────────────────────────── */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A project's initial on a tinted tile — the visual anchor of a project row. */
export function ProjectAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const styles = useStyles();
  // Array.from so a name that starts with an emoji or another astral character keeps it whole.
  const initial = (Array.from(name.trim())[0] ?? '#').toUpperCase();
  return (
    <View
      style={[styles.avatarTile, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={[styles.avatarTileText, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
    </View>
  );
}

/** One figure in a row of counters: the number large, what it counts small beneath it. */
export function StatTile({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Grouped rows inside one rounded outline, dividers between — the Profile pattern. */
export function RowGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.rowGroup}>{children}</View>;
}

export function Row({
  label,
  value,
  onPress,
  last,
  right,
  detail,
  detailLines = 2,
  icon: Icon,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  right?: ReactNode;
  /** Second line under the label. */
  detail?: string;
  /** How many lines the detail may wrap to before it is cut; 0 shows all of it. */
  detailLines?: number;
  /** Leading icon (a component from `icons.tsx`), drawn on a tinted tile. */
  icon?: ComponentType<{ color?: string; size?: number }>;
}) {
  const styles = useStyles();
  const C = useColors();
  const content = (
    <View style={[styles.row, last ? { borderBottomWidth: 0 } : null]}>
      {Icon ? (
        <View style={styles.rowIcon}>
          <Icon color={C.accentText} size={18} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? (
          <Text style={styles.rowDetail} numberOfLines={detailLines || undefined}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress ? <Chevron /> : null)}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** A row whose right side is a switch. */
export function SwitchRow({
  label,
  detail,
  value,
  onValueChange,
  last,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  const C = useColors();
  return (
    <Row
      label={label}
      detail={detail}
      // A switch's explanation is what the user is agreeing to; it is never cut short.
      detailLines={0}
      last={last}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: C.accent, false: C.line85 }}
          thumbColor="#fff"
        />
      }
    />
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const styles = useStyles();
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

/** Diagonal hatch used wherever the design stands in for a photo. */
export function Hatch({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const C = useColors();
  return (
    <View style={[{ backgroundColor: C.hatchA, overflow: 'hidden' }, style]}>
      {Array.from({ length: 14 }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: -40,
            bottom: -40,
            left: i * 20 - 30,
            width: 10,
            backgroundColor: C.hatchB,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
      {children}
    </View>
  );
}

export function Toast({ text }: { text: string | null }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  if (!text) return null;
  return (
    <View style={[styles.toast, { bottom: insets.bottom + 80 }]} pointerEvents="none">
      <Text style={styles.toastText}>{text}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Text style={[styles.subtitle, { textAlign: 'center' }]}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const styles = useStyles();
  const C = useColors();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={C.accentText} />
      {label ? <Text style={[styles.subtitle, { marginTop: 10 }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  const styles = useStyles();
  if (!message) return null;
  return (
    <View style={styles.errorNote}>
      <Text style={styles.errorNoteText}>{message}</Text>
    </View>
  );
}

export function InfoNote({ message, tone = 'info' }: { message: string | null; tone?: 'info' | 'ok' | 'warn' }) {
  const styles = useStyles();
  const C = useColors();
  if (!message) return null;
  const palette = {
    info: { bg: C.accentTint, fg: C.accentText },
    ok: { bg: C.okBg, fg: C.ok },
    warn: { bg: C.warnBg, fg: C.warn },
  }[tone];
  return (
    <View style={[styles.errorNote, { backgroundColor: palette.bg }]}>
      <Text style={[styles.errorNoteText, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

/**
 * Bottom sheet over a scrim — the capture sheet's pattern, generalised. Content scrolls when it
 * outgrows `maxHeight`; tapping the scrim or the system back gesture closes it.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeight = 560,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: number;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* The scrim fills the whole modal *behind* the sheet. Stacked above it instead, the sheet's
          rounded corners showed the undimmed screen through them — white notches in light mode. */}
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.grabber} />
        {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
        <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Round floating control for the map — 44pt target, raised card colours. */
export function MapButton({
  onPress,
  children,
  active,
  label,
  onLongPress,
  style,
}: {
  onPress: () => void;
  children: ReactNode;
  active?: boolean;
  label: string;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const C = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.mapButton,
        active ? { backgroundColor: C.accent } : null,
        { opacity: pressed ? 0.8 : 1 },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

/* ── text ───────────────────────────────────────────────────────────────── */

export const useT = makeStyles((C) => ({
  h1: { fontSize: 26, fontWeight: '700', color: C.ink, fontFamily: Fonts.sans },
  h2: { fontSize: 21, fontWeight: '700', color: C.ink, lineHeight: 26, fontFamily: Fonts.sans },
  section: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  body: { fontSize: 14, color: C.ink30, lineHeight: 20, fontFamily: Fonts.sans },
  sub: { fontSize: 13, color: C.ink55, fontFamily: Fonts.sans },
  caption: { fontSize: 12, color: C.ink55, fontFamily: Fonts.sans },
  mono: { fontSize: 13, color: C.ink46, fontFamily: Fonts.mono },
  monoSm: { fontSize: 11, color: C.ink55, fontFamily: Fonts.mono },
  link: { fontSize: 13, fontWeight: '500', color: C.accentText, fontFamily: Fonts.sans },
}));

const useStyles = makeStyles((C) => ({
  screen: { flex: 1, backgroundColor: C.surface },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
    backgroundColor: C.surface,
  },
  headerBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  headerTitle: { fontSize: 16, fontWeight: '500', color: C.ink, fontFamily: Fonts.sans, flexShrink: 1 },

  tabTitle: { fontSize: 26, fontWeight: '700', color: C.ink, fontFamily: Fonts.sans },
  subtitle: { fontSize: 13, color: C.ink55, fontFamily: Fonts.sans },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipSmall: { paddingHorizontal: 11, paddingVertical: 5 },
  chipFloating: {
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  chipText: { fontSize: 13, fontWeight: '500', fontFamily: Fonts.sans },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '500', fontFamily: Fonts.sans },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  buttonText: { fontSize: 15, fontWeight: '500', fontFamily: Fonts.sans },

  input: {
    borderWidth: 1,
    borderColor: C.line88,
    backgroundColor: C.bg98,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.ink,
    fontFamily: Fonts.sans,
  },
  inputMultiline: { height: 92, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 13, color: C.ink55, marginBottom: 6, fontFamily: Fonts.sans },
  fieldError: { fontSize: 12, color: C.danger, marginTop: 5, fontFamily: Fonts.sans },
  fieldHint: { fontSize: 12, color: C.ink55, marginTop: 5, fontFamily: Fonts.sans },

  segmented: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: C.bg95,
    borderRadius: Radius.md,
    padding: 4,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  segmentText: { fontSize: 14, fontWeight: '500', fontFamily: Fonts.sans },

  card: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, padding: 18 },
  avatarTile: { backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  avatarTileText: { color: C.accentText, fontWeight: '700', fontFamily: Fonts.sans },
  statTile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    backgroundColor: C.bg96,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: C.ink, fontFamily: Fonts.sans },
  statLabel: { fontSize: 12, color: C.ink55, marginTop: 2, fontFamily: Fonts.sans },
  rowGroup: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, color: C.ink, fontFamily: Fonts.sans },
  rowDetail: { fontSize: 12, color: C.ink55, marginTop: 2, fontFamily: Fonts.sans },
  rowValue: { fontSize: 13, color: C.ink55, fontFamily: Fonts.sans },

  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.line92, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.accent },

  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: C.ink,
    borderRadius: Radius.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
    zIndex: 9,
  },
  toastText: { color: C.surface, fontSize: 13, textAlign: 'center', fontFamily: Fonts.sans },

  empty: {
    borderWidth: 1,
    borderColor: C.line90,
    borderStyle: 'dashed',
    borderRadius: Radius.xl,
    padding: 24,
  },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56 },
  errorNote: {
    backgroundColor: C.dangerBg,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 16,
  },
  errorNoteText: { color: C.danger, fontSize: 13, lineHeight: 19, fontFamily: Fonts.sans },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line85,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: C.ink, marginBottom: 12, fontFamily: Fonts.sans },

  mapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.raised,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
}));
