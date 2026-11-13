import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, EmptyState, Loading, SectionTitle } from '@/components/Bits';
import { ShareBar } from '@/components/Breakdown';
import { CashCard } from '@/components/Money';
import {
  LeaveSheet,
  PayrollSheet,
  PaySheet,
  RemoveFromPayrollSheet,
  RemovePaymentSheet,
} from '@/components/SalarySheets';
import { Header, Screen, useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  monthKey,
  useAttendanceDayTotal,
  useAttendanceSheet,
  useLeaveMonth,
  useSalaryMonth,
  useSalaryMonthTotal,
  useSalaryPayments,
} from '@/api/salaries';
import { useLogDownload } from '@/api/reports';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money, monthName, shiftMonth, todayInRiyadh } from '@/lib/format';
import { makeAndSharePdf } from '@/lib/reportPdf';
import { buildSalarySlipsHtml, salarySlipFileName, slipFor } from '@/lib/salarySlipPdf';
import { colors, radius, shadow } from '@/theme';
import type { SalaryLine, SalaryPayment } from '@/types';

/**
 * Salaries, a month at a time.
 *
 * Kept apart from the khatas on purpose. A man's khata is company cash
 * in his hand that he must account for; his salary is his own money and
 * he accounts for nothing. Putting them on one screen would make every
 * balance in this app a question rather than an answer.
 *
 * The question an office has on payday is not "what have we paid" but
 * "what is still owed, and who already took some of it" - so every line
 * carries all four figures together: what he is on, what he took in
 * advance, what he has been paid, and what is left.
 *
 * Only the office, or somebody the office has handed the wages to, can
 * open it. What a man earns is not his
 * workmates' business, and the database refuses them whatever the screen
 * does.
 */
export default function SalariesScreen() {
  const { canPayroll, person: me } = useAuth();
  const [month, setMonth] = useState(monthKey());
  const [sheet, setSheet] = useState<
    | { kind: 'pay'; line: SalaryLine }
    | { kind: 'leave'; line: SalaryLine }
    | { kind: 'edit'; line: SalaryLine }
    | { kind: 'remove'; line: SalaryLine }
    | { kind: 'add' }
    | { kind: 'unpay'; payment: SalaryPayment }
    | { kind: 'editpay'; line: SalaryLine; payment: SalaryPayment }
    | null
  >(null);

  const router = useRouter();
  const lines = useSalaryMonth(month, canPayroll);
  const register = useAttendanceSheet(month, canPayroll);
  // Who was at home, and between which days - so a slip can say so
  // against the days nobody marked, instead of "nobody said".
  const leave = useLeaveMonth(month, canPayroll);
  const logDownload = useLogDownload();
  const [making, setMaking] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const attendance = useAttendanceDayTotal(todayInRiyadh(), canPayroll);
  const total = useSalaryMonthTotal(month, canPayroll);
  const payments = useSalaryPayments(month, canPayroll);
  const wide = useIsWide();

  // The two sorts of man are paid on different rules and read on
  // different days: the office looks at the monthly staff once a month
  // and at the daily men whenever the week's days are settled. Mixing
  // them in one list made both harder to read than either.
  const [show, setShow] = useState<'all' | 'monthly' | 'daily'>('all');
  const ofKind = (l: SalaryLine) =>
    show === 'all' || (show === 'daily' ? l.pay_kind === 'daily' : l.pay_kind !== 'daily');

  const onPayroll = useMemo(
    () => (lines.data ?? []).filter((l) => l.on_payroll && ofKind(l)),
    [lines.data, show],
  );
  const alsoPaid = useMemo(
    () => (lines.data ?? []).filter((l) => !l.on_payroll && ofKind(l)),
    [lines.data, show],
  );

  // The counts are of everybody, not of what is being shown, so the
  // buttons say how many are behind each of them.
  const counts = useMemo(() => {
    const all = lines.data ?? [];
    return {
      all: all.length,
      monthly: all.filter((l) => l.pay_kind !== 'daily').length,
      daily: all.filter((l) => l.pay_kind === 'daily').length,
    };
  }, [lines.data]);

  /**
   * Every man's own handings-over, under his own name. A single list of
   * everybody's below made you read the same names over and over to
   * answer a question about one of them.
   */
  const handedTo = useMemo(() => {
    const by = new Map<string, SalaryPayment[]>();
    for (const p of payments.data ?? []) {
      const had = by.get(p.person_id);
      if (had) had.push(p);
      else by.set(p.person_id, [p]);
    }
    return by;
  }, [payments.data]);


  // Moving to another month puts away whatever the last one said. A
  // notice reading "3 slips for October are ready" over November's
  // figures is a notice about the wrong month.
  const goMonth = (m: string) => {
    setMonth(m);
    setMade(null);
    setFailed(null);
  };

  // Whose month is on the screen, in the order it is read. What is shown
  // is what gets downloaded, so the button can never quietly include a
  // man the segmented control is hiding.
  const shown = useMemo(
    () =>
      [...onPayroll, ...alsoPaid].filter(
        // A man nobody marked, who was handed nothing and owes nothing,
        // has no month to report. This month's list still shows him so
        // the office can act; his slip would be a blank page.
        (l) => l.days_marked > 0 || l.payments > 0 || Number(l.carried_in) !== 0,
      ),
    [onPayroll, alsoPaid],
  );

  /**
   * The month's slips: one page a man, each starting a new sheet so the
   * office can tear them apart and hand them out.
   *
   * The figures are the screen's own - the same salary_month rows the
   * cards above are drawn from - so a sheet can never disagree with the
   * card it was made from. The register and the payments are cut per man
   * here rather than fetched per man, which would be thirty trips to the
   * database for thirty men.
   *
   * Nothing is made while either is still coming. A slip built from an
   * empty register would look finished and say a man worked no days,
   * which is the one mistake a wage sheet must not make.
   */
  const makeSlips = async (who: SalaryLine[], what: string, oneName: string | null) => {
    if (who.length === 0 || making) return;
    setMade(null);
    setFailed(null);

    if (register.isLoading || payments.isLoading || leave.isLoading) {
      setFailed('The month is still loading. Try again in a moment.');
      return;
    }
    if (register.error || payments.error || leave.error) {
      setFailed(
        (register.error ?? payments.error ?? leave.error)?.message ??
          'The month could not be read.',
      );
      return;
    }

    setMaking(what);
    try {
      const days = register.data ?? [];
      const paid = payments.data ?? [];
      const gone = leave.data ?? [];
      const slips = who.map((line) => slipFor(line, days, paid, gone));

      const html = buildSalarySlipsHtml(slips, {
        month,
        generatedBy: me?.full_name ?? 'Admin',
      });
      // One man's slip carries his own number; a file holding everybody's
      // carries none, because it is not any one of them.
      await makeAndSharePdf(
        html,
        salarySlipFileName(month, oneName, who.length === 1 ? who[0].slip_no : undefined),
      );

      const earned = who.reduce((sum, l) => sum + Number(l.earned), 0);
      await logDownload.mutateAsync({
        kind: 'pdf_salary_slips',
        filter: { from: month, to: lastOfMonth(month) },
        rows: who.length,
        total: earned,
        note: oneName
          ? `Salary slip: ${oneName}, ${monthName(month)}`
          : `${who.length} salary slips, ${monthName(month)}`,
      });

      const what_ = oneName
        ? `${oneName}'s slip for ${monthName(month)} is ready.`
        : `${who.length} ${who.length === 1 ? 'slip' : 'slips'} for ${monthName(month)}, one page each.`;
      setMade(
        `${what_} ${
          Platform.OS === 'web'
            ? 'Choose "Save as PDF" in the window that just opened.'
            : 'Saved to this phone - pick where to send it.'
        }`,
      );
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setMaking(null);
    }
  };

  if (!canPayroll) {
    return (
      <Screen>
        <Header title="Salaries" back />
        <Banner tone="error" message="You have not been given the wages to look after." />
      </Screen>
    );
  }

  const t = total.data;
  const thisMonth = monthKey();

  return (
    <Screen>
      <Header title="Salaries" subtitle="What is owed, and what has been paid" back />

      {/* ------------------------------------------------ the month */}
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => goMonth(shiftMonth(month, -1))}
          accessibilityRole="button"
          accessibilityLabel="The month before"
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </Pressable>

        <View style={styles.monthName}>
          <Txt variant="subtitle" weight="semibold">
            {monthName(month)}
          </Txt>
          {month !== thisMonth ? (
            <Pressable onPress={() => goMonth(thisMonth)} accessibilityRole="button">
              <Txt variant="caption" weight="semibold" color={colors.blue}>
                Back to this month
              </Txt>
            </Pressable>
          ) : (
            <Txt variant="caption" color={colors.textMuted}>
              This month
            </Txt>
          )}
        </View>

        <Pressable
          onPress={() => goMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth}
          accessibilityRole="button"
          accessibilityLabel="The month after"
          style={({ pressed }) => [
            styles.arrow,
            month >= thisMonth && styles.arrowOff,
            pressed && month < thisMonth && styles.arrowPressed,
          ]}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={month >= thisMonth ? colors.textFaint : colors.navy}
          />
        </Pressable>
      </View>

      {/* ----------------------------------------------- the figures */}
      {t ? (
        <CashCard
          title="Still owed this month"
          subtitle={`${t.people} on salary`}
          balance={t.remaining}
          given={t.payroll_total}
          spent={t.salary_paid}
          returned={t.advance_paid}
          spentLabel="Paid"
          owedTitle="Taken more than earned"
          owedNote="The staff owe this back - it comes off next month"
        />
      ) : null}

      {t ? (
        <View style={styles.legend}>
          <Txt variant="caption" color={colors.textMuted}>
            Given is the payroll · Paid is salary handed over · Returned is advances taken
          </Txt>
        </View>
      ) : null}

      {/*
        Today's attendance, at the top, because it is the one thing on
        this screen that has to be done today. A daily man's month is
        wrong until somebody has said whether he turned up, so the
        button carries the count of who is still waiting on an answer.
      */}
      <Pressable
        onPress={() => router.push('/attendance')}
        accessibilityRole="button"
        accessibilityLabel="Today's attendance"
        style={({ pressed }) => [styles.attend, pressed && styles.attendPressed]}
      >
        <View style={styles.attendIcon}>
          <Ionicons name="calendar-number-outline" size={21} color={colors.white} />
        </View>
        <View style={styles.flex}>
          <Txt variant="subtitle" weight="bold" color={colors.white}>
            Today&rsquo;s attendance
          </Txt>
          <Txt variant="caption" color={colors.onDarkMuted} numberOfLines={1}>
            {attendance.data
              ? attendance.data.not_marked > 0
                ? `${attendance.data.not_marked} still to answer for · ${attendance.data.present} present`
                : `${attendance.data.present} present · ${attendance.data.absent} absent · ${money(
                    Number(attendance.data.wages),
                  )} in wages`
              : 'Who turned up today'}
          </Txt>
        </View>
        {attendance.data && attendance.data.not_marked > 0 ? (
          <View style={styles.attendCount}>
            <Txt variant="label" weight="bold" color={colors.white}>
              {attendance.data.not_marked}
            </Txt>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={20} color={colors.onDarkMuted} />
        )}
      </Pressable>

      {/* ------------------------------------------------- the people */}
      <SectionTitle title="Who is on salary" />

      {/*
        One track with three segments rather than three loose pills.
        Three fat buttons, two of them carrying an icon the third did
        not, each with a little grey bubble of its own inside, read as
        clutter where this is only a question of which list to show.
      */}
      <View style={styles.kindRow}>
        <KindTab
          label="Everyone"
          count={counts.all}
          chosen={show === 'all'}
          onPress={() => setShow('all')}
        />
        <KindTab
          label="Employees"
          count={counts.monthly}
          chosen={show === 'monthly'}
          onPress={() => setShow('monthly')}
        />
        <KindTab
          label="Dehaari"
          count={counts.daily}
          chosen={show === 'daily'}
          onPress={() => setShow('daily')}
        />
      </View>

      {/*
        The month's slips, under the track that decides who is in them.
        Put here on purpose: what is shown is what is downloaded, and the
        two sit together so that is plain without reading a word.
      */}
      {shown.length > 0 ? (
        <Pressable
          onPress={() => makeSlips(shown, 'everyone', null)}
          disabled={!!making}
          accessibilityRole="button"
          accessibilityLabel={`Download ${shown.length} salary slips for ${monthName(month)}`}
          style={({ pressed }) => [
            styles.slipRow,
            pressed && !making && styles.slipPressed,
            !!making && styles.slipBusy,
          ]}
        >
          <View style={styles.slipIcon}>
            <Ionicons name="document-text-outline" size={18} color={colors.navy} />
          </View>
          <View style={styles.flex}>
            <Txt variant="subtitle" weight="semibold" color={colors.navy} numberOfLines={1}>
              {making === 'everyone' ? 'Making the slips…' : 'Download salary slips'}
            </Txt>
            <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
              {show === 'all'
                ? 'Everyone shown'
                : show === 'daily'
                  ? 'The Dehaari shown'
                  : 'The employees shown'}
              {' · '}
              {shown.length} {shown.length === 1 ? 'page' : 'pages'}, one each
              {' · '}
              {monthName(month)}
            </Txt>
          </View>
          {making === 'everyone' ? (
            <ActivityIndicator size="small" color={colors.navy} />
          ) : (
            <Ionicons name="download-outline" size={19} color={colors.navy} />
          )}
        </Pressable>
      ) : null}

      {made ? <Banner tone="success" message={made} /> : null}
      {failed ? <Banner tone="error" message={failed} /> : null}

      {lines.isLoading ? (
        <Loading />
      ) : lines.error ? (
        <Banner tone="error" message={lines.error.message} />
      ) : onPayroll.length === 0 && alsoPaid.length === 0 ? (
        // Nobody of THIS sort is not the same as nobody at all, and
        // saying the wrong one sends the office looking for a fault.
        counts.all > 0 ? (
          <EmptyState
            icon="people-outline"
            title={show === 'daily' ? 'No daily men this month' : 'No monthly staff this month'}
            message={
              show === 'daily'
                ? 'Nobody is on a daily wage. Put somebody on below and choose Daily.'
                : 'Nobody is on a monthly wage. Put somebody on below and choose Monthly.'
            }
          />
        ) : (
          <EmptyState
            icon="people-outline"
            title="Nobody is on salary yet"
            message={
              'Put somebody on below - a man already in the app, or a new one added right there. ' +
              'Each person then gets their own line with Pay salary and Advance on it.'
            }
          />
        )
      ) : (
        <View style={styles.cards}>
          {onPayroll.map((line) => (
            <SalaryCard
              key={line.person_id}
              line={line}
              wide={wide}
              handed={handedTo.get(line.person_id)}
              onUnpay={(payment) => setSheet({ kind: 'unpay', payment })}
              onEditPayment={(payment) => setSheet({ kind: 'editpay', line, payment })}
              onPay={() => setSheet({ kind: 'pay', line })}
              onEdit={() => setSheet({ kind: 'edit', line })}
              onLeave={() => setSheet({ kind: 'leave', line })}
              onSlip={() => makeSlips([line], line.person_id, line.full_name)}
              busy={making === line.person_id}
            />
          ))}
        </View>
      )}

      <Pressable
        onPress={() => setSheet({ kind: 'add' })}
        accessibilityRole="button"
        accessibilityLabel="Put somebody on salary"
        style={({ pressed }) => [styles.addTile, pressed && styles.addPressed]}
      >
        <Ionicons name="person-add-outline" size={19} color={colors.navy} />
        <Txt variant="subtitle" weight="semibold" color={colors.navy}>
          Put somebody on salary
        </Txt>
      </Pressable>

      {alsoPaid.length > 0 ? (
        <>
          <SectionTitle title="Paid this month, no longer on salary" />
          <View style={styles.cards}>
            {alsoPaid.map((line) => (
              <SalaryCard
                key={line.person_id}
                line={line}
                wide={wide}
                handed={handedTo.get(line.person_id)}
                onUnpay={(payment) => setSheet({ kind: 'unpay', payment })}
                onEditPayment={(payment) => setSheet({ kind: 'editpay', line, payment })}
                past
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ------------------------------------------------- the sheets */}
      {sheet?.kind === 'pay' ? (
        <PaySheet
          line={sheet.line}
          month={month}
          kind="salary"
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === 'leave' ? (
        <LeaveSheet line={sheet.line} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'edit' ? (
        <PayrollSheet
          existing={sheet.line}
          onClose={() => setSheet(null)}
          onTakeOff={() => setSheet({ kind: 'remove', line: sheet.line })}
        />
      ) : null}
      {sheet?.kind === 'add' ? (
        <PayrollSheet onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'remove' ? (
        <RemoveFromPayrollSheet line={sheet.line} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'editpay' ? (
        <PaySheet
          line={sheet.line}
          month={month}
          kind="salary"
          existing={sheet.payment}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === 'unpay' ? (
        <RemovePaymentSheet payment={sheet.payment} onClose={() => setSheet(null)} />
      ) : null}
    </Screen>
  );
}

/**
 * The last day of a month.
 *
 * Built in UTC on purpose: day 0 of the month after is the last day of
 * this one, and reading it back in local time would slide it a day
 * either side of midnight depending on where the phone is standing.
 */
function lastOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m, 0));
  return at.toISOString().slice(0, 10);
}

/** One segment of the track: a list to show, and how many are in it. */
function KindTab({
  label,
  count,
  chosen,
  onPress,
}: {
  label: string;
  count: number;
  chosen: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={`${label}, ${count}`}
      style={({ pressed }) => [
        styles.kindTab,
        chosen && styles.kindTabOn,
        pressed && !chosen && styles.kindTabPressed,
      ]}
    >
      <Txt
        variant="caption"
        weight="bold"
        color={chosen ? colors.white : colors.textMuted}
        numberOfLines={1}
      >
        {label}{' '}
        <Txt variant="caption" weight="bold" color={chosen ? colors.onDarkMuted : colors.textFaint}>
          {count}
        </Txt>
      </Txt>
    </Pressable>
  );
}

/**
 * One person's month.
 *
 * The bar is what has been handed over against what he is on, so a
 * glance down the column says who is still owed without reading a
 * single figure.
 */
function SalaryCard({
  line,
  wide,
  handed: given,
  onUnpay,
  onEditPayment,
  past = false,
  onPay,
  onEdit,
  onLeave,
  onSlip,
  busy = false,
}: {
  line: SalaryLine;
  wide: boolean;
  /** What this man was handed this month, his own entries and nobody else's. */
  handed?: SalaryPayment[];
  onUnpay?: (payment: SalaryPayment) => void;
  /** Tapping an entry opens it to be put right. */
  onEditPayment?: (payment: SalaryPayment) => void;
  past?: boolean;
  onPay?: () => void;
  onEdit?: () => void;
  /** Going home, or coming back. */
  onLeave?: () => void;
  /** His own month on his own page, for when one man asks for his. */
  onSlip?: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows = given ?? [];
  const handed = Number(line.advance_paid) + Number(line.salary_paid);
  const daily = line.pay_kind === 'daily';
  // What the month is worth to him: his monthly wage, or the days he
  // turned up at what each was worth. The bar and the "all paid" mark
  // both read off this, so they mean the same thing for both sorts.
  const earned = Number(line.earned);
  const carried = Number(line.carried_in);
  /*
   * What is owed right now, carry and all. It can go below nought: a
   * man who drew more than his month was worth owes it back, and the
   * card has to say so rather than round it away to "nothing left".
   */
  const left = Number(line.remaining);
  const owesBack = left < 0;
  const done = earned > 0 && left === 0;

  return (
    <View style={[styles.card, shadow.card, past && styles.cardPast]}>
      <View style={styles.cardTop}>
        <Avatar name={line.full_name} size={40} />
        <View style={styles.cardWho}>
          <View style={styles.nameLine}>
            <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
              {line.full_name}
            </Txt>
            {past ? <Badge label="Off salary" tone="grey" style={styles.badgeMid} /> : null}
          </View>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
            {line.job_title ? `${line.job_title} · ` : ''}
            {daily
              ? `${money(Number(line.daily_rate))} a day`
              : Number(line.monthly_amount) > 0
                ? `${money(Number(line.monthly_amount))} a month`
                : 'No monthly figure set'}
          </Txt>
        </View>
        {!past ? (
          <Txt
            weight="bold"
            color={done ? colors.green : owesBack ? colors.red : colors.navy}
            numberOfLines={1}
          >
            {done ? money(handed) : money(Math.abs(left))}
          </Txt>
        ) : (
          <Txt weight="bold" color={colors.textMuted}>
            {money(handed)}
          </Txt>
        )}
      </View>

      {/* A daily man's days, which are what his month is made of. The
          figure is wrong until somebody has marked them, so the card
          says how many were answered for, not just how many he worked. */}
      {daily ? (
        <View style={styles.daysRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.navy} />
          <Txt variant="caption" weight="semibold" color={colors.navy}>
            {line.days_present} {line.days_present === 1 ? 'day' : 'days'} worked
          </Txt>
          <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
            · {money(earned)} earned
            {line.days_marked > line.days_present
              ? ` · ${line.days_marked - line.days_present} off`
              : ''}
          </Txt>
        </View>
      ) : null}

      {/* Fridays he came in, which is the only thing that moves a
          monthly man's figure off his wage. Shown even at nought, so
          the line is not a surprise the month it appears. */}
      {/*
        Only when he worked one. A line reading "0 Fridays worked -
        none this month" on every card is a line nobody reads twice,
        and there were three of them on a screen of six men.
      */}
      {!daily && line.bonus_days > 0 ? (
        <View style={styles.daysRow}>
          <Ionicons name="star" size={13} color={colors.amberDark} />
          <Txt variant="caption" weight="semibold" color={colors.amberDark}>
            {line.bonus_days} {line.bonus_days === 1 ? 'Friday' : 'Fridays'} worked
          </Txt>
          <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
            {Number(line.bonus_total) > 0
              ? `· ${money(Number(line.bonus_total))} on top`
              : '· not priced yet'}
          </Txt>
        </View>
      ) : null}

      {/*
        He is at home.

        Loud, because it explains every empty figure under it, and it
        is the way back: one tap when he turns up again, rather than a
        seventh button on every card for a thing that happens twice a
        year.
      */}
      {/*
        A month he was off salary in is counted by his days, so the
        figure above is not the figure he is on. Said here, under his
        name, because otherwise it reads as a mistake.
      */}
      {!daily && line.on_leave && earned > 0 ? (
        <View style={styles.daysRow}>
          <Ionicons name="calculator-outline" size={14} color={colors.blue} />
          <Txt variant="caption" weight="semibold" color={colors.blue} numberOfLines={1}>
            {line.days_present} {line.days_present === 1 ? 'day' : 'days'} counted
          </Txt>
          <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
            · off salary part of this month
          </Txt>
        </View>
      ) : null}

      {line.on_leave_since ? (
        <Pressable
          onPress={onLeave}
          disabled={!onLeave}
          accessibilityRole="button"
          accessibilityLabel={`${line.full_name} is off salary. Mark him back.`}
          style={({ pressed }) => [styles.away, pressed && onLeave && styles.awayPressed]}
        >
          <Ionicons name="home" size={15} color={colors.amberDark} />
          <View style={styles.flex}>
            <Txt variant="caption" weight="bold" color={colors.amberDark} numberOfLines={1}>
              Off salary since {formatDate(line.on_leave_since)}
            </Txt>
            <Txt variant="caption" color={colors.amberDark} numberOfLines={2}>
              {earned > 0
                ? 'Counted by his days here. Tap when he is back.'
                : 'Earning nothing. Tap when he is back.'}
            </Txt>
          </View>
          {onLeave ? (
            <Ionicons name="chevron-forward" size={16} color={colors.amberDark} />
          ) : null}
        </Pressable>
      ) : null}

      {/*
        What last month left behind. Shown on the card, not only on the
        slip, because it is the figure that makes this month's total
        look wrong to anybody who adds up the wage and the bonus
        themselves.
      */}
      {carried !== 0 ? (
        <View style={styles.daysRow}>
          <Ionicons
            name={carried > 0 ? 'arrow-forward-circle' : 'alert-circle'}
            size={14}
            color={carried > 0 ? colors.blue : colors.red}
          />
          <Txt
            variant="caption"
            weight="semibold"
            color={carried > 0 ? colors.blue : colors.red}
            numberOfLines={1}
          >
            {carried > 0
              ? `${money(carried)} brought from before`
              : `${money(Math.abs(carried))} taken extra before`}
          </Txt>
        </View>
      ) : null}

      {Number(line.owing_added) > 0 ? (
        <View style={styles.daysRow}>
          <Ionicons name="alert-circle" size={14} color={colors.red} />
          <Txt variant="caption" weight="semibold" color={colors.red} numberOfLines={1}>
            {money(Number(line.owing_added))} owed
          </Txt>
          <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
            · written down this month
          </Txt>
        </View>
      ) : null}

      {Number(line.kafalat_paid) > 0 ? (
        <View style={styles.daysRow}>
          <Ionicons name="shield-checkmark" size={14} color={colors.amberDark} />
          <Txt variant="caption" weight="semibold" color={colors.amberDark} numberOfLines={1}>
            {money(Number(line.kafalat_paid))} kafalat
          </Txt>
          <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
            · paid by the company, he owes it back
          </Txt>
        </View>
      ) : null}

      {earned > 0 ? (
        <View style={styles.barRow}>
          {/* The bar fills what is left over; a stretched bar put beside
              bare text pushes the text off the card. */}
          <View style={styles.barFlex}>
            <ShareBar
              fraction={earned > 0 ? handed / earned : 0}
              tone={done ? colors.green : colors.navy}
              stretch
            />
          </View>
          <Txt
            variant="caption"
            color={owesBack ? colors.red : colors.textFaint}
            numberOfLines={1}
          >
            {done
              ? 'all paid'
              : owesBack
                ? `${money(Math.abs(left))} to come off next month`
                : `${money(left)} left`}
          </Txt>
        </View>
      ) : owesBack ? (
        /*
         * Nothing earned, and money owed. There was no bar to draw and
         * so nothing was drawn at all: the card showed a red figure
         * with not a word to say which way it pointed.
         */
        <Txt variant="caption" weight="semibold" color={colors.red} numberOfLines={1}>
          {money(Math.abs(left))} to come off next month
        </Txt>
      ) : daily ? (
        <Txt variant="caption" color={colors.amberDark} numberOfLines={1}>
          No days marked yet this month.
        </Txt>
      ) : null}

      {rows.length === 0 ? (
        <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
          Nothing handed over yet
        </Txt>
      ) : (
        <>
          {/* His own entries, under his own name. Shut by default, or a
              yard of twenty men becomes a page nobody reads. */}
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Hide what he was handed' : 'Show what he was handed'}
            style={({ pressed }) => [styles.openRow, pressed && styles.openPressed]}
          >
            <Txt variant="caption" weight="semibold" color={colors.navy}>
              {Number(line.advance_paid) > 0
                ? `Advance ${money(Number(line.advance_paid))}`
                : ''}
              {Number(line.advance_paid) > 0 && Number(line.salary_paid) > 0 ? ' · ' : ''}
              {Number(line.salary_paid) > 0 ? `Salary ${money(Number(line.salary_paid))}` : ''}
            </Txt>
            <Txt variant="caption" color={colors.textFaint}>
              {rows.length === 1 ? '1 entry' : `${rows.length} entries`}
            </Txt>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.textFaint}
            />
          </Pressable>

          {open ? (
            <View style={styles.entries}>
              {rows.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={onEditPayment ? () => onEditPayment(p) : undefined}
                  disabled={!onEditPayment}
                  accessibilityRole="button"
                  accessibilityLabel={`Change this ${p.kind} of ${money(Number(p.amount))}`}
                  style={({ pressed }) => [
                    styles.entry,
                    pressed && onEditPayment && styles.openPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.payIcon,
                      {
                        backgroundColor:
                          p.kind === 'advance' ? colors.amberSoft : colors.greenSoft,
                      },
                    ]}
                  >
                    <Ionicons
                      name={p.kind === 'advance' ? 'time-outline' : 'cash-outline'}
                      size={14}
                      color={p.kind === 'advance' ? colors.amberDark : colors.green}
                    />
                  </View>
                  <View style={styles.payWho}>
                    <Txt variant="caption" weight="semibold" numberOfLines={1}>
                      {p.kind === 'advance' ? 'Advance' : 'Salary'} · {formatDate(p.paid_on)}
                    </Txt>
                    {p.note || p.entered_by_name ? (
                      <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
                        {p.note ? p.note : ''}
                        {p.note && p.entered_by_name ? ' · ' : ''}
                        {p.entered_by_name ? `by ${p.entered_by_name}` : ''}
                      </Txt>
                    ) : null}
                  </View>
                  <Txt
                    variant="caption"
                    weight="bold"
                    color={p.kind === 'advance' ? colors.amberDark : colors.green}
                  >
                    {money(Number(p.amount))}
                  </Txt>
                  {onUnpay ? (
                    <Pressable
                      onPress={() => onUnpay(p)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Take out this ${p.kind}`}
                      style={({ pressed }) => [styles.unpay, pressed && styles.openPressed]}
                    >
                      <Ionicons name="close" size={15} color={colors.textFaint} />
                    </Pressable>
                  ) : null}
                </Pressable>
              ))}
              {/* A row that can be pressed should say so once. */}
              {onEditPayment ? (
                <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
                  Tap an entry to change it
                </Txt>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      {!past ? (
        <View style={[styles.actions, wide && styles.actionsWide]}>
          {/*
            One button for money, not three.
            
            Salary, advance, kafalat and what he owes are four kinds of
            the same entry, and the kind is asked inside the sheet where
            the amount is typed anyway. Three of them side by side on
            every card made seven buttons on a man.
          */}
          <Small
            icon="cash-outline"
            label="Money"
            tone={colors.green}
            onPress={onPay}
            third={daily}
          />
          <Small
            icon="document-text-outline"
            label={busy ? 'Making…' : 'Slip'}
            onPress={onSlip}
            third={daily}
          />
          {/*
            Off salary - which is what the office calls a man who has
            gone home. Only the monthly staff: a daily man is paid for
            the days he turns up and simply stops turning up, so there
            is nothing to stop and nothing to say.
          */}
          {!daily ? (
            <Small
              icon={line.on_leave_since ? 'home' : 'home-outline'}
              label={line.on_leave_since ? 'Back' : 'Off salary'}
              tone={line.on_leave_since ? colors.amberDark : colors.navy}
              onPress={onLeave}
            />
          ) : null}
          <Small icon="create-outline" label="Edit" onPress={onEdit} third={daily} />
        </View>
      ) : null}
    </View>
  );
}

function Small({
  icon,
  label,
  tone = colors.navy,
  onPress,
  third = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: string;
  onPress?: () => void;
  /**
   * Three to a row rather than two.
   *
   * A daily man has three of these and a monthly one four. At a third
   * each the three fill their row; at a half each the four make two
   * even rows. Either way nothing is left stranded across the bottom
   * of the card on its own.
   */
  third?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.small,
        third && styles.smallThird,
        pressed && styles.smallPressed,
      ]}
    >
      <Ionicons name={icon} size={15} color={tone} />
      <Txt variant="caption" weight="semibold" color={tone}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  arrow: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPressed: { backgroundColor: colors.navyTint },
  arrowOff: { opacity: 0.45 },
  monthName: { flex: 1, alignItems: 'center', gap: 1 },

  legend: { marginTop: 8, marginBottom: 6 },

  // The month's slips. Outlined, not filled: it is a thing to take away,
  // not the thing on this screen that has to be done today.
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    marginBottom: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.navyTint,
    backgroundColor: colors.card,
  },
  slipPressed: { backgroundColor: colors.navyTint },

  // He is at home, and this is the way back.
  away: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  awayPressed: { opacity: 0.75 },
  slipBusy: { opacity: 0.6 },
  slipIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cards: { gap: 10 },

  // One track, three equal segments, the chosen one filled.
  kindRow: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  kindTab: {
    flexGrow: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  kindTabOn: { backgroundColor: colors.navy },
  kindTabPressed: { backgroundColor: colors.navyTint },

  attend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 14,
  },
  attendPressed: { opacity: 0.9 },
  attendIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendCount: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: colors.amberDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    gap: 9,
  },
  cardPast: { backgroundColor: colors.bg },
  // Top of the card: a name and his terms on the left, the figure on
  // the right. The left shrinks and wraps; the figure never does,
  // because a half-printed amount of money is worse than none.
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardWho: { flex: 1, gap: 2, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeMid: { alignSelf: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barFlex: { flex: 1 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionsWide: { flexWrap: 'nowrap' },
  small: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  smallThird: { flexBasis: '30%' },
  smallPressed: { backgroundColor: colors.navyTint },

  addTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    marginTop: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.navyTint,
    backgroundColor: colors.card,
  },
  addPressed: { backgroundColor: colors.navyTint },

  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  openPressed: { opacity: 0.6 },
  entries: {
    gap: 2,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  payIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payWho: { flex: 1, gap: 1 },
  unpay: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
