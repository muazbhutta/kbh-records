import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Avatar, Badge, Banner, Card, Loading, SectionTitle } from '@/components/Bits';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { usePayrollKeepers, usePeople, useSetPayrollRight } from '@/api/people';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/theme';

/**
 * Who looks after the wages.
 *
 * A teacher hands the register to one of the class, and the office
 * wanted the same. Switching a man on here opens the Salaries section
 * on his own home screen - attendance, wages, salaries, advances - and
 * opens nothing else. His role does not move; he is not made an Admin.
 *
 * On its own page rather than in Settings itself, so Settings keeps its
 * one line about it and does not grow a list.
 */
export default function WagesScreen() {
  const { canManage, person: me } = useAuth();
  const people = usePeople({});
  const keepers = usePayrollKeepers(canManage);
  const grant = useSetPayrollRight();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Who looks after the wages" back />
        <Banner tone="error" message="Only an Admin or a Sub-admin can hand over the wages." />
      </Screen>
    );
  }

  const rows = (people.data ?? []).filter((p) => p.is_active);
  // The office already has it, and cannot be switched off here.
  const office = rows.filter((p) => p.role === 'admin' || p.role === 'sub_admin');
  const rest = rows.filter((p) => p.role !== 'admin' && p.role !== 'sub_admin');

  const hand = async (id: string, name: string, next: boolean) => {
    setError(null);
    setNotice(null);
    setBusy(id);
    try {
      await grant.mutateAsync({ userId: id, can: next });
      setNotice(
        next
          ? `${name} looks after the wages now.`
          : `${name} no longer looks after the wages.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Header
        title="Who looks after the wages"
        subtitle="Salaries and attendance, and nothing else"
        back
      />

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color={colors.blue} />
        <Txt variant="caption" color={colors.blue} style={styles.flex}>
          Switch somebody on and the Salaries section appears on his home screen. He can mark
          attendance, set a wage, hand over a salary and pay an advance. The khatas, the reports,
          the people and the projects all stay shut, and his role does not change.
        </Txt>
      </View>

      {notice ? <Banner tone="success" message={notice} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}

      {people.isLoading ? (
        <Loading />
      ) : (
        <>
          <SectionTitle title="Staff" />
          <Card padded={false} style={styles.list}>
            {rest.length === 0 ? (
              <View style={styles.empty}>
                <Txt variant="caption" color={colors.textMuted}>
                  Nobody to hand them to yet.
                </Txt>
              </View>
            ) : (
              rest.map((p, i) => (
                <View key={p.id} style={[styles.row, i === rest.length - 1 && styles.rowLast]}>
                  <Avatar name={p.full_name} size={38} />
                  <View style={styles.flex}>
                    <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                      {p.full_name}
                    </Txt>
                    <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                      {p.job_title ? `${p.job_title} · ` : ''}
                      {ROLE_LABEL[p.role] ?? p.role}
                    </Txt>
                  </View>
                  <Switch
                    value={keepers.data?.has(p.id) ?? false}
                    onValueChange={(next) => hand(p.id, p.full_name, next)}
                    disabled={busy === p.id}
                    trackColor={{ true: colors.navy, false: colors.line }}
                    thumbColor={colors.white}
                  />
                </View>
              ))
            )}
          </Card>

          <SectionTitle title="The office" />
          <Card padded={false} style={styles.list}>
            {office.map((p, i) => (
              <View key={p.id} style={[styles.row, i === office.length - 1 && styles.rowLast]}>
                <Avatar name={p.full_name} size={38} />
                <View style={styles.flex}>
                  <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                    {p.full_name}
                    {p.id === me?.id ? ' (you)' : ''}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </Txt>
                </View>
                <Badge label="Always" tone="green" />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  note: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  list: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLast: { borderBottomWidth: 0 },
  empty: { padding: 16, alignItems: 'center' },
});
