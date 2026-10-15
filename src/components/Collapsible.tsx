import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { colors, radius } from '@/theme';

/**
 * Remembers which sections a person keeps open. The choice is saved on
 * the device, so the owner's dashboard comes back the way they left it.
 */
export function useSections(storageKey: string, defaults: Record<string, boolean> = {}) {
  const [open, setOpen] = useState<Record<string, boolean>>(defaults);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Record<string, boolean>;
        setOpen((current) => ({ ...current, ...saved }));
      })
      .catch(() => {
        /* a remembered layout is a nicety, never a requirement */
      })
      .finally(() => {
        loaded.current = true;
      });
  }, [storageKey]);

  const isOpen = useCallback(
    (id: string) => open[id] ?? defaults[id] ?? true,
    [open, defaults],
  );

  const toggle = useCallback(
    (id: string) => {
      setOpen((current) => {
        const next = { ...current, [id]: !(current[id] ?? defaults[id] ?? true) };
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [storageKey, defaults],
  );

  const setAll = useCallback(
    (ids: string[], value: boolean) => {
      setOpen((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = value;
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [storageKey],
  );

  return { isOpen, toggle, setAll };
}

/**
 * A dashboard section with a heading you can tap to fold it away. The
 * arrow turns, and when a section is closed its heading still carries a
 * one-line summary so nothing is hidden completely.
 */
export function Section({
  title,
  open,
  onToggle,
  hint,
  action,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Shown on the heading while the section is folded away. */
  hint?: string | null;
  /** A link on the right. Tapping it does not fold the section. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // The browser has no native animation module, so it drives these in JS.
  const nativeDriver = Platform.OS !== 'web';
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;
  const fade = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: nativeDriver,
    }).start();
    Animated.timing(fade, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: nativeDriver,
    }).start();
  }, [open, spin, fade, nativeDriver]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}, ${open ? 'open' : 'closed'}`}
          hitSlop={6}
          style={({ pressed }) => [styles.head, pressed && styles.pressed]}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Animated.View>
          <Txt variant="label" color={colors.textFaint} style={styles.title}>
            {title.toUpperCase()}
          </Txt>
          {!open && hint ? (
            <Txt variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.hint}>
              {hint}
            </Txt>
          ) : null}
        </Pressable>
        {action}
      </View>

      {open ? <Animated.View style={{ opacity: fade }}>{children}</Animated.View> : null}
    </View>
  );
}

/** "Show all" / "Hide all" for a whole screen of sections. */
export function SectionToggleAll({
  allOpen,
  onPress,
}: {
  allOpen: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.allBtn, pressed && styles.pressed]}
    >
      <Ionicons
        name={allOpen ? 'contract-outline' : 'expand-outline'}
        size={14}
        color={colors.blue}
      />
      <Txt variant="caption" weight="semibold" color={colors.blue}>
        {allOpen ? 'Hide all' : 'Show all'}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
    marginTop: 8,
  },
  head: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingRight: 6,
    borderRadius: radius.sm,
    minWidth: 0,
  },
  pressed: { backgroundColor: colors.navyTint },
  title: { flexShrink: 0 },
  hint: { flex: 1, textAlign: 'right' },
  allBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
});
