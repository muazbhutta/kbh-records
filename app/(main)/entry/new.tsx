import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Card, Loading } from '@/components/Bits';
import { DuplicateDialog } from '@/components/DuplicateDialog';
import { InvoiceBlockedDialog } from '@/components/InvoiceBlockedDialog';
import { TypeChoiceRow } from '@/components/ExpenseType';
import { PayMethodRow } from '@/components/PayMethodRow';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PhotoPicker } from '@/components/BillPhotos';
import { AmountField, CategoryField, DateField, PersonField } from '@/components/pickers';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useCategories, useCreateEntry, usePeopleNames } from '@/api/entries';
import { useCheckDuplicates } from '@/api/control';
import { useInvoiceDuplicateCheck } from '@/api/expenseType';
import { findZatcaInvoice } from '@/lib/billScan';
import type { ZatcaInvoice } from '@/lib/zatca';
import { useAuth } from '@/auth/AuthProvider';
import { money, todayInRiyadh } from '@/lib/format';
import {
  MAX_PHOTOS,
  PhotoCancelled,
  pickPhotos,
  takePhoto,
  type LocalPhoto,
} from '@/lib/photos';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type {
  DuplicateWarning,
  EntryType,
  InvoiceDuplicate,
  PayMethod,
  TypeChoice,
} from '@/types';

const TITLES: Record<
  EntryType,
  { title: string; subtitle: string; icon: string; save: string }
> = {
  expense: {
    title: 'Add Expense',
    subtitle: 'Cash spent, with the bill',
    icon: 'receipt-outline',
    save: 'Save Expense',
  },
  transfer: {
    title: 'Send Money',
    subtitle: 'Pass cash to another person',
    icon: 'swap-horizontal',
    save: 'Send Money',
  },
  money_given: {
    title: 'Money Given',
    subtitle: 'Company gives cash to a person',
    icon: 'cash-outline',
    save: 'Save Money Given',
  },
  returned: {
    title: 'Returned Cash',
    subtitle: 'A person gives unused cash back',
    icon: 'arrow-undo-outline',
    save: 'Save Returned Cash',
  },
};

export default function NewEntryScreen() {
  const params = useLocalSearchParams<{ type?: string; person?: string }>();
  const router = useRouter();
  const { person: me, canManage } = useAuth();

  const type = (['expense', 'transfer', 'money_given', 'returned'] as EntryType[]).includes(
    params.type as EntryType,
  )
    ? (params.type as EntryType)
    : 'expense';

  const { data: people = [], isLoading: peopleLoading } = usePeopleNames();
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const createEntry = useCreateEntry();
  const checkDuplicates = useCheckDuplicates();
  const checkInvoice = useInvoiceDuplicateCheck();

  const [amount, setAmount] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [billDate, setBillDate] = useState(todayInRiyadh());
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [warning, setWarning] = useState<DuplicateWarning | null>(null);
  const [typeChoice, setTypeChoice] = useState<TypeChoice>('auto');
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [scanning, setScanning] = useState(false);
  const [blocked, setBlocked] = useState<InvoiceDuplicate | null>(null);
  const [qr, setQr] = useState<ZatcaInvoice | null>(null);
  const [amountWarning, setAmountWarning] = useState<string | null>(null);

  // Who the entry is for: whoever the caller asked for, else me.
  useEffect(() => {
    if (personId) return;
    if (type === 'transfer') {
      setPersonId(canManage && params.person ? params.person : (me?.id ?? null));
    } else if (type === 'expense') {
      setPersonId(params.person ?? me?.id ?? null);
    } else {
      setPersonId(params.person ?? null);
    }
  }, [type, params.person, me?.id, canManage, personId]);

  const adminOnly = type === 'money_given' || type === 'returned';
  // A plain employee hands money to nobody. A head may pass his own cash
  // down to the people under him; an Admin may move anyone's.
  const isHead = !!me?.is_head;
  const myTeam = useMemo(
    () => people.filter((p) => p.head_id === me?.id && p.id !== me?.id),
    [people, me?.id],
  );
  const allowed =
    (!adminOnly || canManage) && (type !== 'transfer' || canManage || isHead);

  const value = Number(amount);
  const amountOk = Number.isFinite(value) && value > 0;

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!amountOk) list.push('Enter an amount bigger than zero.');
    if (!personId) list.push('Choose a person.');
    if (type === 'transfer' && !counterpartyId) list.push('Choose who receives the money.');
    if (type === 'transfer' && counterpartyId && counterpartyId === personId) {
      list.push('You cannot send money to yourself.');
    }
    if (type === 'expense' && !categoryId) list.push('Choose what it was for.');
    if (type === 'expense' && photos.length === 0) list.push('Add at least one bill photo.');
    return list;
  }, [amountOk, personId, counterpartyId, categoryId, photos.length, type]);

  const addPhotos = async (source: 'camera' | 'gallery') => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const remaining = MAX_PHOTOS - photos.length;
      const picked =
        source === 'camera' ? [await takePhoto()] : await pickPhotos(remaining);
      setPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS));
    } catch (err) {
      if (!(err instanceof PhotoCancelled)) setPhotoError(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  /** Writes the entry for real. Called after any warning is accepted. */
  const reallySave = async () => {
    setWarning(null);
    if (!me || !personId) return;
    setError(null);

    try {
      const id = await createEntry.mutateAsync({
        type,
        amount: value,
        personId: personId!,
        billDate,
        counterpartyId: type === 'transfer' ? counterpartyId : null,
        categoryId: type === 'expense' ? categoryId : null,
        note: note.trim() || null,
        photos: type === 'expense' ? photos : [],
        uploaderId: me.id,
        expenseType:
          type !== 'expense' ? null : typeChoice === 'auto' ? (qr ? 'invoice' : 'petty') : typeChoice,
        typeSource:
          type !== 'expense'
            ? null
            : typeChoice !== 'auto'
              ? 'manual'
              : qr
                ? 'auto_qr'
                : 'auto_none',
        qr: type === 'expense' ? qr : null,
        duplicateOf: warning?.same_photo?.entry_id ?? null,
        payMethod: type === 'expense' ? null : payMethod,
      });
      router.replace(`/entry/${id}?person=${personId}&saved=1`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /**
   * Before an expense is written, ask the server whether this bill, or
   * this exact amount on this exact day, has been claimed before.
   */
  const save = async () => {
    setTouched(true);
    setError(null);
    if (problems.length > 0 || !me || !personId) return;

    if (type !== 'expense') {
      await reallySave();
      return;
    }

    // Read the bill first: a ZATCA QR settles the type and tells us the
    // real total before anything is written.
    setScanning(true);
    let invoice = qr;
    try {
      invoice = await findZatcaInvoice(photos);
      setQr(invoice);
    } catch (err) {
      console.warn('QR scan failed', err);
    } finally {
      setScanning(false);
    }

    if (invoice?.vat_number && invoice.issued_at && invoice.total != null) {
      const already = await checkInvoice.mutateAsync({
        vatNumber: invoice.vat_number,
        issuedAt: invoice.issued_at,
        total: invoice.total,
      });
      if (already) {
        setBlocked(already);
        return;
      }
    }

    if (invoice?.total != null && invoice.total !== value) {
      setAmountWarning(
        `The bill says ${money(invoice.total)} but you entered ${money(value)}.`,
      );
      return;
    }

    const found = await checkDuplicates.mutateAsync({
      hashes: photos.map((p) => p.sha256),
      phashes: photos.map((p) => p.phash).filter(Boolean) as string[],
      personId,
      amount: value,
      billDate,
    });

    if (found.same_photo || found.same_amount) {
      setWarning(found);
      return;
    }
    await reallySave();
  };

  if (!allowed) {
    return (
      <Screen>
        <Header title={TITLES[type].title} back />
        <Banner
          tone="error"
          message={
            type === 'transfer'
              ? 'Only an Admin, or a head passing cash to his own team, can record this.'
              : 'Only an Admin can record this kind of entry.'
          }
        />
      </Screen>
    );
  }

  if (peopleLoading || (type === 'expense' && catsLoading)) {
    return (
      <Screen>
        <Header title={TITLES[type].title} back />
        <Loading label="Getting ready" />
      </Screen>
    );
  }

  const base = TITLES[type];
  // A head is not "sending money to another person", he is paying his own
  // men, and the screen should say so.
  const meta =
    type === 'transfer' && !canManage && isHead
      ? { ...base, title: 'Give to my team', subtitle: 'Your own cash, down to your own people' }
      : base;

  return (
    <Screen
      footer={
        <Button
          label={
            scanning ? 'Reading the bill...' : createEntry.isPending ? 'Saving...' : meta.save
          }
          icon="checkmark-circle"
          size="lg"
          full
          loading={createEntry.isPending || checkDuplicates.isPending || scanning}
          onPress={save}
        />
      }
    >
      <Header title={meta.title} subtitle={meta.subtitle} back />

      <View style={styles.form}>
        <Card>
          <AmountField
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setError(null);
            }}
            autoFocus
          />
        </Card>

        <Card>
          <View style={styles.group}>
            {type === 'transfer' ? (
              <>
                <PersonField
                  label="From"
                  value={personId}
                  people={canManage ? people : people.filter((p) => p.id === me?.id)}
                  meId={me?.id}
                  onChange={setPersonId}
                  helper={canManage ? 'Whose cash is being passed on' : 'Your own cash'}
                />
                <PersonField
                  label="To"
                  value={counterpartyId}
                  people={canManage ? people : myTeam}
                  excludeId={personId}
                  meId={me?.id}
                  onChange={setCounterpartyId}
                  placeholder={canManage ? 'Who gets the money?' : 'Who on your team?'}
                  helper={canManage ? undefined : 'Only the people under you'}
                  error={touched && !counterpartyId ? 'Choose who receives the money.' : null}
                />
              </>
            ) : (
              <PersonField
                label={
                  type === 'expense' ? 'For' : type === 'money_given' ? 'Give to' : 'Returned by'
                }
                value={personId}
                people={canManage ? people : people.filter((p) => p.id === me?.id)}
                meId={me?.id}
                onChange={setPersonId}
                helper={
                  type !== 'expense'
                    ? undefined
                    : canManage
                      ? 'Whose khata this expense belongs to. Change it if you are entering for a colleague.'
                      : 'This comes out of your own cash'
                }
                error={touched && !personId ? 'Choose a person.' : null}
              />
            )}

            <DateField value={billDate} onChange={setBillDate} />
          </View>
        </Card>

        {type === 'expense' ? (
          <Card>
            <CategoryField
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              error={touched && !categoryId ? 'Choose what it was for.' : null}
            />
          </Card>
        ) : null}

        {type === 'expense' ? (
          <Card>
            <TypeChoiceRow value={typeChoice} onChange={setTypeChoice} />
          </Card>
        ) : (
          <Card>
            <PayMethodRow
              value={payMethod}
              onChange={setPayMethod}
              label={type === 'returned' ? 'HOW WAS IT GIVEN BACK?' : 'HOW WAS IT GIVEN?'}
            />
          </Card>
        )}

        {type === 'expense' ? (
          <Card>
            <PhotoPicker
              photos={photos}
              onRemove={(key) => setPhotos((c) => c.filter((p) => p.key !== key))}
              onCamera={() => addPhotos('camera')}
              onGallery={() => addPhotos('gallery')}
              busy={photoBusy}
              hint="If the bill has a QR code, keep it clear in the photo."
              error={
                photoError ??
                (touched && photos.length === 0 ? 'A bill photo is required.' : null)
              }
            />
          </Card>
        ) : null}

        <Card>
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={(v) => setNote(v.slice(0, 300))}
            placeholder="Short note"
            icon="chatbox-ellipses-outline"
            maxLength={300}
          />
        </Card>

        {amountOk ? (
          <View style={styles.preview}>
            <Ionicons name={meta.icon as never} size={16} color={colors.textMuted} />
            <Txt variant="caption" color={colors.textMuted}>
              {money(value)} · {meta.title}
            </Txt>
          </View>
        ) : null}

        {amountWarning ? (
          <>
            <Banner tone="warn" title="Check the amount" message={amountWarning} />
            <View style={styles.amountActions}>
              <Button
                label="Use bill amount"
                icon="checkmark"
                variant="navy"
                onPress={() => {
                  if (qr?.total != null) setAmount(String(qr.total));
                  setAmountWarning(null);
                }}
                style={styles.amountBtn}
              />
              <Button
                label="Save anyway"
                variant="outline"
                onPress={() => {
                  setAmountWarning(null);
                  reallySave();
                }}
                style={styles.amountBtn}
              />
            </View>
          </>
        ) : null}

        {error ? <Banner tone="error" message={error} /> : null}
        {touched && problems.length > 0 && !error ? (
          <Banner tone="warn" message={problems[0]} />
        ) : null}
      </View>

      <InvoiceBlockedDialog duplicate={blocked} onClose={() => setBlocked(null)} />

      <DuplicateDialog
        warning={warning}
        saving={createEntry.isPending}
        onCancel={() => setWarning(null)}
        onSaveAnyway={reallySave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingBottom: 12 },
  group: { gap: 16 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  amountActions: { flexDirection: 'row', gap: 10 },
  amountBtn: { flex: 1 },
});
