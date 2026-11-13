// Voyagr Service Worker - Enhanced for Mobile PWA
// Version: 6.0 - Network-first for root HTML, cache JS/CSS
const CACHE_VERSION = 'v52';
const CACHE_NAME = `voyagr-${CACHE_VERSION}`;
const STATIC_CACHE = `voyagr-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `voyagr-dynamic-${CACHE_VERSION}`;
const ROUTE_CACHE = `voyagr-routes-${CACHE_VERSION}`;
// Keep current v52 map storage; read legacy v51 tiles without deleting either.
const TILE_CACHE = `voyagr-tiles-${CACHE_VERSION}`;

// Self-hosted MapLibre tile stack is proxied via /map/ (styles, sprites, glyphs, vector tiles).
// Treat these like "tile" resources so they don't flood the generic dynamic cache.
const MAP_PROXY_PATH_PREFIX = '/map/';

// Sensitive endpoints: do NOT cache responses (privacy)
const SENSITIVE_API_PATH_PREFIXES = [
  '/api/dashcam',
  '/api/cache-statistics',
  '/api/alternative-route-cache-info',
  '/api/ml-predictions',
  '/api/config',
  '/api/me',
  '/api/route',
  '/api/trip-history',
  '/api/favorites',
  '/api/search-history',
  '/api/geocode',
  '/api/reverse-geocode',
];

// Core assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/static/css/voyagr.css',
  '/static/vendor/maplibre-gl.js',
  '/static/vendor/maplibre-gl.css',
  '/static/vendor/supabase.min.js',
  '/static/js/voyagr-core.js',
  '/static/js/maplibre-helpers.js',
  '/static/js/voyagr-app.js',
  '/static/js/app/navigation-safety-ux.js',
  '/static/js/modules/navigation/journey-plan.js',
  '/static/js/app/journey-modes.js',
  '/static/vendor/picovoice/porcupine-web.iife.js',
  '/static/vendor/picovoice/web-voice-processor.iife.js',
  '/static/vendor/picovoice/porcupine_params.pv',
  '/static/vendor/picovoice/hey_satnav_wasm.ppn',
  '/static/js/app.js',
  '/static/images/icons/icon.svg',
  '/static/images/icons/icon-192.png',
  '/static/images/icons/icon-512.png',
  '/static/images/icons/icon-512-maskable.png',
];

const MAX_DYNAMIC_CACHE_SIZE = 200;
const MAX_ROUTE_CACHE_SIZE = 30;
const MAX_TILE_CACHE_SIZE = 5000;
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voyagr - Offline</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#1a1a2e;color:#fff;
display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.c{max-width:360px;padding:32px}
h1{font-size:48px;margin-bottom:8px;background:linear-gradient(135deg,#667eea,#764ba2);
-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:#aaa;margin:12px 0}
button{margin-top:20px;padding:14px 32px;border:none;border-radius:12px;font-size:16px;font-weight:600;
cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
button:active{transform:scale(0.97)}
.icon{font-size:64px;margin-bottom:16px}
</style></head><body>
<div class="c">
<div class="icon">📡</div>
<h1>Voyagr</h1>
<p>You're offline. If you were navigating, your route will resume when connectivity returns.</p>
<p style="font-size:13px;color:#777">GPS tracking continues to work offline.</p>
<button onclick="location.reload()">Retry Connection</button>
</div></body></html>`;

// Helper: Limit cache size (with single summary log)
const _lastTrimLogAt = {};
const _trimInFlight = {};
async function trimCache(cacheName, maxSize) {
  if (_trimInFlight[cacheName]) return;
  _trimInFlight[cacheName] = true;
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxSize) {
      const originalSize = keys.length;
      // Delete oldest items until we're at maxSize
      const itemsToDelete = keys.length - maxSize;
      for (let i = 0; i < itemsToDelete; i++) {
        await cache.delete(keys[i]);
      }
      const now = Date.now();
      const last = _lastTrimLogAt[cacheName] || 0;
      if (now - last > 30000) {
        _lastTrimLogAt[cacheName] = now;
        console.log(`[SW] Trimmed ${cacheName}: ${originalSize} → ${maxSize} items`);
      }
    }
  } finally {
    _trimInFlight[cacheName] = false;
  }
}

// Cache storage is optional: browser corruption or stalled disk I/O must not
// prevent a healthy network response from reaching the map.
const CACHE_OPERATION_TIMEOUT_MS = 1000;
function optionalCache(operation) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise(resolve => { timer = setTimeout(resolve, CACHE_OPERATION_TIMEOUT_MS); })
  ]).catch(() => undefined).finally(() => clearTimeout(timer));
}

function readMapCache(request) {
  if (request.cache === 'no-store' || request.cache === 'reload') return Promise.resolve();
  return optionalCache(async () => await (await caches.open(TILE_CACHE)).match(request) ||
    (await caches.open('voyagr-tiles-v51')).match(request));
}

function storeMapResponse(event, request, response) {
  if (!response.ok || request.cache === 'no-store') return;
  const copy = response.clone();
  event.waitUntil(optionalCache(async () => {
    const cache = await caches.open(TILE_CACHE);
    await cache.put(request, copy);
    await trimCache(TILE_CACHE, MAX_TILE_CACHE_SIZE);
  }));
}

// Executable releases are immutable and verified independently of CDN/HTTP caches.
const COHERENT_SHELL = 'voyagr-coherent-shell-v52';
const REQUIRED_MODULES = ['avoidance-integrity.js','journey-plan.js','journey-modes.js',
  'calculate-route-orchestration.js','navigation-lifecycle-orchestration.js',
  'route-selection.js','offline-navigation.js','voyagr-app.js','app.js'];
function releaseAsset(url) {
  const m = /^\/_voyagr\/assets\/([a-f0-9]{64})\/([a-f0-9]{64})\/(\d{3}-[A-Za-z0-9_.-]+\.(?:js|css|pv|ppn))$/.exec(url);
  return m && {release:m[1], sha256:m[2], name:m[3], url:url};
}
async function verifiedAsset(asset) {
  const cache = await caches.open('voyagr-release-v52-' + asset.release);
  async function valid(response) {
    if (!response || !response.ok || response.type === 'opaque') return false;
    const bytes = await response.clone().arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024 || (asset.bytes!==undefined && bytes.byteLength!==asset.bytes)) return false;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    return hash === asset.sha256;
  }
  const cached = await cache.match(asset.url);
  if (await valid(cached)) return cached;
  // Genuine hash identities may reuse HTTP/edge caches; verify every body.
  // A stale successful body gets one bypass retry, never an execution fallback.
  let response = await fetch(asset.url, {cache:'default', credentials:'same-origin', redirect:'error'});
  if (response.ok && !await valid(response))
    response = await fetch(asset.url, {cache:'reload', credentials:'same-origin', redirect:'error'});
  if (!await valid(response)) throw Error('Asset release digest mismatch');
  await cache.put(asset.url, response.clone());
  return response;
}
async function stageCoherentShell(response) {
  if (!response || !response.ok) throw Error('Shell unavailable');
  const html = await response.clone().text();
  const found = /<script type="application\/json" id="voyagr-asset-manifest">([\s\S]*?)<\/script>/.exec(html);
  if (!found) throw Error('Shell release manifest missing');
  const manifest = JSON.parse(found[1]);
  if (manifest.schema !== 1 || !/^[a-f0-9]{64}$/.test(manifest.release) ||
      !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 300)
    throw Error('Invalid release manifest');
  const seen = new Set();
  const assets = manifest.assets.map(entry=>{
    const asset = releaseAsset(entry.url);
    if (!asset || asset.release !== manifest.release || asset.sha256 !== entry.sha256 ||
        asset.name !== entry.name || !Number.isSafeInteger(entry.bytes) || entry.bytes<=0 || entry.bytes>10*1024*1024 || seen.has(asset.url)) throw Error('Invalid release asset');
    seen.add(asset.url); asset.bytes=entry.bytes; return asset;
  });
  if (assets.reduce((sum,a)=>sum+a.bytes,0)>32*1024*1024) throw Error('Release exceeds offline budget');
  if (!REQUIRED_MODULES.every(name=>assets.some(a=>a.name.slice(4)===name)))
    throw Error('Incomplete navigation manifest');
  await Promise.all(assets.map(verifiedAsset));
  // Commit the offline shell only after every dependency verified. An interrupted
  // candidate leaves the last coherent shell untouched; partial assets are inert.
  const shells = await caches.open(COHERENT_SHELL);
  await shells.put('/', response.clone());
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil(fetch('/', {cache:'no-cache', credentials:'same-origin'})
    .then(stageCoherentShell));
  // No skipWaiting: existing tabs, guidance and transactions keep their controller.

});
self.addEventListener('activate', event => {
  // Natural activation after old clients close. No clients.claim, cache deletion,
  // IndexedDB migration, localStorage reset, or automatic reload.
  event.waitUntil(Promise.resolve());

});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/_voyagr/assets/')) {
    const asset = releaseAsset(url.pathname);
    event.respondWith(asset ? verifiedAsset(asset).catch(()=>new Response('Verified release unavailable offline. Reconnect when safe.', {status:503})) : Promise.resolve(new Response('Invalid asset identity', {status:404})));
    return;
  }


  // Private media is network-only for every method, never queued or replayed.
  if (url.pathname.startsWith('/api/dashcam/')) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ success: false, error: 'Private recordings unavailable offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    )));
    return;
  }

  // GPS evidence must never be cached, queued or replayed across navigation fixes.
  if (url.pathname === '/api/road-context' || url.pathname === '/api/road-match') {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ success: false, error: 'Road evidence unavailable offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    )));
    return;
  }

  // Skip non-GET requests (but queue POST for background sync)
  if (request.method !== 'GET') {
    // Handle offline form submissions
    if (request.method === 'POST' && url.pathname.includes('/api/')) {
      event.respondWith(
        fetch(request.clone()).catch(() => {
          // Queue for background sync
          return new Response(
            JSON.stringify({ success: false, queued: true, error: 'Request queued for sync' }),
            { headers: { 'Content-Type': 'application/json' }, status: 202 }
          );
        })
      );
    }
    return;
  }

  // Never cache authenticated API responses, and never cache sensitive endpoints.
  if (url.pathname.startsWith('/api/')) {
    const hasAuth = request.headers.has('Authorization');
    const isSensitive = SENSITIVE_API_PATH_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
    if (hasAuth || isSensitive) {
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(
            JSON.stringify({ success: false, offline: true, error: 'Offline - request not cached for privacy' }),
            { headers: { 'Content-Type': 'application/json' }, status: 503 }
          );
        })
      );
      return;
    }
  }

  // Other API requests - network first with dynamic cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(async cache => {
              await cache.put(request, responseClone);
              await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(response => {
            return response || new Response(
              JSON.stringify({ success: false, offline: true, error: 'Offline - cached data unavailable' }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Styles, sprites and glyphs use network first. Include the root aliases
  // emitted by TileServer, as well as application fallback styles.
  const isMapProxy = url.pathname.startsWith(MAP_PROXY_PATH_PREFIX);
  const isMapStyle = ['/map/styles/', '/styles/', '/static/map/styles/'].some(prefix => url.pathname.startsWith(prefix));
  const isMapDecoration = ['/fonts/', '/glyphs/', '/sprites/'].some(prefix => url.pathname.startsWith(prefix)) ||
    (isMapProxy && /\/(fonts|glyphs|sprites)\//.test(url.pathname));
  if (isMapStyle || isMapDecoration) {
    event.respondWith(
      fetch(request, {cache:'no-cache'}).then(response => {
        storeMapResponse(event, request, response);
        return response;
      }).catch(async () => (await readMapCache(request)) || new Response('Map resource unavailable', { status: 503 }))

    );
    return;
  }

  // Start the tile network request immediately, independently of cache reads.
  // A cached tile can still win, and waitUntil keeps its refresh alive.
  if (isMapProxy || url.pathname.startsWith('/data/') || url.hostname.includes('tile') || url.pathname.includes('tiles')) {
    const cached = readMapCache(request);
    const network = fetch(request).then(response => {
      storeMapResponse(event, request, response);
      return response;
    }).catch(async () => (await cached) || new Response('Map tile unavailable', { status: 503 }));
    event.waitUntil(network.then(() => undefined));
    event.respondWith(Promise.race([network, cached.then(response => response || network)]));
    return;
  }

  // A shell and its dependency set form one committed offline release.
  if (url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(fetch(request, {cache:'no-cache'}).then(stageCoherentShell).catch(async()=>{
      const shells = await caches.open(COHERENT_SHELL);
      return await shells.match('/') || new Response('Voyagr update is incomplete. Reconnect and reopen when safe; saved data has not been cleared.', {status:503, headers:{'Content-Type':'text/plain'}});
    }));
    return;
  }

  // JS and CSS files — NETWORK FIRST so deploys take effect immediately.
  // Exact-URL fallback only. Executable release paths are handled above.
  if (url.pathname.startsWith('/static/js/') || url.pathname.startsWith('/static/css/')) {
    event.respondWith(
      fetch(request, {cache:'no-cache'})
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Never borrow another query-version revision.
          return caches.match(request)
                        .then(resp => resp || new Response('Offline', { status: 503 }));
        })
    );
    return;
  }

  // Other static assets and remaining requests - cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(request).then(networkResponse => {
          if (networkResponse.ok && request.method === 'GET') {
            const responseClone = networkResponse.clone();
            if (url.pathname.startsWith('/static/') || STATIC_ASSETS.includes(url.pathname)) {
              caches.open(STATIC_CACHE).then(cache => {
                cache.put(request, responseClone);
              });
            } else {
              caches.open(DYNAMIC_CACHE).then(async cache => {
                await cache.put(request, responseClone);
                await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
              });
            }
          }
          return networkResponse;
        });
      })
      .catch(() => {
        return caches.match('/') || new Response('Offline');
      })
  );
});

// Background sync for offline trips and routes
self.addEventListener('sync', event => {
  console.log('[SW] Sync event:', event.tag);
  if (event.tag === 'sync-trips') {
    event.waitUntil(syncTrips());
  } else if (event.tag === 'sync-routes') {
    event.waitUntil(syncRoutes());
  } else if (event.tag === 'sync-hazards') {
    event.waitUntil(syncHazardReports());
  }
});

async function syncTrips() {
  console.log('[SW] Syncing trips...');
  try {
    // Get queued trips from IndexedDB
    const trips = await getQueuedItems('pending_trips');

    for (const trip of trips) {
      try {
        const response = await fetch('/api/save-trip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trip.data)
        });

        if (response.ok) {
          await removeQueuedItem('pending_trips', trip.id);
          console.log('[SW] Synced trip:', trip.id);
        }
      } catch (err) {
        console.log('[SW] Failed to sync trip:', err);
      }
    }
  } catch (err) {
    console.log('[SW] Sync trips error:', err);
  }
}

async function syncRoutes() {
  console.log('[SW] Syncing saved routes...');
  try {
    const routes = await getQueuedItems('pending_routes');

    for (const route of routes) {
      try {
        const response = await fetch('/api/save-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(route.data)
        });

        if (response.ok) {
          await removeQueuedItem('pending_routes', route.id);
          console.log('[SW] Synced route:', route.id);
        }
      } catch (err) {
        console.log('[SW] Failed to sync route:', err);
      }
    }
  } catch (err) {
    console.log('[SW] Sync routes error:', err);
  }
}

async function syncHazardReports() {
  console.log('[SW] Syncing hazard reports...');
  try {
    const hazards = await getQueuedItems('pending_hazards');

    for (const hazard of hazards) {
      try {
        const response = await fetch('/api/report-hazard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hazard.data)
        });

        if (response.ok) {
          await removeQueuedItem('pending_hazards', hazard.id);
          console.log('[SW] Synced hazard report:', hazard.id);
        }
      } catch (err) {
        console.log('[SW] Failed to sync hazard:', err);
      }
    }
  } catch (err) {
    console.log('[SW] Sync hazards error:', err);
  }
}

// Simple IndexedDB helpers for queued items
async function getQueuedItems(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('voyagr-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => reject(getAll.error);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_trips')) {
        db.createObjectStore('pending_trips', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_hazards')) {
        db.createObjectStore('pending_hazards', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_routes')) {
        db.createObjectStore('pending_routes', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function removeQueuedItem(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('voyagr-offline', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

// Push notifications with action buttons
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Voyagr notification',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23667eea" width="192" height="192" rx="28"/><text x="50%" y="55%" font-size="110" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">V</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%23667eea" width="96" height="96" rx="16"/><text x="50%" y="55%" font-size="56" fill="white" text-anchor="middle" dominant-baseline="middle">V</text></svg>',
    tag: data.tag || 'voyagr-notification',
    requireInteraction: data.requireInteraction || false,
    vibrate: [100, 50, 100],
    data: data.url || '/',
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Voyagr', options)
  );
});

// Notification click with action handling
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: urlToOpen });
          return client.focus();
        }
      }
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notification closed');
});

// Message handler for client communication
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);

  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.type === 'CLEAR_CACHE')) {
    // Legacy tabs may send these messages. Neither is an update barrier.
    if(event.source && event.source.postMessage)event.source.postMessage({type:'UPDATE_WAITING_FOR_TABS'});
    return;
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then(cache => {
        return cache.addAll(event.data.urls);
      })
    );
  }

  // Targeted static-cache warm-up. Used to opportunistically precache large
  // vendor bundles *after* first successful page load so subsequent launches
  // — including offline — have everything ready.
  // Routed to STATIC_CACHE so it's not evicted by the dynamic cache trimmer.
  // Silently skips URLs that are already cached to keep the warm-up idempotent.
  if (event.data && event.data.type === 'WARM_STATIC_URLS') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    if (urls.length === 0) return;
    event.waitUntil(
      caches.open(STATIC_CACHE).then(async cache => {
        const toFetch = [];
        for (const u of urls) {
          try {
            const hit = await cache.match(u);
            if (!hit) toFetch.push(u);
          } catch (_e) {
            toFetch.push(u);
          }
        }
        if (toFetch.length === 0) {
          console.log('[SW] WARM_STATIC_URLS: all targets already cached');
          return;
        }
        console.log('[SW] WARM_STATIC_URLS: warming', toFetch.length, 'of', urls.length);
        // cache.add() per-url so one 404 doesn't abort the whole set.
        return Promise.all(toFetch.map(u =>
          cache.add(u).catch(err => {
            console.log('[SW] WARM_STATIC_URLS miss:', u, err && err.message);
          })
        ));
      })
    );
  }

  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys();
        let totalSize = 0;
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          totalSize += keys.length;
        }
        event.source.postMessage({ type: 'CACHE_SIZE', size: totalSize });
      })()
    );
  }
});
