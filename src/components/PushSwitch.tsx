import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Card, SectionTitle } from '@/components/Bits';
import { Txt } from '@/components/Txt';
import {
  pushState,
  refreshPushSubscription,
  turnPushOff,
  turnPushOn,
  whatIsMissing,
  type PushState,
} from '@/lib/push';
import { colors, radius } from '@/theme';

/**
 * Being told on the phone when something is recorded or corrected.
 *
 * Only the office is sent these, so only the office is offered the
 * switch. It is per browser: the same man can have it on for the phone
 * in his pocket and off for the computer on his desk.
 *
 * The notification is a nudge and says so. The Waiting for you list on
 * the home screen is the record, and it is there whether a phone buzzed
 * or not.
 */
export function PushSwitch() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = whatIsMissing();

  useEffect(() => {
    let alive = true;
    pushState().then((s) => {
      if (!alive) return;
      setState(s);
      // The browser can replace a subscription without saying so, and
      // then the messages quietly stop. Saving it again keeps it alive.
      if (s === 'on') void refreshPushSubscription();
    });
    return () => {
      alive = false;
    };
  }, []);

  const flip = async () => {
    setError(null);
    setBusy(true);
    try {
      setState(state === 'on' ? await turnPushOff() : await turnPushOn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  // Never nothing. A screen that vanishes when it cannot do something
  // looks exactly like a broken app, and was taken for one.
  if (state === null) return null;

  return (
    <>
      <SectionTitle title="Being told" />
      <Card>
        {state === 'too-old' ? (
          <View style={styles.note}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.amberDark} />
            <Txt variant="caption" color={colors.textMuted}>
              This iPhone is too old for notifications. Safari learned to do them in{' '}
              <Txt variant="caption" weight="semibold">iOS 16.4</Txt>. Update the phone from
              Settings, then come back here.
            </Txt>
          </View>
        ) : state === 'unsupported' ? (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <View style={styles.flex}>
              <Txt variant="caption" color={colors.textMuted}>
                This browser cannot show notifications. Everything still waits for you on the home
                screen.
              </Txt>
              {missing.length > 0 ? (
                <Txt variant="caption" color={colors.textFaint}>
                  It has no {missing.join(', no ')}.
                </Txt>
              ) : null}
            </View>
          </View>
        ) : state === 'needs-install' ? (
          <View style={styles.note}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.blue} />
            <Txt variant="caption" color={colors.textMuted}>
              On an iPhone, notifications only work once KBH Records is on the home screen. Open
              this in Safari, tap Share, then <Txt variant="caption" weight="semibold">Add to Home
              Screen</Txt> — and turn this on from there.
            </Txt>
          </View>
        ) : state === 'blocked' ? (
          <View style={styles.note}>
            <Ionicons name="notifications-off-outline" size={18} color={colors.red} />
            <Txt variant="caption" color={colors.textMuted}>
              Notifications are blocked for this app in your browser or phone settings. Turn them
              back on there first.
            </Txt>
          </View>
        ) : (
          <>
            <Pressable
              onPress={flip}
              disabled={busy}
              accessibilityRole="switch"
              accessibilityState={{ checked: state === 'on' }}
              accessibilityLabel="Tell me on this phone when something is recorded"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View
                style={[styles.icon, { backgroundColor: state === 'on' ? colors.greenSoft : colors.line }]}
              >
                <Ionicons
                  name={state === 'on' ? 'notifications' : 'notifications-outline'}
                  size={18}
                  color={state === 'on' ? colors.green : colors.textMuted}
                />
              </View>
              <View style={styles.words}>
                <Txt variant="subtitle" weight="semibold">
                  Tell me on this phone
                </Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  {state === 'on'
                    ? 'On for this browser. Every entry and every correction.'
                    : 'Off. Turn it on to be told without opening the app.'}
                </Txt>
              </View>
              {busy ? (
                <ActivityIndicator color={colors.navy} size="small" />
              ) : (
                <View style={[styles.pill, state === 'on' && styles.pillOn]}>
                  <View style={[styles.knob, state === 'on' && styles.knobOn]} />
                </View>
              )}
            </Pressable>

            <Txt variant="caption" color={colors.textFaint} style={styles.foot}>
              Each phone and computer is set separately. Whether one buzzes or not, everything
              still waits for you on the home screen.
            </Txt>
          </>
        )}

        {error ? <Banner tone="error" message={error} /> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1, gap: 2 },
  pill: {
    width: 46,
    height: 27,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    padding: 3,
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: colors.green },
  knob: {
    width: 21,
    height: 21,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  knobOn: { alignSelf: 'flex-end' },

  note: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  flex: { flex: 1, gap: 3 },
  foot: { marginTop: 10 },
});
