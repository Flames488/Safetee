import { api } from './api';

const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — generous for a profile picture, small enough not to stall on a bad connection
const UPLOAD_TIMEOUT_MS = 30000; // same reasoning as evidenceCapture.js's UPLOAD_TIMEOUT_MS

export class AvatarUploadError extends Error {}

// Uploads `file` straight to Supabase Storage (same signed-URL pattern as
// SOS evidence — see evidenceCapture.js) and confirms it, returning the
// updated user record (with the new avatar_url) on success.
export async function uploadAvatar(file) {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new AvatarUploadError('Please choose a JPG, PNG, or WebP image.');
  if (file.size > MAX_BYTES) throw new AvatarUploadError('Image is too large — please choose one under 5MB.');

  const { upload_url: uploadUrl, path } = await api.createAvatarUploadUrl(ext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(uploadUrl, { method: 'PUT', body: file, signal: controller.signal });
  } catch {
    throw new AvatarUploadError('Upload failed — check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new AvatarUploadError('Upload failed — check your connection and try again.');

  return api.confirmAvatar(path);
}
