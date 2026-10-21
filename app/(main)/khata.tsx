import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { KhataList } from '@/components/KhataList';
import { CashCard } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { useTotals } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';

/** Everything that has ever touched my own cash. */
export default function MyKhataScreen() {
  const { person } = useAuth();
  const router = useRouter();
  const { data: totals, isLoading } = useTotals(person?.id);

  return (
    <Screen>
      <Header title="My Khata" subtitle="Every entry on your name" />

      {isLoading || !totals ? (
        <Card style={styles.skeleton}>
          <Loading />
        </Card>
      ) : (
        <CashCard
          spentLabel="Paid out"
          owedTitle="The company owes you"
          owedNote="You spent more than you were handed"
          balance={Number(totals.balance)}
          given={Number(totals.money_given) + Number(totals.transfers_in)}
          spent={Number(totals.expenses) + Number(totals.transfers_out)}
          returned={Number(totals.returned)}
        />
      )}

      {/*
        Money goes out from the office now, so nobody but the office
        sends any - not a head, not anybody. The button went with the
        rule; leaving it would have been a button that could only ever
        say no.
      */}
      <View style={styles.actions}>
        <Button
          label="Add Expense"
          icon="receipt"
          size="lg"
          full
          onPress={() => router.push('/entry/new?type=expense')}
        />
      </View>

      <View style={styles.list}>
        <KhataList
          personId={person?.id}
          showSent={false}
          emptyTitle="No entries yet"
          emptyMessage="Record an expense and it will appear here."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { minHeight: 150, justifyContent: 'center' },
  actions: { marginTop: 16 },
  list: { marginTop: 18 },
});
