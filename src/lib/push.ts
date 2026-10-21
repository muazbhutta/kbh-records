import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Turning the phone notifications on and off.
 *
 * A subscription belongs to a browser, not to a person: the same man has
 * one on the phone in his pocket and another on the office computer, and
 * switching it off on one leaves the other alone. So everything here
 * works on "this browser", and the list in the database has a row per
 * browser.
 *
 * The public half of the signing key is in the code on purpose - that is
 * what it is for, and it can only be used to address this app's own
 * notifications. The half that signs them never leaves the server.
 */

export const VAPID_PUBLIC_KEY =
  'BExDTf3wbAbOunwpCshdvRw4n06v7AFaZRVqn0i4HDOvghxUkIbktu_edvTa7KX06Ty4ZCQN3T9Ovu8VcUtbq9E';

export type PushState =
  | 'unsupported'
  | 'blocked'
  | 'off'
  | 'on'
  /** iPhone: the browser only allows this once the app is on the home screen. */
  | 'needs-install';

/** Whether this browser can be told anything at all. */
export function canPush(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

/**
 * On an iPhone, Safari only hands out a subscription once the app has
 * been added to the home screen. Asking before that gives an error the
 * person cannot act on, so the screen says what to do instead.
 */
function isUninstalledIphone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

export async function pushState(): Promise<PushState> {
  if (!canPush()) return isUninstalledIphone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (isUninstalledIphone()) return 'needs-install';

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  // An ArrayBuffer rather than the view onto it: subscribe() will not
  // take a Uint8Array that might be backed by shared memory.
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

/** A name a person will recognise in a list of their own browsers. */
function thisBrowser(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows computer';
  return 'This browser';
}

/** Asks, subscribes, and tells the database where to send. */
export async function turnPushOn(): Promise<PushState> {
  if (!canPush()) return isUninstalledIphone() ? 'needs-install' : 'unsupported';

  const allowed = await Notification.requestPermission();
  if (allowed !== 'granted') return allowed === 'denied' ? 'blocked' : 'off';

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('This browser did not give a full subscription.');
  }

  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_label: thisBrowser(),
  });
  if (error) throw new Error(error.message);

  return 'on';
}

/** Stops this browser being told. Any others carry on. */
export async function turnPushOff(): Promise<PushState> {
  if (!canPush()) return 'unsupported';

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return 'off';

  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.rpc('forget_push_subscription', { p_endpoint: endpoint });
  return 'off';
}
