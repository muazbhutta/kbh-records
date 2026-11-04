/**
 * The number on the app icon.
 *
 * An admin wants to know there is something waiting without opening
 * anything, the way every other app on the phone tells him. The Badging
 * API does exactly that on an installed app - Android, Windows, and an
 * iPhone from 16.4 - and does nothing at all anywhere else, which is
 * why every call here is guarded and silent. A phone that cannot show
 * the number is not a phone that should see an error about it.
 */

type Badger = {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function badger(): Badger | null {
  if (typeof navigator === 'undefined') return null;
  const n = navigator as unknown as Badger;
  return typeof n.setAppBadge === 'function' ? n : null;
}

/** Whether this phone will show a number at all. */
export function canShowBadge(): boolean {
  return badger() !== null;
}

/**
 * Put `count` on the icon, or take the number off at nought.
 *
 * Never throws. Safari refuses before notifications are allowed, and a
 * rejected promise here must not reach a screen.
 */
export function showBadge(count: number): void {
  const n = badger();
  if (!n) return;
  try {
    if (count > 0) void n.setAppBadge?.(count)?.catch(() => {});
    else void n.clearAppBadge?.()?.catch(() => {});
  } catch {
    // Nothing to do: the number is a convenience, not the record.
  }
}
