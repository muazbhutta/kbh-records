import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
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
              <Pressable
                onPress={() => setViewing(p.preview)}
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
/** Loads a private bill photo through a short-lived signed link. */
export function BillImage({
  path,
  style,
  contentFit = 'cover',
  onPress,
}: {
  path: string | null | undefined;
  style?: object;
  contentFit?: 'cover' | 'contain';
  onPress?: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
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
  }, [path]);

  const body = url ? (
    <Image source={{ uri: url }} style={[styles.fill, style]} contentFit={contentFit} transition={180} />
  ) : (
    <View style={[styles.placeholder, style]}>
      {failed ? (
        <Ionicons name="image-outline" size={22} color={colors.textFaint} />
      ) : (
        <ActivityIndicator color={colors.textFaint} />
      )}
    </View>
  );

  if (!onPress || !url) return body;

  return (
    <Pressable onPress={() => onPress(url)} accessibilityRole="imagebutton" accessibilityLabel="Bill photo">
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
