import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/Txt';
import { initials } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';

/**
 * A dim layer for a dialog. The height is pinned to the window rather
 * than left to flex, because inside a long scrolling page a flexible
 * backdrop grows to the whole page and pushes the dialog off screen.
 */
export function useBackdrop(align: 'center' | 'bottom' = 'center'): ViewStyle {
  const { height } = useWindowDimensions();
  return {
    height,
    backgroundColor: 'rgba(11, 22, 40, 0.5)',
    alignItems: 'center',
    justifyContent: align === 'bottom' ? 'flex-end' : 'center',
    paddingHorizontal: align === 'bottom' ? 0 : 20,
    paddingVertical: align === 'bottom' ? 0 : 20,
  };
}

// ----------------------------------------------------------------- card
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, shadow.card, padded && styles.cardPad, style]}>{children}</View>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Txt variant="label" color={colors.textFaint} style={styles.upper}>
        {title}
      </Txt>
      {action}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

// ---------------------------------------------------------------- badge
type BadgeTone = 'navy' | 'blue' | 'green' | 'red' | 'amber' | 'grey';

const badgeTones: Record<BadgeTone, { bg: string; fg: string }> = {
  navy: { bg: colors.navyTint, fg: colors.navy },
  blue: { bg: colors.blueSoft, fg: colors.blue },
  green: { bg: colors.greenSoft, fg: colors.green },
  red: { bg: colors.redSoft, fg: colors.red },
  amber: { bg: colors.amberSoft, fg: colors.amberDark },
  grey: { bg: '#EDF1F6', fg: colors.textMuted },
};

export function Badge({
  label,
  tone = 'grey',
  icon,
  style,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * A badge keeps to its own width by sitting at the start of its line,
   * which is right in a stack but wrong in a row lined up through the
   * middle. Pass alignSelf 'center' in those rows.
   */
  style?: StyleProp<ViewStyle>;
}) {
  const t = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Txt variant="label" color={t.fg} numberOfLines={1} style={styles.badgeText}>
        {label}
      </Txt>
    </View>
  );
}

// --------------------------------------------------------------- avatar
export function Avatar({
  name,
  size = 44,
  tone = colors.navy,
}: {
  name: string | null | undefined;
  size?: number;
  tone?: string;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 3.2,
          backgroundColor: `${tone}12`,
        },
      ]}
    >
      <Txt
        style={{ fontSize: size * 0.36, lineHeight: size * 0.46, color: tone }}
        weight="bold"
      >
        {initials(name)}
      </Txt>
    </View>
  );
}

// --------------------------------------------------------------- banner
export function Banner({
  tone,
  message,
  title,
}: {
  tone: 'error' | 'success' | 'info' | 'warn';
  message: string;
  title?: string;
}) {
  const map = {
    error: { bg: colors.redSoft, fg: colors.red, icon: 'alert-circle' as const },
    success: { bg: colors.greenSoft, fg: colors.green, icon: 'checkmark-circle' as const },
    info: { bg: colors.blueSoft, fg: colors.blue, icon: 'information-circle' as const },
    warn: { bg: colors.amberSoft, fg: colors.amberDark, icon: 'warning' as const },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]}>
      <Ionicons name={map.icon} size={20} color={map.fg} style={styles.bannerIcon} />
      <View style={styles.bannerBody}>
        {title ? (
          <Txt variant="heading" color={map.fg}>
            {title}
          </Txt>
        ) : null}
        <Txt variant="caption" color={map.fg}>
          {message}
        </Txt>
      </View>
    </View>
  );
}

// ------------------------------------------------------------ feedback
export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.navy} size="large" />
      {label ? (
        <Txt variant="caption" color={colors.textMuted} style={styles.loadingLabel}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.textFaint} />
      </View>
      <Txt variant="heading" center>
        {title}
      </Txt>
      {message ? (
        <Txt variant="caption" color={colors.textMuted} center>
          {message}
        </Txt>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** label on the left, value on the right - used all over the detail screens */
export function DetailRow({
  label,
  value,
  valueColor,
  last,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      {typeof value === 'string' ? (
        <Txt variant="subtitle" color={valueColor} style={styles.detailValue}>
          {value}
        </Txt>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardPad: { padding: 16 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  upper: { textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: colors.line },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
  },
  badgeText: { flexShrink: 1 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  bannerIcon: { marginTop: 1 },
  bannerBody: { flex: 1, gap: 2 },
  center: { paddingVertical: 48, alignItems: 'center', gap: 12 },
  loadingLabel: { marginTop: 4 },
  empty: { paddingVertical: 44, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: '#EDF1F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyAction: { marginTop: 12 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
  },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  detailValue: { flexShrink: 1, textAlign: 'right' },
});
