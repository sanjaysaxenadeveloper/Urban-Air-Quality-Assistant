/* eslint-disable no-restricted-globals */
/**
 * Firebase Cloud Messaging / Web Push Service Worker for Urban Air Quality Assistant.
 * Handles background smog alerts and opens/focuses the app on notification click.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'Urban Air Quality Alert', body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'Urban Air Quality Alert';
  const body =
    notification.body ||
    data.body ||
    'Air quality changed in one of your saved locations. Open the app for live guidance.';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: data.locationId ? `uaqa-${data.locationId}` : 'uaqa-alert',
      data: {
        url: data.url || '/',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
