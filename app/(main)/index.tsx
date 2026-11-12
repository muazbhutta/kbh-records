import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Card, EmptyState, Loading, SectionTitle } from '@/components/Bits';
import { EntryRow } from '@/components/EntryRow';
import { CashCard, Money } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Dashboard } from '@/components/Dashboard';
import { useRecentEntries, useTotals } from '@/api/entries';
import { useAttendanceDayTotal } from '@/api/salaries';
import { useMyTeam } from '@/api/team';
import { useAuth } from '@/auth/AuthProvider';
import { firstName, money, ROLE_LABEL, todayInRiyadh } from '@/lib/format';
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
  const { person, canPayroll } = useAuth();
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

      {/*
        The one thing a man comes to this app to do.
        
        It used to be a white card the height of a postcard with a small
        pink square in the middle of it - large, but not loud, and
        mostly empty. Filled and laid across, it is half the height and
        twice as plainly the thing to press.
      */}
      <Pressable
        onPress={() => router.push('/entry/new?type=expense')}
        accessibilityRole="button"
        accessibilityLabel="Add an expense"
        style={({ pressed }) => [styles.addRow, pressed && styles.addPressed]}
      >
        <View style={styles.addIcon}>
          <Ionicons name="receipt" size={21} color={colors.white} />
        </View>
        <View style={styles.flex}>
          <Txt variant="subtitle" weight="bold" color={colors.white} numberOfLines={1}>
            Add an expense
          </Txt>
          <Txt variant="caption" color={colors.onDarkMuted} numberOfLines={1}>
            A bill, a receipt, money paid out
          </Txt>
        </View>
        <Ionicons name="add-circle" size={24} color={colors.white} />
      </Pressable>

      {/*
        The wages, where the man who was handed them will look for
        them. He has no dashboard to put a card on, so it sits on his
        own home screen between his cash and his entries.
      */}
      {canPayroll ? <WagesCard /> : null}

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
      <SectionTitle
        title="What you were given, and what you spent"
        action={
          <Txt variant="label" color={colors.textFaint}>
            SAR
          </Txt>
        }
      />
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
      <Money amount={amount} size="sm" tone="plain" currency={false} />
    </View>
  );
}

/**
 * A head sees the people under him: what each is holding and what each
 * has spent. They still cannot see one another.
 */
/**
 * The wages, for the man who was handed them.
 *
 * One card, in his own colours, saying what is still waiting: a day
 * nobody has answered for is the thing that makes the month wrong, so
 * that is the figure on it.
 */
function WagesCard() {
  const router = useRouter();
  const attendance = useAttendanceDayTotal(todayInRiyadh());
  const waiting = attendance.data?.not_marked ?? 0;

  return (
    <Pressable
      onPress={() => router.push('/salaries')}
      accessibilityRole="button"
      accessibilityLabel="Salaries and attendance"
      style={({ pressed }) => [styles.wages, pressed && styles.wagesPressed]}
    >
      <View style={styles.wagesIcon}>
        <Ionicons name="people-circle-outline" size={22} color={colors.white} />
      </View>
      <View style={styles.wagesText}>
        <Txt variant="subtitle" weight="bold" color={colors.white}>
          Salaries &amp; attendance
        </Txt>
        <Txt variant="caption" color={colors.onDarkMuted} numberOfLines={1}>
          {attendance.data
            ? waiting > 0
              ? `${waiting} still to answer for today`
              : `${attendance.data.present} present today`
            : 'Mark today, and see the month'}
        </Txt>
      </View>
      {waiting > 0 ? (
        <View style={styles.wagesCount}>
          <Txt variant="label" weight="bold" color={colors.white}>
            {waiting}
          </Txt>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.onDarkMuted} />
      )}
    </Pressable>
  );
}

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
        /*
         * A quiet line, not a hoarding.
         *
         * A full empty-state card - big faded icon, heading, message -
         * at the foot of a man's own home screen filled a third of it
         * to say that nothing is there. One line says the same.
         */
        <View style={styles.noTeam}>
          <Ionicons name="people-outline" size={17} color={colors.textFaint} />
          <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
            Nobody works under you yet. An Admin decides who does.
          </Txt>
        </View>
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

/*
 * The role used to be said twice: once under the greeting, and again
 * in a chip an inch to its right. Two labels a centimetre apart, both
 * reading "Employee", is the sort of thing that makes a screen feel
 * unconsidered. The greeting keeps it; the chip is gone.
 */
function LogoutButton() {
  const { logout } = useAuth();
  return (
    <View style={styles.headerRight}>
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

  wages: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
  },
  wagesPressed: { opacity: 0.9 },
  wagesIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wagesText: { flex: 1, gap: 1 },
  wagesCount: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: colors.amberDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Level with the log-out button beside it.
  cashSkeleton: { minHeight: 150, justifyContent: 'center' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 16,
    marginBottom: 6,
  },
  addPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  noTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
