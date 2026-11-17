import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useCancelEntry } from '@/api/expenseType';
import { Banner, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Txt } from '@/components/Txt';
import { errorMessage } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';

/**
 * Refusing an entry, which always costs a sentence.
 *
 * Shared, because the office refuses from two places and both must
 * behave the same: the entry's own screen, and the Waiting for you list
 * where the entries are actually gone through one after another.
 *
 * The reason is not optional here and is not optional in the database
 * either. cancel_entry turns a blank one away, so a refusal cannot slip
 * through unexplained even if some future screen forgets to ask: a man
 * told his work was thrown out and not told why has been given nothing
 * he can act on.
 */
export function RefuseModal({
  visible,
  entryId,
  label,
  onClose,
  onRefused,
}: {
  visible: boolean;
  entryId: string;
  label: string;
  onClose: () => void;
  /** So a list can take the card away once the entry is refused. */
  onRefused?: () => void;
}) {
  const refuse = useCancelEntry();
  const backdrop = useBackdrop('center');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const said = reason.trim();

  const confirm = async () => {
    setError(null);
    // Said here as well as in the database, so the answer is instant
    // and does not cost a trip to Riyadh and back to be told no.
    if (said.length === 0) {
      setError('Say why it is being refused. The person who recorded it is told the reason.');
      return;
    }
    try {
      await refuse.mutateAsync({ id: entryId, reason: said });
      setReason('');
      onRefused?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          <View style={styles.head}>
            <Txt variant="heading">Refuse this entry?</Txt>
            <Pressable
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Txt variant="subtitle" weight="semibold">
            {label}
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            It stops counting in the balances straight away, and the person who recorded it is
            shown your reason on their own screen and on their phone.
          </Txt>

          <Field
            label="Why is it being refused?"
            value={reason}
            onChangeText={(v) => {
              setReason(v.slice(0, 200));
              if (error) setError(null);
            }}
            placeholder="The bill photo is not readable. Take it again."
            icon="chatbox-ellipses-outline"
          />

          {error ? <Banner tone="error" message={error} /> : null}

          <Button
            label="Refuse It"
            icon="close-circle"
            variant="danger"
            size="lg"
            full
            // Nothing written, nothing sent. The button says so before
            // it is pressed rather than after.
            disabled={said.length === 0}
            loading={refuse.isPending}
            onPress={confirm}
          />
          <Button label="Leave It Alone" variant="ghost" full onPress={close} />
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
