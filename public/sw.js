// SmartBetBot Web Push Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: '⚽ SmartBetBot - Nueva Alerta MCP',
    body: 'Nuevos pronósticos de alto valor (+EV) disponibles.',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    url: '/signals',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || '/signals',
      dateOfArrival: Date.now(),
      primaryKey: data.id || 'smartbetbot-alert',
    },
    actions: [
      { action: 'open_app', title: '👀 Ver Pronósticos' },
      { action: 'view_parlay', title: '🔥 Ver Parleys' },
    ],
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let targetUrl = event.notification.data?.url || '/signals';
  if (event.action === 'view_parlay') {
    targetUrl = '/parlay';
  } else if (event.action === 'open_app') {
    targetUrl = '/signals';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
