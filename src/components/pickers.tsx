import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import { Avatar, Badge, useBackdrop } from '@/components/Bits';
import { Txt } from '@/components/Txt';
import { formatDate, TIME_ZONE, todayInRiyadh } from '@/lib/format';
import { colors, fonts, inputFontSize, radius, shadow } from '@/theme';
import type { Category, PersonName } from '@/types';

/**
 * The browser draws its own ring round a focused input. These fields
 * already show focus by turning their border navy, so the ring is only
 * noise on top of it.
 */
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

// ================================================================ money
export function AmountField({
  value,
  onChangeText,
  label = 'Amount',
  error,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  label?: string;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  const clean = (raw: string) => {
    let v = raw.replace(/[^\d.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot >= 0) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
      const [whole, dec = ''] = v.split('.');
      v = `${whole.slice(0, 9)}.${dec.slice(0, 2)}`;
    } else {
      v = v.slice(0, 9);
    }
    onChangeText(v);
  };

  return (
    <View style={styles.group}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <View
        style={[styles.amountBox, focused && styles.amountBoxFocused, !!error && styles.boxError]}
      >
        <Txt weight="semibold" color={colors.textMuted} style={styles.sar}>
          SAR
        </Txt>
        <TextInput
          value={value}
          onChangeText={clean}
          placeholder="0.00"
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.amountInput, noOutline]}
          accessibilityLabel={label}
        />
      </View>
      {error ? (
        <Txt variant="caption" color={colors.red}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

// ================================================================= date
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function shiftDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A plain month grid. Written by hand so the bill date looks and behaves
 * exactly the same on Android, iPhone and the web, and so a date in the
 * future simply cannot be tapped.
 */
export function DateField({
  value,
  onChange,
  label = 'Bill date',
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const backdrop = useBackdrop('center');
  const today = todayInRiyadh();
  const yesterday = shiftDays(today, -1);

  // The value can still be empty while a saved entry is loading, so the
  // calendar always falls back to today rather than doing arithmetic on
  // a date that is not there yet.
  const safeValue = isIsoDate(value) ? value : today;

  const [cursor, setCursor] = useState(() => {
    const [y, m] = safeValue.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const startWeekday = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    if (!Number.isFinite(startWeekday) || !Number.isFinite(daysInMonth)) return [];
    const cells: (number | null)[] = Array(startWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const quick = (iso: string, text: string) => {
    const active = safeValue === iso;
    return (
      <Pressable
        key={text}
        onPress={() => onChange(iso)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.quick,
          active && styles.quickOn,
          pressed && !active && styles.quickPressed,
        ]}
      >
        <Txt
          variant="caption"
          weight="semibold"
          color={active ? colors.white : colors.navy}
        >
          {text}
        </Txt>
      </Pressable>
    );
  };

  return (
    <View style={styles.group}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>

      <View style={styles.dateRow}>
        {quick(today, 'Today')}
        {quick(yesterday, 'Yesterday')}
        <Pressable
          onPress={() => {
            const [y, m] = safeValue.split('-').map(Number);
            setCursor({ year: y, month: m - 1 });
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Pick a date"
          style={({ pressed }) => [
            styles.dateBtn,
            safeValue !== today && safeValue !== yesterday && styles.dateBtnOn,
            pressed && styles.quickPressed,
          ]}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.navy} />
          <Txt variant="caption" weight="semibold" color={colors.navy}>
            {safeValue !== today && safeValue !== yesterday ? formatDate(safeValue) : 'Pick a date'}
          </Txt>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.calendar, shadow.raised]} onPress={() => {}}>
            <View style={styles.calHead}>
              <Pressable
                onPress={() =>
                  setCursor((c) =>
                    c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 },
                  )
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.calArrow}
              >
                <Ionicons name="chevron-back" size={20} color={colors.navy} />
              </Pressable>

              <Txt variant="heading">
                {MONTHS[cursor.month]} {cursor.year}
              </Txt>

              <Pressable
                onPress={() =>
                  setCursor((c) =>
                    c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 },
                  )
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={styles.calArrow}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.navy} />
              </Pressable>
            </View>

            <View style={styles.calWeek}>
              {WEEKDAYS.map((d, i) => (
                <Txt key={i} variant="label" color={colors.textFaint} center style={styles.calCell}>
                  {d}
                </Txt>
              ))}
            </View>

            <View style={styles.calGrid}>
              {grid.map((day, i) => {
                if (day === null) return <View key={`e${i}`} style={styles.calCell} />;
                const iso = ymd(cursor.year, cursor.month, day);
                const future = iso > today;
                const selected = iso === safeValue;
                return (
                  <Pressable
                    key={iso}
                    disabled={future}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={formatDate(iso)}
                    style={styles.calCell}
                  >
                    <View style={[styles.calDay, selected && styles.calDayOn]}>
                      <Txt
                        variant="subtitle"
                        weight={selected ? 'bold' : 'regular'}
                        color={
                          future ? colors.textFaint : selected ? colors.white : colors.text
                        }
                      >
                        {day}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Txt variant="caption" color={colors.textFaint} center>
              A bill cannot be dated in the future. Times are {TIME_ZONE.split('/')[1]}.
            </Txt>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// =============================================================== people
export function PersonField({
  label,
  value,
  people,
  onChange,
  helper,
  excludeId,
  meId,
  error,
  placeholder = 'Choose a person',
}: {
  label: string;
  value: string | null;
  people: PersonName[];
  onChange: (id: string) => void;
  helper?: string;
  excludeId?: string | null;
  meId?: string | null;
  error?: string | null;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const backdrop = useBackdrop('bottom');

  const choices = useMemo(
    () =>
      people
        .filter((p) => p.id !== excludeId)
        .filter((p) =>
          search.trim() ? p.full_name.toLowerCase().includes(search.trim().toLowerCase()) : true,
        ),
    [people, excludeId, search],
  );

  const selected = people.find((p) => p.id === value) ?? null;

  return (
    <View style={styles.group}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>

      <Pressable
        onPress={() => {
          setSearch('');
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.personBox,
          !!error && styles.boxError,
          pressed && styles.quickPressed,
        ]}
      >
        {selected ? (
          <>
            <Avatar name={selected.full_name} size={34} />
            <View style={styles.flex}>
              <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                {selected.full_name}
              </Txt>
            </View>
            {selected.id === meId ? (
              <Badge label="You" tone="blue" style={styles.midBadge} />
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.personEmpty}>
              <Ionicons name="person-outline" size={18} color={colors.textFaint} />
            </View>
            <Txt variant="subtitle" color={colors.textFaint} style={styles.flex}>
              {placeholder}
            </Txt>
          </>
        )}
        <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
      </Pressable>

      {error ? (
        <Txt variant="caption" color={colors.red}>
          {error}
        </Txt>
      ) : helper ? (
        <Txt variant="caption" color={colors.textFaint}>
          {helper}
        </Txt>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={backdrop}>
          <View style={[styles.sheet, shadow.raised]}>
            <View style={styles.sheetHead}>
              <Txt variant="heading">{label}</Txt>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textFaint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search a name"
                placeholderTextColor={colors.textFaint}
                style={[styles.searchInput, noOutline]}
                autoCapitalize="none"
              />
            </View>

            <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
              {choices.length === 0 ? (
                <Txt variant="caption" color={colors.textFaint} center style={styles.sheetEmpty}>
                  Nobody matches that name.
                </Txt>
              ) : (
                choices.map((p) => {
                  const active = p.id === value;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={p.full_name}
                      style={({ pressed }) => [
                        styles.personRow,
                        pressed && styles.quickPressed,
                      ]}
                    >
                      <Avatar name={p.full_name} size={38} />
                      <Txt variant="subtitle" weight="semibold" style={styles.flex} numberOfLines={1}>
                        {p.full_name}
                      </Txt>
                      {p.id === meId ? (
                        <Badge label="You" tone="blue" style={styles.midBadge} />
                      ) : null}
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// =========================================================== categories
export function CategoryField({
  categories,
  value,
  onChange,
  error,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string) => void;
  error?: string | null;
}) {
  return (
    <View style={styles.group}>
      <Txt variant="label" color={colors.textMuted}>
        What was it for?
      </Txt>
      <View style={styles.catGrid}>
        {categories.map((c) => {
          const active = c.id === value;
          return (
            <Pressable
              key={c.id}
              onPress={() => onChange(c.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={c.name}
              style={({ pressed }) => [
                styles.cat,
                active && styles.catOn,
                pressed && !active && styles.quickPressed,
              ]}
            >
              <Ionicons
                name={(c.icon as keyof typeof Ionicons.glyphMap) ?? 'pricetag-outline'}
                size={22}
                color={active ? colors.white : colors.navy}
              />
              <Txt
                variant="caption"
                weight="semibold"
                center
                color={active ? colors.white : colors.navy}
                numberOfLines={2}
              >
                {c.name}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Txt variant="caption" color={colors.red}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: 7 },
  boxError: { borderColor: colors.red, backgroundColor: colors.redSoft },

  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    height: 68,
  },
  amountBoxFocused: { borderColor: colors.navy },
  sar: { fontSize: 17 },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 30,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: -0.5,
    paddingVertical: 0,
  },

  dateRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quick: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  quickPressed: { backgroundColor: colors.navyTint },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    flexGrow: 1,
    justifyContent: 'center',
  },
  dateBtnOn: { borderColor: colors.navy, backgroundColor: colors.navyTint },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 22, 40, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  calendar: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 16,
    gap: 10,
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navyTint,
  },
  calWeek: { flexDirection: 'row' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  calDay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayOn: { backgroundColor: colors.navy },

  // These rows line up through the middle, so the badge does too.
  midBadge: { alignSelf: 'center' },
  personBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
  },
  personEmpty: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(11, 22, 40, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '82%',
    gap: 12,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetList: { maxHeight: 420 },
  sheetEmpty: { paddingVertical: 28 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: inputFontSize,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    flexGrow: 1,
    flexBasis: 94,
    minHeight: 80,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  catOn: { backgroundColor: colors.navy, borderColor: colors.navy },
});
