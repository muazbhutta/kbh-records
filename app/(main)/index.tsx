import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Card, EmptyState, Loading, SectionTitle } from '@/components/Bits';
import { BigActionButton } from '@/components/Button';
import { EntryRow } from '@/components/EntryRow';
import { CashCard, Money } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Dashboard } from '@/components/Dashboard';
import { useRecentEntries, useTotals } from '@/api/entries';
import { useMyTeam } from '@/api/team';
import { useAuth } from '@/auth/AuthProvider';
import { firstName, money, ROLE_LABEL } from '@/lib/format';
import { signedUrls } from '@/lib/photos';
import { colors, radius } from '@/theme';
import type { Totals } from '@/types';

export default function HomeScreen() {
  const { person, canManage } = useAuth();

  return (
    <Screen>
      <Header
        title={`Hello, ${firstName(person?.full_name) || 'there'}`}
        subtitle={person?.is_owner ? 'Owner · Admin' : (ROLE_LABEL[person?.role ?? ''] ?? '')}
        right={<LogoutButton />}
      />
      {canManage ? <Dashboard /> : <EmployeeHome />}
    </Screen>
  );
}

// ------------------------------------------------------- employee home
function EmployeeHome() {
  const { person } = useAuth();
  const router = useRouter();
  const { data: totals, isLoading } = useTotals(person?.id);
  const recent = useRecentEntries({ personId: person?.id }, 6, !!person?.id);
  // Being a head is the only reason an employee may hand money to anyone.
  const isHead = !!person?.is_head;

  return (
    <>
      {isLoading || !totals ? (
        <Card style={styles.cashSkeleton}>
          <Loading />
        </Card>
      ) : (
        <>
          <CashCard
            spentLabel="Paid out"
            owedTitle="The company owes you"
            owedNote="You spent more than you were handed"
            balance={Number(totals.balance)}
            given={Number(totals.money_given) + Number(totals.transfers_in)}
            spent={Number(totals.expenses) + Number(totals.transfers_out)}
            returned={Number(totals.returned)}
          />
          <MoneyInSplit totals={totals} />
        </>
      )}

      <View style={styles.bigActions}>
        <BigActionButton
          label="Add Expense"
          icon="receipt"
          tint={colors.red}
          onPress={() => router.push('/entry/new?type=expense')}
        />
        {isHead ? (
          <BigActionButton
            label="Give to my team"
            icon="swap-horizontal"
            tint={colors.blue}
            onPress={() => router.push('/entry/new?type=transfer')}
          />
        ) : null}
      </View>

      {isHead ? <TeamStrip /> : null}

      <RecentList
        query={recent}
        title="Recent entries"
        onSeeAll={() => router.push('/khata')}
        emptyTitle="Nothing recorded yet"
        emptyMessage="Your entries will show here as soon as you add one."
      />
    </>
  );
}

/**
 * "How did this money reach me?" - the first question a person asks of
 * his own khata, and until now the books could not answer it.
 */
function MoneyInSplit({ totals }: { totals: Totals }) {
  const cash = Number(totals.in_cash);
  const bank = Number(totals.in_transfer);
  const spent = Number(totals.expenses);
  if (cash === 0 && bank === 0 && spent === 0) return null;

  return (
    <>
      <SectionTitle title="What you were given, and what you spent" />
      <View style={styles.splitRow}>
        <SplitTile icon="cash-outline" label="Cash in hand" amount={cash} tint={colors.green} />
        <SplitTile icon="card-outline" label="Bank transfer" amount={bank} tint={colors.blue} />
        <SplitTile icon="receipt-outline" label="Spent" amount={spent} tint={colors.red} />
      </View>
    </>
  );
}

function SplitTile({
  icon,
  label,
  amount,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  amount: number;
  tint: string;
}) {
  return (
    <View style={styles.splitTile}>
      <View style={[styles.splitIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
        {label}
      </Txt>
      <Money amount={amount} size="sm" tone="plain" />
    </View>
  );
}

/**
 * A head sees the people under him: what each is holding and what each
 * has spent. They still cannot see one another.
 */
function TeamStrip() {
  const router = useRouter();
  const { data: team = [], isLoading } = useMyTeam();

  return (
    <>
      <SectionTitle
        title="My team"
        action={
          team.length > 0 ? (
            <Txt variant="caption" color={colors.textFaint}>
              {team.length} {team.length === 1 ? 'person' : 'people'}
            </Txt>
          ) : null
        }
      />
      {isLoading ? (
        <Loading />
      ) : team.length === 0 ? (
        <Card>
          <EmptyState
            icon="people-outline"
            title="Nobody under you yet"
            message="An Admin decides who works under you."
          />
        </Card>
      ) : (
        <Card padded={false} style={styles.feedCard}>
          {team.map((member, i) => (
            <Pressable
              key={member.id}
              onPress={() => router.push(`/team/${member.id}`)}
              accessibilityRole="button"
              accessibilityLabel={member.full_name}
              style={({ pressed }) => [
                styles.teamRow,
                i < team.length - 1 && styles.teamBorder,
                pressed && styles.teamPressed,
              ]}
            >
              <Avatar name={member.full_name} size={38} />
              <View style={styles.teamMain}>
                <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                  {member.full_name}
                </Txt>
                <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                  Spent {money(member.expenses)} - cash {money(member.in_cash)}, bank{' '}
                  {money(member.in_transfer)}
                </Txt>
              </View>
              <View style={styles.teamEnd}>
                <Money amount={member.balance} size="sm" tone="plain" />
                <Txt variant="label" color={colors.textFaint}>
                  {member.balance < 0 ? 'owed back' : 'in hand'}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}

// ------------------------------------------------------------- shared
function RecentList({
  query,
  title,
  onSeeAll,
  emptyTitle,
  emptyMessage,
  showOwner,
}: {
  query: ReturnType<typeof useRecentEntries>;
  title: string;
  onSeeAll: () => void;
  emptyTitle: string;
  emptyMessage: string;
  showOwner?: boolean;
}) {
  const entries = query.data ?? [];
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
    <>
      <SectionTitle
        title={title}
        action={
          entries.length > 0 ? (
            <Pressable onPress={onSeeAll} accessibilityRole="button">
              <Txt variant="caption" weight="semibold" color={colors.blue}>
                See all
              </Txt>
            </Pressable>
          ) : null
        }
      />
      {query.isLoading ? (
        <Loading />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon="document-text-outline" title={emptyTitle} message={emptyMessage} />
        </Card>
      ) : (
        <Card padded={false} style={styles.feedCard}>
          {entries.map((entry) => (
            <EntryRow
              key={`${entry.id}-${entry.person_id}`}
              entry={entry}
              thumbUrl={entry.thumb_path ? thumbs[entry.thumb_path] : null}
              showOwner={showOwner}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function LogoutButton() {
  const { logout, person } = useAuth();
  return (
    <View style={styles.headerRight}>
      <Badge
        label={person?.is_owner ? 'Owner' : (ROLE_LABEL[person?.role ?? ''] ?? '')}
        tone={person?.is_owner ? 'amber' : person?.role === 'employee' ? 'grey' : 'navy'}
        style={styles.midBadge}
      />
      <Pressable
        onPress={logout}
        accessibilityRole="button"
        accessibilityLabel="Log out"
        hitSlop={10}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.navy} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Level with the log-out button beside it.
  midBadge: { alignSelf: 'center' },
  cashSkeleton: { minHeight: 150, justifyContent: 'center' },
  bigActions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 6 },
  splitRow: { flexDirection: 'row', gap: 8 },
  splitTile: {
    flex: 1,
    gap: 4,
    padding: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 0,
  },
  splitIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  teamBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  teamPressed: { backgroundColor: colors.navyTint },
  teamMain: { flex: 1, gap: 1, minWidth: 0 },
  teamEnd: { alignItems: 'flex-end', flexShrink: 0 },
  grid: { flexDirection: 'row', gap: 10 },
  gridGap: { marginTop: 10, marginBottom: 6 },
  owedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  holder: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  holderBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { backgroundColor: colors.navyTint },
  feedCard: { overflow: 'hidden' },
  wideFigures: { flexDirection: 'row', gap: 10, marginTop: 18 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
