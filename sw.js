// 🔄 الشبكة أولاً دائماً (مع الكاش احتياطياً عند انقطاع الإنترنت فقط) — كي لا تُعرَض أبداً نسخة قديمة من
// صفحة التطبيق بعد أي تحديث. كانت المسارات القديمة (/umrah-app/) خاطئة فيفشل تثبيت الـService Worker.
const CACHE_NAME = 'umrah-v2';

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // لا نتدخل في طلبات جوجل (التطبيق نفسه)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
