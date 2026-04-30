const CACHE_NAME = 't-bank-loyalty-v1';

self.addEventListener('install', event => {
  self.skipWaiting(); // Сразу активируем
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim()); // Берем контроль над клиентами
});

self.addEventListener('fetch', event => {
  // Простая стратегия, чтобы PWA считалось валидным (network-first/pass-through)
  // Мы не кэшируем жестко, чтобы не сломать динамику
  event.respondWith(
    fetch(event.request).catch(() => new Response('Offline'))
  );
});
