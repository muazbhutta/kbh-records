import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PinPad } from '@/components/PinPad';
import { Txt } from '@/components/Txt';
import { useAuth } from '@/auth/AuthProvider';
import { formatMobileInput, normalizeMobile, prettyMobile } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';

type Step = 'details' | 'pin' | 'confirm';

/**
 * Shown once, on a completely empty database. Creates the Owner, who is
 * an Admin that can never be deleted, disabled or downgraded.
 */
export default function SetupScreen() {
  const { createOwner } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('details');
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [mobileText, setMobileText] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const normalized = normalizeMobile(mobileText);
  const nameOk = fullName.trim().length >= 2;

  const nextFromDetails = () => {
    if (!nameOk) return setError('Please enter the full name.');
    if (!normalized) return setError('Enter a Saudi mobile number like 050 123 4567.');
    setError(null);
    setStep('pin');
  };

  const finish = async (confirmPin: string) => {
    if (confirmPin !== pin) {
      setError('The two PINs are not the same. Try again.');
      setConfirm('');
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createOwner({
        fullName: fullName.trim(),
        mobile: normalized!,
        pin,
        jobTitle: jobTitle.trim() || undefined,
      });
    } catch (err) {
      setError(errorMessage(err));
      setStep('pin');
      setPin('');
      setConfirm('');
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 },
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
          />
        </View>

        <View style={styles.steps}>
          {(['details', 'pin', 'confirm'] as Step[]).map((s, i) => {
            const order: Step[] = ['details', 'pin', 'confirm'];
            const done = order.indexOf(step) > i;
            const active = step === s;
            return (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  (active || done) && styles.stepDotOn,
                  active && styles.stepDotActive,
                ]}
              />
            );
          })}
        </View>

        <View style={[styles.card, shadow.raised]}>
          {step === 'details' ? (
            <>
              <View style={styles.titleWrap}>
                <View style={styles.crown}>
                  <Ionicons name="shield-checkmark" size={22} color={colors.amberDark} />
                </View>
                <Txt variant="title" center>
                  Create Owner Account
                </Txt>
                <Txt variant="caption" color={colors.textMuted} center>
                  This is the first and main account. It can never be deleted or turned off.
                </Txt>
              </View>

              <Field
                label="Full name"
                value={fullName}
                onChangeText={(v) => {
                  setFullName(v);
                  setError(null);
                }}
                placeholder="Saleem"
                icon="person-outline"
                autoCapitalize="words"
              />

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
              />

              <Field
                label="Job title (optional)"
                value={jobTitle}
                onChangeText={setJobTitle}
                placeholder="Owner"
                icon="briefcase-outline"
                autoCapitalize="words"
              />

              {error ? <Banner tone="error" message={error} /> : null}

              <Button label="Next" iconRight="arrow-forward" size="lg" full onPress={nextFromDetails} />
            </>
          ) : (
            <>
              <Txt variant="title" center>
                {step === 'pin' ? 'Choose a 4-digit PIN' : 'Enter the PIN again'}
              </Txt>
              <Txt variant="caption" color={colors.textMuted} center>
                {step === 'pin'
                  ? 'You will use this PIN every time you log in.'
                  : `For ${prettyMobile(normalized ?? '')}`}
              </Txt>

              <View style={styles.padWrap}>
                <PinPad
                  value={step === 'pin' ? pin : confirm}
                  onChange={(v) => {
                    if (step === 'pin') setPin(v);
                    else setConfirm(v);
                    if (error) setError(null);
                  }}
                  onComplete={(v) => {
                    if (step === 'pin') {
                      setStep('confirm');
                      setConfirm('');
                    } else {
                      finish(v);
                    }
                  }}
                  disabled={busy}
                  shake={shake}
                />
              </View>

              {error ? <Banner tone="error" message={error} /> : null}

              {busy ? (
                <Button label="Creating account..." size="lg" full loading />
              ) : (
                <Pressable
                  onPress={() => {
                    setError(null);
                    if (step === 'confirm') {
                      setStep('pin');
                      setPin('');
                      setConfirm('');
                    } else {
                      setStep('details');
                    }
                  }}
                  accessibilityRole="button"
                  style={styles.backLink}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
                  <Txt variant="caption" color={colors.textMuted}>
                    Back
                  </Txt>
                </Pressable>
              )}
            </>
          )}
        </View>

        <Txt variant="caption" color={colors.textFaint} center>
          You can add your staff right after this.
        </Txt>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  inner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 16 },
  brand: { alignItems: 'center' },
  logo: { width: 150, height: 100 },
  steps: { flexDirection: 'row', gap: 7, alignSelf: 'center' },
  stepDot: { width: 22, height: 5, borderRadius: 3, backgroundColor: colors.line },
  stepDotOn: { backgroundColor: colors.navySoft },
  stepDotActive: { backgroundColor: colors.amber, width: 30 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    gap: 16,
  },
  titleWrap: { alignItems: 'center', gap: 6 },
  crown: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  padWrap: { marginTop: 4 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'center', padding: 8 },
});
