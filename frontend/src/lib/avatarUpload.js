import { api } from './api';

const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — generous for a profile picture, small enough not to stall on a bad connection
const UPLOAD_TIMEOUT_MS = 30000; // same reasoning as evidenceCapture.js's UPLOAD_TIMEOUT_MS

// A phone camera photo is routinely several MB at full resolution — that
// was getting uploaded (and then re-downloaded, at full size, every time
// the avatar rendered anywhere in the app) completely unresized, which is
// why setting a profile picture felt slow. Every avatar slot in the app
// renders at 76px or smaller, so there's nothing gained past this.
const AVATAR_MAX_DIMENSION = 512;
const AVATAR_JPEG_QUALITY = 0.85;

export class AvatarUploadError extends Error {}

// Downscales/recompresses to a small JPEG via canvas. Always outputs JPEG
// regardless of the source format — at avatar size the difference from
// PNG/WebP is imperceptible, and standardizing means one predictable,
// small output rather than carrying through whatever the original was.
// Falls back to the original file untouched if resizing fails for any
// reason (unsupported API, corrupt image, etc.) — a slow upload beats a
// blocked one.
async function resizeForAvatar(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', AVATAR_JPEG_QUALITY));
    return blob ? { blob, ext: 'jpg' } : null;
  } catch {
    return null;
  }
}

// Uploads `file` straight to Supabase Storage (same signed-URL pattern as
// SOS evidence — see evidenceCapture.js) and confirms it, returning the
// updated user record (with the new avatar_url) on success.
export async function uploadAvatar(file) {
  const originalExt = ALLOWED_TYPES[file.type];
  if (!originalExt) throw new AvatarUploadError('Please choose a JPG, PNG, or WebP image.');
  if (file.size > MAX_BYTES) throw new AvatarUploadError('Image is too large — please choose one under 5MB.');

  const resized = await resizeForAvatar(file);
  const { blob, ext } = resized || { blob: file, ext: originalExt };

  const { upload_url: uploadUrl, path } = await api.createAvatarUploadUrl(ext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(uploadUrl, { method: 'PUT', body: blob, signal: controller.signal });
  } catch (err) {
    // A genuine network failure (offline, DNS, CORS block, timed-out abort)
    // never reaches a response at all — this is the one case where "check
    // your connection" is actually the right message.
    throw new AvatarUploadError(
      err?.name === 'AbortError'
        ? 'Upload timed out — check your connection and try again.'
        : 'Upload failed — check your connection and try again.'
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    // Supabase Storage returns a JSON body describing exactly what it
    // rejected (bucket MIME-type restriction, size limit, expired signed
    // URL, ...) — surface that instead of a generic message that hides
    // the actual reason and makes this impossible to diagnose remotely.
    const detail = await res.json().catch(() => null);
    throw new AvatarUploadError(
      detail?.message ? `Upload rejected: ${detail.message}` : `Upload failed (HTTP ${res.status}). Please try again.`
    );
  }

  return api.confirmAvatar(path);
}
