/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAqHLWmRPcIyN1NvyI9J8wslRwZUM7k8Io',
  authDomain: 'collective-district-db34d.firebaseapp.com',
  projectId: 'collective-district-db34d',
  storageBucket: 'collective-district-db34d.firebasestorage.app',
  messagingSenderId: '845237460617',
  appId: '1:845237460617:web:3226844561c0ba68e9f058'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload?.notification || {};
  const data = payload?.data || {};

  const title =
    notification.title ||
    data.title ||
    'MYITARU SIMK';

  const body =
    notification.body ||
    data.body ||
    'Pembaruan antrean atau hasil pemeriksaan laboratorium Anda tersedia.';

  const targetUrl =
    data.url ||
    (data.type === 'lab_ready' ? '/mobile?tab=hasil' : '/mobile?tab=beranda');

  const options = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.id || `myitaru-${data.type || 'alert'}-${Date.now()}`,
    renotify: true,
    requireInteraction: data.type === 'queue_call',
    vibrate: data.type === 'queue_call' ? [220, 120, 220, 120, 320] : [180, 100, 180],
    data: {
      url: targetUrl,
      type: data.type || 'system',
      no_rm: data.no_rm || '',
      nomor_antrian: data.nomor_antrian || '',
      lab_order_id: data.lab_order_id || ''
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification?.data?.url || '/mobile';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/mobile') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
      return undefined;
    })
  );
});
