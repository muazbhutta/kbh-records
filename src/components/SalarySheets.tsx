import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Banner, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PayMethodRow } from '@/components/PayMethodRow';
import { AmountField, DateField, PersonField } from '@/components/pickers';
import { Txt } from '@/components/Txt';
import {
  useAddSalaryPerson,
  useRecordSalary,
  useRemoveFromPayroll,
  useRemoveSalaryPayment,
  useSalaryCandidates,
  useSetPayroll,
} from '@/api/salaries';
import { errorMessage } from '@/lib/supabase';
import { money, monthName, todayInRiyadh } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type {
  PayKind,
  PayMethod,
  PersonName,
  SalaryCandidate,
  SalaryLine,
  SalaryPayment,
} from '@/types';

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
  const { height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        {/*
          The panel is as tall as it needs to be, up to most of the
          screen, and then it scrolls. Adding a new man opened a panel
          taller than a phone and the button at the foot of it could
          not be reached at all - worse with the keyboard up, which is
          exactly when it is being used.
        */}
        <View style={[styles.sheet, { maxHeight: height * 0.86 }, shadow.raised]}>
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
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
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
  existing,
  onClose,
}: {
  existing?: SalaryLine;
  onClose: () => void;
}) {
  const set = useSetPayroll();
  const candidates = useSalaryCandidates(!existing);
  const [personId, setPersonId] = useState<string | null>(existing?.person_id ?? null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState(() => {
    if (!existing) return '';
    const held =
      existing.pay_kind === 'daily' ? existing.daily_rate : existing.monthly_amount;
    return held > 0 ? String(held) : '';
  });
  const [payKind, setPayKind] = useState<PayKind>(existing?.pay_kind ?? 'monthly');
  const [since, setSince] = useState(todayInRiyadh());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) setPersonId(existing.person_id);
  }, [existing]);

  const value = Number(amount);

  const save = async () => {
    if (!personId) return setError('Choose who this is for.');
    if (!Number.isFinite(value) || value <= 0) {
      return setError(
        payKind === 'daily'
          ? 'Enter a daily wage bigger than zero.'
          : 'Enter a monthly salary bigger than zero.',
      );
    }
    setError(null);
    // One of the app's people carries his account id, not a roster id,
    // until the database writes him onto the roster.
    const chosen = (candidates.data ?? []).find((c) => c.id === personId);
    const asUser = !existing && chosen?.kind === 'user';
    try {
      await set.mutateAsync({
        personId: asUser ? null : personId,
        userId: asUser ? personId : null,
        amount: value,
        payKind,
        since,
      });
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
        adding ? (
          <NewSalaryPersonBox
            onAdded={(id) => {
              setPersonId(id);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <>
            <PersonField
              label="Who"
              value={personId}
              people={asPersonNames(candidates.data)}
              onChange={setPersonId}
            />
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Add somebody new"
              style={({ pressed }) => [styles.addNew, pressed && styles.addNewPressed]}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.navy} />
              <Txt variant="caption" weight="semibold" color={colors.navy}>
                Not on the list? Add him here
              </Txt>
            </Pressable>
          </>
        )
      ) : null}

      {/*
        Which sort of man this is. It decides what the figure below
        means, so it is asked above it rather than after.
      */}
      <Txt variant="label" color={colors.textMuted}>
        HOW IS HE PAID?
      </Txt>
      <View style={styles.kindRow}>
        <KindChoice
          icon="calendar-outline"
          label="Monthly"
          hint="A fixed wage"
          chosen={payKind === 'monthly'}
          onPress={() => setPayKind('monthly')}
        />
        <KindChoice
          icon="today-outline"
          label="Daily"
          hint="Paid per day"
          chosen={payKind === 'daily'}
          onPress={() => setPayKind('daily')}
        />
      </View>

      <AmountField
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setError(null);
        }}
      />
      <Txt variant="caption" color={colors.textMuted}>
        {payKind === 'daily'
          ? "One day's wage. What he earns is this times the days he turns up, and attendance is where those days are marked."
          : "A month's salary. What is already paid for past months does not change."}
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

/**
 * A new man on the payroll, written down here.
 *
 * Men change from month to month on a site, and most of them never
 * touch the app: a mazdoor needs no mobile number, no PIN and no login
 * he will never use. A name and a trade is the whole of what the
 * payroll knows about him, and he stays inside it - he is in no picker
 * and on no screen anywhere else.
 *
 * Somebody who does need an account is added in Settings, as before,
 * and then shows up in the list above this.
 */
function NewSalaryPersonBox({
  onAdded,
  onCancel,
}: {
  onAdded: (personId: string) => void;
  onCancel: () => void;
}) {
  const add = useAddSalaryPerson();
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    if (name.trim().length < 2) return setError('Enter his name.');
    setError(null);
    try {
      const person = await add.mutateAsync({
        name: name.trim(),
        jobTitle: jobTitle.trim() || undefined,
      });
      onAdded(person.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <View style={styles.newBox}>
      <View style={styles.newHead}>
        <Txt variant="label" color={colors.textMuted}>
          SOMEBODY NEW
        </Txt>
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
          <Ionicons name="close" size={17} color={colors.textMuted} />
        </Pressable>
      </View>

      <Field
        label="Name"
        value={name}
        onChangeText={(v) => setName(v.slice(0, 80))}
        placeholder="Full name"
        icon="person-outline"
      />
      <Field
        label="Work (optional)"
        value={jobTitle}
        onChangeText={(v) => setJobTitle(v.slice(0, 60))}
        placeholder="Mason, driver, foreman"
        icon="hammer-outline"
      />

      <Txt variant="caption" color={colors.textFaint}>
        He goes on the payroll only. No login, and no name added anywhere else
        in the app.
      </Txt>

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Add him"
        icon="person-add-outline"
        full
        loading={add.isPending}
        onPress={go}
      />
    </View>
  );
}

/** Monthly or daily: the one choice that decides what the figure means. */
function KindChoice({
  icon,
  label,
  hint,
  chosen,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  chosen: boolean;
  onPress: () => void;
}) {
  const tone = chosen ? colors.navy : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      style={({ pressed }) => [
        styles.kind,
        chosen && styles.kindOn,
        pressed && !chosen && styles.kindPressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={tone} />
      <Txt variant="caption" weight="bold" color={tone}>
        {label}
      </Txt>
      <Txt variant="caption" color={chosen ? colors.navy : colors.textFaint}>
        {hint}
      </Txt>
    </Pressable>
  );
}

/**
 * The picker speaks in app people, so lend the roster that shape. None
 * of the flags below mean anything on a payroll; it only draws names.
 */
function asPersonNames(rows: SalaryCandidate[] | undefined): PersonName[] {
  return (rows ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    is_active: true,
    is_owner: false,
    is_head: false,
    head_id: null,
  }));
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
            : 'Nothing stands against him this month, so he comes off the list. If nothing was ever handed over, his name goes with him.'}
        </Txt>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Yes, take him off"
        icon="person-remove-outline"
        variant="danger"
        size="lg"
        full
        loading={remove.isPending}
        onPress={go}
      />
      <Button label="Keep him on" variant="ghost" full onPress={onClose} />
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
  // The head stays put and the rest of the panel scrolls under it, so
  // the title and the close never go out of reach.
  body: { flexShrink: 1 },
  bodyInner: { gap: 12, paddingBottom: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1, gap: 2 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kind: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  kindOn: { borderColor: colors.navy, backgroundColor: colors.navyTint },
  kindPressed: { backgroundColor: colors.navyTint },

  newBox: {
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 12,
  },
  newHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.navyTint,
  },
  addNewPressed: { backgroundColor: colors.navyTint },
  note: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: 11,
  },
});

/**
 * Taking a payment back out.
 *
 * A figure typed wrong on payday is the one mistake this screen was
 * always going to see, and until now there was no way back from it.
 * Nothing is really deleted: the row stays with who took it out and
 * why, because money said to have changed hands and then unsaid is
 * exactly the sort of thing an office argues about later.
 */
export function RemovePaymentSheet({
  payment,
  onClose,
}: {
  payment: SalaryPayment;
  onClose: () => void;
}) {
  const remove = useRemoveSalaryPayment();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    try {
      await remove.mutateAsync({ id: payment.id, reason: reason.trim() || undefined });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet
      title="Take this out?"
      subtitle={`${payment.full_name} · ${payment.kind === 'advance' ? 'Advance' : 'Salary'} ${money(Number(payment.amount))}`}
      onClose={onClose}
    >
      <Txt variant="caption" color={colors.textMuted}>
        The month stops counting it, and what he is owed goes back up by{' '}
        {money(Number(payment.amount))}.
      </Txt>

      <Field
        label="Why (optional)"
        value={reason}
        onChangeText={(v) => setReason(v.slice(0, 200))}
        placeholder="Typed the wrong figure"
        icon="create-outline"
      />

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Yes, take it out"
        icon="trash-outline"
        variant="danger"
        size="lg"
        full
        loading={remove.isPending}
        onPress={go}
      />
      <Button label="Leave it" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}
