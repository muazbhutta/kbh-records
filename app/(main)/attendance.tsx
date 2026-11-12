import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, EmptyState, Loading, SectionTitle } from '@/components/Bits';
import { Button } from '@/components/Button';
import { DateField } from '@/components/pickers';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  useAttendanceDay,
  useAttendanceDayTotal,
  useClearAttendance,
  useMarkAttendance,
} from '@/api/salaries';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money, todayInRiyadh } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';
import type { AttendanceRow } from '@/types';

/** One day back or forward, in plain dates, no clock arithmetic. */
function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/**
 * Who turned up today.
 *
 * The daily men come first, because their wage is made here and the
 * month is wrong until somebody says. The monthly staff are below them,
 * marked all the same: their pay does not move either way, but the
 * office wants the record of who was on site.
 *
 * Nobody is absent until somebody says so. A day nobody has answered
 * for says exactly that, rather than quietly counting as a day off.
 */
export default function AttendanceScreen() {
  const { canPayroll } = useAuth();
  const [day, setDay] = useState(todayInRiyadh());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useAttendanceDay(day, canPayroll);
  const total = useAttendanceDayTotal(day, canPayroll);
  const mark = useMarkAttendance();
  const clear = useClearAttendance();

  const today = todayInRiyadh();
  const isToday = day === today;

  const daily = useMemo(
    () => (rows.data ?? []).filter((r) => r.pay_kind === 'daily'),
    [rows.data],
  );
  const monthly = useMemo(
    () => (rows.data ?? []).filter((r) => r.pay_kind !== 'daily'),
    [rows.data],
  );

  if (!canPayroll) {
    return (
      <Screen>
        <Header title="Attendance" back />
        <Banner tone="error" message="You have not been given the wages to look after." />
      </Screen>
    );
  }

  const say = (row: AttendanceRow, present: boolean) => {
    setError(null);
    setBusy(row.person_id);
    // Pressing the answer that is already given takes it back off, so a
    // wrong tap costs one more tap and not a trip to somebody else.
    const undo = row.present === present;
    const done = {
      onError: (err: unknown) => setError(errorMessage(err)),
      onSettled: () => setBusy(null),
    };
    if (undo) clear.mutate({ personId: row.person_id, day }, done);
    else mark.mutate({ personId: row.person_id, day, present }, done);
  };

  const markRest = (present: boolean) => {
    setError(null);
    const waiting = (rows.data ?? []).filter((r) => r.present === null);
    for (const row of waiting) {
      mark.mutate(
        { personId: row.person_id, day, present },
        { onError: (err) => setError(errorMessage(err)) },
      );
    }
  };

  const t = total.data;
  const waiting = t?.not_marked ?? 0;

  return (
    <Screen>
      <Header title="Attendance" subtitle="Who turned up, and what the day costs" back />

      {/* --------------------------------------------------- the day */}
      <View style={styles.dayRow}>
        <Pressable
          onPress={() => setDay(shiftDay(day, -1))}
          accessibilityRole="button"
          accessibilityLabel="The day before"
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </Pressable>

        <View style={styles.dayName}>
          <Txt variant="subtitle" weight="bold">
            {formatDate(day)}
          </Txt>
          <Txt variant="caption" color={colors.textFaint}>
            {isToday ? 'Today' : ''}
          </Txt>
        </View>

        <Pressable
          onPress={() => setDay(shiftDay(day, 1))}
          disabled={isToday}
          accessibilityRole="button"
          accessibilityLabel="The day after"
          style={({ pressed }) => [
            styles.arrow,
            isToday && styles.arrowOff,
            pressed && !isToday && styles.arrowPressed,
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.navy} />
        </Pressable>
      </View>

      {!isToday ? (
        <Button label="Back to today" variant="ghost" onPress={() => setDay(today)} />
      ) : null}

      <DateField label="Or pick a day" value={day} onChange={setDay} />

      {/* ------------------------------------------------- the figures */}
      <View style={[styles.tiles, shadow.card]}>
        <Tile label="Present" value={String(t?.present ?? 0)} tone={colors.green} />
        <Tile label="Absent" value={String(t?.absent ?? 0)} tone={colors.red} />
        <Tile label="Not said" value={String(waiting)} tone={colors.textFaint} />
        <Tile
          label={t?.is_friday ? "Day's wages & bonuses" : "Day's wages"}
          value={money(Number(t?.wages ?? 0))}
          tone={colors.navy}
          wide
        />
      </View>

      {t?.is_friday ? (
        <View style={styles.friday}>
          <Ionicons name="star" size={16} color={colors.amberDark} />
          <Txt variant="caption" color={colors.amberDark} style={styles.flex}>
            <Txt variant="caption" weight="bold" color={colors.amberDark}>
              Friday.
            </Txt>{' '}
            It is the day off, so a monthly man marked present today earns his bonus on top of
            his wage. A daily man earns his day, as he would any other.
          </Txt>
        </View>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}

      {waiting > 0 ? (
        <View style={styles.restRow}>
          <Button
            label={`Mark the other ${waiting} present`}
            icon="checkmark-done-outline"
            variant="success"
            onPress={() => markRest(true)}
            style={styles.restButton}
          />
          <Button
            label="All absent"
            icon="close-outline"
            variant="outline"
            onPress={() => markRest(false)}
            style={styles.restButton}
          />
        </View>
      ) : null}

      {/* -------------------------------------------------- the people */}
      {rows.isLoading ? (
        <Loading />
      ) : rows.error ? (
        <Banner tone="error" message={rows.error.message} />
      ) : (rows.data ?? []).length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Nobody is on the payroll"
          message="Put somebody on salary first, and his days will be asked for here."
        />
      ) : (
        <>
          {daily.length > 0 ? (
            <>
              <SectionTitle title="Daily wage" />
              <View style={styles.list}>
                {daily.map((row) => (
                  <PersonRow
                    key={row.person_id}
                    row={row}
                    busy={busy === row.person_id}
                    onSay={(present) => say(row, present)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {monthly.length > 0 ? (
            <>
              <SectionTitle title="Monthly staff" />
              <Txt variant="caption" color={colors.textFaint} style={styles.hint}>
                {t?.is_friday
                  ? 'Today is a Friday, so whoever comes in earns his bonus on top of his wage.'
                  : 'Kept for the record. What they are paid does not change either way.'}
              </Txt>
              <View style={styles.list}>
                {monthly.map((row) => (
                  <PersonRow
                    key={row.person_id}
                    row={row}
                    busy={busy === row.person_id}
                    onSay={(present) => say(row, present)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Tile({
  label,
  value,
  tone,
  wide = false,
}: {
  label: string;
  value: string;
  tone: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.tile, wide && styles.tileWide]}>
      <Txt variant="label" color={colors.textMuted}>
        {label.toUpperCase()}
      </Txt>
      <Txt variant="subtitle" weight="bold" color={tone} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

/**
 * One man, and the two answers.
 *
 * The answer already given is filled in, so a glance down the list says
 * who is still waiting on somebody. Pressing it again takes it back.
 */
function PersonRow({
  row,
  busy,
  onSay,
}: {
  row: AttendanceRow;
  busy: boolean;
  onSay: (present: boolean) => void;
}) {
  const rate = Number(row.daily_rate ?? 0);
  const worth = Number(row.day_worth ?? 0);

  return (
    <View style={[styles.person, shadow.card, row.present === null && styles.personWaiting]}>
      <View style={styles.who}>
        <Avatar name={row.full_name} size={38} />
        <View style={styles.flex}>
          <View style={styles.nameLine}>
            <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
              {row.full_name}
            </Txt>
            {row.present === null ? (
              <Badge label="Not said" tone="grey" style={styles.badgeMid} />
            ) : null}
          </View>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {row.job_title ? `${row.job_title} · ` : ''}
            {row.pay_kind === 'daily' ? `${money(rate)} a day` : 'Monthly'}
          </Txt>
          {worth > 0 ? (
            <View style={styles.worthRow}>
              <Ionicons
                name={row.pay_kind === 'daily' ? 'cash-outline' : 'star'}
                size={12}
                color={row.present ? colors.green : colors.textFaint}
              />
              <Txt
                variant="caption"
                weight="semibold"
                color={row.present ? colors.green : colors.textFaint}
              >
                {row.present
                  ? `${money(worth)} earned`
                  : row.pay_kind === 'daily'
                    ? `${money(worth)} if present`
                    : `${money(worth)} bonus if present`}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.answers}>
        <Answer
          icon="checkmark"
          label="Present"
          tone={colors.green}
          chosen={row.present === true}
          busy={busy}
          onPress={() => onSay(true)}
        />
        <Answer
          icon="close"
          label="Absent"
          tone={colors.red}
          chosen={row.present === false}
          busy={busy}
          onPress={() => onSay(false)}
        />
      </View>
    </View>
  );
}

function Answer({
  icon,
  label,
  tone,
  chosen,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: string;
  chosen: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.answer,
        { borderColor: tone },
        chosen && { backgroundColor: tone, borderColor: tone },
        pressed && !chosen && { backgroundColor: `${tone}16` },
        busy && styles.answerBusy,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={chosen ? colors.white : tone} />
      ) : (
        <Ionicons name={icon} size={17} color={chosen ? colors.white : tone} />
      )}
      <Txt variant="caption" weight="bold" color={chosen ? colors.white : tone}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
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
  dayName: { flex: 1, alignItems: 'center', gap: 1 },

  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    backgroundColor: colors.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    gap: 2,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.card,
  },
  tileWide: { flexBasis: '100%' },

  restRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  restButton: { flexGrow: 1, flexBasis: '44%' },

  hint: { marginTop: -4, marginBottom: 8 },
  friday: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  worthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  list: { gap: 9, marginBottom: 6 },

  person: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
  },
  // A day nobody has answered for should catch the eye, because the
  // month is wrong until somebody does.
  personWaiting: { borderColor: colors.amberSoft, borderWidth: 1.5 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeMid: { alignSelf: 'center' },

  answers: { flexDirection: 'row', gap: 8 },
  answer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.card,
  },
  answerBusy: { opacity: 0.6 },
});
