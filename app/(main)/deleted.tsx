import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useDeletedEntries, useRestoreEntry } from '@/api/control';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import { ENTRY_TYPE_LABEL } from '@/types';

/** Deleted entries are hidden, never gone. An Admin can put one back. */
export default function DeletedScreen() {
  const { canManage } = useAuth();
  const { data: entries = [], isLoading, error } = useDeletedEntries();
  const restore = useRestoreEntry();
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Deleted entries" back />
        <Banner tone="error" message="Only an Admin can see deleted entries." />
      </Screen>
    );
  }

  const putBack = async (id: string) => {
    setNotice(null);
    setFailure(null);
    setBusyId(id);
    try {
      await restore.mutateAsync(id);
      setNotice('Entry put back. It counts in the balances again.');
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <Header
        title="Deleted entries"
        subtitle={isLoading ? 'Loading...' : `${entries.length} kept`}
        back
      />

      {notice ? <Banner tone="success" message={notice} /> : null}
      {failure ? <Banner tone="error" message={failure} /> : null}

      {isLoading ? (
        <Loading />
      ) : error ? (
        <Banner tone="error" message={(error as Error).message} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="trash-outline"
          title="Nothing has been deleted"
          message="When an Admin deletes an entry it is hidden, not removed, and it shows up here."
        />
      ) : (
        <View style={styles.list}>
          {entries.map((e) => (
            <Card key={e.id} style={styles.card}>
              <View style={styles.top}>
                <View style={styles.icon}>
                  <Ionicons
                    name={
                      (e.category_icon as keyof typeof Ionicons.glyphMap) ?? 'document-text-outline'
                    }
                    size={18}
                    color={colors.textMuted}
                  />
                </View>
                <View style={styles.main}>
                  <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                    {e.category_name ?? ENTRY_TYPE_LABEL[e.type]}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {formatDate(e.bill_date)} · {e.person_name ?? 'someone'}
                    {e.counterparty_name ? ` → ${e.counterparty_name}` : ''}
                  </Txt>
                </View>
                <Money amount={Number(e.amount)} size="md" tone="plain" />
              </View>

              {e.note ? (
                <Txt variant="caption" color={colors.textMuted}>
                  {e.note}
                </Txt>
              ) : null}

              <View style={styles.badges}>
                <Badge label={ENTRY_TYPE_LABEL[e.type]} tone="grey" />
                {e.entered_by_name ? (
                  <Badge label={`Entered by ${e.entered_by_name}`} tone="navy" />
                ) : null}
              </View>

              <View style={styles.deleteBox}>
                <Ionicons name="trash-outline" size={14} color={colors.red} />
                <Txt variant="caption" color={colors.red} style={styles.deleteText}>
                  Deleted by {e.deleted_by_name ?? 'someone'} on {formatDateTime(e.deleted_at)}
                  {e.delete_reason ? ` — ${e.delete_reason}` : ''}
                </Txt>
              </View>

              <Button
                label="Put It Back"
                icon="arrow-undo"
                variant="outline"
                full
                loading={busyId === e.id}
                onPress={() => putBack(e.id)}
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: '#EDF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 2, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  deleteBox: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.redSoft,
    borderRadius: radius.sm,
    padding: 9,
  },
  deleteText: { flex: 1 },
});
