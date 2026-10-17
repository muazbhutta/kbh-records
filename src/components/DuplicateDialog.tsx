import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Banner, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { formatDate, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type { DuplicateWarning } from '@/types';

/**
 * "This bill photo was already used on 14 Oct by Rana — SAR 120.
 *  Save anyway?"  Nothing is blocked: the owner decides, and the entry is
 *  flagged for admins either way.
 */
export function DuplicateDialog({
  warning,
  saving,
  onCancel,
  onSaveAnyway,
}: {
  warning: DuplicateWarning | null;
  saving?: boolean;
  onCancel: () => void;
  onSaveAnyway: () => void;
}) {
  const backdrop = useBackdrop('center');
  const photo = warning?.same_photo ?? null;
  const same = warning?.same_amount ?? null;

  return (
    <Modal visible={!!warning} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Ionicons name="copy-outline" size={26} color={colors.amberDark} />
            </View>
            <Txt variant="title" center>
              Seen this before?
            </Txt>
          </View>

          {photo ? (
            <Banner
              tone="warn"
              title={warning?.photo_match === 'exact' ? 'The same photo' : 'The same bill'}
              message={`${
                warning?.photo_match === 'exact'
                  ? 'This exact photo'
                  : 'A photo of this same bill'
              } was already used on ${formatDate(photo.bill_date)} by ${photo.person_name} — ${money(
                Number(photo.amount),
              )}${photo.system_id ? ` (${photo.system_id})` : ''}.`}
            />
          ) : null}

          {same ? (
            <Banner
              tone="warn"
              title="Same amount, same day"
              message={`There is already an expense of ${money(Number(same.amount))} on ${formatDate(
                same.bill_date,
              )}${same.category_name ? ` under ${same.category_name}` : ''}${
                same.system_id ? ` (${same.system_id})` : ''
              }.`}
            />
          ) : null}

          <Txt variant="caption" color={colors.textMuted} center>
            If this really is a different bill, go ahead. The entry is marked
            &quot;Suspected duplicate&quot; and an Admin decides.
          </Txt>

          <View style={styles.honest}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
            <Txt variant="caption" color={colors.textFaint} style={styles.honestText}>
              This check finds the same bill photographed again. A freshly written
              bill is a different picture, and no check here can tell that it is made up.
            </Txt>
          </View>

          <Button
            label={saving ? 'Saving...' : 'Save Anyway'}
            icon="checkmark-circle"
            size="lg"
            full
            loading={saving}
            onPress={onSaveAnyway}
          />
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Txt variant="subtitle" weight="semibold" color={colors.navy}>
              Go back and check
            </Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    gap: 12,
  },
  head: { alignItems: 'center', gap: 6 },
  honest: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingHorizontal: 2 },
  honestText: { flex: 1 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  pressed: { backgroundColor: colors.navyTint },
});
