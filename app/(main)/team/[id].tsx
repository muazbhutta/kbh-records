import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Card, Loading, SectionTitle } from '@/components/Bits';
import { KhataList } from '@/components/KhataList';
import { CashCard, Money } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTeamMember } from '@/api/team';
import { useAuth } from '@/auth/AuthProvider';
import { colors, radius } from '@/theme';

/**
 * What a head sees of one of his own people: what they are holding, how
 * it reached them, and every expense they recorded.
 *
 * It is a window, not a desk. A head cannot edit, delete or hand out
 * company money from here - only pass down his own cash, which he does
 * from his home screen.
 */
export default function TeamMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { person: me } = useAuth();
  const { data: member, isLoading, error } = useTeamMember(id);

  if (!me?.is_head) {
    return (
      <Screen>
        <Header title="Team" back />
        <Banner tone="error" message="Only a head of employees can open this." />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <Header title="Team" back />
        <Loading />
      </Screen>
    );
  }

  if (error || !member) {
    return (
      <Screen>
        <Header title="Team" back />
        <Banner
          tone="error"
          message="This person is not on your team, so there is nothing to show."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={member.full_name} subtitle="Under you" back />

      <CashCard
        title="Should be holding"
        spentLabel="Paid out"
        subtitle={member.full_name}
        owedTitle="Company owes them"
        owedNote="They spent more than they were handed"
        balance={Number(member.balance)}
        given={Number(member.money_given) + Number(member.transfers_in)}
        spent={Number(member.expenses) + Number(member.transfers_out)}
        returned={Number(member.returned)}
      />

      <SectionTitle title="How the money reached them" />
      <View style={styles.row}>
        <Tile icon="cash-outline" label="Cash in hand" amount={Number(member.in_cash)} tint={colors.green} />
        <Tile icon="card-outline" label="Bank transfer" amount={Number(member.in_transfer)} tint={colors.blue} />
        <Tile icon="receipt-outline" label="Spent" amount={Number(member.expenses)} tint={colors.red} />
      </View>

      <Card style={styles.note}>
        <Txt variant="caption" color={colors.textMuted}>
          You can see this because {member.full_name.split(' ')[0]} works under you. Only an Admin
          can change or remove anything here.
        </Txt>
      </Card>

      <SectionTitle title="Everything they recorded" />
      <KhataList
        personId={member.id}
        emptyTitle="Nothing recorded yet"
        emptyMessage="Their entries will show here as soon as they add one."
      />
    </Screen>
  );
}

function Tile({
  icon,
  label,
  amount,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  amount: number;
  tint: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
        {label}
      </Txt>
      <Money amount={amount} size="sm" tone="plain" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    gap: 4,
    padding: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 0,
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { marginTop: 12 },
});
