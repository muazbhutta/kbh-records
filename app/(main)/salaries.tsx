import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, EmptyState, Loading, SectionTitle } from '@/components/Bits';
import { ShareBar } from '@/components/Breakdown';
import { CashCard } from '@/components/Money';
import {
  PayrollSheet,
  PaySheet,
  RemoveFromPayrollSheet,
  RemovePaymentSheet,
} from '@/components/SalarySheets';
import { Header, Screen, useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  monthKey,
  useSalaryMonth,
  useSalaryMonthTotal,
  useSalaryPayments,
} from '@/api/salaries';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money, monthName, shiftMonth } from '@/lib/format';
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
 * Only an Admin and a Sub-admin can open it. What a man earns is not his
 * workmates' business, and the database refuses them whatever the screen
 * does.
 */
export default function SalariesScreen() {
  const { canManage } = useAuth();
  const [month, setMonth] = useState(monthKey());
  const [sheet, setSheet] = useState<
    | { kind: 'pay' | 'advance'; line: SalaryLine }
    | { kind: 'edit'; line: SalaryLine }
    | { kind: 'remove'; line: SalaryLine }
    | { kind: 'add' }
    | { kind: 'unpay'; payment: SalaryPayment }
    | null
  >(null);

  const lines = useSalaryMonth(month, canManage);
  const total = useSalaryMonthTotal(month, canManage);
  const payments = useSalaryPayments(month, canManage);
  const wide = useIsWide();

  const onPayroll = useMemo(
    () => (lines.data ?? []).filter((l) => l.on_payroll),
    [lines.data],
  );
  const alsoPaid = useMemo(
    () => (lines.data ?? []).filter((l) => !l.on_payroll),
    [lines.data],
  );

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


  if (!canManage) {
    return (
      <Screen>
        <Header title="Salaries" back />
        <Banner tone="error" message="Only an Admin or a Sub-admin can see the salaries." />
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
          onPress={() => setMonth(shiftMonth(month, -1))}
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
            <Pressable onPress={() => setMonth(thisMonth)} accessibilityRole="button">
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
          onPress={() => setMonth(shiftMonth(month, 1))}
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
          owedTitle="Fully paid"
          owedNote="Nothing is owed for this month"
        />
      ) : null}

      {t ? (
        <View style={styles.legend}>
          <Txt variant="caption" color={colors.textMuted}>
            Given is the payroll · Paid is salary handed over · Returned is advances taken
          </Txt>
        </View>
      ) : null}

      {/* ------------------------------------------------- the people */}
      <SectionTitle title="Who is on salary" />

      {lines.isLoading ? (
        <Loading />
      ) : lines.error ? (
        <Banner tone="error" message={lines.error.message} />
      ) : onPayroll.length === 0 && alsoPaid.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Nobody is on salary yet"
          message={
            'Put somebody on below - a man already in the app, or a new one added right there. ' +
            'Each person then gets their own line with Pay salary and Advance on it.'
          }
        />
      ) : (
        <View style={styles.cards}>
          {onPayroll.map((line) => (
            <SalaryCard
              key={line.person_id}
              line={line}
              wide={wide}
              handed={handedTo.get(line.person_id)}
              onUnpay={(payment) => setSheet({ kind: 'unpay', payment })}
              onPay={() => setSheet({ kind: 'pay', line })}
              onAdvance={() => setSheet({ kind: 'advance', line })}
              onEdit={() => setSheet({ kind: 'edit', line })}
              onRemove={() => setSheet({ kind: 'remove', line })}
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
                past
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ------------------------------------------------- the sheets */}
      {sheet?.kind === 'pay' || sheet?.kind === 'advance' ? (
        <PaySheet
          line={sheet.line}
          month={month}
          kind={sheet.kind === 'advance' ? 'advance' : 'salary'}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === 'edit' ? (
        <PayrollSheet existing={sheet.line} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'add' ? (
        <PayrollSheet onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'remove' ? (
        <RemoveFromPayrollSheet line={sheet.line} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'unpay' ? (
        <RemovePaymentSheet payment={sheet.payment} onClose={() => setSheet(null)} />
      ) : null}
    </Screen>
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
  past = false,
  onPay,
  onAdvance,
  onEdit,
  onRemove,
}: {
  line: SalaryLine;
  wide: boolean;
  /** What this man was handed this month, his own entries and nobody else's. */
  handed?: SalaryPayment[];
  onUnpay?: (payment: SalaryPayment) => void;
  past?: boolean;
  onPay?: () => void;
  onAdvance?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = given ?? [];
  const handed = Number(line.advance_paid) + Number(line.salary_paid);
  const monthly = Number(line.monthly_amount);
  const left = Number(line.remaining);
  const done = monthly > 0 && left === 0;

  return (
    <View style={[styles.card, shadow.card, past && styles.cardPast]}>
      <View style={styles.cardTop}>
        <Avatar name={line.full_name} size={40} />
        <View style={styles.cardWho}>
          <View style={styles.nameLine}>
            <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
              {line.full_name}
            </Txt>
            {done ? <Badge label="Paid" tone="green" style={styles.badgeMid} /> : null}
            {past ? <Badge label="Off salary" tone="grey" style={styles.badgeMid} /> : null}
          </View>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {line.job_title ? `${line.job_title} · ` : ''}
            {monthly > 0 ? `${money(monthly)} a month` : 'No monthly figure set'}
          </Txt>
        </View>
        {!past ? (
          <Txt weight="bold" color={done ? colors.green : colors.red} numberOfLines={1}>
            {done ? money(handed) : money(left)}
          </Txt>
        ) : (
          <Txt weight="bold" color={colors.textMuted}>
            {money(handed)}
          </Txt>
        )}
      </View>

      {monthly > 0 ? (
        <View style={styles.barRow}>
          {/* The bar fills what is left over; a stretched bar put beside
              bare text pushes the text off the card. */}
          <View style={styles.barFlex}>
            <ShareBar
              fraction={monthly > 0 ? handed / monthly : 0}
              tone={done ? colors.green : colors.navy}
              stretch
            />
          </View>
          <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
            {done ? 'all paid' : `${money(left)} left`}
          </Txt>
        </View>
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
                <View key={p.id} style={styles.entry}>
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
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}

      {!past ? (
        <View style={[styles.actions, wide && styles.actionsWide]}>
          <Small icon="cash-outline" label="Pay salary" tone={colors.green} onPress={onPay} />
          <Small icon="time-outline" label="Advance" tone={colors.amberDark} onPress={onAdvance} />
          <Small icon="create-outline" label="Edit" onPress={onEdit} />
          <Small icon="person-remove-outline" label="Remove" tone={colors.red} onPress={onRemove} />
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.small, pressed && styles.smallPressed]}
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

  cards: { gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    gap: 9,
  },
  cardPast: { backgroundColor: colors.bg },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardWho: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeMid: { alignSelf: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barFlex: { flex: 1 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionsWide: { flexWrap: 'nowrap' },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
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
