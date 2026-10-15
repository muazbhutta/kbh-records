import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { computePhash } from '@/lib/phash';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const BILLS_BUCKET = 'bills';
export const MAX_PHOTOS = 5;

/** Long side of the stored photo, and of the small one used in lists. */
const FULL_MAX_SIDE = 1600;
const THUMB_MAX_SIDE = 320;
const FULL_QUALITY = 0.7;
const THUMB_QUALITY = 0.6;

export type LocalPhoto = {
  /** Local id while the photo only exists on this device. */
  key: string;
  /** Where the shrunk photo sits on this device, for the QR scanner. */
  uri: string;
  /** Data URI of the small version, shown straight away in the form. */
  preview: string;
  fullBase64: string;
  thumbBase64: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  /** What the picture looks like, for catching the same bill twice. */
  phash: string | null;
};

export type UploadedPhoto = {
  storage_path: string;
  thumb_path: string;
  sha256: string;
  phash: string | null;
  width: number;
  height: number;
  bytes: number;
};

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Roughly how many bytes a base64 string decodes to. */
function base64Bytes(b64: string) {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Shrinks a picked photo to something a site phone can upload on a weak
 * signal, and makes the small version used in lists. `resize({ width })`
 * keeps the ratio, so the long side is capped rather than the width, and
 * both sizes come back as base64 so the same code works on Android,
 * iPhone and the web.
 */
async function prepareCapped(uri: string): Promise<LocalPhoto> {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  const landscape = probe.width >= probe.height;

  const render = async (side: number, quality: number) => {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize(landscape ? { width: side } : { height: side });
    const image = await ctx.renderAsync();
    return image.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  };

  const full = await render(FULL_MAX_SIDE, FULL_QUALITY);
  const thumb = await render(THUMB_MAX_SIDE, THUMB_QUALITY);

  const fullBase64 = full.base64 ?? '';
  const thumbBase64 = thumb.base64 ?? '';
  const sha256 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    fullBase64,
  );
  const phash = await computePhash(uri);

  return {
    key: randomId(),
    uri: full.uri,
    preview: `data:image/jpeg;base64,${thumbBase64}`,
    fullBase64,
    thumbBase64,
    width: full.width,
    height: full.height,
    bytes: base64Bytes(fullBase64),
    sha256,
    phash,
  };
}

export class PhotoCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PhotoCancelled';
  }
}

export class PhotoPermissionDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoPermissionDenied';
  }
}

/** Opens the camera, returns the ready-to-upload photo. */
export async function takePhoto(): Promise<LocalPhoto> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoPermissionDenied(
      'The camera is blocked. Turn it on for KBH Records in your phone settings.',
    );
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) throw new PhotoCancelled();
  return prepareCapped(result.assets[0].uri);
}

/** Opens the gallery. Can return several photos at once. */
export async function pickPhotos(remaining: number): Promise<LocalPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoPermissionDenied(
      'Photos are blocked. Turn them on for KBH Records in your phone settings.',
    );
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    allowsMultipleSelection: remaining > 1,
    selectionLimit: Math.max(1, remaining),
  });
  if (result.canceled || !result.assets?.length) throw new PhotoCancelled();

  const picked: LocalPhoto[] = [];
  for (const asset of result.assets.slice(0, Math.max(1, remaining))) {
    picked.push(await prepareCapped(asset.uri));
  }
  return picked;
}

/**
 * Pushes the two sizes into the private bills bucket, under a folder
 * named after the person uploading, which is what Storage's rules allow.
 */
export async function uploadPhoto(
  photo: LocalPhoto,
  userId: string,
): Promise<UploadedPhoto> {
  const base = `${userId}/${photo.key}`;
  const fullPath = `${base}.jpg`;
  const thumbPath = `${base}-s.jpg`;

  const put = async (path: string, base64: string) => {
    const { error } = await supabase.storage
      .from(BILLS_BUCKET)
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
  };

  await put(fullPath, photo.fullBase64);
  await put(thumbPath, photo.thumbBase64);

  return {
    storage_path: fullPath,
    thumb_path: thumbPath,
    sha256: photo.sha256,
    phash: photo.phash,
    width: photo.width,
    height: photo.height,
    bytes: photo.bytes,
  };
}

export async function uploadPhotos(
  photos: LocalPhoto[],
  userId: string,
): Promise<UploadedPhoto[]> {
  const out: UploadedPhoto[] = [];
  for (const photo of photos) {
    out.push(await uploadPhoto(photo, userId));
  }
  return out;
}

/** Throws away photos that were uploaded for an entry that never saved. */
export async function removeUploaded(paths: string[]) {
  if (paths.length === 0) return;
  await supabase.storage.from(BILLS_BUCKET).remove(paths).catch(() => {});
}

// ------------------------------------------------------- signed urls

const SIGNED_TTL_SECONDS = 60 * 30;
const signedCache = new Map<string, { url: string; expires: number }>();

/** The bucket is private, so every photo is shown through a signed link. */
export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;

  const cached = signedCache.get(path);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(BILLS_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;

  signedCache.set(path, {
    url: data.signedUrl,
    expires: Date.now() + SIGNED_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/** Signs a batch in one round trip, for a list of thumbnails. */
export async function signedUrls(paths: (string | null)[]): Promise<Record<string, string>> {
  const wanted = Array.from(
    new Set(paths.filter((p): p is string => !!p && !signedCache.has(p))),
  );

  if (wanted.length > 0) {
    const { data } = await supabase.storage
      .from(BILLS_BUCKET)
      .createSignedUrls(wanted, SIGNED_TTL_SECONDS);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        signedCache.set(row.path, {
          url: row.signedUrl,
          expires: Date.now() + SIGNED_TTL_SECONDS * 1000,
        });
      }
    }
  }

  const out: Record<string, string> = {};
  for (const path of paths) {
    if (!path) continue;
    const hit = signedCache.get(path);
    if (hit) out[path] = hit.url;
  }
  return out;
}

export const canUseCamera = Platform.OS !== 'web' || typeof navigator !== 'undefined';
