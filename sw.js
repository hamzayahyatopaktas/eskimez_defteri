/* Eskimez Yazı Defteri — çevrimdışı servis işçisi
   Gezinme: ağ-öncelik (yeni sürüm otomatik gelir; çevrimdışıysa önbellekten açılır)
   Varlıklar: önbellek-öncelik */
const CACHE = 'eyd-defter-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('eyd-defter-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // dış istekler (webview/sözlük siteleri, CDN) SW'ye takılmasın

  if (e.request.mode === 'navigate') {          // sayfa açılışı: ağ-öncelik → güncelleme otomatik
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();               // clone'u KULLANMADAN önce al (yarış önlenir)
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(                                // varlıklar: önbellek-öncelik
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
