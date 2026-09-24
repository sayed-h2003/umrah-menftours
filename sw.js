// 🔄 الشبكة أولاً دائماً (مع الكاش احتياطياً عند انقطاع الإنترنت فقط) — كي لا تُعرَض أبداً نسخة قديمة من
// صفحة التطبيق بعد أي تحديث. لا نتدخل إطلاقاً في طلبات جوجل (البرنامج نفسه يعمل من هناك).
const CACHE_NAME = 'umrah-v3';
const SHELL = ['./', 'index.html', 'manifest.json', 'favicon.ico'];

self.addEventListener('install', e => {
  // تخزين الغلاف مسبقاً كي تظهر شاشة التحميل ورسالة «لا يوجد اتصال» حتى بدون إنترنت
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // نخزّن الردود السليمة فقط (لا صفحات 404/أخطاء) كي لا يُعرَض خطأ قديم عند انقطاع الاتصال
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
