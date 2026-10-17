import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PinPad } from '@/components/PinPad';
import { Txt } from '@/components/Txt';
import { useAuth } from '@/auth/AuthProvider';
import { formatMobileInput, normalizeMobile, prettyMobile } from '@/lib/format';
import { errorMessage, isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';

const LAST_MOBILE_KEY = 'kbh-last-mobile';

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<'mobile' | 'pin'>('mobile');
  const [mobileText, setMobileText] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(LAST_MOBILE_KEY)
      .then((saved) => {
        if (saved) setMobileText(formatMobileInput(saved));
      })
      .catch(() => {});
  }, []);

  const normalized = normalizeMobile(mobileText);

  const goToPin = () => {
    if (!normalized) {
      setError('Enter a Saudi mobile number like 050 123 4567.');
      return;
    }
    setError(null);
    setPin('');
    setStep('pin');
  };

  const submit = useCallback(
    async (value: string) => {
      if (!normalized || value.length !== 4 || busy) return;
      setBusy(true);
      setError(null);
      try {
        await login(normalized, value);
        AsyncStorage.setItem(LAST_MOBILE_KEY, normalized).catch(() => {});
      } catch (err) {
        setError(errorMessage(err));
        setPin('');
        setShake((n) => n + 1);
      } finally {
        setBusy(false);
      }
    },
    [busy, login, normalized],
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.inner}>
        <View style={styles.brand}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            contentFit="contain"
            transition={200}
          />
        </View>

        <View style={[styles.card, shadow.raised]}>
          {step === 'mobile' ? (
            <>
              <Txt variant="title" center>
                Log in
              </Txt>
              <Txt variant="caption" color={colors.textMuted} center>
                Enter your mobile number
              </Txt>

              <Field
                label="Mobile number"
                value={mobileText}
                onChangeText={(v) => {
                  setMobileText(formatMobileInput(v));
                  setError(null);
                }}
                placeholder="050 123 4567"
                keyboardType="number-pad"
                icon="call-outline"
                prefix="+966"
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={goToPin}
                style={styles.field}
              />

              {error ? <Banner tone="error" message={error} /> : null}

              <Button
                label="Next"
                iconRight="arrow-forward"
                size="lg"
                full
                onPress={goToPin}
                disabled={!normalized}
              />
            </>
          ) : (
            <>
              <Txt variant="title" center>
                Enter your PIN
              </Txt>
              <Pressable
                onPress={() => {
                  setStep('mobile');
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Change mobile number"
                style={styles.numberRow}
              >
                <Txt variant="caption" color={colors.textMuted}>
                  {prettyMobile(normalized ?? '')}
                </Txt>
                <Ionicons name="create-outline" size={15} color={colors.blue} />
              </Pressable>

              <View style={styles.padWrap}>
                <PinPad
                  value={pin}
                  onChange={(v) => {
                    setPin(v);
                    if (error) setError(null);
                  }}
                  onComplete={submit}
                  disabled={busy}
                  shake={shake}
                />
              </View>

              {error ? <Banner tone="error" message={error} /> : null}

              <Button
                label={busy ? 'Checking...' : 'Log in'}
                size="lg"
                full
                loading={busy}
                disabled={pin.length !== 4}
                onPress={() => submit(pin)}
              />
            </>
          )}
        </View>

        {!isSupabaseConfigured ? (
          <View style={styles.notice}>
            <Banner
              tone="warn"
              title="Not connected yet"
              message="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the .env file, then restart the app."
            />
          </View>
        ) : null}

        <Txt variant="caption" color={colors.textFaint} center style={styles.foot}>
          Forgot your PIN? Ask the owner to set a new one.
        </Txt>

        {__DEV__ ? (
          <Link href="/setup" asChild>
            <Pressable style={styles.devLink}>
              <Txt variant="caption" color={colors.textFaint}>
                First time setup
              </Txt>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  inner: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 18 },
  brand: { alignItems: 'center', paddingBottom: 4 },
  logo: { width: 190, height: 128 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    gap: 16,
  },
  field: { marginTop: 4 },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: -8,
  },
  padWrap: { marginTop: 6, marginBottom: 2 },
  notice: { marginTop: 4 },
  foot: { marginTop: 2 },
  devLink: { alignSelf: 'center', padding: 8, opacity: Platform.OS === 'web' ? 0.7 : 0.6 },
});
