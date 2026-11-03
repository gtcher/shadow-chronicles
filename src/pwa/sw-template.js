/* Service worker de Shadow Chronicles — généré par tools/pwa.ts, ne pas modifier dist/sw.js. */
const VERSION = __SC_VERSION__;
/** [url relative au scope, empreinte] */
const PRECACHE = __SC_PRECACHE__;
const CACHE = 'sc-precache-v1';
const RUNTIME = 'sc-runtime-v1';

const scope = self.registration.scope;
const abs = (u) => new URL(u, scope).href;
/** URL absolue (sans requête) → clé de cache versionnée. */
const REV = new Map(PRECACHE.map(([u, r]) => [abs(u), `${abs(u)}${u.includes('?') ? '&' : '?'}__rev=${r}`]));
REV.set(abs('index.html'), REV.get(abs('./')));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const todo = [];
    for (const key of new Set(REV.values())) if (!(await cache.match(key))) todo.push(key);
    // 6 téléchargements en parallèle ; seuls les fichiers modifiés depuis la version précédente.
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const key = todo[i++];
        const res = await fetch(key.replace(/[?&]__rev=[^&]+$/, ''), { cache: 'reload' });
        if (!res.ok) throw new Error(`${res.status} ${key}`);
        await cache.put(key, res);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set(REV.values());
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    for (const name of await caches.keys()) if (name !== CACHE && name !== RUNTIME) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'version') event.source?.postMessage({ type: 'sc-version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Polices Google : mises en cache au premier lancement pour que le jeu garde son allure hors ligne.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    })());
    return;
  }
  if (url.origin !== location.origin) return;
  const clean = url.origin + url.pathname;
  // Navigation (avec ?hero=… etc.) → la page du jeu en cache.
  const key = req.mode === 'navigate' ? REV.get(abs('./')) : REV.get(clean);
  if (key) {
    event.respondWith((async () => {
      const hit = await caches.match(key, { cacheName: CACHE });
      if (hit) return hit;
      try { return await fetch(req); }
      catch (e) { if (req.mode === 'navigate') { const p = await caches.match(REV.get(abs('./'))); if (p) return p; } throw e; }
    })());
    return;
  }
  // Hors liste (ex. version.json) : réseau d'abord, cache en secours.
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await caches.match(req, { cacheName: RUNTIME });
      if (hit) return hit;
      throw e;
    }
  })());
});
