import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Header, Screen, useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { usePeople } from '@/api/people';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money, prettyMobile, ROLE_LABEL } from '@/lib/format';
import { Money } from '@/components/Money';
import { CheckResultBadge } from '@/components/CashCheckCard';
import { colors, radius } from '@/theme';
import type { PeopleRow } from '@/types';

export default function PeopleScreen() {
  const router = useRouter();
  const wide = useIsWide();
  const { canManage } = useAuth();

  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = usePeople({
    search,
    showDisabled,
  });

  const people = useMemo(() => data ?? [], [data]);

  if (!canManage) {
    return (
      <Screen>
        <Header title="People" back />
        <Banner tone="error" message="Only an Admin can see the people list." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="People"
        subtitle={
          isLoading
            ? 'Loading...'
            : `${people.length} shown · ${money(
                people.reduce((sum, p) => sum + Math.max(0, Number(p.balance ?? 0)), 0),
              )} in hand`
        }
        right={
          wide ? (
            <Button label="Add Person" icon="person-add" onPress={() => router.push('/people/new')} />
          ) : (
            <Pressable
              onPress={() => router.push('/people/new')}
              accessibilityRole="button"
              accessibilityLabel="Add Person"
              style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            >
              <Ionicons name="person-add" size={20} color={colors.navyDeep} />
            </Pressable>
          )
        }
      />

      <Field
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Name or mobile number"
        icon="search-outline"
        autoCapitalize="none"
      />

      <Pressable
        onPress={() => setShowDisabled((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: showDisabled }}
        style={styles.toggleRow}
      >
        <View style={[styles.checkbox, showDisabled && styles.checkboxOn]}>
          {showDisabled ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
        </View>
        <Txt variant="caption" color={colors.textMuted}>
          Also show accounts that are turned off
        </Txt>
      </Pressable>

      {error ? (
        <Banner tone="error" message={(error as Error).message} />
      ) : isLoading ? (
        <Loading label="Loading people" />
      ) : people.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search ? 'Nobody matches that search' : 'No people yet'}
          message={
            search
              ? 'Try a different name or number.'
              : 'Add your staff so you can start recording cash against their names.'
          }
          action={
            !search ? (
              <Button label="Add Person" icon="person-add" onPress={() => router.push('/people/new')} />
            ) : null
          }
        />
      ) : (
        <View style={styles.list}>
          {people.map((p) => (
            <PersonRow key={p.id} person={p} wide={wide} onPress={() => router.push(`/people/${p.id}`)} />
          ))}
        </View>
      )}

      {!isLoading && people.length > 0 ? (
        <Pressable onPress={() => refetch()} style={styles.refresh} accessibilityRole="button">
          <Ionicons
            name="refresh"
            size={15}
            color={colors.textFaint}
          />
          <Txt variant="caption" color={colors.textFaint}>
            {isRefetching ? 'Refreshing...' : 'Refresh'}
          </Txt>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function PersonRow({
  person,
  wide,
  onPress,
}: {
  person: PeopleRow;
  wide: boolean;
  onPress: () => void;
}) {
  const dim = !person.is_active;
  const balance = Number(person.balance ?? 0);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={person.full_name}>
      {({ pressed }) => (
        <Card style={[styles.row, pressed && styles.rowPressed, dim && styles.rowDim]}>
          <Avatar
            name={person.full_name}
            size={46}
            tone={person.is_owner ? colors.amberDark : colors.navy}
          />

          <View style={styles.rowMain}>
            <View style={styles.nameLine}>
              <Txt variant="heading" numberOfLines={1} style={styles.name}>
                {person.full_name}
              </Txt>
              {person.is_owner ? <Badge label="Owner" tone="amber" /> : null}
              {person.is_head ? (
                <Badge
                  label={`Head · ${person.team_count}`}
                  tone="blue"
                  icon="people-outline"
                />
              ) : null}
              {dim ? <Badge label="Off" tone="red" /> : null}
            </View>
            <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
              {prettyMobile(person.mobile)}
              {person.job_title ? ` · ${person.job_title}` : ''}
              {person.head_name ? ` · under ${person.head_name}` : ''}
            </Txt>

            <View style={styles.checkLine}>
              {person.last_check_result ? (
                <>
                  <CheckResultBadge
                    result={person.last_check_result}
                    difference={Number(person.last_check_difference ?? 0)}
                  />
                  <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
                    {formatDate(person.last_checked_at)}
                  </Txt>
                </>
              ) : (
                <Txt variant="caption" color={colors.textFaint}>
                  Never counted
                </Txt>
              )}
            </View>
          </View>

          {wide ? (
            <Badge
              label={ROLE_LABEL[person.role]}
              tone={person.role === 'employee' ? 'grey' : 'navy'}
            />
          ) : null}

          <View style={styles.rowEnd}>
            <View style={styles.balanceBox}>
              <Money amount={balance} size="md" />
              <Txt variant="caption" color={balance < 0 ? colors.red : colors.textFaint}>
                {balance < 0 ? 'Company owes' : 'in hand'}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowPressed: { backgroundColor: colors.navyTint },
  rowDim: { opacity: 0.6 },
  rowMain: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { flexShrink: 1 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceBox: { alignItems: 'flex-end', gap: 1 },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnPressed: { opacity: 0.85 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    padding: 14,
  },
});
