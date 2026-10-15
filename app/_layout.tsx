import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/Bits';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { makeQueryClient } from '@/lib/queryClient';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const queryClient = useMemo(() => makeQueryClient(), []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <AuthGate />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Sends the user to the right place: the one-time Owner setup on an
 * empty database, the login screen when signed out, the app when in.
 */
function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && !splashGone) {
      SplashScreen.hideAsync().catch(() => {});
      setSplashGone(true);
    }
  }, [status, splashGone]);

  useEffect(() => {
    if (status === 'loading') return;

    const path = segments.join('/');
    const inAuth = path.startsWith('(auth)');

    if (status === 'signed-in' && inAuth) {
      router.replace('/');
    } else if (status === 'signed-out' && !inAuth) {
      router.replace('/login');
    } else if (status === 'needs-owner' && !path.includes('setup')) {
      router.replace('/setup');
    }
  }, [status, segments, router]);

  if (status === 'loading') {
    return (
      <View style={styles.boot}>
        <Loading />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(main)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
