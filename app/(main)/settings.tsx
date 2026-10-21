import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Card, DetailRow, SectionTitle } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { PushSwitch } from '@/components/PushSwitch';
import { useAuth } from '@/auth/AuthProvider';
import { prettyMobile, ROLE_LABEL } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius } from '@/theme';

/** The stamp the build wrote into the page, or a word saying there is none. */
function buildStamp(): string {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 'app';
  const tag = document.querySelector('meta[name="kbh-build"]');
  return tag?.getAttribute('content') || 'before builds were stamped';
}

export default function SettingsScreen() {
  const { person, canManage, logout } = useAuth();
  const router = useRouter();

  return (
    <Screen>
      <Header title="Settings" />

      <Card style={styles.me}>
        <Avatar
          name={person?.full_name}
          size={54}
          tone={person?.is_owner ? colors.amberDark : colors.navy}
        />
        <View style={styles.meText}>
          <Txt variant="heading" numberOfLines={1}>
            {person?.full_name}
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {prettyMobile(person?.mobile)}
          </Txt>
          <View style={styles.badges}>
            {person?.is_owner ? <Badge label="Owner" tone="amber" /> : null}
            <Badge
              label={ROLE_LABEL[person?.role ?? ''] ?? ''}
              tone={person?.role === 'employee' ? 'grey' : 'navy'}
            />
          </View>
        </View>
      </Card>

      {canManage ? (
        <>
          <SectionTitle title="Company" />
          <Card padded={false}>
            <LinkRow
              icon="people"
              label="People & Roles"
              hint="Add staff, change roles, reset PINs"
              onPress={() => router.push('/people')}
            />
            <LinkRow
              icon="person-add"
              label="Add Person"
              hint="New employee, sub-admin or admin"
              onPress={() => router.push('/people/new')}
            />
            <LinkRow
              icon="pricetags"
              label="Expense Categories"
              hint="Add, rename or hide what expenses are filed under"
              onPress={() => router.push('/categories')}
              last
            />
          </Card>

          {/* The four an Admin opens when something looks wrong. */}
          <SectionTitle title="Checks & history" />
          <Card padded={false}>
            <LinkRow
              icon="pricetag"
              label="Check Bill Type"
              hint="Expenses the app could not read"
              onPress={() => router.push('/check-type')}
            />
            <LinkRow
              icon="copy"
              label="Suspected Duplicates"
              hint="The same bill recorded twice"
              onPress={() => router.push('/duplicates')}
            />
            <LinkRow
              icon="time"
              label="Change History"
              hint="Who changed what, and when"
              onPress={() => router.push('/history')}
            />
            <LinkRow
              icon="trash"
              label="Deleted Entries"
              hint="Hidden entries, and how to put one back"
              onPress={() => router.push('/deleted')}
              last
            />
          </Card>

          <SectionTitle title="Reports" />
          <Card padded={false}>
            <LinkRow
              icon="document-text"
              label="Reports & Downloads"
              hint="Petty, Invoice and All Expenses PDFs, and the bill photo ZIP"
              onPress={() => router.push('/reports')}
              last
            />
          </Card>

        </>
      ) : null}

      {canManage ? <PushSwitch /> : null}

      <SectionTitle title="About" />
      <Card padded={false} style={styles.aboutCard}>
        <DetailRow label="App" value="KBH Records" />
        <DetailRow
          label="Version"
          value={`${Constants.expoConfig?.version ?? '1.0.0'} (${Platform.OS})`}
        />
        {/*
          Which build this phone actually has. Telling a cached old copy
          from a real fault was guesswork without it, and the guessing
          cost two rounds of asking somebody to delete and reinstall.
        */}
        <DetailRow label="Build" value={buildStamp()} />
        <DetailRow label="Currency" value="SAR - Saudi Riyal" />
        <DetailRow label="Time zone" value="Asia/Riyadh" />
        <DetailRow
          label="Database"
          value={isSupabaseConfigured ? 'Connected' : 'Not connected'}
          valueColor={isSupabaseConfigured ? colors.green : colors.red}
          last
        />
      </Card>

      <View style={styles.logout}>
        <Button label="Log out" icon="log-out-outline" variant="outline" size="lg" full onPress={logout} />
      </View>
    </Screen>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={colors.navy} />
      </View>
      <View style={styles.rowText}>
        <Txt variant="subtitle" weight="semibold">
          {label}
        </Txt>
        {hint ? (
          <Txt variant="caption" color={colors.textMuted}>
            {hint}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}


const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 6 },
  meText: { flex: 1, gap: 3 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowPressed: { backgroundColor: colors.navyTint },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 1 },
  aboutCard: { paddingHorizontal: 16 },
  logout: { marginTop: 18, marginBottom: 8 },
});
