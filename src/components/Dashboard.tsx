import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, Loading, SectionTitle } from '@/components/Bits';
import { Section, SectionToggleAll, useSections } from '@/components/Collapsible';
import { ActionTile } from '@/components/Button';
import { CategoryDonut, MonthBars, RankedBars } from '@/components/charts';
import { EntryRow } from '@/components/EntryRow';
import { CashCard, Figure } from '@/components/Money';
import { DateField } from '@/components/pickers';
import { Txt } from '@/components/Txt';
import { useIsWide } from '@/components/Screen';
import {
  useDashboardSummary,
  useExpensesByCategory,
  useExpensesByMonth,
  usePeopleNeedingCheck,
  useTeams,
  useTopCashHolders,
} from '@/api/dashboard';
import { useRecentEntries } from '@/api/entries';
import { useOpenTicketCount } from '@/api/tickets';
import { Tickets } from '@/components/Tickets';
import { useProjectTotals, useUnfiledExpenses } from '@/api/projects';
import { periodRange, type Period } from '@/components/KhataList';
import { formatDate, money, todayInRiyadh } from '@/lib/format';
import { signedUrls } from '@/lib/photos';
import { colors, radius } from '@/theme';
import type { FeedEntry, FigureKind } from '@/types';

/** Every foldable block on the dashboard, in the order they appear. */
const SECTION_IDS = [
  'tickets',
  'checks',
  'months',
  'categories',
  'projects',
  'holders',
  'teams',
  'activity',
];

const PERIODS: { key: Period | 'custom'; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

/** Everything the owner needs to see at a glance, for a chosen period. */
export function Dashboard() {
  const router = useRouter();
  const wide = useIsWide();

  const sections = useSections('kbh-dashboard-sections');
  const allOpen = SECTION_IDS.every((id) => sections.isOpen(id));

  const [period, setPeriod] = useState<Period | 'custom'>('this_month');
  const [customFrom, setCustomFrom] = useState(todayInRiyadh());
  const [customTo, setCustomTo] = useState(todayInRiyadh());

  const range = useMemo(() => {
    if (period === 'custom') {
      const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
      return { from, to };
    }
    return periodRange(period);
  }, [period, customFrom, customTo]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? 'This month';

  const summary = useDashboardSummary(range);
  const months = useExpensesByMonth(12);
  const categories = useExpensesByCategory(range);
  const top = useTopCashHolders(5);
  const stale = usePeopleNeedingCheck(30);
  const teams = useTeams();
  const recent = useRecentEntries({}, 10);
  const waiting = useOpenTicketCount();
  const projects = useProjectTotals(range);
  const unfiled = useUnfiledExpenses(range);

  const s = summary.data;

  /**
   * Open one of the three figures up. The period goes with it, by name
   * as well as by date, so the screen that opens is counting exactly
   * what the card on this screen was counting.
   */
  const openFigure = (kind: FigureKind) => {
    const query = new URLSearchParams({ period: periodLabel });
    if (range.from) query.set('from', range.from);
    if (range.to) query.set('to', range.to);
    router.push(`/breakdown/${kind}?${query.toString()}`);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p.key }}
            style={({ pressed }) => [
              styles.chip,
              period === p.key && styles.chipOn,
              pressed && period !== p.key && styles.chipPressed,
            ]}
          >
            <Txt
              variant="caption"
              weight="semibold"
              color={period === p.key ? colors.white : colors.textMuted}
            >
              {p.label}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>

      {period === 'custom' ? (
        <Card style={styles.customCard}>
          <DateField label="From" value={customFrom} onChange={setCustomFrom} />
          <DateField label="To" value={customTo} onChange={setCustomTo} />
          <Txt variant="caption" color={colors.textFaint}>
            {formatDate(range.from)} to {formatDate(range.to)}
          </Txt>
        </Card>
      ) : null}

      {summary.error ? (
        <Banner tone="error" message={(summary.error as Error).message} />
      ) : null}

      {/* The one number that matters most. */}
      {summary.isLoading || !s ? (
        <Card style={styles.skeleton}>
          <Loading />
        </Card>
      ) : (
        <CashCard
          title="Cash with people"
          subtitle={`${s.holder_count} of ${s.people_count} holding`}
          balance={Number(s.cash_with_people)}
          given={Number(s.money_given)}
          spent={Number(s.expenses)}
          returned={Number(s.returned)}
          onPress={() => router.push('/cash-with-people')}
        />
      )}

      {s && Number(s.owed_back) > 0 ? (
        <View style={styles.owed}>
          <Ionicons name="alert-circle" size={15} color={colors.red} />
          <Txt variant="caption" color={colors.red}>
            The company owes {money(Number(s.owed_back))} back to staff
          </Txt>
        </View>
      ) : null}

      {s ? (
        <View style={styles.figures}>
          <Figure
            label="Money Given"
            value={Number(s.money_given)}
            tone={colors.green}
            icon="cash-outline"
            onPress={() => openFigure('money_given')}
          />
          <Figure
            label="Expenses"
            value={Number(s.expenses)}
            tone={colors.red}
            icon="receipt-outline"
            onPress={() => openFigure('expense')}
          />
          <Figure
            label="Returned"
            value={Number(s.returned)}
            tone={colors.amberDark}
            icon="arrow-undo-outline"
            onPress={() => openFigure('returned')}
          />
        </View>
      ) : null}

      <View style={styles.allRow}>
        <SectionToggleAll
          allOpen={allOpen}
          onPress={() => sections.setAll(SECTION_IDS, !allOpen)}
        />
      </View>

      <SectionTitle title="Record cash" />
      <View style={styles.grid}>
        <ActionTile
          label="Money Given"
          icon="cash"
          tint={colors.green}
          onPress={() => router.push('/entry/new?type=money_given')}
        />
        <ActionTile
          label="Expense"
          icon="receipt"
          tint={colors.red}
          onPress={() => router.push('/entry/new?type=expense')}
        />
      </View>
      <View style={[styles.grid, styles.gridGap]}>
        <ActionTile
          label="Transfer"
          icon="swap-horizontal"
          tint={colors.blue}
          onPress={() => router.push('/entry/new?type=transfer')}
        />
        <ActionTile
          label="Returned"
          icon="arrow-undo"
          tint={colors.amberDark}
          onPress={() => router.push('/entry/new?type=returned')}
        />
      </View>

      {/* ------------------------------------------------- the tickets */}
      <Section
        title="Waiting for you"
        open={sections.isOpen('tickets')}
        onToggle={() => sections.toggle('tickets')}
        hint={
          (waiting.data ?? 0) === 0
            ? 'Nothing waiting'
            : `${waiting.data} ${waiting.data === 1 ? 'entry' : 'entries'}`
        }
      >
        <Tickets />
      </Section>

      {/* ------------------------------------------------- cash check */}
      <Section
        title="Cash checks"
        open={sections.isOpen('checks')}
        onToggle={() => sections.toggle('checks')}
        hint={
          Number(s?.short_people ?? 0) > 0
            ? `${s?.short_people} short · ${money(Number(s?.short_total ?? 0))}`
            : 'Nobody short'
        }
        action={
          <Pressable onPress={() => router.push('/people')} accessibilityRole="button">
            <Txt variant="caption" weight="semibold" color={colors.blue}>
              People
            </Txt>
          </Pressable>
        }
      >
      <Card style={styles.checkCard}>
        <View style={styles.checkRow}>
          <CheckStat
            label="Short in period"
            value={money(Number(s?.short_total ?? 0))}
            tone={Number(s?.short_total ?? 0) > 0 ? colors.red : colors.text}
          />
          <CheckStat
            label="People short"
            value={String(s?.short_people ?? 0)}
            tone={Number(s?.short_people ?? 0) > 0 ? colors.red : colors.text}
          />
          <CheckStat label="Counts done" value={String(s?.check_count ?? 0)} />
        </View>

        {stale.data && stale.data.length > 0 ? (
          <>
            <Txt variant="caption" weight="semibold" color={colors.amberDark}>
              Not counted for over 30 days ({stale.data.length})
            </Txt>
            <View style={styles.staleList}>
              {stale.data.slice(0, 5).map((p) => (
                <Pressable
                  key={p.person_id}
                  onPress={() => router.push(`/people/${p.person_id}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.staleRow, pressed && styles.pressed]}
                >
                  <Avatar name={p.full_name} size={30} />
                  <View style={styles.staleText}>
                    <Txt variant="caption" weight="semibold" numberOfLines={1}>
                      {p.full_name}
                    </Txt>
                    <Txt variant="caption" color={colors.textFaint}>
                      {p.last_checked_at
                        ? `Last counted ${formatDate(p.last_checked_at)}`
                        : 'Never counted'}
                    </Txt>
                  </View>
                  <Txt variant="caption" weight="bold" color={colors.navy}>
                    {money(Number(p.balance))}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Txt variant="caption" color={colors.green}>
            Everybody has been counted in the last 30 days.
          </Txt>
        )}
      </Card>
      </Section>

      {/* ----------------------------------------------------- charts */}
      <View style={wide ? styles.twoUp : undefined}>
        <View style={wide ? styles.half : undefined}>
          <Section
            title="Expenses per month"
            open={sections.isOpen('months')}
            onToggle={() => sections.toggle('months')}
            hint="Last 12 months"
          >
            <Card>
              {months.isLoading ? <Loading /> : <MonthBars data={months.data ?? []} />}
            </Card>
          </Section>
        </View>

        <View style={wide ? styles.half : undefined}>
          <Section
            title="Expenses by category"
            open={sections.isOpen('categories')}
            onToggle={() => sections.toggle('categories')}
            hint={money(Number(s?.expenses ?? 0))}
          >
          <Card>
            {categories.isLoading ? (
              <Loading />
            ) : (
              <CategoryDonut
                data={(categories.data ?? []).map((c) => ({
                  id: c.category_id,
                  name: c.name,
                  total: Number(c.total),
                }))}
              />
            )}
          </Card>
          </Section>
        </View>
      </View>

      {/* --------------------------------------------------- projects */}
      <Section
        title="Spent on each project"
        open={sections.isOpen('projects')}
        onToggle={() => sections.toggle('projects')}
        hint={
          projects.data && projects.data.length > 0
            ? `${projects.data.length} ${projects.data.length === 1 ? 'project' : 'projects'}`
            : 'None yet'
        }
        action={
          <Pressable onPress={() => router.push('/projects')} accessibilityRole="button">
            <Txt variant="caption" weight="semibold" color={colors.blue}>
              All projects
            </Txt>
          </Pressable>
        }
      >
      <Card>
        {projects.isLoading ? (
          <Loading />
        ) : (projects.data ?? []).length === 0 ? (
          <Txt variant="caption" color={colors.textMuted} center>
            No project has been started yet. One can be written down while recording an expense.
          </Txt>
        ) : (
          <>
            <RankedBars
              data={(projects.data ?? []).slice(0, 6).map((p) => ({
                id: p.project_id,
                label: p.name,
                sub:
                  Number(p.entry_count) === 0
                    ? 'Nothing spent yet'
                    : `${p.entry_count} ${Number(p.entry_count) === 1 ? 'expense' : 'expenses'}`,
                value: Number(p.spent),
              }))}
              onPress={(id) =>
                router.push(
                  `/projects?project=${id}&name=${encodeURIComponent(
                    (projects.data ?? []).find((p) => p.project_id === id)?.name ?? '',
                  )}`,
                )
              }
            />
            {unfiled.data && unfiled.data.spent > 0 ? (
              <Pressable
                onPress={() => router.push('/projects?unfiled=1')}
                accessibilityRole="button"
                style={styles.unfiled}
              >
                <Ionicons name="help-circle-outline" size={15} color={colors.textMuted} />
                <Txt variant="caption" color={colors.textMuted}>
                  {money(unfiled.data.spent)} not filed against any project yet
                </Txt>
                <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </>
        )}
      </Card>
      </Section>

      <Section
        title="Who is holding the most cash"
        open={sections.isOpen('holders')}
        onToggle={() => sections.toggle('holders')}
        hint={`${s?.holder_count ?? 0} holding · ${money(Number(s?.cash_with_people ?? 0))}`}
      >
      <Card>
        {top.isLoading ? (
          <Loading />
        ) : (
          <RankedBars
            data={(top.data ?? []).map((p) => ({
              id: p.person_id,
              label: p.full_name,
              sub: p.head_name ? `Under ${p.head_name}` : null,
              value: Number(p.balance),
            }))}
            onPress={(id) => router.push(`/people/${id}`)}
          />
        )}
      </Card>
      </Section>

      {/* ------------------------------------------------------ teams */}
      {teams.data && teams.data.length > 0 ? (
        <>
          <Section
            title="Teams"
            open={sections.isOpen('teams')}
            onToggle={() => sections.toggle('teams')}
            hint={`${teams.data.length} ${teams.data.length === 1 ? 'head' : 'heads'}`}
          >
          <Card padded={false}>
            {teams.data.map((t, i) => (
              <Pressable
                key={t.head_id}
                onPress={() => router.push(`/people/${t.head_id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${t.head_name}, ${t.people_count} people`}
                style={({ pressed }) => [
                  styles.teamRow,
                  i < (teams.data?.length ?? 0) - 1 && styles.teamBorder,
                  pressed && styles.pressed,
                ]}
              >
                <Avatar name={t.head_name} size={38} tone={colors.blue} />
                <View style={styles.teamText}>
                  <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                    {t.head_name}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    {t.people_count} {t.people_count === 1 ? 'person' : 'people'} under them
                  </Txt>
                </View>
                <View style={styles.teamCash}>
                  <Txt variant="subtitle" weight="bold" color={colors.navy}>
                    {money(Number(t.team_cash) + Number(t.head_cash))}
                  </Txt>
                  <Txt variant="caption" color={colors.textFaint}>
                    team cash
                  </Txt>
                </View>
              </Pressable>
            ))}
          </Card>
          </Section>
        </>
      ) : null}

      <RecentActivity
        entries={recent.data ?? []}
        loading={recent.isLoading}
        open={sections.isOpen('activity')}
        onToggle={() => sections.toggle('activity')}
      />
    </>
  );
}

function CheckStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.checkStat}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="heading" color={tone ?? colors.text} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
    </View>
  );
}

function RecentActivity({
  entries,
  loading,
  open,
  onToggle,
}: {
  entries: FeedEntry[];
  loading: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  React.useEffect(() => {
    const paths = entries.map((e) => e.thumb_path).filter(Boolean) as string[];
    if (paths.length === 0) return;
    let alive = true;
    signedUrls(paths).then((map) => alive && setThumbs((old) => ({ ...old, ...map })));
    return () => {
      alive = false;
    };
  }, [entries]);

  const flagged = entries.filter((e) => e.duplicate_photo).length;

  return (
    <>
      <Section
        title="Recent activity"
        open={open}
        onToggle={onToggle}
        hint={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        action={
          <Pressable onPress={() => router.push('/history')} accessibilityRole="button">
            <Txt variant="caption" weight="semibold" color={colors.blue}>
              Change history
            </Txt>
          </Pressable>
        }
      >
      {flagged > 0 ? (
        <View style={styles.flagRow}>
          <Badge
            label={`${flagged} with a duplicate bill photo`}
            tone="amber"
            icon="copy-outline"
          />
        </View>
      ) : null}
      {loading ? (
        <Loading />
      ) : entries.length === 0 ? (
        <Card>
          <Txt variant="caption" color={colors.textMuted} center>
            Nothing has been recorded yet.
          </Txt>
        </Card>
      ) : (
        <Card padded={false} style={styles.feed}>
          {entries.map((entry) => (
            <EntryRow
              key={`${entry.id}-${entry.person_id}`}
              entry={entry}
              thumbUrl={entry.thumb_path ? thumbs[entry.thumb_path] : null}
              showOwner
            />
          ))}
        </Card>
      )}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  allRow: { alignItems: 'flex-end', marginTop: 4 },
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
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipPressed: { backgroundColor: colors.navyTint },
  customCard: { gap: 14, marginBottom: 12 },
  skeleton: { minHeight: 150, justifyContent: 'center' },
  owed: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  grid: { flexDirection: 'row', gap: 10 },
  gridGap: { marginTop: 10, marginBottom: 2 },
  checkCard: { gap: 12 },
  checkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  checkStat: {
    flexGrow: 1,
    flexBasis: 108,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 10,
    gap: 2,
  },
  staleList: { gap: 2 },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  staleText: { flex: 1, gap: 1, minWidth: 0 },
  pressed: { backgroundColor: colors.navyTint },
  twoUp: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  half: { flex: 1 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  teamBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  teamText: { flex: 1, gap: 1, minWidth: 0 },
  teamCash: { alignItems: 'flex-end', gap: 1 },
  unfiled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  flagRow: { marginBottom: 8 },
  feed: { overflow: 'hidden' },
});
