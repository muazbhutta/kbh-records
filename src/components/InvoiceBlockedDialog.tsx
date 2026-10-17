import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Card, DetailRow, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type { InvoiceDuplicate } from '@/types';

/**
 * The same invoice cannot be claimed twice. Unlike the photo warning
 * this one is not a choice: the QR says it is the very same bill, so
 * saving stops here and the earlier entry is shown instead.
 */
export function InvoiceBlockedDialog({
  duplicate,
  onClose,
}: {
  duplicate: InvoiceDuplicate | null;
  onClose: () => void;
}) {
  const backdrop = useBackdrop('center');
  const router = useRouter();

  return (
    <Modal visible={!!duplicate} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Ionicons name="close-circle" size={28} color={colors.red} />
            </View>
            <Txt variant="title" center>
              This bill is already recorded
            </Txt>
            <Txt variant="caption" color={colors.textMuted} center>
              The QR code on this invoice matches an entry that is already in the
              records. The same invoice cannot be claimed twice.
            </Txt>
          </View>

          {duplicate ? (
            <Card padded={false} style={styles.card}>
              <DetailRow label="Entry" value={duplicate.system_id ?? '-'} />
              <DetailRow label="Recorded for" value={duplicate.person_name} />
              <DetailRow label="Bill date" value={formatDate(duplicate.bill_date)} />
              <DetailRow label="Amount" value={money(Number(duplicate.amount))} />
              <DetailRow label="Saved at" value={formatDateTime(duplicate.entered_at)} last />
            </Card>
          ) : null}

          <Banner
            tone="info"
            message="If this really is a different bill, ask an Admin to look at both."
          />

          <Button
            label="Open the earlier entry"
            icon="open-outline"
            variant="navy"
            size="lg"
            full
            onPress={() => {
              if (!duplicate) return;
              onClose();
              router.push(`/entry/${duplicate.entry_id}`);
            }}
          />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Txt variant="subtitle" weight="semibold" color={colors.navy}>
              Go back
            </Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  head: { alignItems: 'center', gap: 6 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { paddingHorizontal: 16 },
  back: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  pressed: { backgroundColor: colors.navyTint },
});
