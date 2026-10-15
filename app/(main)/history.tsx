import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { HistoryRow } from '@/components/History';
import { PersonField } from '@/components/pickers';
import { periodRange, type Period } from '@/components/KhataList';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useAuditFeed } from '@/api/control';
import { usePeopleNames } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { colors, radius } from '@/theme';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

const WHAT: { key: string; label: string; table?: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'entries', label: 'Entries', table: 'entries' },
  { key: 'cash_checks', label: 'Cash Checks', table: 'cash_checks' },
  { key: 'app_users', label: 'People', table: 'app_users' },
  { key: 'expense_categories', label: 'Categories', table: 'expense_categories' },
];

/** Who changed what, and when. Admins only. */
export default function HistoryScreen() {
  const { canManage } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ person?: string }>();

  const { data: people = [] } = usePeopleNames();
  const [personId, setPersonId] = useState<string | null>(params.person ?? null);
  const [period, setPeriod] = useState<Period>('this_month');
  const [what, setWhat] = useState('all');

  const filter = useMemo(() => {
    const range = periodRange(period);
    const table = WHAT.find((w) => w.key === what)?.table;
    return {
      personId: personId ?? undefined,
      table,
      from: range.from,
      to: range.to,
    };
  }, [personId, period, what]);

  const query = useAuditFeed(filter, canManage);
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Change History" back />
        <Banner tone="error" message="Only an Admin can see the change history." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Change History"
        subtitle="Every create, edit and delete"
        back
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      />

      <Card>
        <PersonField
          label="Person"
          value={personId}
          people={[
            {
              id: '',
              full_name: 'Everybody',
              is_active: true,
              is_owner: false,
              is_head: false,
              head_id: null,
            },
            ...people,
          ]}
          onChange={(id) => setPersonId(id || null)}
          placeholder="Everybody"
          helper="Whose khata the change belongs to"
        />
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map((p) => (
          <Chip key={p.key} label={p.label} active={period === p.key} onPress={() => setPeriod(p.key)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {WHAT.map((w) => (
          <Chip key={w.key} label={w.label} active={what === w.key} onPress={() => setWhat(w.key)} subtle />
        ))}
      </ScrollView>

      {query.isLoading ? (
        <Loading label="Loading history" />
      ) : query.error ? (
        <Banner tone="error" message={(query.error as Error).message} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="Nothing changed in this period"
          message="Try a longer period, or clear the filters."
        />
      ) : (
        <Card padded={false} style={styles.list}>
          {items.map((item) => (
            <HistoryRow key={item.id} item={item} showPerson={!personId} />
          ))}
        </Card>
      )}

      {query.hasNextPage ? (
        <Pressable
          onPress={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          accessibilityRole="button"
          style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
        >
          {query.isFetchingNextPage ? (
            <ActivityIndicator color={colors.navy} />
          ) : (
            <>
              <Ionicons name="chevron-down" size={16} color={colors.navy} />
              <Txt variant="caption" weight="semibold" color={colors.navy}>
                Show more
              </Txt>
            </>
          )}
        </Pressable>
      ) : null}
    </Screen>
  );
}

function Chip({
  label,
  active,
  onPress,
  subtle,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  subtle?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active && (subtle ? styles.chipActiveSubtle : styles.chipActive),
        pressed && !active && styles.chipPressed,
      ]}
    >
      <Txt
        variant="caption"
        weight="semibold"
        color={active ? (subtle ? colors.navy : colors.white) : colors.textMuted}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipActiveSubtle: { backgroundColor: colors.navyTint, borderColor: colors.navySoft },
  chipPressed: { backgroundColor: colors.navyTint },
  list: { marginTop: 8, overflow: 'hidden' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  morePressed: { opacity: 0.6 },
});
