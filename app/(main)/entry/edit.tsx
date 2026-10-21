import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Card, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { AmountField, CategoryField, DateField, PersonField } from '@/components/pickers';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useUpdateEntry } from '@/api/control';
import { useCategories, useEntry, usePeopleNames } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { money, todayInRiyadh } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import { ENTRY_TYPE_LABEL } from '@/types';

/**
 * Only an Admin or Sub-admin gets here. Who entered it and when are
 * frozen by the database, and every change is written to the history.
 */
export default function EditEntryScreen() {
  const { id, person } = useLocalSearchParams<{ id: string; person?: string }>();
  const router = useRouter();
  const { person: me, canManage } = useAuth();

  const { data: entry, isLoading } = useEntry(id, person);
  const { data: people = [] } = usePeopleNames();
  const { data: categories = [] } = useCategories();
  const updateEntry = useUpdateEntry();

  const [amount, setAmount] = useState('');
  const [billDate, setBillDate] = useState(todayInRiyadh());
  const [personId, setPersonId] = useState<string | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!entry || loaded) return;
    setAmount(String(Number(entry.amount)));
    setBillDate(entry.bill_date);
    setPersonId(entry.owner_id);
    setCounterpartyId(entry.counterparty_id);
    setCategoryId(entry.category_id);
    setNote(entry.note ?? '');
    setLoaded(true);
  }, [entry, loaded]);

  // The office may correct anybody; everybody else may correct himself.
  // The database holds the same line - this only decides what is shown.
  //
  // This screen used to turn away anyone who was not an Admin, which it
  // went on doing after the rule changed and the button to get here
  // appeared. The button worked, the database would have allowed it, and
  // the screen said no.
  const mine = !!entry && entry.person_id === me?.id;
  if (!canManage && !(loaded && mine)) {
    return (
      <Screen>
        <Header title="Edit entry" back />
        {isLoading ? (
          <Loading />
        ) : (
          <Banner tone="error" message="You can only correct your own entries." />
        )}
      </Screen>
    );
  }

  if (isLoading || !entry) {
    return (
      <Screen>
        <Header title="Edit entry" back />
        {isLoading ? <Loading /> : <Banner tone="error" message="That entry was not found." />}
      </Screen>
    );
  }

  const value = Number(amount);
  const amountOk = Number.isFinite(value) && value > 0;

  const save = async () => {
    setTouched(true);
    setError(null);
    if (!amountOk) return setError('Enter an amount bigger than zero.');
    if (!personId) return setError('Choose a person.');
    if (entry.type === 'transfer' && !counterpartyId) {
      return setError('Choose who receives the money.');
    }
    if (entry.type === 'transfer' && counterpartyId === personId) {
      return setError('You cannot send money to yourself.');
    }
    if (entry.type === 'expense' && !categoryId) return setError('Choose what it was for.');
    if (reason.trim().length < 3) {
      return setError('Say why you are changing this entry. The office is told.');
    }

    try {
      await updateEntry.mutateAsync({
        id: entry.id,
        reason: reason.trim(),
        amount: value,
        billDate,
        personId,
        counterpartyId: entry.type === 'transfer' ? (counterpartyId ?? undefined) : undefined,
        categoryId: entry.type === 'expense' ? (categoryId ?? undefined) : undefined,
        note: note.trim() === '' ? null : note.trim(),
      });
      router.replace(`/entry/${entry.id}?person=${personId}&edited=1`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={updateEntry.isPending ? 'Saving...' : 'Save Changes'}
          icon="checkmark-circle"
          size="lg"
          full
          loading={updateEntry.isPending}
          onPress={save}
        />
      }
    >
      <Header
        title="Edit entry"
        subtitle={`${ENTRY_TYPE_LABEL[entry.type]} · was ${money(Number(entry.amount))}`}
        back
      />

      <Banner
        tone="info"
        message="Who entered this and when cannot be changed by anyone. Everything you change here is written to the change history."
      />

      <View style={styles.form}>
        <Card>
          <AmountField
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setError(null);
            }}
          />
        </Card>

        <Card>
          <View style={styles.group}>
            {canManage ? (
              <PersonField
                label={entry.type === 'transfer' ? 'From' : 'Whose khata'}
                value={personId}
                people={people}
                onChange={setPersonId}
              />
            ) : null}
            {entry.type === 'transfer' ? (
              <PersonField
                label="To"
                value={counterpartyId}
                people={people}
                excludeId={personId}
                onChange={setCounterpartyId}
              />
            ) : null}
            <DateField value={billDate} onChange={setBillDate} />
          </View>
        </Card>

        {entry.type === 'expense' ? (
          <Card>
            <CategoryField categories={categories} value={categoryId} onChange={setCategoryId} />
          </Card>
        ) : null}

        <Card>
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={(v) => setNote(v.slice(0, 300))}
            placeholder="Short note"
            icon="chatbox-ellipses-outline"
          />
        </Card>

        {/*
          Why, not optional. A change to the books without a reason beside
          it is a change somebody has to come and ask about later, and the
          office gets this word for word.
        */}
        <Card>
          <Field
            label="Why are you changing this?"
            value={reason}
            onChangeText={(v) => setReason(v.slice(0, 300))}
            placeholder="Typed 55, the bill says 60"
            icon="help-circle-outline"
            error={touched && reason.trim().length < 3 ? 'This is needed.' : null}
          />
          <View style={styles.tellRow}>
            <Ionicons name="notifications-outline" size={14} color={colors.textMuted} />
            <Txt variant="caption" color={colors.textMuted}>
              The office is told about this change, with your reason.
            </Txt>
          </View>
        </Card>

        {entry.photo_count > 0 ? (
          <Txt variant="caption" color={colors.textFaint} center>
            The bill photos stay as they are.
          </Txt>
        ) : null}

        {error ? <Banner tone="error" message={error} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingBottom: 12, marginTop: 12 },
  group: { gap: 16 },
  tellRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
});
