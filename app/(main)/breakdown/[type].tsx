import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { breakdownStyles, DrillRow, TotalCard } from '@/components/Breakdown';
import { EntryRow } from '@/components/EntryRow';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useBreakdownByDate, useBreakdownByPerson } from '@/api/breakdown';
import { useRecentEntries } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money } from '@/lib/format';
import { signedUrls } from '@/lib/photos';
import { colors } from '@/theme';
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
const styles = breakdownStyles;
