import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Banner, EmptyState, Loading } from '@/components/Bits';
import {
  CategoryFilter,
  type CategoryChoice,
  type KindChoice,
} from '@/components/CategoryFilter';
import { EntryRow } from '@/components/EntryRow';
import { Txt } from '@/components/Txt';
import { useEntryFeed, type FeedFilter } from '@/api/entries';
import { signedUrls } from '@/lib/photos';
import { todayInRiyadh } from '@/lib/format';
import { colors, radius } from '@/theme';

export type Period = 'this_month' | 'last_month' | 'this_year' | 'all';

const TYPE_FILTERS: { key: string; label: string; lines: string[] }[] = [
  { key: 'all', label: 'Everything', lines: [] },
  { key: 'in', label: 'Money in', lines: ['money_given', 'transfer_in'] },
  { key: 'expense', label: 'Expenses', lines: ['expense'] },
  { key: 'out', label: 'Sent', lines: ['transfer_out'] },
  { key: 'returned', label: 'Returned', lines: ['returned'] },
];

/** First and last day of a period, as YYYY-MM-DD in Riyadh. */
export function periodRange(period: Period): { from?: string; to?: string } {
  const today = todayInRiyadh();
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();

  if (period === 'this_month') {
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  }
  if (period === 'last_month') {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(lastDay(ly, lm))}` };
  }
  if (period === 'this_year') {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return {};
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

/**
 * The khata: every entry that touches one person, newest first, with
 * filters for the period and the kind of entry.
 */
export function KhataList({
  personId,
  emptyTitle = 'No entries yet',
  emptyMessage,
  showOwner = false,
  showFilters = true,
}: {
  personId: string | undefined;
  emptyTitle?: string;
  emptyMessage?: string;
  showOwner?: boolean;
  showFilters?: boolean;
}) {
  const [period, setPeriod] = useState<Period>('this_month');
  const [typeKey, setTypeKey] = useState('all');
  const [categoryId, setCategoryId] = useState<CategoryChoice>(null);
  const [kind, setKind] = useState<KindChoice>(null);

  // Only an expense has a category or a bill type, so narrowing by either
  // means the list is showing expenses whether the person said so or not.
  const narrowed = categoryId !== null || kind !== null;

  const filter: FeedFilter = useMemo(() => {
    const range = periodRange(period);
    const lines = narrowed
      ? ['expense']
      : (TYPE_FILTERS.find((t) => t.key === typeKey)?.lines ?? []);
    return {
      personId,
      ...range,
      lineTypes: lines.length ? lines : undefined,
      categoryId: categoryId ?? undefined,
      expenseType: kind ?? undefined,
    };
  }, [personId, period, typeKey, categoryId, kind, narrowed]);

  const query = useEntryFeed(filter, !!personId);
  const entries = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  // Bill thumbnails live in a private bucket, so they need signed links.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = entries.map((e) => e.thumb_path).filter(Boolean) as string[];
    if (paths.length === 0) return;
    let alive = true;
    signedUrls(paths).then((map) => alive && setThumbs((old) => ({ ...old, ...map })));
    return () => {
      alive = false;
    };
  }, [entries]);

  return (
    <View style={styles.wrap}>
      {showFilters ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {PERIODS.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                active={period === p.key}
                onPress={() => setPeriod(p.key)}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {TYPE_FILTERS.map((t) => (
              <Chip
                key={t.key}
                label={t.label}
                active={narrowed ? t.key === 'expense' : typeKey === t.key}
                onPress={() => {
                  setTypeKey(t.key);
                  if (t.key !== 'expense' && t.key !== 'all') {
                    setCategoryId(null);
                    setKind(null);
                  }
                }}
                subtle
              />
            ))}
          </ScrollView>

          <CategoryFilter
            categoryId={categoryId}
            onCategory={setCategoryId}
            kind={kind}
            onKind={setKind}
            note={
              narrowed ? 'Only expenses have a category, so only expenses are shown.' : null
            }
          />
        </>
      ) : null}

      {query.isLoading ? (
        <Loading label="Loading entries" />
      ) : query.error ? (
        <Banner tone="error" message={(query.error as Error).message} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={emptyTitle}
          message={
            emptyMessage ??
            (period === 'all'
              ? 'Nothing has been recorded yet.'
              : 'Nothing in this period. Try "All time".')
          }
        />
      ) : (
        <View style={styles.list}>
          {entries.map((entry) => (
            <EntryRow
              key={`${entry.id}-${entry.person_id}`}
              entry={entry}
              thumbUrl={entry.thumb_path ? thumbs[entry.thumb_path] : null}
              showOwner={showOwner}
            />
          ))}
        </View>
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
    </View>
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
  wrap: { gap: 10 },
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
  // A finger resting on a chip must not look like a chip that is chosen.
  // The chosen one is navy-tinted with a navy edge; a press is only a
  // faint wash.
  chipPressed: { backgroundColor: colors.bg },
  list: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  morePressed: { opacity: 0.6 },
});
