# Location-data inventory

Audit date: 2026-11-13. Baseline: `bf0b58838ab33cef6dc2e66db4ad1a602b166430`
(main, including logging PR #491). Scope: repository implementation, not the deployed
VPS, live databases, provider accounts or actual users. No production connections,
record inspection, migrations, historical deletions or deployment were performed.

This is the Phase 1 read-only finding set. Subsequent security changes are recorded
separately in the remediation and verification reports; do not mistake a baseline
finding for the patched behaviour.

## Verified component boundaries

- The production-facing web entry point is **Flask**, `voyagr_web.py:91`.
  No FastAPI entry point/import was found in the inspected application Python and
  dependency sources. FastAPI is not assumed to exist.
- Main application data uses **SQLite**, `voyagr/config/settings.py:36` and
  `voyagr/models/database.py:25`. Supabase PostgreSQL separately holds account/auth
  data and JSON profile snapshots. These are not interchangeable databases.
- Valhalla and GraphHopper are configured through environment URLs; the checked-in
  defaults point to localhost. OSRM is an optional/fallback code path with a public
  **HTTP** default. Runtime enablement/actual remote URLs were not inspected.
- Redis integration is evidenced for **rate limiting**, not as the main route
  cache. SQLite and process memory implement route caches. `QueryCache` is a
  separate helper; its production call sites were not found outside its own file.
- The application already supports local-only dashcam capture and local-first
  journeys. Neither fact means that every mode is device-only.

## Interpretation of the inventory

Unless explicitly identified as public map data, precise endpoints, addresses,
route geometry, timed GPS fixes and location-linked media are **potential personal
data**. Account linkage makes identification more direct, but no account linkage
is needed for repeated home/work locations, IP logs or timestamps to identify or
single out someone. Hashing a coordinate key does not anonymise the cached route.

“Until deleted” means no automatic time-based retention enforcement was found,
not evidence that real production records exist forever. “Operator” includes host,
database, backup administrators and any processors authorised by the operator;
actual staffing and contracts are unknown. Device data is accessible to the user,
people with device/profile access and same-origin script, including compromised
script. Device-only is a storage boundary, not encryption or immunity from XSS.

## Data pathways

| ID / pathway | Data and necessary purpose | Leaves device; processing/storage | Identifiability / access | Current retention / deletion / evidence |
|---|---|---|---|---|
| L01 GPS tracking | Latitude/longitude, accuracy, speed, heading, fix time for position, map following, route progress and recalculation | Normal navigation fixes handled in browser memory. Derived fixes leave for the lookups below; server dashcam adds a separate GPS sender | Personal location; device scripts/user, then relevant endpoint operator | Watch callbacks maintain current state, not an evidenced server continuous-track table for ordinary navigation. Stop/restart lifecycle exists. `static/js/app/gps-orchestration.js:811,918`; `auto-gps-orchestration.js:78` |
| L02 Active/offline journey | Route geometry, instructions, selected route, step/progress and durable journey identity for recovery/offline preview | IndexedDB `voyagr-nav` on device; no network in the persistence helper | Precise journey; same-origin/device access. Journey ownership tokens are local concurrency controls, not server account authorisation | Explicit current-record clear/replace and guarded restore. No universal physical time-based erasure. Tile prefetch below is separate. `modules/navigation/offline-navigation.js:14,96,126,300`; `app/offline-navigation-orchestration.js:149,184` |
| L03 Route ingress and reroute | Start/end, via points, stops, avoidance points, departure time, raw origin fix/integrity metadata and preferences | POST `/api/route` to Flask; request memory, server caches, selected routing/lookup services | Route can identify person even when no account ID is necessary. Public ingress; IP/transport can link requests | Request transient, then cache writes can persist. Cache key is not account-scoped. Reroute/force-refresh bypass reads; bypass is not a guarantee against writes. `voyagr_web.py:1230,1260,1345,1762,1935,2131,2240`; `services/routing/request_params.py`; `route_cache_key.py:111`; `app/gps-orchestration.js:1744` |
| L04 Valhalla | Full waypoints, vehicle costing, exclusions and sometimes departure time; route calculation/ETA | App -> configured Valhalla; primarily JSON POST. Route response returns geometry/instructions to app/device | Routing operator has endpoints and request times. No provider-side retention verified | App request lifetime plus own cache; engine access logs/backups unknown. `services/routing/orchestrator.py:226`; `engines.py:130`; `voyagr/config/settings.py:21` |
| L05 GraphHopper | Waypoints and profile; hazard/custom-model regions, instructions/speed/lane details | App -> configured GraphHopper. GET point query paths and POST custom-model/fallback requests exist | Endpoints visible to engine and its proxy; GET query can enter access logs | Engine retention/deletion unknown. `services/routing/engines.py:364,405,440`; `graphhopper_diagnostics.py`; `config/settings.py:22` |
| L06 OSRM | Coordinates in URL path, route shape/instructions; fallback/multi-stop routing | App -> configured OSRM, optional/conditional. Default URL is public cleartext HTTP, not evidence production uses it | Engine and any HTTP-path observer can see locations when that default is used | No upstream retention agreement established. `config/settings.py:23-24`; `voyagr_web.py:2152`; `services/routing/engines.py:171`; `multidrop.py:787` |
| L07 Process route cache | Whole route responses, which can include exact geometry, endpoints and integrity context; latency saving | Server memory, max 1,000 entries **per cache instance/worker**. Main and services RouteCache classes both exist | Shared coordinate/preference-keyed cache, not a private user store. Same-key request can reuse a response; operators can inspect memory | Default 3,600-second freshness, expiration on matching read, capacity eviction/restart/clear. Unaccessed expired entries need not be physically removed at TTL. Main `voyagr_web.py:726,835,918`; helper `services/costs.py:24,104` |
| L08 Persistent route cache | Start/end REAL columns, `route_data` JSON, costs, timestamps, hit counts, preference key; reuse and historical cost prediction | SQLite `persistent_route_cache`; not device-only, not Redis | No owner field. Baseline public diagnostics disclosed popular endpoints and cache membership; patched access is separate | Keyed and legacy readers default to 24-hour freshness. No scheduled row expiry found; stale row remains. Invalidation deletes rows but is not scheduled retention. `models/database.py:404`; `services/costs.py:422,489,538,579,619,778`; `api/costs.py` |
| L09 Geocoding/reverse | Search text, postal addresses/postcodes, precise coordinate for reverse lookup; turn places into routable coordinates | Browser GET `/api/geocode?q=...` or reverse lat/lon -> app -> Nominatim, optionally postcodes.io and TomTom fallbacks. Browser geocoding cache in localStorage | Places/queries may identify someone; app, provider and query-bearing proxy logs; device scripts see cache | No server geocoding DB insert found in lookup handler. Provider/log retention unknown; local cache has no evidenced age-based purge. Explicit search history below is separate. `api/search.py:134,178,224,335,468`; `app/geocoding-orchestration.js:17,48,395` |
| L10 Overpass / road/lane/arrival context | Point/bounds/corridor queries and OSM IDs for nearby roads, speed, lanes, hazards and parking | Browser -> app -> configured Overpass; may be self-hosted or external. Public feature responses cached in memory. Live road context tiles bounds around fix rather than submitting a track | Query region can reveal location/intent; returned public roads are not automatically a user track. App/provider know query/time | Overpass cache bounded 128 entries/16MiB, TTL <=300s; matching lookup/purge/capacity removes. Live context request uses 60s. Lane cache separately 5min for serving; no size eviction found in that dictionary. Evidence response no-store endpoints bypass SW. `overpass_helper.py:90,160,289`; `services/overpass_road_context.py:12,22,30`; `api/navigation.py:76,154,184` |
| L11 Speed lookups and feedback | Fix/heading/road type for mapped speed; optional correction feedback stores exact fix, displayed value, client time | GET speed API -> app -> TomTom snap-to-roads/Overpass and process cache. Explicit POST feedback -> SQLite | Lookup not equivalent to continuous tracking, but repeated requests/logs can form a track. Feedback is potentially personal despite code's “anonymous/no PII” comment | Detector default cache TTL 600s, bounded size 1,000; SQLite feedback lacks purge/subject deletion route. `speed_limit_detector.py:404,550,1084`; `api/navigation.py:288,403,455`; `models/database.py:483` |
| L12 TomTom traffic, road-info, weather | Position or route sample points/bounds for live traffic, incidents, labels and weather; map tile z/x/y | App proxies to configured/public providers; client tile loading may also contact providers. Traffic tile memory cache clears above 4,000 entries, 90s fresh (45s failed-tile fallback), stale fallback | Provider/app know query area/time; IP + map viewport reveals coarse location. Keys are tile cells, not account IDs | Request transient except caches; provider/proxy retention unknown. `api/traffic.py:32,104,265,381,420`; `api/navigation.py:470,665`; `services/routing/engines.py:580` |
| L13 Local saved journeys / recents | Named route, exact geometry/coordinates and recent destination labels for convenience | `savedRoutes`, recent destinations (15) and completed trips (50) in localStorage; profile store can duplicate saved routes | Same-origin/device access; signed-in snapshot upload changes boundary | User remove/overwrite/browser clear; count caps, no general age expiry. `app/route-saving-orchestration.js:38,105`; `modules/navigation/route-sharing.js`; `recent-destinations.js:8,64`; `app/trip-history-orchestration.js:11,73` |
| L14 Account journey history | Completed start/end addresses/coordinates, distance/time/costs and account UUID | Completion saves locally, then automatically POSTs to SQLite `trips` when token exists; no separate cloud-history opt-in found | JWT subject scopes API queries and deletes for authenticated requests; a conditional loopback development bypass exists (see below). Host/DB admins also access. Supabase auth is not where these trip rows are stored | GET limits 50 but storage has no age/count purge. Per-trip owner DELETE exists. `app/trip-history-orchestration.js:89`; `api/trips.py:23,97,113`; `models/database.py:324` |
| L15 Supabase profiles/preferences | `savedRoutes` JSON plus settings, `user_id`, `profile_id` and update time; account recovery/sync | Local snapshot and automatic 1.2s-debounced upsert for account profile -> Supabase PostgreSQL/PostgREST | Account-linked exact routes. SQL RLS own-user select/insert/update/delete; service-role/DB admin bypass privileges must be controlled | No time expiry, no automatic auth-account cascade FK in supplied snapshot DDL. DELETE policy exists; no complete account-erasure orchestration found. `app/profile-store-orchestration.js:43,81,94,194`; `supabase-selfhost/volumes/db/init/01-voyagr-schema.sql` |
| L16 Server search history/favourites | Search labels/query, exact point, category and JWT subject | Authenticated APIs -> SQLite; separate from no-network recent destinations. UI has calls for server history/favourites | Owner-filtered endpoints; operator access. Shared device still holds local copies | History trimmed to latest 50 per user, clear-all DELETE. Favourite per-item owner DELETE; no age expiry. `api/search.py:930,969,973,991,1064`; `app/search-favorites-orchestration.js` |
| L17 Dashcam device-only | Camera video/audio as enabled; download on stop | Local browser MediaRecorder blobs; local-only mode skips recording API and GPS metadata sender | Video/audio may identify driver, bystanders, registrations; device/download access | In memory until stopped/downloaded, not a proven durable continuous disk recorder. Download persists under user's control. Local-only checkbox is **unchecked by default**. `templates/index.html:1467,2102,2186,2323,2375,2430` |
| L18 Dashcam server mode | Uploaded video/audio plus recording IDs, owner, trip reference and timed GPS/speed/heading every 5s | Browser -> authenticated API; SQLite rows + owner-directory video and JSON metadata sidecar. GPS already transmits while server recording is active, before final video upload | Personal track linked to identifiable media/account. JWT plus live Supabase session check on every request; owner-scoped reads/writes, no-store and safe paths | Default setting 7 days; owner `/cleanup` is callable, **no automatic schedule found**. Max-storage setting not proof of enforcement. Owner delete unlinks file/sidecar and cascades metadata rows. Ownerless legacy rows quarantined, not erased. `templates/index.html:2556`; `dashcam_blueprint.py:22,94,160,197,208`; `dashcam_service.py:64,95,207,281,296`; `dashcam_schema.py:20`; `utils/dashcam_auth.py` |
| L19 Community reports / spatial ML | User-requested hazard fix, description, possible supplied user identifier, expiry; route prediction endpoints/time-frequency; traffic sample positions | SQLite community reports and ML tables; ML POST admin-only, baseline global ML GET public | Reports intentionally reveal hazard location, but identity/timing/free text can expose reporter; pseudonymous or no-account data still needs minimisation | Report “24h expiry” used to filter active results, not evidenced physical deletion. ML spatial rows lack purge. Public map dataset tables (cameras/charging) are a different purpose from individual tracks. `api/hazards.py:220,243,259`; `api/settings.py:99,136,156,193`; `models/database.py:422,531,549` |
| L20 Voice | Spoken command, optional microphone clip, current lat/lon for contextual actions | Browser speech recogniser may use browser vendor; optional AI clip -> Flask -> configured compatible provider; command text/fix -> `/api/voice/command` | Voice and destination phrases can identify person; server/provider have transient access | No audio-file persistence found in transcription boundary. Main transcript/TTS content logs already removed; upstream storage unknown. Command-derived reports/routes persist through their own paths. `api/navigation.py:788,823`; `services/voice_transcription.py:51`; `app/voice-control-orchestration.js:330`; `app/voice-announcements-orchestration.js` |
| L21 Application/proxy/errors | Requests, route diagnostics, IPs, query URLs, exceptions; support/security | App files/stdout, Gunicorn/system logs; checked-in Nginx templates proxy APIs; actual Cloudflare/host log setup unknown | Addresses/lat-lon in GET URLs, provider exception URLs or logs can form identifiable histories | No universal app log rotation/retention policy found. No Sentry/OpenTelemetry integration found in inspected application/dependency sources, not proof no external collection. Prior fix #491 removes specific logs, not all exception sinks. `voyagr_web.py:234`; `api/search.py:450`; `api/navigation.py:518`; `production_monitoring.py:74`; `deploy/nginx-vibevoyager.org.conf:173`; `utils/rate_limiting.py:143` |
| L22 Analytics / Redis / tiles | Optional page views, IP/network identifiers; request counters; viewport/corridor tile addresses | Google analytics opt-in only if configured; strips URL query/hash/referrer for explicit page event. Redis rate counter keys include IP and a limiter prefix. Tiles go through self-hosted/external configured sources/CDN and device caches | Analytics/tile providers can identify or locate approximately; no precise-GPS analytics event found. Rate counters are network identifiers, not route objects | Redis counters expire by configured window, persistence of Redis instance unknown. Analytics retention/processor controls unknown. Device tile caches have count eviction, no fixed wall-clock retention. `app/analytics-consent.js:29`; `utils/rate_limiting.py:69,97`; `service-worker.js:12,122,270`; `modules/navigation/offline-navigation.js` |
| L23 Backups / restore | Full SQLite includes trips, cache, feedback, ML, dashcam GPS rows; file recordings outside DB are not included by this module | `backup_automation.py` copies/gzips DB to local backups; optional S3 SSE-AES256. External host snapshots, Postgres backups and providers unknown | All copied data retains original sensitivity. Host/backup account permissions and encryption/access keys matter | Local nominal daily/weekly/monthly values 7/4/12, implementation does not establish hard expiry. Cleanup parsing fails on module's `.db.gz` format; restore replays whole DB with no deletion ledger. No remote S3 expiry routine found. `bool(os.getenv('BACKUP_S3_ENABLED', False))` treats a nonempty `false` string as enabled; actual upload still needs a caller/SDK/credentials. Scheduler helper exists but web app wiring not found. `backup_automation.py:24,34,77,143,162,198,235`; actual scheduling unverified |

## Access and transport qualifications

- Main route cache uses no bearer-secret lookup token or user/session partition.
  Requesting the same rounded endpoints/preferences is sufficient to obtain a hit;
  response `cached` and `cache_stats` indicate shared activity. No dedicated public
  “download arbitrary route by ID” was found; this does **not** make reuse private.
- Operational/admin auth uses `X-Voyagr-Admin-Key`; ordinary JWTs must not gain
  administrative cache access. CORS is not access control. RLS script presence is
  not proof it was applied to a deployed Supabase project.
- `voyagr/utils/auth.py:58` permits private-user loopback calls as shared `sub=local`
  by default unless `ALLOW_LOCAL_UNAUTH=false`. `utils/client_ip.py` uses proxy trust
  settings to classify clients. A misconfigured reverse proxy can therefore affect
  history/favourite access. Dashcam deliberately does not use this bypass. Do not
  claim all private endpoints are strict-auth without verifying deployment settings.
- SQLite owner filtering is application-level, not PostgreSQL RLS. SQL parameter
  binding protects injection, but does not provide encryption or retention.
- Existing route-cache key prints rounded endpoint coordinates directly; hashes
  of waypoints are deterministic. Neither must be exposed through logs, telemetry
  or public diagnostics. Key obfuscation alone cannot fix cross-user sharing.
- Service worker excludes selected sensitive APIs and authenticated responses,
  with special network-only road-evidence/dashcam paths. Other GET APIs may enter
  dynamic CacheStorage. Cache size is not retention duration. Old browser cache
  contents are not retroactively deleted by changing a future fetch policy.
- GET geocoding, speed, weather and GraphHopper query parameters, OSRM URL paths,
  map tile paths, client IP and timing need proxy/provider review even after app
  content logs are removed.

## Explicit gaps requiring operator evidence

No production environment settings, row counts, traffic captures, account records,
DNS/TLS settings, Redis AOF/RDB settings, CDN logging, Nginx inherited log format,
logrotate/journal retention, provider contracts, applied RLS grants, object storage
lifecycle/versioning, VM snapshots or PostgreSQL backups were examined. Verify these
with authorised configuration evidence, not real journey exports, before making
public promises about retention, anonymisation, international transfers or erasure.

## Additional spatial datasets and helper boundaries

- `voyagr/models/database.py:390,472,497` creates route-hazard, speed and lane
  cache tables. A schema declaration alone does not prove current GPS writes.
  `voyagr/services/hazards.py:239` and `hazard_service.py:70` read spatial hazard
  cache bounds, using timestamps for freshness. No corresponding active writer
  was established by the inspected insert-path search. Existing/legacy rows and
  backups still require an inventory by the operator.
- Operator-supplied road-evidence JSON (`voyagr/services/road_context.py:14`) is
  a map dataset cached by file identity. The request selects a small tile; the
  source JSON is not a collected GPS track. The distinction should remain.
- Cameras, charging stations, OSM lanes, railway crossings and map tiles describe
  places/features, whereas request histories reveal who queried them and when.
  Do not delete public map datasets as if they were private trip logs.
- `ml_route_predictor.py` and other desktop utilities can read stored trips.
  Their existence does not establish a scheduled PWA training/upload job. No
  such job was verified. Desktop `satnav.py` is a separate entry point, not proof
  its storage paths run in the Flask PWA. A future native conversion needs a
  separate platform audit.
