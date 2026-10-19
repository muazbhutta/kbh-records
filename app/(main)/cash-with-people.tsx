import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, Loading, SectionTitle } from '@/components/Bits';
import { breakdownStyles, DrillRow, TotalCard } from '@/components/Breakdown';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useCashWithPeople } from '@/api/breakdown';
import { useAuth } from '@/auth/AuthProvider';
import { money } from '@/lib/format';
import { colors } from '@/theme';
import type { CashHolder } from '@/types';

/**
 * Who is holding the company's cash.
 *
 * The figure on the home screen is a sum of hands. This is the hands.
 * Each line says what reached that person and what they did with it, so
 * the number beside their name can be checked rather than believed, and
 * tapping the name opens their khata where every entry behind it is.
 *
 * People the company owes are kept apart, below. They are not holding
 * anything - they are out of pocket - and adding a minus figure into a
 * list of what is in hand would make both numbers mean less.
 */
export default function CashWithPeopleScreen() {
  const router = useRouter();
  const { canManage } = useAuth();
  const { data, isLoading, error } = useCashWithPeople(canManage);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Cash with people" back />
        <Banner tone="error" message="Only an Admin can see who is holding the cash." />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <Header title="Cash with people" back />
        <Loading />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Header title="Cash with people" back />
        <Banner tone="error" message={error.message} />
      </Screen>
    );
  }

  const rows = data ?? [];
  const holding = rows.filter((r) => Number(r.balance) > 0);
  const owed = rows.filter((r) => Number(r.balance) < 0);
  const square = rows.filter((r) => Number(r.balance) === 0);

  const inHand = holding.reduce((sum, r) => sum + Number(r.balance), 0);
  const owedTotal = owed.reduce((sum, r) => sum - Number(r.balance), 0);

  const open = (row: CashHolder) => router.push(`/people/${row.person_id}`);

  if (rows.length === 0) {
    return (
      <Screen>
        <Header title="Cash with people" back />
        <EmptyState
          icon="people-outline"
          title="Nobody on the books"
          message="Add the company's people from Settings, and their cash will show here."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Cash with people"
        subtitle={`${holding.length} of ${rows.length} holding · right now`}
        back
      />

      <TotalCard
        tone={colors.navy}
        total={inHand}
        label="IN THEIR HANDS"
        caption={
          holding.length === 1 ? '1 person is holding company cash' : `${holding.length} people are holding company cash`
        }
      />

      {holding.length > 0 ? (
        <Card padded={false} style={breakdownStyles.list}>
          {holding.map((row) => (
            <HolderRow key={row.person_id} row={row} of={inHand} tone={colors.navy} onPress={open} />
          ))}
        </Card>
      ) : (
        <Card>
          <Txt variant="caption" color={colors.textMuted} center>
            Nobody is holding company cash at the moment.
          </Txt>
        </Card>
      )}

      {owed.length > 0 ? (
        <>
          <SectionTitle title="The company owes these people" />
          <View style={styles.owedNote}>
            <Ionicons name="alert-circle" size={15} color={colors.red} />
            <Txt variant="caption" color={colors.red}>
              {money(owedTotal)} back in total — they spent more than was handed over
            </Txt>
          </View>
          <Card padded={false} style={breakdownStyles.list}>
            {owed.map((row) => (
              <HolderRow
                key={row.person_id}
                row={row}
                of={owedTotal}
                tone={colors.red}
                owed
                onPress={open}
              />
            ))}
          </Card>
        </>
      ) : null}

      {square.length > 0 ? (
        <>
          <SectionTitle title="Square" />
          <Card padded={false} style={breakdownStyles.list}>
            {square.map((row) => (
              <HolderRow
                key={row.person_id}
                row={row}
                of={0}
                tone={colors.textMuted}
                onPress={open}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * One person's line. The caption is the sum behind the figure, written
 * out, because "SAR 3,317" beside a name invites exactly one question.
 */
function HolderRow({
  row,
  of,
  tone,
  owed = false,
  onPress,
}: {
  row: CashHolder;
  of: number;
  tone: string;
  owed?: boolean;
  onPress: (row: CashHolder) => void;
}) {
  const got = Number(row.got);
  const spent = Number(row.spent);
  const back = Number(row.gave_back);
  const balance = Number(row.balance);

  const sum = [
    `Got ${money(got)}`,
    spent > 0 ? `spent ${money(spent)}` : null,
    back > 0 ? `gave back ${money(back)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <DrillRow
      leading={<Avatar name={row.full_name} size={40} />}
      title={row.full_name}
      badge={
        row.head_name ? (
          <Badge label={`Under ${row.head_name}`} tone="grey" style={breakdownStyles.badgeMid} />
        ) : null
      }
      caption={sum || 'Nothing recorded yet'}
      amount={Math.abs(balance)}
      fraction={of > 0 ? Math.abs(balance) / of : 0}
      tone={tone}
      onPress={() => onPress(row)}
    />
  );
}

const styles = StyleSheet.create({
  owedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -4,
    marginBottom: 10,
  },
});
