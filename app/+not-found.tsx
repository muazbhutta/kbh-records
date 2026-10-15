import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/Bits';
import { Button } from '@/components/Button';
import { colors } from '@/theme';

export default function NotFound() {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <EmptyState
        icon="help-circle-outline"
        title="Page not found"
        message="That screen does not exist."
        action={<Button label="Go Home" icon="home-outline" onPress={() => router.replace('/')} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
});
