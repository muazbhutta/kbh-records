import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { breakdownStyles, DrillRow, ShareBar, TotalCard } from '@/components/Breakdown';
import { EntryRow } from '@/components/EntryRow';
import { NewProjectBox } from '@/components/ProjectField';
import { ProjectSheets } from '@/components/ProjectSheets';
import { Header, Screen, useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useRecentEntries } from '@/api/entries';
import { useProjectByPerson, useProjectTotals, useUnfiledExpenses } from '@/api/projects';
import { useAuth } from '@/auth/AuthProvider';
import { periodRange, type Period } from '@/components/KhataList';
import { formatDate, money } from '@/lib/format';
import { signedUrls } from '@/lib/photos';
import { colors, radius, shadow } from '@/theme';
import type { ProjectTotal } from '@/types';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'this_year', label: 'This year' },
  { key: 'this_month', label: 'This month' },
];

/**
 * What the money was spent on.
 *
 * An Admin and a Sub-admin see every project and the whole of what was
 * spent on it. A head sees only the projects his own people have spent
 * on, and only their share - the same window he has everywhere else.
 *
 * Expenses nobody has filed yet are kept in plain sight at the bottom
 * rather than quietly left out, because a list of projects that does not
 * add up to what the company spent is a list that will be trusted once
 * and then not again.
 *
 * Starting a project is a card at the end of the running ones, not a
 * button in the heading. On a phone a button up there crowded the title,
 * and opening it shoved the whole page down; down here the field appears
 * where the eye already is and nothing above it moves.
 */
export default function ProjectsScreen() {
  const router = useRouter();
  const { person: me, canManage } = useAuth();
  const params = useLocalSearchParams<{
    project?: string;
    name?: string;
    unfiled?: string;
    person?: string;
    who?: string;
  }>();

  const [period, setPeriod] = useState<Period>('all');
  const range = useMemo(() => periodRange(period), [period]);

  const canSee = canManage || !!me?.is_head;
  const inside = !!params.project || params.unfiled === '1';

  if (!canSee) {
    return (
      <Screen>
        <Header title="Projects" back />
        <Banner
          tone="error"
          message="Only an Admin, a Sub-admin or a head of employees can see the projects."
        />
      </Screen>
    );
  }

  const projectName = params.unfiled === '1' ? 'Not filed yet' : (params.name ?? 'Project');
  const projectId = params.unfiled === '1' ? null : (params.project ?? null);

  if (inside && params.person) {
    return (
      <OnePersonOnOneProject
        projectId={projectId}
        projectName={projectName}
        personId={params.person}
        who={params.who ?? 'Person'}
        range={range}
      />
    );
  }

  if (inside) {
    return <OneProject projectId={projectId} name={projectName} range={range} />;
  }

  return (
    <Screen>
      <Header
        title="Projects"
        subtitle={canManage ? 'What the money was spent on' : 'What your people spent it on'}
      />

      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: p.key === period }}
            style={({ pressed }) => [
              styles.chip,
              p.key === period && styles.chipOn,
              pressed && p.key !== period && styles.chipPressed,
            ]}
          >
            <Txt
              variant="caption"
              weight="semibold"
              color={p.key === period ? colors.white : colors.navy}
            >
              {p.label}
            </Txt>
          </Pressable>
        ))}
      </View>

      <ProjectList
        range={range}
        onOpen={(id, name) =>
          router.push(
            id
              ? `/projects?project=${id}&name=${encodeURIComponent(name)}`
              : '/projects?unfiled=1',
          )
        }
      />
    </Screen>
  );
}

// ------------------------------------------------------------- the list
function ProjectList({
  range,
  onOpen,
}: {
  range: { from?: string; to?: string };
  onOpen: (id: string | null, name: string) => void;
}) {
  const totals = useProjectTotals(range);
  const unfiled = useUnfiledExpenses(range);
  const [adding, setAdding] = useState(false);

  if (totals.isLoading) return <Loading />;
  if (totals.error) return <Banner tone="error" message={totals.error.message} />;

  const rows = totals.data ?? [];
  const running = rows.filter((r) => r.is_active);
  const finished = rows.filter((r) => !r.is_active);
  const loose = unfiled.data ?? { spent: 0, entry_count: 0 };
  const filed = rows.reduce((sum, r) => sum + Number(r.spent), 0);
  const everything = filed + Number(loose.spent);

  const starter = (
    <View style={styles.starter}>
      {adding ? (
        <Card>
          <NewProjectBox onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Card>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Start a project"
          style={({ pressed }) => [styles.addTile, pressed && styles.addPressed]}
        >
          <Ionicons name="add" size={20} color={colors.navy} />
          <Txt variant="subtitle" weight="semibold" color={colors.navy}>
            Start a project
          </Txt>
        </Pressable>
      )}
    </View>
  );

  if (rows.length === 0 && Number(loose.spent) === 0) {
    return (
      <>
        <EmptyState
          icon="business-outline"
          title="No projects yet"
          message="Start one here, or while recording an expense. What is spent on it gathers here."
        />
        {starter}
      </>
    );
  }

  return (
    <>
      <TotalCard
        tone={colors.red}
        total={everything}
        label="SPENT IN ALL"
        caption={summary(running.length, finished.length)}
      />

      {running.length > 0 ? (
        <View style={styles.cards}>
          {running.map((row) => (
            <ProjectCard
              key={row.project_id}
              row={row}
              of={everything}
              onPress={() => onOpen(row.project_id, row.name)}
            />
          ))}
        </View>
      ) : null}

      {starter}

      {finished.length > 0 ? (
        <>
          <Heading icon="checkmark-done-outline" text="Finished" />
          <View style={styles.cards}>
            {finished.map((row) => (
              <ProjectCard
                key={row.project_id}
                row={row}
                of={everything}
                onPress={() => onOpen(row.project_id, row.name)}
              />
            ))}
          </View>
        </>
      ) : null}

      {Number(loose.spent) > 0 ? (
        <>
          <Heading icon="help-circle-outline" text="Not filed against any project yet" />
          <Card padded={false} style={breakdownStyles.list}>
            <DrillRow
              leading={
                <View style={[breakdownStyles.dayIcon, styles.looseIcon]}>
                  <Ionicons name="help-outline" size={18} color={colors.textMuted} />
                </View>
              }
              title="Not filed yet"
              caption={`${loose.entry_count} ${
                Number(loose.entry_count) === 1 ? 'expense' : 'expenses'
              } · open one to say what it was for`}
              amount={Number(loose.spent)}
              fraction={everything > 0 ? Number(loose.spent) / everything : 0}
              tone={colors.textMuted}
              onPress={() => onOpen(null, 'Not filed yet')}
            />
          </Card>
        </>
      ) : null}
    </>
  );
}

function summary(running: number, finished: number): string {
  const parts: string[] = [];
  if (running > 0) parts.push(`${running} running`);
  if (finished > 0) parts.push(`${finished} finished`);
  if (parts.length === 0) return 'nothing filed against a project yet';
  return parts.join(' · ');
}

function Heading({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.heading}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Txt variant="label" color={colors.textMuted}>
        {text.toUpperCase()}
      </Txt>
    </View>
  );
}

/**
 * A project as a card rather than a row: a site has a name, a life and a
 * figure, and three facts crammed on one line is how a list stops being
 * readable on a phone.
 */
function ProjectCard({
  row,
  of,
  onPress,
}: {
  row: ProjectTotal;
  of: number;
  onPress: () => void;
}) {
  const spent = Number(row.spent);
  const done = !row.is_active;
  const tone = done ? colors.textMuted : colors.red;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${money(spent)}`}
      style={({ pressed }) => [
        styles.card,
        shadow.card,
        done && styles.cardDone,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, done && styles.cardIconDone]}>
          <Ionicons
            name={done ? 'checkmark-done' : 'business'}
            size={19}
            color={done ? colors.textMuted : colors.navy}
          />
        </View>
        <View style={styles.cardName}>
          <Txt variant="subtitle" weight="semibold" numberOfLines={2}>
            {row.name}
          </Txt>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {done
              ? `Started ${formatDate(row.started_on)} · finished ${formatDate(row.closed_at)}`
              : `Started ${formatDate(row.started_on)}`}
          </Txt>
        </View>
        {done ? <Badge label="Finished" tone="grey" style={breakdownStyles.badgeMid} /> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </View>

      <View style={styles.cardFoot}>
        <View style={styles.cardBar}>
          <ShareBar fraction={of > 0 ? spent / of : 0} tone={tone} stretch />
        </View>
        <Txt weight="bold" color={tone} numberOfLines={1}>
          {money(spent)}
        </Txt>
      </View>

      <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
        {Number(row.entry_count) === 0
          ? 'Nothing spent on it yet'
          : `${row.entry_count} ${Number(row.entry_count) === 1 ? 'expense' : 'expenses'} · ${
              row.people_count
            } ${Number(row.people_count) === 1 ? 'person' : 'people'}${
              row.last_spend ? ` · last ${formatDate(row.last_spend)}` : ''
            }`}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------- one project
function OneProject({
  projectId,
  name,
  range,
}: {
  projectId: string | null;
  name: string;
  range: { from?: string; to?: string };
}) {
  const router = useRouter();
  const { data, isLoading, error } = useProjectByPerson(projectId, range);
  const totals = useProjectTotals(range, !!projectId);
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const project = (totals.data ?? []).find((p) => p.project_id === projectId);
  // The address carries the name it was opened with, which goes stale the
  // moment the project is renamed. The database's name wins.
  const title = project?.name ?? name;

  return (
    <Screen>
      <Header title={title} subtitle="Who spent it" back />

      {project ? <ProjectLife project={project} /> : null}

      {isLoading ? (
        <Loading />
      ) : error ? (
        <Banner tone="error" message={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="Nothing on it yet"
          message="No expense has been filed against this project in the chosen period."
        />
      ) : (
        <>
          <TotalCard
            tone={colors.red}
            total={total}
            caption={`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
          />
          <Card padded={false} style={breakdownStyles.list}>
            {rows.map((row) => (
              <DrillRow
                key={row.person_id}
                leading={<Avatar name={row.full_name} size={40} />}
                title={row.full_name}
                badge={
                  !row.is_active ? (
                    <Badge label="Off" tone="grey" style={breakdownStyles.badgeMid} />
                  ) : null
                }
                caption={`${row.job_title ? `${row.job_title} · ` : ''}${row.entry_count} ${
                  Number(row.entry_count) === 1 ? 'expense' : 'expenses'
                }`}
                amount={Number(row.total)}
                fraction={total > 0 ? Number(row.total) / total : 0}
                tone={colors.red}
                onPress={() =>
                  router.push(
                    `/projects?${
                      projectId
                        ? `project=${projectId}&name=${encodeURIComponent(title)}`
                        : 'unfiled=1'
                    }&person=${row.person_id}&who=${encodeURIComponent(row.full_name)}`,
                  )
                }
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

/** When it started, whether it is finished, and what an Admin may do. */
function ProjectLife({ project }: { project: ProjectTotal }) {
  const wide = useIsWide();
  const { canManage } = useAuth();
  const [sheet, setSheet] = useState<'none' | 'rename' | 'finish' | 'remove'>('none');

  return (
    <>
      <View style={[styles.life, wide && styles.lifeWide]}>
        <Fact
          icon="play-circle-outline"
          label="Started"
          value={formatDate(project.started_on)}
          tone={colors.green}
        />
        <Fact
          icon={project.is_active ? 'time-outline' : 'checkmark-circle-outline'}
          label={project.is_active ? 'Still running' : 'Finished'}
          value={project.is_active ? 'Not finished' : formatDate(project.closed_at)}
          tone={project.is_active ? colors.blue : colors.textMuted}
        />
        <Fact
          icon="receipt-outline"
          label="Spent on it"
          value={money(Number(project.spent))}
          tone={colors.red}
        />
      </View>

      {canManage ? (
        <View style={styles.actions}>
          <SmallButton icon="create-outline" label="Rename" onPress={() => setSheet('rename')} />
          {project.is_active ? (
            <SmallButton
              icon="checkmark-done"
              label="Mark complete"
              tone={colors.green}
              onPress={() => setSheet('finish')}
            />
          ) : (
            <SmallButton
              icon="refresh-outline"
              label="Open again"
              onPress={() => setSheet('finish')}
            />
          )}
          {project.can_remove ? (
            <SmallButton
              icon="trash-outline"
              label="Remove"
              tone={colors.red}
              onPress={() => setSheet('remove')}
            />
          ) : null}
        </View>
      ) : null}

      <ProjectSheets which={sheet} project={project} onClose={() => setSheet('none')} />
    </>
  );
}

function Fact({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <View style={[styles.fact, shadow.card]}>
      <View style={styles.factTop}>
        <Ionicons name={icon} size={15} color={tone} />
        <Txt variant="label" color={colors.textMuted} numberOfLines={1}>
          {label.toUpperCase()}
        </Txt>
      </View>
      <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

function SmallButton({
  icon,
  label,
  tone = colors.navy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.small, pressed && styles.smallPressed]}
    >
      <Ionicons name={icon} size={16} color={tone} />
      <Txt variant="caption" weight="semibold" color={tone}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ------------------------------------------- one person, on one project
/**
 * The entries themselves: what this person put on this project, which is
 * where the questions run out. The feed is filtered on the project, so
 * "not filed yet" means exactly that and nothing else wanders in.
 */
function OnePersonOnOneProject({
  projectId,
  projectName,
  personId,
  who,
  range,
}: {
  projectId: string | null;
  projectName: string;
  personId: string;
  who: string;
  range: { from?: string; to?: string };
}) {
  const { data, isLoading, error } = useRecentEntries(
    {
      personId,
      lineTypes: ['expense'],
      projectId: projectId ?? 'none',
      from: range.from,
      to: range.to,
    },
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

  return (
    <Screen>
      <Header title={who} subtitle={`On ${projectName}`} back />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <Banner tone="error" message={error.message} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="Nothing here"
          message="No expense of this person sits on this project in the chosen period."
        />
      ) : (
        <>
          <TotalCard
            tone={colors.red}
            total={total}
            caption={`${entries.length} ${entries.length === 1 ? 'expense' : 'expenses'}`}
          />
          <Card padded={false} style={breakdownStyles.list}>
            {entries.map((entry) => (
              <EntryRow
                key={`${entry.id}-${entry.person_id}`}
                entry={entry}
                thumbUrl={entry.thumb_path ? thumbs[entry.thumb_path] : null}
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 15,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipPressed: { backgroundColor: colors.navyTint },

  cards: { gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 10,
  },
  cardDone: { backgroundColor: colors.bg },
  cardPressed: { backgroundColor: colors.navyTint },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconDone: { backgroundColor: colors.line },
  cardName: { flex: 1, gap: 2 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardBar: { flex: 1 },

  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 9 },
  looseIcon: { backgroundColor: colors.line },

  starter: { marginTop: 12 },
  addTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.navyTint,
    backgroundColor: colors.card,
  },
  addPressed: { backgroundColor: colors.navyTint },

  life: { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  lifeWide: { flexWrap: 'nowrap' },
  fact: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  factTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  actions: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  smallPressed: { backgroundColor: colors.navyTint },
});
