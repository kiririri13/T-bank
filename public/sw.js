const CACHE_NAME = 't-bank-loyalty-hub-v1';

self.addEventListener('install', event => {
  self.skipWaiting(); // Сразу активируем
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim()); // Берем контроль над клиентами
});

self.addEventListener('fetch', event => {
  // Пустой обработчик fetch нужен только для того, чтобы PWA считалось валидным для установки.
  // Мы не перехватываем запросы (не используем event.respondWith), 
  // чтобы браузер (особенно iOS Safari) обрабатывал их стандартно и не выдавал непредвиденных ошибок при шеринге.
});
