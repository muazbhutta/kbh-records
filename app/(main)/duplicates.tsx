import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { BillImage, PhotoViewer } from '@/components/BillPhotos';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Header, Screen, useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useResolveDuplicate, useSuspectedDuplicates } from '@/api/duplicates';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatDateTime } from '@/lib/format';
import { signedUrl } from '@/lib/photos';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import type { SuspectedDuplicate } from '@/types';

/**
 * Two expenses that look like the same bill, side by side with both
 * photos. The Admin decides: throw the new one out, or say it is fine.
 */
export default function DuplicatesScreen() {
  const { canManage } = useAuth();
  const { data: rows = [], isLoading, error } = useSuspectedDuplicates(canManage);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Suspected duplicates" back />
        <Banner tone="error" message="Only an Admin can settle duplicates." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Suspected duplicates"
        subtitle={isLoading ? 'Loading...' : `${rows.length} waiting`}
        back
      />

      {notice ? <Banner tone="success" message={notice} /> : null}

      <Banner
        tone="info"
        message="These bills look like one that was already recorded. Cancelling does not delete anything: the expense leaves the balances and the reports, the money goes back to the person, and the record stays in the change history."
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <Banner tone="error" message={(error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="copy-outline"
          title="Nothing to settle"
          message="No expense is waiting on a duplicate decision."
        />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <DuplicatePair
              key={row.id}
              row={row}
              onDone={setNotice}
              onViewPhoto={setViewing}
            />
          ))}
        </View>
      )}

      <Txt variant="caption" color={colors.textFaint} center style={styles.honest}>
        This check finds the same bill photographed again. A freshly written bill is a
        different picture, and no check here can tell that it is made up.
      </Txt>

      <PhotoViewer uri={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}

function DuplicatePair({
  row,
  onDone,
  onViewPhoto,
}: {
  row: SuspectedDuplicate;
  onDone: (m: string) => void;
  onViewPhoto: (url: string) => void;
}) {
  const resolve = useResolveDuplicate();
  const wide = useIsWide();
  const [error, setError] = useState<string | null>(null);

  const act = async (action: 'cancel' | 'not_duplicate') => {
    setError(null);
    try {
      await resolve.mutateAsync({ id: row.id, action });
      onDone(
        action === 'cancel'
          ? `${row.system_id ?? 'Expense'} cancelled. The money is back with ${
              row.person_name ?? 'them'
            }.`
          : `${row.system_id ?? 'Expense'} kept. The flag is gone.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card style={styles.card}>
      <View style={[styles.pair, wide && styles.pairWide]}>
        <Side
          label="This one"
          tone={colors.red}
          systemId={row.system_id}
          person={row.person_name}
          amount={Number(row.amount)}
          billDate={row.bill_date}
          enteredAt={row.entered_at}
          category={row.category_name}
          note={row.note}
          thumb={row.thumb_path}
          onViewPhoto={onViewPhoto}
        />

        <View style={styles.between}>
          <Ionicons name="swap-horizontal" size={18} color={colors.textFaint} />
        </View>

        <Side
          label="Already recorded"
          tone={colors.navy}
          systemId={row.other_system_id}
          person={row.other_person_name}
          amount={row.other_amount != null ? Number(row.other_amount) : null}
          billDate={row.other_bill_date}
          enteredAt={row.other_entered_at}
          category={row.other_category_name}
          note={row.other_note}
          thumb={row.other_thumb_path}
          onViewPhoto={onViewPhoto}
        />
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <View style={styles.actions}>
        <Button
          label="Cancel (duplicate)"
          icon="close-circle"
          variant="danger"
          full
          loading={resolve.isPending}
          onPress={() => act('cancel')}
          style={styles.action}
        />
        <Button
          label="Not a duplicate"
          icon="checkmark-circle"
          variant="outline"
          full
          loading={resolve.isPending}
          onPress={() => act('not_duplicate')}
          style={styles.action}
        />
      </View>
    </Card>
  );
}

function Side({
  label,
  tone,
  systemId,
  person,
  amount,
  billDate,
  enteredAt,
  category,
  note,
  thumb,
  onViewPhoto,
}: {
  label: string;
  tone: string;
  systemId: string | null;
  person: string | null;
  amount: number | null;
  billDate: string | null;
  enteredAt: string | null;
  category: string | null;
  note: string | null;
  thumb: string | null;
  onViewPhoto: (url: string) => void;
}) {
  const router = useRouter();

  return (
    <View style={styles.side}>
      <Txt variant="label" color={tone}>
        {label.toUpperCase()}
      </Txt>

      {thumb ? (
        <BillImage
          path={thumb}
          style={styles.photo}
          onPress={async () => {
            const url = await signedUrl(thumb);
            if (url) onViewPhoto(url);
          }}
        />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <Ionicons name="image-outline" size={22} color={colors.textFaint} />
        </View>
      )}

      <View style={styles.sideInfo}>
        {systemId ? <Badge label={systemId} tone="grey" /> : null}
        {amount != null ? <Money amount={amount} size="md" tone="plain" /> : null}
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {person ?? 'someone'}
          {category ? ` · ${category}` : ''}
        </Txt>
        <Txt variant="caption" color={colors.textFaint}>
          Bill {billDate ? formatDate(billDate) : '-'}
        </Txt>
        <Txt variant="caption" color={colors.textFaint}>
          Saved {enteredAt ? formatDateTime(enteredAt) : '-'}
        </Txt>
        {note ? (
          <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
            {note}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { gap: 12 },
  pair: { gap: 10 },
  pairWide: { flexDirection: 'row', alignItems: 'flex-start' },
  side: { flex: 1, gap: 7 },
  between: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  // Two bills are being told apart by eye here, so the picture needs room.
  // A bill is taller than it is wide, so the box is too.
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
  noPhoto: {
    backgroundColor: '#EDF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideInfo: { gap: 2, alignItems: 'flex-start' },
  actions: { gap: 10 },
  action: { flex: 1 },
  honest: { marginTop: 18, paddingHorizontal: 8 },
});
