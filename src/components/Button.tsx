import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/Txt';
import { colors, fonts, radius, shadow } from '@/theme';

type Variant = 'primary' | 'navy' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};

const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.amber, fg: colors.navyDeep },
  navy: { bg: colors.navy, fg: colors.white },
  outline: { bg: 'transparent', fg: colors.navy, border: colors.lineStrong },
  ghost: { bg: 'transparent', fg: colors.navy },
  danger: { bg: colors.red, fg: colors.white },
  success: { bg: colors.green, fg: colors.white },
};

const sizes: Record<Size, { height: number; px: number; font: number; icon: number }> = {
  sm: { height: 38, px: 14, font: 14, icon: 16 },
  md: { height: 50, px: 18, font: 15, icon: 19 },
  lg: { height: 58, px: 22, font: 17, icon: 22 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  full = false,
  style,
}: Props) {
  const tone = palette[variant];
  const dim = sizes[size];
  const off = disabled || loading;

  const handlePress = () => {
    if (off || !onPress) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={handlePress}
      disabled={off}
      style={({ pressed }) => [
        styles.base,
        {
          height: dim.height,
          paddingHorizontal: dim.px,
          backgroundColor: tone.bg,
          borderColor: tone.border ?? 'transparent',
          borderWidth: tone.border ? 1 : 0,
          opacity: off ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !off ? 0.985 : 1 }],
        },
        full && styles.full,
        variant === 'primary' || variant === 'navy' ? shadow.card : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={dim.icon} color={tone.fg} /> : null}
          <Txt
            style={{ fontSize: dim.font, fontFamily: fonts.semibold, color: tone.fg }}
            numberOfLines={1}
          >
            {label}
          </Txt>
          {iconRight ? <Ionicons name={iconRight} size={dim.icon} color={tone.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/**
 * The big square action button on the home screen: large icon on top,
 * short label underneath. Easy to hit and easy to understand.
 */
export function BigActionButton({
  label,
  icon,
  onPress,
  tint = colors.navy,
  background = colors.card,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  tint?: string;
  background?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.big,
        shadow.card,
        {
          backgroundColor: background,
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.bigIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={28} color={tint} />
      </View>
      <Txt variant="heading" center numberOfLines={2}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * The dashboard version of a main action: the same big tap target, but
 * laid out across instead of down, so four of them do not take over the
 * screen next to the folded-up sections.
 */
export function ActionTile({
  label,
  icon,
  onPress,
  tint = colors.navy,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  tint?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.tile,
        shadow.card,
        {
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      {/* Two lines, because "Money Given" does not fit on one at phone width. */}
      <Txt variant="subtitle" weight="semibold" numberOfLines={2} style={styles.tileLabel}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  big: {
    flex: 1,
    minWidth: 140,
    borderRadius: radius.lg,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 12,
  },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 66,
    paddingHorizontal: 11,
    paddingVertical: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flex: 1, minWidth: 0 },
});
