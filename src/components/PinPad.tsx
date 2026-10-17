import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { colors, fonts, radius, shadow } from '@/theme';

const KEYS: (string | 'back' | '')[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

/**
 * Four big dots plus a big number pad. No system keyboard, so it looks
 * and behaves the same on Android, iPhone and the web, and the keys are
 * large enough to hit with work gloves on.
 */
export function PinPad({
  value,
  onChange,
  onComplete,
  disabled = false,
  shake = 0,
  tone = 'navy',
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  /** bump this number to make the dots shake, e.g. after a wrong PIN */
  shake?: number;
  tone?: 'navy' | 'white';
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    Animated.sequence([
      Animated.timing(offset, { toValue: 1, duration: 60, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(offset, { toValue: -1, duration: 60, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(offset, { toValue: 1, duration: 60, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(offset, { toValue: 0, duration: 60, useNativeDriver: true, easing: Easing.linear }),
    ]).start();
  }, [shake, offset]);

  const press = (key: string) => {
    if (disabled) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    if (key === 'back') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= 4) return;
    const next = value + key;
    onChange(next);
    if (next.length === 4) onComplete?.(next);
  };

  const dotEmpty = tone === 'white' ? 'rgba(255,255,255,0.28)' : colors.line;
  const dotFull = tone === 'white' ? colors.white : colors.navy;

  const translateX = offset.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dots, { transform: [{ translateX }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < value.length ? dotFull : 'transparent',
                borderColor: i < value.length ? dotFull : dotEmpty,
              },
            ]}
          />
        ))}
      </Animated.View>

      <View style={styles.pad}>
        {KEYS.map((key, i) => {
          if (key === '') return <View key={`gap-${i}`} style={styles.key} />;
          return (
            <Pressable
              key={key}
              onPress={() => press(key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={key === 'back' ? 'Delete' : key}
              style={({ pressed }) => [
                styles.key,
                key !== 'back' && styles.keyFilled,
                key !== 'back' && shadow.card,
                pressed && !disabled && styles.keyPressed,
                disabled && styles.keyDisabled,
              ]}
            >
              {key === 'back' ? (
                <Ionicons name="backspace-outline" size={26} color={colors.navy} />
              ) : (
                <Txt style={styles.keyText}>{key}</Txt>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 26 },
  dots: { flexDirection: 'row', gap: 18 },
  dot: { width: 17, height: 17, borderRadius: 9, borderWidth: 2 },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 300,
    gap: 12,
  },
  key: {
    width: 84,
    height: 62,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyFilled: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  keyPressed: { backgroundColor: colors.navyTint, transform: [{ scale: 0.96 }] },
  keyDisabled: { opacity: 0.5 },
  keyText: { fontSize: 25, lineHeight: 32, fontFamily: fonts.semibold, color: colors.navy },
});
