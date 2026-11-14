import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Banner, useBackdropScroll } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PayMethodRow } from '@/components/PayMethodRow';
import { AmountField, DateField, PersonField } from '@/components/pickers';
import { Txt } from '@/components/Txt';
import {
  useAddSalaryPerson,
  useCameBack,
  useEditSalaryPayment,
  useGoOnLeave,
  useRecordSalary,
  useRemoveFromPayroll,
  useRemoveSalaryPayment,
  useSalaryCandidates,
  useSetPayroll,
} from '@/api/salaries';
import { errorMessage } from '@/lib/supabase';
import { formatDate, money, monthName, todayInRiyadh } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type {
  PayKind,
  PayKindChoice,
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
  const backdrop = useBackdropScroll();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/*
        The whole panel scrolls, inside the dim layer, rather than
        having a scrolling window of its own. A panel that scrolled
        inside itself took its own name and question out of sight the
        moment a field near the foot was touched, and what was left
        looked like a dialog with its top half missing.
      */}
      <ScrollView
        style={backdrop.style}
        contentContainerStyle={backdrop.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
          <View style={styles.bodyInner}>{children}</View>
        </View>
      </ScrollView>
    </Modal>
  );
}

/**
 * The four things an entry against a man's month can be, and how each
 * one is spoken about.
 *
 * Three of them are money that changed hands; the fourth is a debt
 * written down. They are gathered here rather than spelled out at
 * every turn, so a fifth is a line in a table and not a hunt through
 * the sheet.
 */
/*
 * The four the office offers.
 *
 * The last two are the two halves of an old account, and a company
 * that kept no books until now has both: money a man walked in owing,
 * and money he walked in owed.
 *
 * Kafalat is not among them any more - it was asked for and then not
 * wanted - but it stays in the table below, because entries already
 * written down as kafalat have to go on being named, on the card, in
 * the register and on the sheet. It appears in the chooser again only
 * when one of those is being put right, so the chip under the cursor
 * is the kind the entry actually is.
 */
export const PAY_KINDS: PayKindChoice[] = ['salary', 'advance', 'owing', 'backpay'];

const PAY_KIND: Record<
  PayKindChoice,
  {
    short: string;
    title: string;
    button: string;
    day: string;
    hint: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone: string;
    soft: string;
  }
> = {
  salary: {
    short: 'Salary',
    title: 'Pay salary',
    button: 'Record the payment',
    day: 'The day it was handed over',
    hint: 'Short note',
    icon: 'cash-outline',
    tone: colors.green,
    soft: colors.greenSoft,
  },
  advance: {
    short: 'Advance',
    title: 'Advance',
    button: 'Record the advance',
    day: 'The day it was handed over',
    hint: 'Asked for it before Eid',
    icon: 'time-outline',
    tone: colors.amberDark,
    soft: colors.amberSoft,
  },
  kafalat: {
    short: 'Kafalat',
    title: 'Kafalat',
    button: 'Record the kafalat',
    day: 'The day the company paid it',
    hint: 'Iqama renewal, October',
    icon: 'shield-outline',
    tone: colors.blue,
    soft: colors.blueSoft,
  },
  owing: {
    short: 'Owes',
    title: 'What he owes',
    button: 'Write it down',
    day: 'From when',
    hint: 'Purana hisaab, app se pehle ka',
    icon: 'alert-circle-outline',
    tone: colors.red,
    soft: colors.redSoft,
  },
  backpay: {
    short: 'Back pay',
    title: 'What the company owes him',
    button: 'Write it down',
    day: 'From when',
    hint: 'Purani tankhwah, app se pehle ki',
    icon: 'business-outline',
    tone: colors.navy,
    soft: colors.navyTint,
  },
};

/** Handing salary over, or writing down what he owes. */
export function PaySheet({
  line,
  month,
  kind,
  existing,
  onClose,
}: {
  line: SalaryLine;
  month: string;
  kind: PayKindChoice;
  /** An entry already written down, being put right. */
  existing?: SalaryPayment;
  onClose: () => void;
}) {
  const record = useRecordSalary();
  const change = useEditSalaryPayment();
  /*
   * Which of the four this entry is.
   *
   * It used to be settled before the sheet opened, by which button was
   * pressed, which meant a button for each on every man's card. One
   * button now, and the question asked here, where the amount is being
   * typed anyway.
   */
  const [chosen, setChosen] = useState<PayKindChoice>(existing?.kind ?? kind);
  const advance = chosen === 'advance';
  /*
   * The company's own money, laid out for a man who is away.
   *
   * It counts against him exactly as an advance does - the company is
   * out of pocket either way - but it is never cash in his hand, and
   * the sheet must not let anybody type it in as though it were.
   */
  const kafalat = chosen === 'kafalat';
  /** Money he already owed - from before the app, or from anywhere else. */
  const owing = chosen === 'owing';
  /**
   * Money the company already owed him.
   *
   * The other half of an old account. Like owing, nothing is handed
   * over as it is written: it simply joins what he is owed.
   */
  const backpay = chosen === 'backpay';

  /*
   * Empty, always, unless an entry is being put right.
   *
   * This used to open with whatever was still owed already typed in,
   * from when the button said "Pay salary" and meant only that. One
   * button now covers four kinds, and a figure the office did not type
   * is a figure nobody checked: press Record without looking and the
   * books have a payment that never happened. The amount owed is still
   * written above the box, to be read and not assumed.
   */
  const [amount, setAmount] = useState(existing ? String(Number(existing.amount)) : '');
  const [paidOn, setPaidOn] = useState(existing?.paid_on ?? todayInRiyadh());
  const [method, setMethod] = useState<PayMethod>(existing?.method ?? 'cash');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const ok = Number.isFinite(value) && value > 0;

  const save = async () => {
    if (!ok) return setError('Enter an amount bigger than zero.');
    setError(null);
    try {
      if (existing) {
        await change.mutateAsync({
          id: existing.id,
          amount: value,
          paidOn,
          note: note.trim() || undefined,
          kind: chosen,
          method: method === 'transfer' ? 'transfer' : 'cash',
        });
      } else {
        await record.mutateAsync({
          personId: line.person_id,
          month,
          amount: value,
          kind: chosen,
          paidOn,
          method: method === 'transfer' ? 'transfer' : 'cash',
          note: note.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet
      title={existing ? 'Change this entry' : PAY_KIND[chosen].title}
      subtitle={`${line.full_name} · ${monthName(month)}`}
      onClose={onClose}
    >
      <Txt variant="label" color={colors.textMuted}>
        WHAT IS THIS?
      </Txt>
      <View style={styles.payKinds}>
        {(PAY_KINDS.includes(chosen) ? PAY_KINDS : [...PAY_KINDS, chosen]).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setChosen(k);
              setError(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen === k }}
            accessibilityLabel={PAY_KIND[k].title}
            style={({ pressed }) => [
              styles.payKind,
              chosen === k && { borderColor: PAY_KIND[k].tone, backgroundColor: PAY_KIND[k].soft },
              pressed && chosen !== k && styles.payKindPressed,
            ]}
          >
            <Ionicons
              name={PAY_KIND[k].icon}
              size={16}
              color={chosen === k ? PAY_KIND[k].tone : colors.textMuted}
            />
            <Txt
              variant="caption"
              weight="bold"
              color={chosen === k ? PAY_KIND[k].tone : colors.textMuted}
              numberOfLines={1}
            >
              {PAY_KIND[k].short}
            </Txt>
          </Pressable>
        ))}
      </View>

      {backpay ? (
        <View style={[styles.note, styles.noteDeep]}>
          <Ionicons name="business-outline" size={15} color={colors.navy} />
          <Txt variant="caption" color={colors.navy}>
            Money the company already owes him - wages from before this app, or a
            settlement promised and never paid. No cash changes hands now; it is simply
            written down, and is added to what he is owed.
          </Txt>
        </View>
      ) : owing ? (
        <View style={[styles.note, styles.noteBad]}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.red} />
          <Txt variant="caption" color={colors.red}>
            Money he already owes the company - an old account from before this app, or
            anything else he has to give back. No cash changes hands now; it is simply
            written down, and comes off what he is owed.
          </Txt>
        </View>
      ) : kafalat ? (
        <View style={[styles.note, styles.noteWarn]}>
          <Ionicons name="shield-outline" size={15} color={colors.amberDark} />
          <Txt variant="caption" color={colors.amberDark}>
            What the company paid for his kafalat. He never sees this money, but he owes it
            back, so it comes off what is due to him - the same as an advance, under its own
            name.
          </Txt>
        </View>
      ) : advance ? (
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

      <DateField
        label={PAY_KIND[chosen].day}
        value={paidOn}
        onChange={setPaidOn}
      />

      {/* Neither half of an old account was handed over, so there is no "how". */}
      {owing || backpay ? null : (
        <PayMethodRow
          value={method}
          onChange={setMethod}
          label={kafalat ? 'HOW DID THE COMPANY PAY IT?' : 'HOW WAS IT GIVEN?'}
        />
      )}

      <Field
        label="Note (optional)"
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 300))}
        placeholder={PAY_KIND[chosen].hint}
        icon="chatbox-ellipses-outline"
      />

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label={existing ? 'Save the change' : PAY_KIND[chosen].button}
        icon="checkmark"
        size="lg"
        full
        loading={record.isPending || change.isPending}
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
  onTakeOff,
}: {
  existing?: SalaryLine;
  onClose: () => void;
  /**
   * Taking him off the payroll altogether.
   *
   * It lives in here rather than on his card because it is the rarest
   * thing the office does to a man and the only one it cannot undo by
   * typing again. A card carrying it beside Pay and Advance put the
   * two a thumb's width apart.
   */
  onTakeOff?: () => void;
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

      {/*
        Friday used to carry a figure here, set per man and added to
        his month. The office does not want a rate - it wants to know
        how many Fridays he worked and to decide for itself what that
        is worth. The count is still kept and still shown; only the
        money has gone.
      */}
      {payKind === 'monthly' ? (
        <View style={styles.note}>
          <Ionicons name="star-outline" size={15} color={colors.blue} />
          <Txt variant="caption" color={colors.blue}>
            Friday is the day off. Mark him present on one and it is counted on his card and
            on his slip, so you can see how many he worked. It adds nothing to his wage by
            itself.
          </Txt>
        </View>
      ) : null}

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

      {existing && onTakeOff ? (
        <>
          <View style={styles.rule} />
          <Pressable
            onPress={onTakeOff}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${existing.full_name} from the list`}
            style={({ pressed }) => [styles.takeOff, pressed && styles.takeOffPressed]}
          >
            <Ionicons name="person-remove-outline" size={17} color={colors.red} />
            <View style={styles.flex}>
              <Txt variant="subtitle" weight="semibold" color={colors.red} numberOfLines={1}>
                Remove him from the list
              </Txt>
              <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
                For good, not for a trip home - for that, use Off salary on his card. What he
                was paid stays on the books either way.
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </>
      ) : null}
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
  noteWarn: { backgroundColor: colors.amberSoft },
  noteBad: { backgroundColor: colors.redSoft },
  noteDeep: { backgroundColor: colors.navyTint },
  payKinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  payKind: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 42,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  payKindPressed: { backgroundColor: colors.bg },
  rule: { height: 1, backgroundColor: colors.line, marginTop: 4 },
  takeOff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.redSoft,
    backgroundColor: colors.card,
  },
  takeOffPressed: { backgroundColor: colors.redSoft },
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


/**
 * Off salary, and back again.
 *
 * The office's own words for a man who has gone home: he is off the
 * salary until he turns up. He earns nothing meanwhile - nobody is
 * marking him, and the books already say so - but his months would
 * otherwise be a run of empty registers nobody could explain. Writing
 * down the day he went turns them into something he can be shown: "ye
 * mahina chhutti par guzra", and the kafalat the company went on
 * paying underneath it.
 *
 * Not the same as being removed from the list, which is for good and
 * lives in the Edit sheet.
 *
 * The day matters. He went on a date, not on the day somebody got
 * round to typing it, and a month he half-worked is half his.
 */
export function LeaveSheet({
  line,
  onClose,
}: {
  line: SalaryLine;
  onClose: () => void;
}) {
  const away = !!line.on_leave_since;
  const go = useGoOnLeave();
  const back = useCameBack();

  const [day, setDay] = useState(todayInRiyadh());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      if (away) {
        await back.mutateAsync({ personId: line.person_id, onDate: day });
      } else {
        await go.mutateAsync({
          personId: line.person_id,
          wentOn: day,
          note: note.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet
      title={away ? 'He is back' : 'Take him off salary'}
      subtitle={line.full_name}
      onClose={onClose}
    >
      {away ? (
        <View style={styles.note}>
          <Ionicons name="airplane-outline" size={15} color={colors.blue} />
          <Txt variant="caption" color={colors.blue}>
            Off salary since {formatDate(line.on_leave_since)}. Marking him back puts him on
            the attendance list again from the day he returned. The days he was away keep
            whatever was written down for them.
          </Txt>
        </View>
      ) : (
        <View style={[styles.note, styles.noteWarn]}>
          <Ionicons name="home-outline" size={15} color={colors.amberDark} />
          <Txt variant="caption" color={colors.amberDark}>
            He stops earning from this day, and nobody is asked to mark him. Whatever the
            company pays for his kafalat meanwhile is recorded against him and comes off what
            he is owed. He goes back on salary the day you mark him back.
          </Txt>
        </View>
      )}

      <DateField
        label={away ? 'The day he came back' : 'The day he went off salary'}
        value={day}
        onChange={setDay}
      />

      {away ? null : (
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={(v) => setNote(v.slice(0, 200))}
          placeholder="Gaya ghar, 2 mahine"
          icon="chatbox-ellipses-outline"
        />
      )}

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label={away ? 'He is back' : 'Take him off salary'}
        icon={away ? 'arrow-undo' : 'home-outline'}
        size="lg"
        full
        loading={go.isPending || back.isPending}
        onPress={save}
      />
    </Sheet>
  );
}
