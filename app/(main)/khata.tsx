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

      <View style={styles.actions}>
        <Button
          label="Add Expense"
          icon="receipt"
          onPress={() => router.push('/entry/new?type=expense')}
          style={styles.action}
        />
        <Button
          label="Send Money"
          icon="swap-horizontal"
          variant="outline"
          onPress={() => router.push('/entry/new?type=transfer')}
          style={styles.action}
        />
      </View>

      <View style={styles.list}>
        <KhataList
          personId={person?.id}
          emptyTitle="No entries yet"
          emptyMessage="Add an expense or send money and it will appear here."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { minHeight: 150, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  action: { flex: 1 },
  list: { marginTop: 18 },
});
