import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { EntryRow } from '@/components/EntryRow';
import { Header, Screen, useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useBreakdownByDate, useBreakdownByPerson } from '@/api/breakdown';
import { useRecentEntries } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money } from '@/lib/format';
import { signedUrls } from '@/lib/photos';
import { colors, radius } from '@/theme';
import { FIGURE_META, type FigureKind } from '@/types';

/**
 * One figure on the dashboard, opened up.
 *
 * A figure says how much. Tapping it asks who, tapping a name asks when,
 * and tapping a day asks what - which is where the entries themselves
 * are, and where the questions run out.
 *
 * All three steps live on this one screen, told apart by what is in the
 * address: no person means the list of people, a person means their
 * days, a person and a day means the entries of that day. Going back is
 * then the ordinary back, and a link to any step can be sent to somebody.
 */
export default function BreakdownScreen() {
  const router = useRouter();
  const { canManage } = useAuth();
  const params = useLocalSearchParams<{
    type: string;
    person?: string;
    name?: string;
    date?: string;
    from?: string;
    to?: string;
    period?: string;
  }>();

  const kind = params.type as FigureKind;
  const meta = FIGURE_META[kind];
  const range = useMemo(
    () => ({ from: params.from || undefined, to: params.to || undefined }),
    [params.from, params.to],
  );

  // Which of the three steps we are on.
  const step = params.date ? 'entries' : params.person ? 'days' : 'people';

  const go = (next: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const all: Record<string, string | undefined> = {
      from: params.from,
      to: params.to,
      period: params.period,
      person: params.person,
      name: params.name,
      date: params.date,
      ...next,
    };
    for (const key of Object.keys(all)) {
      const value = all[key];
      if (value) query.set(key, value);
    }
    router.push(`/breakdown/${kind}?${query.toString()}`);
  };

  if (!canManage) {
    return (
      <Screen>
        <Header title="Breakdown" back />
        <Banner tone="error" message="Only an Admin can open up a dashboard figure." />
      </Screen>
    );
  }

  if (!meta) {
    return (
      <Screen>
        <Header title="Breakdown" back />
        <Banner tone="error" message="That is not a figure this app keeps." />
      </Screen>
    );
  }

  const tone = TONE[kind];

  return (
    <Screen>
      <Header
        title={meta.label}
        subtitle={
          step === 'people'
            ? `${meta.question} · ${params.period ?? 'This month'}`
            : step === 'days'
              ? `${params.name ?? 'Person'} · day by day`
              : `${params.name ?? 'Person'} · ${formatDate(params.date)}`
        }
        back
      />

      {step === 'people' ? (
        <PeopleStep kind={kind} range={range} tone={tone} onPick={go} />
      ) : step === 'days' ? (
        <DaysStep kind={kind} personId={params.person!} range={range} tone={tone} onPick={go} />
      ) : (
        <EntriesStep kind={kind} personId={params.person!} date={params.date!} tone={tone} />
      )}
    </Screen>
  );
}

const TONE: Record<FigureKind, string> = {
  money_given: colors.green,
  expense: colors.red,
  returned: colors.amberDark,
};

// ------------------------------------------------------- step 1: people
function PeopleStep({
  kind,
  range,
  tone,
  onPick,
}: {
  kind: FigureKind;
  range: { from?: string; to?: string };
  tone: string;
  onPick: (next: Record<string, string | undefined>) => void;
}) {
  const { data, isLoading, error } = useBreakdownByPerson(kind, range);
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);

  if (isLoading) return <Loading />;
  if (error) return <Banner tone="error" message={error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="wallet-outline"
        title="Nothing in this period"
        message="Pick a wider period on the home screen and open the figure again."
      />
    );
  }

  return (
    <>
      <TotalCard
        tone={tone}
        total={total}
        caption={`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
      />
      <Card padded={false} style={styles.list}>
        {rows.map((row) => (
          <DrillRow
            key={row.person_id}
            leading={<Avatar name={row.full_name} size={40} />}
            title={row.full_name}
            badge={!row.is_active ? <Badge label="Off" tone="grey" style={styles.badgeMid} /> : null}
            caption={`${row.job_title ? `${row.job_title} · ` : ''}${row.entry_count} ${
              Number(row.entry_count) === 1 ? 'entry' : 'entries'
            }`}
            amount={Number(row.total)}
            fraction={total > 0 ? Number(row.total) / total : 0}
            tone={tone}
            onPress={() => onPick({ person: row.person_id, name: row.full_name, date: undefined })}
          />
        ))}
      </Card>
    </>
  );
}

// --------------------------------------------------------- step 2: days
function DaysStep({
  kind,
  personId,
  range,
  tone,
  onPick,
}: {
  kind: FigureKind;
  personId: string;
  range: { from?: string; to?: string };
  tone: string;
  onPick: (next: Record<string, string | undefined>) => void;
}) {
  const { data, isLoading, error } = useBreakdownByDate(kind, personId, range);
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);

  if (isLoading) return <Loading />;
  if (error) return <Banner tone="error" message={error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Nothing on any day"
        message="This person has nothing of this kind in the chosen period."
      />
    );
  }

  return (
    <>
      <TotalCard
        tone={tone}
        total={total}
        caption={`${rows.length} ${rows.length === 1 ? 'day' : 'days'}`}
      />
      <Card padded={false} style={styles.list}>
        {rows.map((row) => (
          <DrillRow
            key={row.bill_date}
            leading={
              <View style={[styles.dayIcon, { backgroundColor: `${tone}14` }]}>
                <Ionicons name="calendar-outline" size={18} color={tone} />
              </View>
            }
            title={formatDate(row.bill_date)}
            caption={`${row.entry_count} ${Number(row.entry_count) === 1 ? 'entry' : 'entries'}`}
            amount={Number(row.total)}
            fraction={total > 0 ? Number(row.total) / total : 0}
            tone={tone}
            onPress={() => onPick({ date: row.bill_date })}
          />
        ))}
      </Card>
    </>
  );
}

// ------------------------------------------------------ step 3: entries
function EntriesStep({
  kind,
  personId,
  date,
  tone,
}: {
  kind: FigureKind;
  personId: string;
  date: string;
  tone: string;
}) {
  const { data, isLoading, error } = useRecentEntries(
    { personId, lineTypes: [kind], from: date, to: date },
    100,
  );
  const entries = useMemo(() => data ?? [], [data]);
  const total = entries.reduce((sum, e) => sum + Number(e.amount), 0);

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

  if (isLoading) return <Loading />;
  if (error) return <Banner tone="error" message={error.message} />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="document-text-outline"
        title="Nothing on this day"
        message="The entries may have been deleted since."
      />
    );
  }

  return (
    <>
      <TotalCard
        tone={tone}
        total={total}
        caption={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
      />
      <Card padded={false} style={styles.list}>
        {entries.map((entry) => (
          <EntryRow
            key={`${entry.id}-${entry.person_id}`}
            entry={entry}
            thumbUrl={entry.thumb_path ? thumbs[entry.thumb_path] : null}
          />
        ))}
      </Card>
    </>
  );
}

// ------------------------------------------------------------- the bits
/**
 * One line of a breakdown: who or when, what it came to, and how big a
 * piece of the whole that is.
 *
 * On a wide screen the amount sits at the end of the line, where the eye
 * can run down a column of them. On a phone there is no room for both a
 * name and a column, so the amount drops to its own line and the bar
 * stretches out beside it - and a name like Muhammad Muaz stops being
 * cut in half.
 */
function DrillRow({
  leading,
  title,
  caption,
  badge,
  amount,
  fraction,
  tone,
  onPress,
}: {
  leading: React.ReactNode;
  title: string;
  caption: string;
  badge?: React.ReactNode;
  amount: number;
  fraction: number;
  tone: string;
  onPress: () => void;
}) {
  const wide = useIsWide();

  const heading = (
    <View style={styles.rowText}>
      <View style={styles.nameLine}>
        <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
          {title}
        </Txt>
        {badge}
      </View>
      <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
        {caption}
      </Txt>
    </View>
  );

  const value = (
    <Txt weight="bold" color={tone} numberOfLines={1}>
      {money(amount)}
    </Txt>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${money(amount)}`}
      style={({ pressed }) => [
        wide ? styles.row : styles.rowNarrow,
        pressed && styles.rowPressed,
      ]}
    >
      {wide ? (
        <>
          {leading}
          {heading}
          <View style={styles.rowRight}>
            {value}
            <ShareBar fraction={fraction} tone={tone} />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </>
      ) : (
        <>
          <View style={styles.narrowTop}>
            {leading}
            {heading}
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </View>
          <View style={styles.narrowFoot}>
            <View style={styles.narrowBar}>
              <ShareBar fraction={fraction} tone={tone} stretch />
            </View>
            {value}
          </View>
        </>
      )}
    </Pressable>
  );
}

/** The figure for whatever is on the screen, so the parts add up in sight. */
function TotalCard({ tone, total, caption }: { tone: string; total: number; caption: string }) {
  return (
    <View style={[styles.total, { backgroundColor: `${tone}12`, borderColor: `${tone}33` }]}>
      <Txt variant="label" color={colors.textMuted}>
        TOTAL
      </Txt>
      <Txt weight="bold" color={tone} style={styles.totalValue} numberOfLines={1}>
        {money(total)}
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        {caption}
      </Txt>
    </View>
  );
}

/** How big this row is against the whole, read at a glance. */
function ShareBar({
  fraction,
  tone,
  stretch = false,
}: {
  fraction: number;
  tone: string;
  /** Fill the room it is given, rather than keeping to a set width. */
  stretch?: boolean;
}) {
  const width = Math.max(2, Math.min(100, Math.round(fraction * 100)));
  return (
    <View style={[styles.barTrack, stretch && styles.barStretch]}>
      <View style={[styles.barFill, { width: `${width}%`, backgroundColor: tone }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  total: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 2,
    marginBottom: 14,
  },
  totalValue: { fontSize: 30, lineHeight: 38, letterSpacing: -0.8 },

  list: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowNarrow: {
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  narrowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  narrowFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  narrowBar: { flex: 1 },
  rowPressed: { backgroundColor: colors.navyTint },
  rowText: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeMid: { alignSelf: 'center' },
  rowRight: { alignItems: 'flex-end', gap: 5, minWidth: 96 },
  dayIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barStretch: { width: '100%' },
  barTrack: {
    width: 64,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2 },
});
