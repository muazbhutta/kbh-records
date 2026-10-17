import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/Bits';
import { Txt } from '@/components/Txt';
import { colors, radius } from '@/theme';
import {
  EXPENSE_KIND_LABEL,
  FLAG_LABEL,
  TYPE_SOURCE_LABEL,
  type BillScanState,
  type ExpenseKind,
  type TypeChoice,
  type TypeSource,
} from '@/types';

/**
 * How long a bill may sit saying it is being looked at. After this the
 * tag stops spinning and says plainly that nobody checked it, which is
 * the truth whenever the bill reader is switched off.
 */
const STILL_CHECKING_MS = 10 * 60 * 1000;

/**
 * The small tag that follows an expense everywhere: Invoice is navy,
 * Petty is amber, and the bracket says who decided.
 */
export function TypeTag({
  type,
  source,
  scanState,
  enteredAt,
  small = false,
}: {
  type: ExpenseKind | null | undefined;
  source?: TypeSource | null;
  scanState?: BillScanState | null;
  /** When the expense was saved, so a stuck check can own up to it. */
  enteredAt?: string | null;
  small?: boolean;
}) {
  const started = enteredAt ? Date.parse(enteredAt) : Number.NaN;
  const stillWorking =
    scanState === 'pending' &&
    (!Number.isFinite(started) || Date.now() - started < STILL_CHECKING_MS);

  if (stillWorking) {
    return (
      <View style={[styles.tag, styles.tagChecking, small && styles.tagSmall]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Txt variant="label" color={colors.textMuted}>
          Checking bill...
        </Txt>
      </View>
    );
  }

  if (!type) return null;

  // Nobody ever got to this bill, so say so rather than show a tick that
  // was never earned.
  const unchecked = scanState === 'pending' || scanState === 'failed';
  const invoice = type === 'invoice';
  const label = unchecked
    ? `${EXPENSE_KIND_LABEL[type]} (not checked)`
    : source
      ? `${EXPENSE_KIND_LABEL[type]} (${TYPE_SOURCE_LABEL[source]})`
      : EXPENSE_KIND_LABEL[type];

  return (
    <View
      style={[
        styles.tag,
        small && styles.tagSmall,
        { backgroundColor: invoice ? colors.navyTint : colors.amberSoft },
      ]}
    >
      <Ionicons
        name={unchecked ? 'help-circle-outline' : invoice ? 'document-text' : 'cash-outline'}
        size={small ? 11 : 12}
        color={invoice ? colors.navy : colors.amberDark}
      />
      <Txt variant="label" color={invoice ? colors.navy : colors.amberDark}>
        {label}
      </Txt>
    </View>
  );
}

/** The flags an Admin should look at, as small chips. */
export function TypeFlags({ flags }: { flags: string[] | null | undefined }) {
  const list = (flags ?? []).filter((f) => FLAG_LABEL[f]);
  if (list.length === 0) return null;

  return (
    <View style={styles.flags}>
      {list.map((flag) => (
        <Badge
          key={flag}
          label={FLAG_LABEL[flag]}
          tone={flag === 'type_changed' ? 'grey' : 'amber'}
          icon={flag === 'suspected_duplicate' ? 'copy-outline' : 'warning-outline'}
        />
      ))}
    </View>
  );
}

/**
 * Auto · Petty · Invoice. Auto is picked for them, so most people never
 * have to touch this row at all.
 */
export function TypeChoiceRow({
  value,
  onChange,
}: {
  value: TypeChoice;
  onChange: (v: TypeChoice) => void;
}) {
  const options: { key: TypeChoice; label: string; hint: string }[] = [
    { key: 'auto', label: 'Auto', hint: 'Let the bill decide' },
    { key: 'petty', label: 'Petty', hint: 'Small cash bill' },
    { key: 'invoice', label: 'Invoice', hint: 'Proper VAT bill' },
  ];

  return (
    <View style={styles.choiceWrap}>
      <Txt variant="label" color={colors.textMuted}>
        BILL TYPE
      </Txt>
      <View style={styles.choices}>
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onChange(opt.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${opt.label}, ${opt.hint}`}
              style={({ pressed }) => [
                styles.choice,
                active && styles.choiceOn,
                pressed && !active && styles.choicePressed,
              ]}
            >
              <Txt
                variant="subtitle"
                weight="semibold"
                color={active ? colors.white : colors.navy}
              >
                {opt.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt variant="caption" color={colors.textFaint}>
        {value === 'auto'
          ? 'The app reads the bill and decides. Leave it on Auto unless you are sure.'
          : value === 'petty'
            ? 'Saved as Petty. If the bill turns out to be a VAT invoice, an Admin is told.'
            : 'Saved as Invoice. If the bill has no VAT on it, an Admin is told.'}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  tagSmall: { paddingHorizontal: 7, paddingVertical: 3, gap: 4 },
  tagChecking: { backgroundColor: '#EDF1F6' },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choiceWrap: { gap: 8 },
  choices: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  choicePressed: { backgroundColor: colors.navyTint },
});
