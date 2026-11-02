# Base map blocked by browser cache failures

## Observed failure

Operator browser logs show `UnknownError` from Cache.match, `NotFoundError`
from Cache.put, and rejected service-worker FetchEvents. The vector source
remains unloaded while route GeoJSON and DOM markers render; WebGL is not lost.
A tile fetch in that browser times out after 15 seconds. The same tile returns
HTTP 200 promptly from production, Cloudflare and the operator Windows curl.
The sprite JSON also succeeds from Windows curl. The evidence establishes cache
API failures; their underlying browser-storage cause remains unknown. A successful
Incognito or confirmed service-worker-bypass comparison was not supplied.

The previous tile handler awaited caches.open and cache.match before invoking
fetch. Either cache failure rejected respondWith before any network attempt.
Background cache writes were detached promises and could reject unhandled.

## Correction

Worker v52 starts tile network retrieval independently of cache reads. A cached
tile may still win while waitUntil tracks its network refresh. Optional cache
operations catch failures and have a one-second bound; a healthy network response
never waits for that bound. Cache writes and trimming run as caught, tracked
background work. When offline, a valid cached resource remains usable; when
neither source succeeds, map handlers return an explicit HTTP 503.

Network-first map decoration handling includes root /styles/, /fonts/, /glyphs/
and /sprites/ aliases and application fallback styles, matching the configured
Nginx routes. Tile handling also covers /data/. no-store probes skip cache reads
and writes. HTTP error responses are not cached.

Installation cache population and activation cleanup are best effort and bounded,
so broken cache storage cannot prevent the replacement worker installing and
claiming clients. Existing versioned-cache cleanup semantics are preserved.
No localStorage, IndexedDB, saved journeys or private recordings are cleared.
Private-media and GPS-evidence network-only guards remain ahead of map routing.

## Deployment verification (operator; not executed here)

1. Deploy the reviewed revision through the existing application procedure.
2. Confirm /api/deployed-version reports service_worker_cache_version v52.
3. With a stationary planning view and no active live navigation, refresh the app.
   Observe worker v52 installing/activating. Check /service-worker.js has a
   revalidation policy rather than immutable caching. Do not clear all site data.
4. Confirm the vector source loads and the base map renders. Re-run the single
   tile probe with a 15-second timeout. Inspect a fresh console log for rejected
   FetchEvents and cache-write rejections from the new map handler.
5. If a previous worker still controls an open tab, close and reopen that tab or
   use the normal update flow. If v52 requests still hang, compare an explicitly
   bypassed worker or fresh Incognito session; do not assume the storage cause is
   repaired by a code fallback.

Other service-worker cache strategies are outside this map-specific repair;
this change does not claim to fix the browser cache implementation itself.
