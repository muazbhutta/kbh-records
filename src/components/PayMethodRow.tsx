import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { colors, radius } from '@/theme';
import { PAY_METHOD_LABEL, PAY_METHOD_SHORT, type PayMethod } from '@/types';

/**
 * How the money changed hands. Two big buttons, because the question is
 * asked of a person standing on a site with one hand on the phone, and
 * because "where did this come from" is the first thing anyone asks of
 * the books afterwards.
 *
 * An expense never shows this: money going out of a hand is not money
 * moving between hands.
 */
export function PayMethodRow({
  value,
  onChange,
  label = 'HOW WAS IT GIVEN?',
}: {
  value: PayMethod;
  onChange: (v: PayMethod) => void;
  label?: string;
}) {
  const options: { key: PayMethod; icon: keyof typeof Ionicons.glyphMap; hint: string }[] = [
    { key: 'cash', icon: 'cash-outline', hint: 'Notes handed over' },
    { key: 'transfer', icon: 'card-outline', hint: 'Sent to a bank account' },
  ];

  return (
    <View style={styles.wrap}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onChange(opt.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${PAY_METHOD_LABEL[opt.key]}, ${opt.hint}`}
              style={({ pressed }) => [
                styles.choice,
                active && styles.choiceOn,
                pressed && !active && styles.pressed,
              ]}
            >
              <Ionicons
                name={opt.icon}
                size={22}
                color={active ? colors.white : colors.navy}
              />
              <Txt
                variant="subtitle"
                weight="semibold"
                color={active ? colors.white : colors.navy}
                numberOfLines={1}
              >
                {PAY_METHOD_LABEL[opt.key]}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The same fact as a small tag, for a row in a list or an entry page. */
export function PayMethodTag({
  method,
  short = false,
}: {
  method: PayMethod | null | undefined;
  short?: boolean;
}) {
  if (!method) return null;
  const cash = method === 'cash';
  return (
    <View style={[styles.tag, { backgroundColor: cash ? colors.greenSoft : colors.blueSoft }]}>
      <Ionicons
        name={cash ? 'cash-outline' : 'card-outline'}
        size={11}
        color={cash ? colors.green : colors.blue}
      />
      <Txt variant="label" color={cash ? colors.green : colors.blue}>
        {short ? PAY_METHOD_SHORT[method] : PAY_METHOD_LABEL[method]}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  choiceOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  pressed: { backgroundColor: colors.navyTint },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
