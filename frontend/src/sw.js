import { precacheAndRoute } from 'workbox-precaching';

// App-shell precaching only, same scope as before — journeys/SOS/contacts
// all need a live network round-trip to be trustworthy, so none of that
// is cached, and this deliberately does not promise offline SOS
// triggering (dishonest for a safety app to imply).
precacheAndRoute(self.__WB_MANIFEST);

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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // HashRouter — the app's real routes live after a `#`, so a plain path
  // in the push payload (e.g. "/track/{id}/evidence") needs that prefixed
  // back on before it means anything to the SPA.
  const targetPath = event.notification.data?.url || '/';
  const targetUrl = new URL(`/#${targetPath}`, self.location.origin).href;

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
