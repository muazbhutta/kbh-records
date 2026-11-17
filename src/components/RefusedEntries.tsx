import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMarkRefusalSeen, useMyRefusals } from '@/api/refusals';
import { Card } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { formatDate, money } from '@/lib/format';
import { colors, radius } from '@/theme';
import type { RefusedEntry } from '@/types';

/**
 * What the office said about his entries.
 *
 * The books have always been able to refuse an entry and say why, and
 * the reason has never gone anywhere a man could read it. This is the
 * place it goes. It sits near the top of his own screen, because the
 * one thing worse than having work refused is finding out a fortnight
 * later.
 *
 * Only the ones he has not read yet. Once he says he has seen it the
 * card goes, and the entry stays where it was, refused and out of the
 * books, in his list of entries like any other.
 */
export function RefusedEntries() {
  const { data = [], isLoading } = useMyRefusals(20);
  const unread = data.filter((r) => !r.seen_at);

  if (isLoading) return null;
  if (unread.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="alert-circle" size={17} color={colors.red} />
        <Txt variant="subtitle" weight="bold" color={colors.red}>
          {unread.length === 1
            ? 'An entry of yours was not accepted'
            : `${unread.length} of your entries were not accepted`}
        </Txt>
      </View>
      {unread.map((r) => (
        <RefusedCard key={r.id} row={r} />
      ))}
    </View>
  );
}

function RefusedCard({ row }: { row: RefusedEntry }) {
  const router = useRouter();
  const seen = useMarkRefusalSeen();

  const what =
    [row.category_name, row.note].filter(Boolean).join(' · ') ||
    row.system_id ||
    'Entry';

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => router.push(`/entry/${row.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open the entry for ${money(Number(row.amount))}`}
        style={styles.top}
      >
        <View style={styles.flex}>
          <Txt variant="subtitle" weight="bold" numberOfLines={1}>
            {money(Number(row.amount))}
          </Txt>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {what}
            {row.bill_date ? ` · ${formatDate(row.bill_date)}` : ''}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      {/* The reason, which is the whole point of the card. */}
      <View style={styles.why}>
        <Txt variant="caption" weight="semibold" color={colors.red}>
          Why it was not accepted
        </Txt>
        <Txt variant="body" color={colors.text}>
          {row.reason}
        </Txt>
        <Txt variant="caption" color={colors.textFaint}>
          {row.refused_by ? `${row.refused_by}` : 'The office'}
          {row.refused_at ? ` · ${formatDate(row.refused_at.slice(0, 10))}` : ''}
        </Txt>
      </View>

      <Txt variant="caption" color={colors.textFaint}>
        This entry is out of the books. Record it again, correctly, if it still stands.
      </Txt>

      <Button
        label="Got it"
        icon="checkmark"
        variant="navy"
        full
        loading={seen.isPending}
        onPress={() => seen.mutate(row.id)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  card: {
    gap: 11,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.card,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  why: {
    gap: 3,
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: 11,
  },
});
