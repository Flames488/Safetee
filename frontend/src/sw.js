import { precacheAndRoute } from 'workbox-precaching';

// App-shell precaching only, same scope as before — journeys/SOS/contacts
// all need a live network round-trip to be trustworthy, so none of that
// is cached, and this deliberately does not promise offline SOS
// triggering (dishonest for a safety app to imply).
precacheAndRoute(self.__WB_MANIFEST);

// registerType: 'prompt' (see vite.config.js/UpdatePrompt.jsx) means a new
// SW installs but deliberately waits rather than taking over immediately —
// without this listener, tapping "Refresh" in that prompt would post
// SKIP_WAITING and get no response, so the new version would never
// actually activate.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const { title = 'Safetee', body = '', data = {} } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Collapses repeat notifications about the same alert into one
      // instead of stacking a fresh banner every ~20s as evidence chunks
      // land — tag is per-URL, so an unrelated alert still gets its own.
      tag: data.url || undefined,
    })
  );
});

// applicationServerKey needs raw bytes, not the base64url string itself —
// duplicated from src/lib/push.js rather than imported, since this file
// builds as its own service-worker bundle and shouldn't pull in api.js
// (which touches localStorage, unavailable in a service worker).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Browsers can silently rotate or expire a push subscription (key
// rotation, storage pressure) with no app window open. Without this,
// incoming-SOS push notifications just stop working with no recovery
// path and nothing visibly wrong to the user. This re-subscribes locally
// to keep a live subscription, then hands it to any open window via
// postMessage — the service worker itself has no auth token to complete
// the POST /devices re-registration (see listenForSubscriptionChanges in
// src/lib/push.js, the other half of this). If no window is open, the
// resubscribe still happened; the next authenticated app load re-syncs
// whatever subscription exists then (see syncPushSubscriptionIfGranted).
self.addEventListener('pushsubscriptionchange', (event) => {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) })
      .then((subscription) =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          windowClients.forEach((client) =>
            client.postMessage({ type: 'push-subscription-changed', subscription: subscription.toJSON() })
          );
        })
      )
      .catch(() => {})
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
