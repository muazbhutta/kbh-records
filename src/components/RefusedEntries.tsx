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
 * Only the ones he has not read yet. The card goes when he says he has
 * seen it, and it goes when he sends a correction, because sending one
 * is dealing with it - the database takes the mark off at the same
 * moment it files the request.
 *
 * Two answers, then. He can put right whatever was wrong with it and
 * send it back, which is what he will want nine times in ten; or he can
 * say he has read it and leave it alone. Correcting it does not put it
 * back in the books by itself - the office refused it and the office
 * decides - it asks the office to look again, and the books move when
 * they say so.
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
        {row.asked
          ? 'A correction is already with the office. It comes back into the books when they accept it.'
          : 'This entry is out of the books. Put right what was wrong and send it back, and the office will look again.'}
      </Txt>

      {row.asked ? null : (
        <Button
          label="Fix This Entry"
          icon="create-outline"
          variant="navy"
          size="lg"
          full
          onPress={() => router.push(`/entry/edit?id=${row.id}&person=${row.person_id}`)}
        />
      )}

      <Button
        label="Got it"
        icon="checkmark"
        variant="ghost"
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
