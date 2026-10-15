import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/Txt';
import { colors, CONTENT_MAX_WIDTH, radius, WIDE_BREAKPOINT } from '@/theme';

export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}

/**
 * Page frame. Keeps content in a readable column on wide screens and
 * handles the keyboard and the notch on phones.
 */
export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
  footer,
  background = colors.bg,
  edges = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
  background?: string;
  edges?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[styles.inner, contentStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: background }, style]}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: edges ? insets.top + 8 : 8, paddingBottom: 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingTop: edges ? insets.top + 8 : 8 }]}>{body}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.inner}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Screen title row, with an optional back arrow and right-hand action. */
export function Header({
  title,
  subtitle,
  back = false,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.navy} />
        </Pressable>
      ) : null}

      <View style={styles.headerText}>
        <Txt variant="title" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    marginBottom: 6,
  },
  headerText: { flex: 1, gap: 2 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  backPressed: { backgroundColor: colors.navyTint },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    paddingTop: 12,
    paddingHorizontal: 0,
  },
});
