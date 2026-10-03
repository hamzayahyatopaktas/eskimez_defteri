/* Eskimez Yazı Defteri — çevrimdışı servis işçisi
   Gezinme: ağ-öncelik; 4 sn içinde yanıt gelmezse önbellekteki sayfa açılır (yeni sürüm arkada yine indirilir).
   Varlıklar (yazı tipleri, pdf.js, hesap kütüphanesi, simgeler): önbellek-öncelik.
   Önbelleğe yalnız başarılı, yönlendirilmemiş, kendi sitemizden gelen yanıtlar girer;
   sayfa ayrıca gerçekten bu uygulamanın sayfası mı diye denetlenir (ara sunucu/giriş sayfası önbelleği bozmasın).
   Bulut (Supabase) istekleri başka kökene gider, servis işçisine hiç takılmaz. */
const CACHE = 'eyd-defter-20261003';
const SAYFA = './index.html';
const SAYFA_IMI = 'id="editor"';            // index.html'de bulunan, başka bir sayfada bulunmayacak iz
const AG_SURESI = 4000;
const ASSETS = [
  './index.html',
  './manifest.webmanifest',
  './ayarlar.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './fontlar/Scheherazade.ttf',
  './fontlar/Rika.otf',
  './fontlar/NimbusLatin.otf',
  './pdfjs/pdf.min.js',
  './pdfjs/pdf.worker.min.js',
  './kutuphane/supabase-2.117.2.js'
];

function iyiYanit(res) {
  return !!res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected;
}

// Kurulum: tarayıcının HTTP önbelleğini atla (cache:'reload'); biri bile inmezse kurulum başarısız olur, eski sürüm çalışmaya devam eder.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(ASSETS.map(u =>
      fetch(new Request(u, { cache: 'reload' })).then(res => {
        if (!iyiYanit(res)) throw new Error('İndirilemedi: ' + u + ' (' + res.status + ')');
        return c.put(u, res);
      })
    ))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('eyd-defter-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function sayfaSakla(res) {
  return res.text().then(metin => {
    if (metin.indexOf(SAYFA_IMI) < 0) return;  // bu uygulamanın sayfası değil: önbelleğe alma
    return caches.open(CACHE).then(c => c.put(SAYFA, new Response(metin, {
      status: 200, statusText: 'OK', headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html; charset=utf-8' }
    })));
  }).catch(() => {});
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // dış istekler (Supabase, CDN, sözlük siteleri) servis işçisine takılmasın

  if (url.pathname.endsWith('/ayarlar.js')) {    // bulut ayarları: ağ-öncelik (düzeltilen anahtar hemen geçerli olsun), çevrimdışıyken önbellek
    const ag = fetch(e.request);
    e.waitUntil(ag.then(res => { if (iyiYanit(res)) { const k = res.clone(); return caches.open(CACHE).then(c => c.put('./ayarlar.js', k)); } }).catch(() => {}));
    const zaman = new Promise(r => setTimeout(() => r(null), AG_SURESI));
    e.respondWith(
      Promise.race([ag.catch(() => null), zaman]).then(res =>
        (res && res.ok) ? res : caches.match('./ayarlar.js').then(hit => hit || res || ag))
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    const ag = fetch(e.request);
    e.waitUntil(ag.then(res => { if (iyiYanit(res)) return sayfaSakla(res.clone()); }).catch(() => {}));
    const zaman = new Promise(r => setTimeout(() => r(null), AG_SURESI));
    e.respondWith(
      Promise.race([ag.catch(() => null), zaman]).then(res => {
        if (res && res.ok) return res;
        return caches.match(SAYFA).then(hit => hit || res || ag);
      })
    );
    return;
  }

  e.respondWith(                                // varlıklar: önbellek-öncelik (sorgu dizgisi dahil birebir eşleşme)
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        if (iyiYanit(res)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
