import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, DetailRow, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { AmountField } from '@/components/pickers';
import { Txt } from '@/components/Txt';
import { useRecordCashCheck } from '@/api/control';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';
import { CHECK_META, type CashCheck, type CheckSummary } from '@/types';

/** The coloured Matched / Short / Extra chip. */
export function CheckResultBadge({
  result,
  difference,
}: {
  result: 'short' | 'extra' | 'matched';
  difference?: number;
}) {
  const meta = CHECK_META[result];
  const label =
    result === 'matched'
      ? 'Matched'
      : `${meta.label}: ${money(Math.abs(Number(difference ?? 0)))}`;
  return <Badge label={label} tone={meta.tone} />;
}

/** One line in a person's Cash Check history. */
export function CashCheckRow({
  check,
  onDelete,
  canDelete,
  last,
}: {
  check: CashCheck;
  onDelete?: () => void;
  canDelete?: boolean;
  last?: boolean;
}) {
  const meta = CHECK_META[check.result];
  const tone =
    meta.tone === 'green' ? colors.green : meta.tone === 'red' ? colors.red : colors.amberDark;

  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.rowIcon, { backgroundColor: `${tone}14` }]}>
        <Ionicons
          name={
            check.result === 'matched'
              ? 'checkmark-circle'
              : check.result === 'short'
                ? 'trending-down'
                : 'trending-up'
          }
          size={18}
          color={tone}
        />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <CheckResultBadge result={check.result} difference={check.difference} />
        </View>
        <Txt variant="caption" color={colors.textMuted}>
          Expected {money(Number(check.expected))} · counted {money(Number(check.counted))}
        </Txt>
        {check.note ? (
          <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
            {check.note}
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textFaint}>
          {check.checked_by_name ?? 'Someone'} · {formatDateTime(check.checked_at)}
        </Txt>
      </View>

      {canDelete && onDelete ? (
        <Pressable
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove this Cash Check"
          style={({ pressed }) => [styles.del, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={17} color={colors.red} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** "4 checks · 2 short · total short SAR 130" */
export function CheckSummaryLine({ summary }: { summary: CheckSummary | null | undefined }) {
  if (!summary || summary.check_count === 0) {
    return (
      <Txt variant="caption" color={colors.textFaint}>
        Never counted
      </Txt>
    );
  }
  const bits = [`${summary.check_count} ${summary.check_count === 1 ? 'check' : 'checks'}`];
  if (summary.short_count > 0) bits.push(`${summary.short_count} short`);
  if (Number(summary.total_short) > 0) {
    bits.push(`total short ${money(Number(summary.total_short))}`);
  }
  return (
    <Txt variant="caption" color={summary.short_count > 0 ? colors.red : colors.textMuted}>
      {bits.join(' · ')}
    </Txt>
  );
}

/**
 * Counting someone's real cash. The expected figure is never sent from
 * the phone: the server reads it at the moment the check is saved.
 */
export function CashCheckModal({
  visible,
  personId,
  personName,
  expected,
  onClose,
}: {
  visible: boolean;
  personId: string;
  personName: string;
  expected: number;
  onClose: (saved?: boolean) => void;
}) {
  const record = useRecordCashCheck();
  const backdrop = useBackdrop('center');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { counted: number; difference: number }>(null);

  useEffect(() => {
    if (!visible) return;
    setCounted('');
    setNote('');
    setError(null);
    setDone(null);
  }, [visible]);

  const value = Number(counted);
  const valid = counted !== '' && Number.isFinite(value) && value >= 0;
  const preview = valid ? value - expected : 0;

  const save = async () => {
    setError(null);
    if (!valid) return setError('Enter the amount you counted.');
    try {
      await record.mutateAsync({ personId, counted: value, note: note.trim() || undefined });
      setDone({ counted: value, difference: value - expected });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const result = preview < 0 ? 'short' : preview > 0 ? 'extra' : 'matched';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onClose()}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          {done ? (
            <>
              <View style={styles.doneHead}>
                <View
                  style={[
                    styles.doneIcon,
                    {
                      backgroundColor:
                        done.difference === 0
                          ? colors.greenSoft
                          : done.difference < 0
                            ? colors.redSoft
                            : colors.amberSoft,
                    },
                  ]}
                >
                  <Ionicons
                    name={done.difference === 0 ? 'checkmark-circle' : 'alert-circle'}
                    size={28}
                    color={
                      done.difference === 0
                        ? colors.green
                        : done.difference < 0
                          ? colors.red
                          : colors.amberDark
                    }
                  />
                </View>
                <Txt variant="title" center>
                  {done.difference === 0
                    ? 'Matched'
                    : done.difference < 0
                      ? `Short: ${money(Math.abs(done.difference))}`
                      : `Extra: ${money(done.difference)}`}
                </Txt>
                <Txt variant="caption" color={colors.textMuted} center>
                  {done.difference === 0
                    ? `${personName} is holding exactly what the khata says.`
                    : done.difference < 0
                      ? `${personName} is holding less than the khata says.`
                      : `${personName} is holding more than the khata says, so an entry may be missing.`}
                </Txt>
              </View>

              <Card padded={false} style={styles.doneCard}>
                <DetailRow label="Expected" value={money(expected)} />
                <DetailRow label="Counted" value={money(done.counted)} />
                <DetailRow
                  label="Difference"
                  value={money(done.difference)}
                  valueColor={
                    done.difference === 0
                      ? colors.green
                      : done.difference < 0
                        ? colors.red
                        : colors.amberDark
                  }
                  last
                />
              </Card>

              <Banner
                tone="info"
                message="This is only a record. It does not change the balance. To settle a difference, add a normal entry with a note."
              />

              <Button label="Done" icon="checkmark" size="lg" full onPress={() => onClose(true)} />
            </>
          ) : (
            <>
              <View style={styles.head}>
                <Txt variant="heading">Cash Check · {personName}</Txt>
                <Pressable
                  onPress={() => onClose()}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.expected}>
                <Txt variant="label" color={colors.textMuted} style={styles.upper}>
                  Should be holding
                </Txt>
                <Money amount={expected} size="lg" tone="plain" />
              </View>

              <Txt variant="caption" color={colors.textMuted}>
                Count the cash in {personName}&apos;s hand and type the real amount.
              </Txt>

              <AmountField
                label="Amount counted"
                value={counted}
                onChangeText={(v) => {
                  setCounted(v);
                  setError(null);
                }}
                autoFocus
              />

              {valid && preview !== 0 ? (
                <Banner
                  tone={preview < 0 ? 'error' : 'warn'}
                  message={
                    preview < 0
                      ? `Short: ${money(Math.abs(preview))}`
                      : `Extra: ${money(preview)} — an entry may be missing.`
                  }
                />
              ) : valid ? (
                <Banner tone="success" message="Matched. The count agrees with the khata." />
              ) : null}

              <Field
                label="Note (optional)"
                value={note}
                onChangeText={(v) => setNote(v.slice(0, 300))}
                placeholder="Counted at the site office"
                icon="chatbox-ellipses-outline"
              />

              {error ? <Banner tone="error" message={error} /> : null}

              <Button
                label="Save Cash Check"
                icon="checkmark-circle"
                size="lg"
                full
                loading={record.isPending}
                onPress={save}
              />
              <Button label="Cancel" variant="ghost" full onPress={() => onClose()} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  upper: { textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 3, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  del: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.redSoft },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 22, 40, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 20,
    gap: 13,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  expected: {
    backgroundColor: colors.navyTint,
    borderRadius: radius.md,
    padding: 14,
    gap: 2,
  },
  doneHead: { alignItems: 'center', gap: 6 },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  doneCard: { paddingHorizontal: 16 },
});
