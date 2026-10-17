import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/Bits';
import { TypeTag } from '@/components/ExpenseType';
import { PayMethodTag } from '@/components/PayMethodRow';
import { Money } from '@/components/Money';
import { Txt } from '@/components/Txt';
import { firstName, formatDate } from '@/lib/format';
import { colors, radius } from '@/theme';
import { LINE_META, type FeedEntry } from '@/types';

/** What the line says on the left, from this person's side of the khata. */
export function lineTitle(entry: FeedEntry): string {
  switch (entry.line_type) {
    case 'money_given':
      return 'Money Given';
    case 'transfer_in':
      return `Received from ${entry.other_person_name ?? 'someone'}`;
    case 'transfer_out':
      return `Sent to ${entry.other_person_name ?? 'someone'}`;
    case 'expense':
      return entry.category_name ?? 'Expense';
    case 'returned':
      return 'Returned to company';
  }
}

export function lineIcon(entry: FeedEntry): keyof typeof Ionicons.glyphMap {
  if (entry.line_type === 'expense') {
    return (entry.category_icon as keyof typeof Ionicons.glyphMap) ?? 'receipt-outline';
  }
  return LINE_META[entry.line_type].icon as keyof typeof Ionicons.glyphMap;
}

export function EntryRow({
  entry,
  thumbUrl,
  onPress,
  showOwner = false,
}: {
  entry: FeedEntry;
  thumbUrl?: string | null;
  onPress?: () => void;
  /** On an all-people list, say whose khata the line belongs to. */
  showOwner?: boolean;
}) {
  const router = useRouter();
  const meta = LINE_META[entry.line_type];
  const tone = meta.positive ? colors.green : colors.red;

  const open = onPress ?? (() => router.push(`/entry/${entry.id}?person=${entry.person_id}`));

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${lineTitle(entry)} ${entry.amount}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {thumbUrl ? (
        <Image source={{ uri: thumbUrl }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.icon, { backgroundColor: `${tone}14` }]}>
          <Ionicons name={lineIcon(entry)} size={20} color={tone} />
        </View>
      )}

      <View style={styles.main}>
        <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
          {lineTitle(entry)}
        </Txt>

        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {formatDate(entry.bill_date)}
          {showOwner && entry.owner_name ? ` · ${entry.owner_name}` : ''}
          {entry.note ? ` · ${entry.note}` : ''}
        </Txt>

        {entry.entered_for_someone_else ||
        entry.photo_count > 0 ||
        entry.expense_type ||
        entry.pay_method ? (
          <View style={styles.flags}>
            {entry.type === 'expense' ? (
              <TypeTag
                type={entry.expense_type}
                scanState={entry.bill_scan_state}
                enteredAt={entry.entered_at}
                small
              />
            ) : (
              <PayMethodTag method={entry.pay_method} short />
            )}
            {entry.entered_for_someone_else ? (
              <Badge
                label={`Entered by ${firstName(entry.entered_by_name) || 'someone else'}`}
                tone="blue"
                icon="person-outline"
              />
            ) : null}
            {entry.photo_count > 0 ? (
              <Badge
                label={entry.photo_count === 1 ? '1 bill' : `${entry.photo_count} bills`}
                tone="grey"
                icon="image-outline"
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.end}>
        <Money
          amount={entry.amount}
          tone={meta.positive ? 'in' : 'out'}
          size="md"
          showSign
        />
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pressed: { backgroundColor: colors.navyTint },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.navyTint },
  main: { flex: 1, gap: 2, minWidth: 0 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 3, maxWidth: '100%' },
  end: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
});
