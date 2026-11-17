import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { useAuth } from '@/auth/AuthProvider';
import { pushState, turnPushOn, type PushState } from '@/lib/push';
import { colors, radius } from '@/theme';

/**
 * Asking once, and then never again.
 *
 * Notifications cannot be turned on behind somebody's back. The browser
 * will not have it: Chrome and Safari both insist the person says yes
 * themselves, and on an iPhone the app has to be on the home screen
 * before the question can even be put. So the nearest honest thing to
 * "on by default" is to ask, clearly, the first time somebody is in a
 * position to answer - and to take no for an answer.
 *
 * Asked once per browser. Said no, or turned it on, or it cannot be
 * done here at all, and this never appears again; the switch is in
 * Settings either way.
 */

/** Per browser, because the subscription is per browser. */
const ASKED = 'kbh.notify.asked';

function alreadyAsked(): boolean {
  try {
    return localStorage.getItem(ASKED) === '1';
  } catch {
    // A browser with storage switched off is a browser that will be
    // asked again. Better than one that is never asked at all.
    return false;
  }
}

function rememberAsked() {
  try {
    localStorage.setItem(ASKED, '1');
  } catch {
    /* nothing to be done, and nothing worth failing over */
  }
}

export function NotifyNudge() {
  const { canManage } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (alreadyAsked()) return;
    pushState().then((s) => {
      if (!alive) return;
      setState(s);
      // Only when there is a real question to put. Already on, blocked,
      // or a browser that cannot do it: nothing to ask.
      setShow(s === 'off' || s === 'needs-install');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    rememberAsked();
    setShow(false);
  };

  const yes = async () => {
    setBusy(true);
    try {
      await turnPushOn();
    } catch {
      // Said no at the browser's own prompt, or it failed. Either way
      // the switch is in Settings and this has had its one chance.
    } finally {
      rememberAsked();
      setBusy(false);
      setShow(false);
    }
  };

  const onIphone = state === 'needs-install';

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="notifications" size={18} color={colors.white} />
        </View>
        <View style={styles.flex}>
          <Txt variant="subtitle" weight="bold">
            Turn on notifications
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {canManage
              ? 'So you know as soon as somebody records or corrects an entry.'
              : 'So you know at once if one of your entries is not accepted, and why.'}
          </Txt>
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        >
          <Ionicons name="close" size={20} color={colors.textFaint} />
        </Pressable>
      </View>

      {onIphone ? (
        <Txt variant="caption" color={colors.textMuted}>
          On an iPhone this works once KBH Records is on the home screen. Tap Share in Safari,
          then <Txt variant="caption" weight="semibold">Add to Home Screen</Txt>, and open it
          from there.
        </Txt>
      ) : (
        <Button
          label="Turn Them On"
          icon="notifications"
          variant="navy"
          full
          loading={busy}
          onPress={yes}
        />
      )}

      <Pressable onPress={dismiss} accessibilityRole="button">
        <Txt variant="caption" color={colors.textFaint} center>
          Not now — you can turn it on any time in Settings
        </Txt>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 11, borderWidth: 1, borderColor: colors.navyTint },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
});
