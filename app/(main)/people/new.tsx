import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Card } from '@/components/Bits';
import { Button } from '@/components/Button';
import { ChoiceField, Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useCreatePerson } from '@/api/people';
import { usePeopleNames } from '@/api/entries';
import { TeamFields } from '@/components/TeamFields';
import { useAuth } from '@/auth/AuthProvider';
import { formatMobileInput, normalizeMobile } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/theme';
import type { Role } from '@/types';

export default function NewPersonScreen() {
  const router = useRouter();
  const { canManage } = useAuth();
  const createPerson = useCreatePerson();
  const { data: people = [] } = usePeopleNames();

  const [fullName, setFullName] = useState('');
  const [mobileText, setMobileText] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [isHead, setIsHead] = useState(false);
  const [headId, setHeadId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Add Person" back />
        <Banner tone="error" message="Only an Admin can add people." />
      </Screen>
    );
  }

  const normalized = normalizeMobile(mobileText);

  const save = async () => {
    setError(null);

    if (fullName.trim().length < 2) return setError('Please enter the full name.');
    if (!normalized) return setError('Enter a Saudi mobile number like 050 123 4567.');
    if (!/^\d{4}$/.test(pin)) return setError('The PIN must be exactly 4 digits.');
    if (pin !== confirm) return setError('The two PINs are not the same.');

    try {
      const person = await createPerson.mutateAsync({
        fullName: fullName.trim(),
        mobile: normalized,
        role,
        pin,
        jobTitle: jobTitle.trim() || undefined,
        isHead,
        headId,
      });
      router.replace(`/people/${person.id}?created=1`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Screen
      footer={
        <Button
          label="Save Person"
          icon="checkmark-circle"
          size="lg"
          full
          loading={createPerson.isPending}
          onPress={save}
        />
      }
    >
      <Header title="Add Person" subtitle="They log in with this number and PIN" back />

      <View style={styles.form}>
        <Card>
          <View style={styles.group}>
            <Field
              label="Full name"
              value={fullName}
              onChangeText={(v) => {
                setFullName(v);
                setError(null);
              }}
              placeholder="Rana Ahmed"
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
              helper="This is also the login name."
            />

            <Field
              label="Job title (optional)"
              value={jobTitle}
              onChangeText={setJobTitle}
              placeholder="Site supervisor"
              icon="briefcase-outline"
              autoCapitalize="words"
            />
          </View>
        </Card>

        <Card>
          <ChoiceField<Role>
            label="What can this person do?"
            value={role}
            onChange={setRole}
            options={[
              {
                value: 'employee',
                label: 'Employee',
                icon: 'person-outline',
                hint: 'Adds their own entries, sees only their own khata',
              },
              {
                value: 'sub_admin',
                label: 'Sub-admin',
                icon: 'shield-half-outline',
                hint: 'Same powers as Admin, including managing other admins',
              },
              {
                value: 'admin',
                label: 'Admin',
                icon: 'shield-checkmark-outline',
                hint: 'Sees everything, edits and deletes any entry',
              },
            ]}
          />
        </Card>

        <Card>
          <TeamFields
            people={people}
            isHead={isHead}
            onIsHead={setIsHead}
            headId={headId}
            onHeadId={setHeadId}
          />
        </Card>

        <Card>
          <View style={styles.group}>
            <View style={styles.pinHead}>
              <Ionicons name="keypad-outline" size={18} color={colors.navy} />
              <Txt variant="heading">Starting PIN</Txt>
            </View>
            <Txt variant="caption" color={colors.textMuted}>
              Give them these 4 digits. You can change the PIN later at any time.
            </Txt>

            <Field
              label="4-digit PIN"
              value={pin}
              onChangeText={(v) => {
                setPin(v.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="0000"
              keyboardType="number-pad"
              maxLength={4}
              icon="lock-closed-outline"
              secret
              autoCapitalize="none"
            />

            <Field
              label="Type the PIN again"
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="0000"
              keyboardType="number-pad"
              maxLength={4}
              icon="lock-closed-outline"
              secret
              autoCapitalize="none"
            />
          </View>
        </Card>

        {error ? <Banner tone="error" message={error} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingBottom: 12 },
  group: { gap: 14 },
  pinHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
