import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { money } from '@/lib/format';
import { colors, radius } from '@/theme';

/**
 * The pieces every "open this figure up" screen is built from: the
 * figure itself at the top, and under it a line for each part of it.
 *
 * They live together because the arithmetic has to be visible: a person
 * who taps a number is checking it, and a list whose parts do not add
 * back up to the heading is worse than no list at all.
 */

/** The figure for whatever is on the screen, so the parts add up in sight. */
export function TotalCard({
  tone,
  total,
  caption,
  label = 'TOTAL',
  style,
}: {
  tone: string;
  total: number;
  caption: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.total, { backgroundColor: `${tone}12`, borderColor: `${tone}33` }, style]}
    >
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt weight="bold" color={tone} style={styles.totalValue} numberOfLines={1}>
        {money(total)}
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        {caption}
      </Txt>
    </View>
  );
}

/** How big this row is against the whole, read at a glance. */
export function ShareBar({
  fraction,
  tone,
  stretch = false,
}: {
  fraction: number;
  tone: string;
  /** Fill the room it is given, rather than keeping to a set width. */
  stretch?: boolean;
}) {
  const width = Math.max(2, Math.min(100, Math.round(fraction * 100)));
  return (
    <View style={[styles.barTrack, stretch && styles.barStretch]}>
      <View style={[styles.barFill, { width: `${width}%`, backgroundColor: tone }]} />
    </View>
  );
}

/**
 * One line of a breakdown: who or when, what it came to, and how big a
 * piece of the whole that is.
 *
 * On a wide screen the amount sits at the end of the line, where the eye
 * can run down a column of them. On a phone there is no room for both a
 * name and a column, so the amount drops to its own line and the bar
 * stretches out beside it - and a name like Muhammad Muaz stops being
 * cut in half.
 */
export function DrillRow({
  leading,
  title,
  caption,
  badge,
  amount,
  fraction,
  tone,
  onPress,
}: {
  leading: React.ReactNode;
  title: string;
  caption: string;
  badge?: React.ReactNode;
  amount: number;
  fraction: number;
  tone: string;
  onPress: () => void;
}) {
  const wide = useIsWide();

  const heading = (
    <View style={styles.rowText}>
      <View style={styles.nameLine}>
        <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
          {title}
        </Txt>
        {badge}
      </View>
      <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
        {caption}
      </Txt>
    </View>
  );

  const value = (
    <Txt weight="bold" color={tone} numberOfLines={1}>
      {money(amount)}
    </Txt>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${money(amount)}`}
      style={({ pressed }) => [wide ? styles.row : styles.rowNarrow, pressed && styles.rowPressed]}
    >
      {wide ? (
        <>
          {leading}
          {heading}
          <View style={styles.rowRight}>
            {value}
            <ShareBar fraction={fraction} tone={tone} />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </>
      ) : (
        <>
          <View style={styles.narrowTop}>
            {leading}
            {heading}
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </View>
          <View style={styles.narrowFoot}>
            <View style={styles.narrowBar}>
              <ShareBar fraction={fraction} tone={tone} stretch />
            </View>
            {value}
          </View>
        </>
      )}
    </Pressable>
  );
}

export const breakdownStyles = StyleSheet.create({
  list: { overflow: 'hidden' },
  badgeMid: { alignSelf: 'center' },
  dayIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  total: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 2,
    marginBottom: 14,
  },
  totalValue: { fontSize: 30, lineHeight: 38, letterSpacing: -0.8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowNarrow: {
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  narrowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  narrowFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  narrowBar: { flex: 1 },
  rowPressed: { backgroundColor: colors.navyTint },
  rowText: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowRight: { alignItems: 'flex-end', gap: 5, minWidth: 96 },

  barStretch: { width: '100%' },
  barTrack: {
    width: 64,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2 },
});
