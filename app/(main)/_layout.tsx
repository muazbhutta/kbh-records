import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Bits';
import { useIsWide } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/lib/format';
import { colors, radius } from '@/theme';

type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  /** which path prefixes light this item up */
  match: (path: string) => boolean;
};

const HOME: NavItem = {
  href: '/',
  label: 'Home',
  icon: 'home-outline',
  iconActive: 'home',
  match: (p) => p === '/' || p === '',
};

const PEOPLE: NavItem = {
  href: '/people',
  label: 'People',
  icon: 'people-outline',
  iconActive: 'people',
  match: (p) => p.startsWith('/people'),
};

const KHATA: NavItem = {
  href: '/khata',
  label: 'My Khata',
  icon: 'wallet-outline',
  iconActive: 'wallet',
  match: (p) => p.startsWith('/khata'),
};

const PROJECTS: NavItem = {
  href: '/projects',
  label: 'Projects',
  icon: 'business-outline',
  iconActive: 'business',
  match: (p) => p.startsWith('/projects'),
};

const REPORTS: NavItem = {
  href: '/reports',
  label: 'Reports',
  icon: 'document-text-outline',
  iconActive: 'document-text',
  match: (p) => p.startsWith('/reports'),
};

const SETTINGS: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: 'settings-outline',
  iconActive: 'settings',
  match: (p) => p.startsWith('/settings'),
};

export default function MainLayout() {
  const { canManage, person } = useAuth();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();

  // A head of employees gets Projects too: he files his own people's
  // expenses against sites, so he needs somewhere to see them.
  const items: NavItem[] = canManage
    ? [HOME, PEOPLE, PROJECTS, REPORTS, SETTINGS]
    : person?.is_head
      ? [HOME, KHATA, PROJECTS, SETTINGS]
      : [HOME, KHATA, SETTINGS];

  const content = (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <Sidebar items={items} />
        <View style={styles.wideContent}>{content}</View>
      </View>
    );
  }

  return (
    <View style={styles.narrowRoot}>
      <View style={styles.narrowContent}>{content}</View>
      <TabBar items={items} bottomInset={insets.bottom} />
    </View>
  );
}

// ------------------------------------------------------------- sidebar
function Sidebar({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { person, logout } = useAuth();

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <Image
          source={require('../../assets/emblem.png')}
          style={styles.sidebarLogo}
          contentFit="contain"
        />
        <View style={styles.flex}>
          <Txt variant="heading" color={colors.white} numberOfLines={1}>
            KBH Records
          </Txt>
          <Txt variant="caption" color={colors.onDarkMuted} numberOfLines={1}>
            Cash accounts
          </Txt>
        </View>
      </View>

      <View style={styles.sidebarNav}>
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Pressable
              key={item.href}
              onPress={() => router.navigate(item.href as never)}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.sideItem,
                active && styles.sideItemActive,
                pressed && !active && styles.sideItemPressed,
              ]}
            >
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={21}
                color={active ? colors.navyDeep : colors.onDarkMuted}
              />
              <Txt
                variant="subtitle"
                weight="semibold"
                color={active ? colors.navyDeep : colors.white}
              >
                {item.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sidebarFoot}>
        <View style={styles.sideUser}>
          <Avatar name={person?.full_name} size={38} tone={colors.white} />
          <View style={styles.flex}>
            <Txt variant="subtitle" weight="semibold" color={colors.white} numberOfLines={1}>
              {person?.full_name ?? ''}
            </Txt>
            <Txt variant="caption" color={colors.onDarkMuted}>
              {person?.is_owner ? 'Owner' : ROLE_LABEL[person?.role ?? ''] ?? ''}
            </Txt>
          </View>
        </View>
        <Pressable
          onPress={logout}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logout, pressed && styles.sideItemPressed]}
        >
          <Ionicons name="log-out-outline" size={19} color={colors.onDarkMuted} />
          <Txt variant="caption" color={colors.onDarkMuted}>
            Log out
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

// ------------------------------------------------------------- tab bar
function TabBar({ items, bottomInset }: { items: NavItem[]; bottomInset: number }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Pressable
            key={item.href}
            onPress={() => router.navigate(item.href as never)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            style={styles.tab}
          >
            <View style={[styles.tabIcon, active && styles.tabIconActive]}>
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={22}
                color={active ? colors.navy : colors.textFaint}
              />
            </View>
            <Txt
              variant="label"
              color={active ? colors.navy : colors.textFaint}
              numberOfLines={1}
            >
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  wideContent: { flex: 1 },
  narrowRoot: { flex: 1, backgroundColor: colors.bg },
  narrowContent: { flex: 1 },

  sidebar: {
    width: 248,
    backgroundColor: colors.navy,
    paddingVertical: 20,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  sidebarBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  sidebarLogo: { width: 40, height: 30 },
  sidebarNav: { flex: 1, gap: 6, marginTop: 28 },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 13,
    height: 48,
    borderRadius: radius.md,
  },
  sideItemActive: { backgroundColor: colors.amber },
  sideItemPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  sidebarFoot: { gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  sideUser: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    height: 42,
    borderRadius: radius.md,
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  tabIcon: {
    paddingHorizontal: 16,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tabIconActive: { backgroundColor: colors.navyTint },
});
