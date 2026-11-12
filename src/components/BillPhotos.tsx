import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Txt } from '@/components/Txt';
import { MAX_PHOTOS, signedUrl, type LocalPhoto } from '@/lib/photos';
import { colors, radius } from '@/theme';

// ======================================================== picking them
export function PhotoPicker({
  photos,
  onAdd,
  onRemove,
  onCamera,
  onGallery,
  busy,
  error,
  hint,
}: {
  photos: LocalPhoto[];
  onAdd?: () => void;
  onRemove: (key: string) => void;
  onCamera: () => void;
  onGallery: () => void;
  busy?: boolean;
  error?: string | null;
  /** One line under the buttons, e.g. keep the QR clear. */
  hint?: string | null;
}) {
  const remaining = MAX_PHOTOS - photos.length;
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <View style={styles.group}>
      <View style={styles.headRow}>
        <Txt variant="label" color={colors.textMuted}>
          BILL PHOTO
        </Txt>
        <Txt variant="caption" color={colors.textFaint}>
          {photos.length} of {MAX_PHOTOS}
        </Txt>
      </View>

      {photos.length > 0 ? (
        <View style={styles.thumbs}>
          {photos.map((p) => (
            <View key={p.key} style={styles.thumbWrap}>
              {/* The tile stays the small one, but full screen is the
                  bill itself. Looking the photograph over before saving
                  is the whole reason anybody taps it, and `preview` is
                  320 pixels across. */}
              <Pressable
                onPress={() => setViewing(p.uri || `data:image/jpeg;base64,${p.fullBase64}`)}
                accessibilityRole="imagebutton"
                accessibilityLabel="Bill photo"
              >
                <Image source={{ uri: p.preview }} style={styles.thumb} contentFit="cover" />
              </Pressable>
              <Pressable
                onPress={() => onRemove(p.key)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove this photo"
                style={styles.thumbClose}
              >
                <Ionicons name="close" size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {remaining > 0 ? (
        <View style={styles.addRow}>
          <PhotoButton
            icon="camera"
            label="Take Photo"
            onPress={onCamera}
            disabled={busy}
            primary
          />
          <PhotoButton icon="images-outline" label="From Gallery" onPress={onGallery} disabled={busy} />
        </View>
      ) : (
        <Txt variant="caption" color={colors.textFaint}>
          That is the most photos one entry can hold.
        </Txt>
      )}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.navy} />
          <Txt variant="caption" color={colors.textMuted}>
            Getting the photo ready...
          </Txt>
        </View>
      ) : null}

      {error ? (
        <Txt variant="caption" color={colors.red}>
          {error}
        </Txt>
      ) : hint ? (
        <View style={styles.hintRow}>
          <Ionicons name="qr-code-outline" size={14} color={colors.textFaint} />
          <Txt variant="caption" color={colors.textFaint} style={styles.hintText}>
            {hint}
          </Txt>
        </View>
      ) : null}

      <PhotoViewer uri={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.photoBtn,
        primary && styles.photoBtnPrimary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={24} color={primary ? colors.navyDeep : colors.navy} />
      <Txt variant="caption" weight="semibold" color={primary ? colors.navyDeep : colors.navy}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ================================================= showing a saved one
/**
 * Has this spot come near the screen yet?
 *
 * The home screen holds fifty tickets, each with a bill. Fetching all
 * fifty photographs to show the first three is ten megabytes to open
 * the app on a site with one bar - and shrinking the pictures to avoid
 * it only makes the bill unreadable, which is the whole reason it is
 * there. So the picture is full size, and it is fetched when it is
 * about to be looked at.
 *
 * A screenful of margin means it is already there by the time it is
 * scrolled to. Where there is no such thing as a viewport - a phone
 * build, or an old browser - it simply answers yes and nothing
 * changes.
 *
 * And it gives up quickly. An observer that exists but never reports
 * is a real thing - the browser this was tested in has one - and a
 * bill that never arrives is far worse than a bill that costs a little
 * to fetch. So a short wait, and then load it anyway: the worst this
 * can do is behave exactly as it did before.
 */
const GIVE_UP_AFTER_MS = 1200;

function useNearTheScreen(ref: React.RefObject<unknown>, on: boolean) {
  const [near, setNear] = useState(!on);

  useEffect(() => {
    if (!on || near) return;
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const node = ref.current as Element | null;
    if (!node || typeof node.getBoundingClientRect !== 'function') {
      setNear(true);
      return;
    }
    // The timer is for an observer that never speaks at all, not for
    // one that says "not yet". The first word it says, whatever it is,
    // proves it works and the timer is dropped - otherwise every bill
    // would load a second later and none of this would mean anything.
    let giveUp: ReturnType<typeof setTimeout> | undefined;

    const watch = new IntersectionObserver(
      (entries) => {
        if (giveUp !== undefined) {
          clearTimeout(giveUp);
          giveUp = undefined;
        }
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          watch.disconnect();
        }
      },
      { rootMargin: '800px' },
    );
    watch.observe(node);

    giveUp = setTimeout(() => {
      setNear(true);
      watch.disconnect();
    }, GIVE_UP_AFTER_MS);

    return () => {
      if (giveUp !== undefined) clearTimeout(giveUp);
      watch.disconnect();
    };
  }, [on, near, ref]);

  return near;
}

/** Loads a private bill photo through a short-lived signed link. */
export function BillImage({
  path,
  thumb,
  style,
  contentFit = 'cover',
  onPress,
  lazy = false,
}: {
  path: string | null | undefined;
  /**
   * The small copy, shown at once while the real one is still coming.
   * A bill is 200KB and a phone on site is slow: without this the card
   * sat empty for seconds and looked broken.
   */
  thumb?: string | null;
  style?: object;
  contentFit?: 'cover' | 'contain';
  onPress?: (url: string) => void;
  /** Wait until it is nearly on screen. For long lists of bills. */
  lazy?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const spot = useRef<View>(null);
  const near = useNearTheScreen(spot, lazy);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    setUrl(null);
    setThumbUrl(null);
    setFailed(false);

    // The small one first and on its own, so it can be drawn the
    // moment it lands rather than waiting on the big one beside it.
    if (thumb && thumb !== path) {
      signedUrl(thumb)
        .then((u) => alive && u && setThumbUrl(u))
        .catch(() => {});
    }

    signedUrl(path)
      .then((u) => {
        if (!alive) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path, thumb, near]);

  const body = url ? (
    <Image
      source={{ uri: url }}
      // Shown until the real one has decoded, then crossed over to.
      placeholder={thumbUrl ? { uri: thumbUrl } : undefined}
      placeholderContentFit={contentFit}
      style={[styles.fill, style]}
      contentFit={contentFit}
      transition={180}
    />
  ) : thumbUrl ? (
    <Image
      source={{ uri: thumbUrl }}
      style={[styles.fill, style]}
      contentFit={contentFit}
      transition={120}
    />
  ) : (
    <View ref={spot} style={[styles.placeholder, style]}>
      {failed ? (
        <Ionicons name="image-outline" size={22} color={colors.textFaint} />
      ) : near ? (
        <ActivityIndicator color={colors.textFaint} />
      ) : null}
    </View>
  );

  // Tappable as soon as there is something to look at. Waiting for the
  // full one meant a tap on a card that was plainly showing a bill did
  // nothing at all, which reads as a broken screen.
  const shown = url ?? thumbUrl;
  if (!onPress || !shown) return body;

  return (
    <Pressable onPress={() => onPress(shown)} accessibilityRole="imagebutton" accessibilityLabel="Bill photo">
      {body}
    </Pressable>
  );
}

// ======================================================== full screen
/** Tap a bill to fill the screen. Pinch, or double tap, to zoom in. */
export function PhotoViewer({
  uri,
  onClose,
  caption,
}: {
  uri: string | null;
  onClose: () => void;
  caption?: string;
}) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
  };

  useEffect(() => {
    if (uri) {
      scale.value = 1;
      x.value = 0;
      y.value = 0;
    }
  }, [uri, scale, x, y]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, startScale.value * e.scale));
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        x.value = withTiming(0);
        y.value = withTiming(0);
      } else {
        scale.value = withTiming(2.5);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.viewerBody, { width, height }, imageStyle]}>
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width, height: height * 0.8 }}
                contentFit="contain"
                transition={150}
              />
            ) : null}
          </Animated.View>
        </GestureDetector>

        <View style={styles.viewerBar}>
          {caption ? (
            <Txt variant="caption" color={colors.onDarkMuted} style={styles.viewerCaption}>
              {caption}
            </Txt>
          ) : (
            <View style={styles.flex} />
          )}
          <Pressable
            onPress={() => {
              reset();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={12}
            style={styles.viewerClose}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
        </View>

        <Txt variant="caption" color={colors.onDarkMuted} center style={styles.viewerHint}>
          {Platform.OS === 'web' ? 'Double click to zoom' : 'Pinch or double tap to zoom'}
        </Txt>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: 9 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 86,
    height: 86,
    borderRadius: radius.md,
    backgroundColor: colors.navyTint,
  },
  thumbClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    minHeight: 76,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoBtnPrimary: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderStyle: 'solid',
  },
  pressed: { backgroundColor: colors.navyTint },
  disabled: { opacity: 0.5 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  hintText: { flex: 1 },

  fill: { width: '100%', height: '100%', backgroundColor: colors.navyTint },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  viewer: { flex: 1, backgroundColor: 'rgba(5, 10, 20, 0.96)', justifyContent: 'center' },
  viewerBody: { alignItems: 'center', justifyContent: 'center' },
  viewerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 48,
    paddingHorizontal: 18,
  },
  viewerCaption: { flex: 1 },
  viewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerHint: { position: 'absolute', bottom: 34, left: 0, right: 0 },
});
