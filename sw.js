// 🔄 الشبكة أولاً دائماً (مع الكاش احتياطياً عند انقطاع الإنترنت فقط) — كي لا تُعرَض أبداً نسخة قديمة من
// صفحة التطبيق بعد أي تحديث. لا نتدخل إطلاقاً في طلبات جوجل (البرنامج نفسه يعمل من هناك).
const CACHE_NAME = 'umrah-v6';   // رُفِع (v5⇒v6) شاشة التحميل والشعار والأيقونات الجديدة (V4.319)
// الشعار ضمن الغلاف كي تظهر شاشة التحميل بالشعار حتى بلا إنترنت
const SHELL = ['./', 'index.html', 'manifest.json', 'favicon.ico', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/logo-tile-512.png'];

self.addEventListener('install', e => {
  // تخزين الغلاف مسبقاً، كلٌّ على حدة كي لا يُفشِل عنصرٌ واحد تخزين الباقي
  e.waitUntil(caches.open(CACHE_NAME)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
    .catch(() => {}).then(() => self.skipWaiting()));
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
