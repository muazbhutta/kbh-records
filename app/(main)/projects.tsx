import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { breakdownStyles, DrillRow, TotalCard } from '@/components/Breakdown';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useProjectByPerson, useProjectTotals, useUnfiledExpenses } from '@/api/projects';
import { useRecentEntries } from '@/api/entries';
import { NewProjectBox } from '@/components/ProjectField';
import { EntryRow } from '@/components/EntryRow';
import { signedUrls } from '@/lib/photos';
import { useAuth } from '@/auth/AuthProvider';
import { periodRange, type Period } from '@/components/KhataList';
import { formatDate, money } from '@/lib/format';
import { colors, radius } from '@/theme';

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
  const [adding, setAdding] = useState(false);
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
        right={
          !adding ? (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a project"
              style={({ pressed }) => [styles.addBtn, pressed && styles.addPressed]}
            >
              <Ionicons name="add" size={18} color={colors.navy} />
              <Txt variant="caption" weight="semibold" color={colors.navy}>
                Add project
              </Txt>
            </Pressable>
          ) : null
        }
      />

      {adding ? (
        <View style={styles.addBox}>
          <NewProjectBox
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
            placeholder="Name of the site or job"
          />
        </View>
      ) : null}

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

  if (totals.isLoading) return <Loading />;
  if (totals.error) return <Banner tone="error" message={totals.error.message} />;

  const rows = totals.data ?? [];
  const loose = unfiled.data ?? { spent: 0, entry_count: 0 };
  const filed = rows.reduce((sum, r) => sum + Number(r.spent), 0);
  const everything = filed + Number(loose.spent);

  if (rows.length === 0 && Number(loose.spent) === 0) {
    return (
      <EmptyState
        icon="business-outline"
        title="No projects yet"
        message="Add one above, or start one while recording an expense. What is spent on it gathers here."
      />
    );
  }

  return (
    <>
      <TotalCard
        tone={colors.red}
        total={everything}
        label="SPENT IN ALL"
        caption={
          rows.length === 0
            ? 'nothing filed against a project yet'
            : rows.length === 1
              ? 'across 1 project'
              : `across ${rows.length} projects`
        }
      />

      {rows.length > 0 ? (
        <Card padded={false} style={breakdownStyles.list}>
          {rows.map((row) => (
            <DrillRow
              key={row.project_id}
              leading={
                <View style={[breakdownStyles.dayIcon, styles.projectIcon]}>
                  <Ionicons name="business-outline" size={18} color={colors.navy} />
                </View>
              }
              title={row.name}
              badge={
                !row.is_active ? (
                  <Badge label="Closed" tone="grey" style={breakdownStyles.badgeMid} />
                ) : null
              }
              caption={
                Number(row.entry_count) === 0
                  ? 'Nothing spent on it yet'
                  : `${row.entry_count} ${Number(row.entry_count) === 1 ? 'expense' : 'expenses'} · ${
                      row.people_count
                    } ${Number(row.people_count) === 1 ? 'person' : 'people'}${
                      row.last_spend ? ` · last ${formatDate(row.last_spend)}` : ''
                    }`
              }
              amount={Number(row.spent)}
              fraction={everything > 0 ? Number(row.spent) / everything : 0}
              tone={colors.red}
              onPress={() => onOpen(row.project_id, row.name)}
            />
          ))}
        </Card>
      ) : null}

      {Number(loose.spent) > 0 ? (
        <>
          <View style={styles.looseNote}>
            <Ionicons name="help-circle-outline" size={15} color={colors.textMuted} />
            <Txt variant="caption" color={colors.textMuted}>
              Spent, but not filed against any project yet
            </Txt>
          </View>
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
  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);

  return (
    <Screen>
      <Header title={name} subtitle="Who spent it" back />

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
                      projectId ? `project=${projectId}&name=${encodeURIComponent(name)}` : 'unfiled=1'
                    }&person=${row.person_id}&who=${encodeURIComponent(row.full_name)}`,
                  )
                }
              />
            ))}
          </Card>
          <Txt variant="caption" color={colors.textFaint} style={styles.foot}>
            {money(total)} on {name.toLowerCase() === 'not filed yet' ? 'unfiled expenses' : name}
          </Txt>
        </>
      )}
    </Screen>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  addPressed: { backgroundColor: colors.navyTint },
  addBox: { marginBottom: 14 },
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

  projectIcon: { backgroundColor: colors.navyTint },
  looseIcon: { backgroundColor: colors.line },
  looseNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
  },
  foot: { marginTop: 12, textAlign: 'center' },
});
