import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Banner, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PayMethodRow } from '@/components/PayMethodRow';
import { AmountField, DateField, PersonField } from '@/components/pickers';
import { Txt } from '@/components/Txt';
import {
  useRecordSalary,
  useRemoveFromPayroll,
  useSetPayroll,
} from '@/api/salaries';
import { errorMessage } from '@/lib/supabase';
import { money, monthName, todayInRiyadh } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type { PayMethod, PersonName, SalaryLine } from '@/types';

/**
 * The three things the office does on this screen: hand money over, put
 * somebody on the payroll, and take them off again.
 *
 * Each one asks for the day it happened rather than assuming today. A
 * salary handed over on the 28th and typed on the 2nd is a thing that
 * happens every month, and a month that quietly records the wrong one
 * is a month that will be argued about.
 */

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const backdrop = useBackdrop('center');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={[styles.sheet, shadow.raised]}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Txt variant="heading">{title}</Txt>
              {subtitle ? (
                <Txt variant="caption" color={colors.textMuted}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Handing salary or an advance over. */
export function PaySheet({
  line,
  month,
  kind,
  onClose,
}: {
  line: SalaryLine;
  month: string;
  kind: 'salary' | 'advance';
  onClose: () => void;
}) {
  const record = useRecordSalary();
  const advance = kind === 'advance';

  const [amount, setAmount] = useState(
    advance ? '' : line.remaining > 0 ? String(line.remaining) : '',
  );
  const [paidOn, setPaidOn] = useState(todayInRiyadh());
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const ok = Number.isFinite(value) && value > 0;

  const save = async () => {
    if (!ok) return setError('Enter an amount bigger than zero.');
    setError(null);
    try {
      await record.mutateAsync({
        personId: line.person_id,
        month,
        amount: value,
        kind,
        paidOn,
        method: method === 'transfer' ? 'transfer' : 'cash',
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet
      title={advance ? 'Advance' : 'Pay salary'}
      subtitle={`${line.full_name} · ${monthName(month)}`}
      onClose={onClose}
    >
      {advance ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={15} color={colors.blue} />
          <Txt variant="caption" color={colors.blue}>
            Money taken before payday. It counts against {monthName(month)}, so what is left
            goes down by the same amount.
          </Txt>
        </View>
      ) : line.remaining > 0 ? (
        <Txt variant="caption" color={colors.textMuted}>
          {money(line.remaining)} still owed for {monthName(month)}.
        </Txt>
      ) : (
        <View style={styles.note}>
          <Ionicons name="checkmark-circle-outline" size={15} color={colors.green} />
          <Txt variant="caption" color={colors.green}>
            {line.full_name} is fully paid for {monthName(month)}. Anything here is on top.
          </Txt>
        </View>
      )}

      <AmountField
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setError(null);
        }}
      />

      <DateField label="The day it was handed over" value={paidOn} onChange={setPaidOn} />

      <PayMethodRow value={method} onChange={setMethod} label="HOW WAS IT GIVEN?" />

      <Field
        label="Note (optional)"
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 300))}
        placeholder={advance ? 'Asked for it before Eid' : 'Short note'}
        icon="chatbox-ellipses-outline"
      />

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label={advance ? 'Record the advance' : 'Record the payment'}
        icon="checkmark"
        size="lg"
        full
        loading={record.isPending}
        onPress={save}
      />
      <Button label="Cancel" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/** Putting somebody on the payroll, or changing what they are on. */
export function PayrollSheet({
  people,
  existing,
  onClose,
}: {
  /** Everybody who could be put on. Already on the payroll is fine - it edits. */
  people: PersonName[];
  existing?: SalaryLine;
  onClose: () => void;
}) {
  const set = useSetPayroll();
  const [personId, setPersonId] = useState<string | null>(existing?.person_id ?? null);
  const [amount, setAmount] = useState(
    existing && existing.monthly_amount > 0 ? String(existing.monthly_amount) : '',
  );
  const [since, setSince] = useState(todayInRiyadh());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) setPersonId(existing.person_id);
  }, [existing]);

  const value = Number(amount);

  const save = async () => {
    if (!personId) return setError('Choose who this is for.');
    if (!Number.isFinite(value) || value <= 0) {
      return setError('Enter a monthly salary bigger than zero.');
    }
    setError(null);
    try {
      await set.mutateAsync({ personId, amount: value, since });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet
      title={existing ? 'Change this salary' : 'Put somebody on salary'}
      subtitle={existing?.full_name}
      onClose={onClose}
    >
      {!existing ? (
        <PersonField label="Who" value={personId} people={people} onChange={setPersonId} />
      ) : null}

      <AmountField
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setError(null);
        }}
      />
      <Txt variant="caption" color={colors.textMuted}>
        A month's salary. What is already paid for past months does not change.
      </Txt>

      <DateField label="From when" value={since} onChange={setSince} />

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label={existing ? 'Save' : 'Put on salary'}
        icon="checkmark"
        size="lg"
        full
        loading={set.isPending}
        onPress={save}
      />
      <Button label="Cancel" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/** Taking somebody off. */
export function RemoveFromPayrollSheet({
  line,
  onClose,
}: {
  line: SalaryLine;
  onClose: () => void;
}) {
  const remove = useRemoveFromPayroll();
  const [error, setError] = useState<string | null>(null);
  const paid = line.payments > 0;

  const go = async () => {
    setError(null);
    try {
      await remove.mutateAsync(line.person_id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet title="Take off the payroll?" subtitle={line.full_name} onClose={onClose}>
      <Txt variant="caption" color={colors.textMuted}>
        {line.full_name} stops drawing a salary from now on.
      </Txt>
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.blue} />
        <Txt variant="caption" color={colors.blue}>
          {paid
            ? 'What has already been paid stays exactly where it is. Those months have to keep saying what they said.'
            : 'Nothing has ever been paid, so there is nothing to keep.'}
        </Txt>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Yes, Take Them Off"
        icon="person-remove-outline"
        variant="danger"
        size="lg"
        full
        loading={remove.isPending}
        onPress={go}
      />
      <Button label="Keep Them On" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1, gap: 2 },
  note: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: 11,
  },
});
