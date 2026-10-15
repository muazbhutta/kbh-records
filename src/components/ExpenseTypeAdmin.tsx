import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner, Card, DetailRow, SectionTitle } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { useClearTypeFlags, useInvoiceDetails, useSetExpenseType } from '@/api/expenseType';
import { formatDateTime, money } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import { EXPENSE_KIND_LABEL, type ExpenseKind, type FeedEntry } from '@/types';

/**
 * What an Admin can do about an expense's type: see what the QR said,
 * correct a blurry read, and tick off anything the system flagged.
 * Every change here goes to the change history.
 */
export function ExpenseTypeAdmin({ entry }: { entry: FeedEntry }) {
  const setType = useSetExpenseType();
  const clearFlags = useClearTypeFlags();
  const { data: invoice } = useInvoiceDetails(entry.id);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const change = async (type: ExpenseKind) => {
    setError(null);
    setNotice(null);
    try {
      await setType.mutateAsync({ id: entry.id, type });
      setNotice(`Saved as ${EXPENSE_KIND_LABEL[type]}.`);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const tickOff = async () => {
    setError(null);
    try {
      await clearFlags.mutateAsync(entry.id);
      setNotice('Marked as checked.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const needsLook = (entry.type_flags ?? []).some((f) =>
    ['type_check', 'old_entry_check', 'amount_differs'].includes(f),
  );

  return (
    <>
      <SectionTitle
        title="Bill type"
        action={
          <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" hitSlop={8}>
            <Txt variant="caption" weight="semibold" color={colors.blue}>
              {open ? 'Close' : 'Change'}
            </Txt>
          </Pressable>
        }
      />

      {notice ? <Banner tone="success" message={notice} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}

      {invoice && (invoice.qr_seller_name || invoice.vat_number) ? (
        <Card padded={false} style={styles.card}>
          {invoice.qr_seller_name ? (
            <DetailRow label="Seller" value={invoice.qr_seller_name} />
          ) : null}
          {invoice.qr_vat_number ?? invoice.vat_number ? (
            <DetailRow label="VAT number" value={invoice.qr_vat_number ?? invoice.vat_number ?? '-'} />
          ) : null}
          {invoice.qr_issued_at ? (
            <DetailRow label="Bill issued" value={formatDateTime(invoice.qr_issued_at)} />
          ) : null}
          {invoice.qr_total != null ? (
            <DetailRow
              label="Bill total"
              value={money(Number(invoice.qr_total))}
              valueColor={invoice.amount_differs ? colors.red : undefined}
            />
          ) : null}
          {invoice.qr_vat_amount != null ? (
            <DetailRow label="VAT on the bill" value={money(Number(invoice.qr_vat_amount))} last />
          ) : null}
        </Card>
      ) : null}

      {invoice?.amount_differs ? (
        <Banner
          tone="warn"
          title="Amount differs from bill"
          message={`The bill says ${money(Number(invoice.qr_total))} but ${money(
            Number(entry.amount),
          )} was recorded.`}
        />
      ) : null}

      {open ? (
        <View style={styles.actions}>
          <Button
            label="Save as Petty"
            icon="cash-outline"
            variant={entry.expense_type === 'petty' ? 'navy' : 'outline'}
            size="lg"
            full
            loading={setType.isPending}
            onPress={() => change('petty')}
          />
          <Button
            label="Save as Invoice"
            icon="document-text-outline"
            variant={entry.expense_type === 'invoice' ? 'navy' : 'outline'}
            size="lg"
            full
            loading={setType.isPending}
            onPress={() => change('invoice')}
          />
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
            <Txt variant="caption" color={colors.textFaint} style={styles.noteText}>
              Changing the type is written to the change history, and the entry is marked
              &quot;Type changed&quot;.
            </Txt>
          </View>
        </View>
      ) : null}

      {needsLook && !open ? (
        <Button
          label="Looks right, mark as checked"
          icon="checkmark-done"
          variant="outline"
          full
          loading={clearFlags.isPending}
          onPress={tickOff}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16 },
  actions: { gap: 10 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingHorizontal: 2 },
  noteText: { flex: 1 },
});
