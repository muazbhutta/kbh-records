import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { useCategories } from '@/api/entries';
import { colors, radius } from '@/theme';
import type { ExpenseKind } from '@/types';

/** Null means every category / every kind of bill. */
export type CategoryChoice = string | null;
export type KindChoice = ExpenseKind | null;

const KINDS: { key: KindChoice; label: string }[] = [
  { key: null, label: 'All bills' },
  { key: 'petty', label: 'Petty' },
  { key: 'invoice', label: 'Invoice' },
];

/**
 * "Fuel, and only the Invoice ones."
 *
 * Two rows that slide sideways: what the money was spent on, and which
 * kind of bill came back with it. Both only ever narrow an expense, so
 * the row says so plainly when the list is showing other things too.
 */
export function CategoryFilter({
  categoryId,
  onCategory,
  kind,
  onKind,
  note,
}: {
  categoryId: CategoryChoice;
  onCategory: (id: CategoryChoice) => void;
  kind: KindChoice;
  onKind: (k: KindChoice) => void;
  /** A line under the rows, when the caller has something to explain. */
  note?: string | null;
}) {
  const { data: categories = [] } = useCategories();

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <FilterChip
          label="All categories"
          active={categoryId === null}
          onPress={() => onCategory(null)}
        />
        {categories.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            icon={c.icon as keyof typeof Ionicons.glyphMap}
            active={categoryId === c.id}
            onPress={() => onCategory(categoryId === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {KINDS.map((k) => (
          <FilterChip
            key={k.label}
            label={k.label}
            active={kind === k.key}
            onPress={() => onKind(k.key)}
            subtle
          />
        ))}
      </ScrollView>

      {note ? (
        <Txt variant="caption" color={colors.textFaint} style={styles.note}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onPress,
  subtle,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  subtle?: boolean;
}) {
  const on = active;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        styles.chip,
        subtle ? styles.chipSubtle : null,
        on && (subtle ? styles.chipSubtleOn : styles.chipOn),
        pressed && !on && styles.chipPressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={on ? (subtle ? colors.navy : colors.white) : colors.textMuted}
        />
      ) : null}
      <Txt
        variant="caption"
        weight="semibold"
        color={on ? (subtle ? colors.navy : colors.white) : colors.textMuted}
        numberOfLines={1}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipSubtle: { backgroundColor: colors.bg },
  chipSubtleOn: { backgroundColor: colors.navyTint, borderColor: colors.navy, borderWidth: 1.5 },
  // Same reason as the khata chips: a press must not read as a choice.
  chipPressed: { backgroundColor: colors.bg, borderColor: colors.lineStrong },
  note: { paddingHorizontal: 2 },
});
