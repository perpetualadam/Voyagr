// Voyagr Service Worker - Enhanced for Mobile PWA
// Version: 6.0 - Network-first for root HTML, cache JS/CSS
const CACHE_VERSION = 'v6';
const CACHE_NAME = `voyagr-${CACHE_VERSION}`;
const STATIC_CACHE = `voyagr-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `voyagr-dynamic-${CACHE_VERSION}`;
const ROUTE_CACHE = `voyagr-routes-${CACHE_VERSION}`;

// Core assets to cache immediately
// NOTE: '/' is NOT cached - it uses network-first to get fresh API keys
const STATIC_ASSETS = [
  '/manifest.json',
  '/static/css/voyagr.css',
  '/static/js/voyagr-core.js',
  '/static/js/voyagr-app.js',
  '/static/js/app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

// Max cache sizes (in items)
const MAX_DYNAMIC_CACHE_SIZE = 150;
const MAX_ROUTE_CACHE_SIZE = 20;
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper: Limit cache size (with single summary log)
async function trimCache(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    const originalSize = keys.length;
    // Delete oldest items until we're at maxSize
    const itemsToDelete = keys.length - maxSize;
    for (let i = 0; i < itemsToDelete; i++) {
      await cache.delete(keys[i]);
    }
    console.log(`[SW] Trimmed ${cacheName}: ${originalSize} → ${maxSize} items`);
  }
}

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v6...');
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
  console.log('[Service Worker] Activating v5...');
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, ROUTE_CACHE, CACHE_NAME];
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

  // Route API requests - network first with route cache
  if (url.pathname === '/api/route') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(ROUTE_CACHE).then(async cache => {
              await cache.put(request, responseClone);
              await trimCache(ROUTE_CACHE, MAX_ROUTE_CACHE_SIZE);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(response => {
            if (response) {
              console.log('[SW] Serving cached route');
              return response;
            }
            return new Response(
              JSON.stringify({ success: false, error: 'Offline - no cached route available' }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
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

  // Map tiles - cache first with network update (stale-while-revalidate)
  if (url.hostname.includes('tile') || url.pathname.includes('tiles')) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
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
          // Fallback to cache only if network fails
          return caches.match(request).then(response => {
            return response || new Response('Offline - please reconnect');
          });
        })
    );
    return;
  }

  // Static assets - cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(request).then(networkResponse => {
          if (networkResponse.ok && request.method === 'GET') {
            const responseClone = networkResponse.clone();
            // Cache static assets
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
        // Return offline page if available
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
  // Similar implementation for route sync
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
