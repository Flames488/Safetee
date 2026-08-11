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

// Called on every authenticated app load (see AuthContext.jsx), not just
// from Settings' explicit "enable notifications" tap. Two things this
// re-sync closes the gap on, both otherwise silent: (1) permission was
// granted in a past session before push existed / before this device was
// ever registered, and (2) the browser rotated the subscription
// server-side (key rotation, storage pressure) — pushManager.getSubscription()
// picks up whatever's current and subscribeToPush() re-registers it,
// rather than the backend quietly holding a Device row for a dead
// subscription until the user happens to revisit Settings.
export function syncPushSubscriptionIfGranted() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  subscribeToPush().catch((err) => console.error('Push subscription sync failed:', err));
}

// The service worker (see src/sw.js) can't itself complete backend
// re-registration on pushsubscriptionchange — it has no access to
// localStorage, so no auth token. It re-subscribes locally and posts the
// new subscription to any open window instead; this is the window-side
// half that finishes the job by sending it to POST /devices.
export function listenForSubscriptionChanges() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'push-subscription-changed' || !event.data.subscription) return;
    const { endpoint, keys } = event.data.subscription;
    api.registerDevice({ endpoint, keys, platform: 'web' })
      .catch((err) => console.error('Failed to sync rotated push subscription:', err));
  });
}
