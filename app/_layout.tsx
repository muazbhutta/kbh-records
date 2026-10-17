import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/Bits';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { makeQueryClient } from '@/lib/queryClient';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // These are the Google originals cut down to the letters this app
  // prints: 1,722 KB of font became 148 KB. Rebuild them with
  // `npm run fonts` if the text or the icons ever change.
  //
  // Ionicons is loaded here by name so @expo/vector-icons finds it
  // already in place and does not fetch its own 381 KB copy.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('../assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('../assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('../assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('../assets/fonts/Inter_700Bold.ttf'),
    Ionicons: require('../assets/fonts/Ionicons.ttf'),
  });

  const [fontsTookTooLong, setFontsTookTooLong] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontsTookTooLong(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  const queryClient = useMemo(() => makeQueryClient(), []);

  // The fonts are 148 KB now, so waiting for them is cheap - and worth
  // it: @expo/vector-icons checks whether Ionicons is already loaded and
  // fetches its own 381 KB copy if it is not, so drawing an icon before
  // ours has landed costs more than the wait ever would.
  //
  // The timeout is the safety net. If a font never arrives the app still
  // opens, in the system font, rather than showing a white screen for
  // ever.
  if (!fontsLoaded && !fontError && !fontsTookTooLong) return null;

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
