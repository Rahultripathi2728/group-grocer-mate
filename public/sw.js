import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// Precache only hashed assets — never HTML.
// Serving precached HTML cache-first is the classic cause of white screens
// after a deploy: the cached index.html references hashed JS chunks that no
// longer exist on the server.
const manifest = (self.__WB_MANIFEST || []).filter((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url;
  return !/\.html$/i.test(url);
});
precacheAndRoute(manifest);

// Always fetch fresh HTML from the network, fall back to cache only when offline.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'html-navigations',
      networkTimeoutSeconds: 4,
    }),
    {
      denylist: [/^\/~oauth/, /^\/api\//],
    }
  )
);

const resolveAppUrl = (path = '') => {
  const normalizedPath = String(path).replace(/^\/+/, '');
  return new URL(normalizedPath, self.registration.scope).toString();
};

// Push Notification Handler
self.addEventListener('push', (event) => {
  let data = { title: 'Expense Manager', body: 'You have a new notification' };
  const iconUrl = resolveAppUrl('pwa-icon-192.png');
  const dashboardUrl = resolveAppUrl('dashboard');
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message || 'New notification',
    icon: iconUrl,
    badge: iconUrl,
    vibrate: [100, 50, 100],
    data: {
      url: resolveAppUrl(data.url || dashboardUrl),
      type: data.type,
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Expense Manager', options)
      .then(() => {
        if ('setAppBadge' in self.navigator) {
          return self.navigator.setAppBadge();
        }
      })
      .catch(() => {})
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || resolveAppUrl('dashboard');
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          if ('navigate' in client && client.url !== url) {
            await client.navigate(url);
          }
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
