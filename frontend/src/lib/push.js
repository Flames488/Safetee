import { api } from './api';

// applicationServerKey needs raw bytes, not the base64url string itself.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Only ever call this after Notification.requestPermission() has already
// resolved 'granted' — subscribe() throws otherwise. Safe to call
// repeatedly: pushManager.getSubscription() reuses an existing
// subscription instead of minting a new one, and the backend's device
// registration is itself idempotent on the same subscription.
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const { endpoint, keys } = subscription.toJSON();
  await api.registerDevice({ endpoint, keys, platform: 'web' });
  return true;
}
