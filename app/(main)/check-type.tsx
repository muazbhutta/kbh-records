import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { BillImage } from '@/components/BillPhotos';
import { Button } from '@/components/Button';
import { TypeFlags, TypeTag } from '@/components/ExpenseType';
import { Money } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useClearTypeFlags, useExpensesToCheck, useSetExpenseType } from '@/api/expenseType';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import type { ExpenseKind, ToCheckRow } from '@/types';

/**
 * Everything the app could not decide on its own: old entries that came
 * before bill types existed, bills it could not read, and entries where
 * the person's choice and the bill disagree.
 */
export default function CheckTypeScreen() {
  const { canManage } = useAuth();
  const { data: rows = [], isLoading, error } = useExpensesToCheck(canManage);
  const [notice, setNotice] = useState<string | null>(null);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Check type" back />
        <Banner tone="error" message="Only an Admin can see this list." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Check type"
        subtitle={isLoading ? 'Loading...' : `${rows.length} to look at`}
        back
      />

      {notice ? <Banner tone="success" message={notice} /> : null}

      <Banner
        tone="info"
        message="These expenses were saved as Petty because nothing could be read off the bill. Open one to see the photo, then set the right type or tick it off."
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <Banner tone="error" message={(error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing to check"
          message="Every expense has a type the app is happy with."
        />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <CheckRow key={row.id} row={row} onDone={setNotice} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function CheckRow({ row, onDone }: { row: ToCheckRow; onDone: (m: string) => void }) {
  const router = useRouter();
  const setType = useSetExpenseType();
  const clearFlags = useClearTypeFlags();
  const [error, setError] = useState<string | null>(null);

  const change = async (type: ExpenseKind) => {
    setError(null);
    try {
      await setType.mutateAsync({ id: row.id, type });
      onDone(`${row.system_id ?? 'Expense'} saved as ${type === 'petty' ? 'Petty' : 'Invoice'}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => router.push(`/entry/${row.id}?person=${row.person_id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${row.system_id ?? 'expense'}`}
        style={({ pressed }) => [styles.top, pressed && styles.pressed]}
      >
        {row.thumb_path ? (
          <BillImage path={row.thumb_path} style={styles.thumb} />
        ) : (
          <View style={styles.noPhoto}>
            <Ionicons name="image-outline" size={20} color={colors.textFaint} />
          </View>
        )}

        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Txt variant="subtitle" weight="semibold" numberOfLines={1} style={styles.title}>
              {row.category_name ?? 'Expense'}
            </Txt>
            <Money amount={Number(row.amount)} tone="out" size="md" />
          </View>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {formatDate(row.bill_date)} · {row.person_name ?? 'someone'}
            {row.note ? ` · ${row.note}` : ''}
          </Txt>
          <View style={styles.tags}>
            {row.system_id ? <Badge label={row.system_id} tone="grey" /> : null}
            <TypeTag
              type={row.expense_type}
              scanState={row.bill_scan_state}
              enteredAt={row.entered_at}
              small
            />
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <TypeFlags flags={row.type_flags} />

      {error ? <Banner tone="error" message={error} /> : null}

      <View style={styles.actions}>
        <Button
          label="Petty"
          icon="cash-outline"
          size="sm"
          variant={row.expense_type === 'petty' ? 'navy' : 'outline'}
          loading={setType.isPending}
          onPress={() => change('petty')}
          style={styles.action}
        />
        <Button
          label="Invoice"
          icon="document-text-outline"
          size="sm"
          variant={row.expense_type === 'invoice' ? 'navy' : 'outline'}
          loading={setType.isPending}
          onPress={() => change('invoice')}
          style={styles.action}
        />
        <Button
          label="Looks right"
          icon="checkmark"
          size="sm"
          variant="ghost"
          loading={clearFlags.isPending}
          onPress={async () => {
            setError(null);
            try {
              await clearFlags.mutateAsync(row.id);
              onDone(`${row.system_id ?? 'Expense'} marked as checked.`);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
          style={styles.action}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 4 },
  card: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: radius.sm },
  pressed: { backgroundColor: colors.navyTint },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  noPhoto: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: '#EDF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 3, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
