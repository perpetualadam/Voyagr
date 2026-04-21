// Voyagr Service Worker - Enhanced for Mobile PWA
// Version: 6.0 - Network-first for root HTML, cache JS/CSS
const CACHE_VERSION = 'v22';
const CACHE_NAME = `voyagr-${CACHE_VERSION}`;
const STATIC_CACHE = `voyagr-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `voyagr-dynamic-${CACHE_VERSION}`;
const ROUTE_CACHE = `voyagr-routes-${CACHE_VERSION}`;
const TILE_CACHE = `voyagr-tiles-${CACHE_VERSION}`;

// Self-hosted MapLibre tile stack is proxied via /map/ (styles, sprites, glyphs, vector tiles).
// Treat these like "tile" resources so they don't flood the generic dynamic cache.
const MAP_PROXY_PATH_PREFIX = '/map/';

// Sensitive endpoints: do NOT cache responses (privacy)
const SENSITIVE_API_PATH_PREFIXES = [
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
  '/static/js/sherpa-kws-map-runtime.js',
  '/static/js/sherpa-onnx-kws-spike.js',
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

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log(`[Service Worker] Installing ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[Service Worker] Caching static assets');
      return Promise.all(
        STATIC_ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.log('[SW] Failed to cache:', url, err.message);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log(`[Service Worker] Activating ${CACHE_VERSION}...`);
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, ROUTE_CACHE, TILE_CACHE, CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

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

  // Map resources
  // - Vector tiles can be cached cache-first (fast + offline-friendly).
  // - Styles/sprites/glyphs should NOT be cache-first, otherwise the PWA can get "stuck"
  //   on an older (or broken) style where labels never appear.
  const isMapProxy = url.pathname.startsWith(MAP_PROXY_PATH_PREFIX);
  const isMapStyle = isMapProxy && url.pathname.startsWith('/map/styles/');
  const isMapSprite = isMapProxy && url.pathname.includes('/sprites/');
  const isMapGlyphsOrFonts = isMapProxy && (url.pathname.includes('/glyphs/') || url.pathname.includes('/fonts/'));

  // Map styles/sprites/glyphs/fonts - NETWORK FIRST with cache fallback
  if (isMapStyle || isMapSprite || isMapGlyphsOrFonts) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(TILE_CACHE).then(async cache => {
              await cache.put(request, responseClone);
              await trimCache(TILE_CACHE, MAX_TILE_CACHE_SIZE);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.open(TILE_CACHE).then(cache => cache.match(request)))
        .then(resp => resp || new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Map tiles - cache first with network update (stale-while-revalidate)
  // Includes our self-hosted vector tile stack proxied via /map/.
  if (isMapProxy || url.hostname.includes('tile') || url.pathname.includes('tiles')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache => cache.match(request)).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(TILE_CACHE).then(async cache => {
              await cache.put(request, responseClone);
              await trimCache(TILE_CACHE, MAX_TILE_CACHE_SIZE);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Root HTML page - NETWORK FIRST to always get fresh API keys
  // This ensures TomTom and other API keys are always current
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the fresh response for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(response => {
            return response || new Response(OFFLINE_HTML, {
              headers: { 'Content-Type': 'text/html' }
            });
          });
        })
    );
    return;
  }

  // JS and CSS files — NETWORK FIRST so deploys take effect immediately.
  // Falls back to cache (including ignoreSearch) for offline use.
  if (url.pathname.startsWith('/static/js/') || url.pathname.startsWith('/static/css/')) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline: try exact match first, then ignoreSearch to handle cache-buster changes.
          return caches.match(request)
            .then(resp => resp || caches.match(request, { ignoreSearch: true }))
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

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then(cache => {
        return cache.addAll(event.data.urls);
      })
    );
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }

  if (event.data.type === 'GET_CACHE_SIZE') {
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
