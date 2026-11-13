# Location threat model

Date: 2026-11-13. Scope and baseline are in [the inventory](location-data-inventory.md).
This model identifies repository-supported possibilities, not evidence of an actual
breach, malicious administrator or a particular production configuration.

## Assets and trust boundaries

Assets: exact origins/destinations/via points, route geometry and timing, account
history, home/work labels, uploaded media and GPS tracks, bearer/session/admin
credentials, device stores, backup replicas and deletion state.

Boundaries:

1. Phone GPS/microphone/camera -> browser page and same-origin scripts.
2. Browser localStorage/IndexedDB/CacheStorage -> optional HTTP requests.
3. Browser -> CDN/reverse proxy/Gunicorn -> Flask.
4. Flask -> process cache / SQLite / private filesystem / rate-limit Redis.
5. Browser or Flask -> routing, geocoding, map, traffic and voice providers.
6. Browser -> Supabase auth/PostgREST -> PostgreSQL/RLS.
7. Database/media -> backups, optional object storage, restore workflows.
8. Operators/support -> diagnostic APIs and logs.

The browser is an untrusted request producer; client-supplied user IDs, coordinates,
“verified” assertions and local ownership tokens cannot substitute for server
resource ownership. Conversely, accurate coordinates are necessary inputs; do not
break navigation by replacing them with irreversible hashes or coarse guesses.

## Ranked scenarios

| ID / severity | Scenario and evidenced weakness | Consequence | Mitigation / present status |
|---|---|---|---|
| T01 High | Unauthenticated caller reads `/api/cache-statistics`, `/api/ml-predictions` or probes `/api/alternative-route-cache-info` | Stored route endpoints or evidence of activity exposed without owner permission | **Patched in this branch:** existing fail-closed admin gate; private no-store responses; service-worker network-only GET handling. Production deployment not performed |
| T02 High | Caller guesses rounded endpoint/preference tuple for public `/api/route`; shared cache serves another request's response/hit metadata | Cross-user inference, near-origin disclosure through geometry or private response context; route integrity collisions | No arbitrary route-ID download found, but key knowledge is not ownership. Pending per-session private memory cache or no server route-body cache; remove hit/membership hints. Hash alone insufficient |
| T03 High | Application/host compromised after months of persistent route-cache/feedback/ML collection | Detailed location relationships exposed at a scale unnecessary for immediate navigation | Stop new persistent route retention under approved architecture; bounded memory; minimise spatial telemetry; approved historical cleanup. Still pending |
| T04 High | Account sign-in automatically uploads completed journey/search/saved-route data when user expected local storage | Hidden cloud copy and purpose/default mismatch | Explicit separate sync opt-ins and no backlog upload. Preserve local/offline operation. Approval/migration design pending |
| T05 High | Dashcam default server mode sends a GPS point every 5s, then uploads clip on stop | Continuous account-linked track plus bystander media; larger impact than single routing lookup | Device-only capture default, separate per-clip and GPS upload actions; preserve strict JWT, live session authority, owner SQL/file paths. Existing ownership tests retained; new default/upload UX pending |
| T06 High | Deletion performed in live DB, later whole backup restored without deletion replay | Erased history resurrected; stale consent/history becomes active | Synthetic test confirms possibility. Restore isolation, independent deletion ledger, approved expiry of replicas/versioned objects; no production restore or purge performed |
| T07 High | Backup cleanup fails parsing `.db.gz` timestamps; remote lifecycle unknown | Nominal retention does not bound real copies | Local synthetic reproduction confirmed cleanup failure; the S3 boolean parser also treats a nonempty `false` value as enabled. Approve backup policy and fix parser/scheduling consistently; do not blindly delete old backup files |
| T08 High, configuration dependent | Loopback development bypass used behind misconfigured proxy for private history/favourites | Unauthenticated shared “local” subject; requests incorrectly classified as trusted | Verify `ALLOW_LOCAL_UNAUTH=false` and trusted proxy chain in production with explicit authorisation. No live changes; dashcam bypass is already prohibited. Separate hardening may alter development workflows |
| T09 High, configuration dependent | GET coordinate/query URLs retained by app/provider proxy/CDN; OSRM public HTTP default enabled | Location visible in logs or in transit; request/body removal from one logger does not fix infrastructure | HTTPS-only reviewed provider config; path-template access logs without query strings/bodies/referrers; provider contracts and log expiry. Runtime and infrastructure unknown |
| T10 Medium–High | Provider exceptions/error responses include URL/query text; external tracing auto-captures it | Location/API keys spread into diagnostics/support | Previous PR removed several navigation logs. Residual search/road-info/traffic exception sinks remain; add allowlisted error categories and tests, review upstream debug logging. No global redaction guarantee |
| T11 Medium–High | Stolen/changed/revoked account session or guessed recording ID accesses private media | Video/track breach | Existing dashcam JWT + live session RPC, owner-bound SQL, safe private paths, no-store; isolated tests cover anonymous/cross-owner/revoked access and deletion. Actual deployment SQL/grants must be verified |
| T12 Medium–High | Malicious same-origin script/XSS, stolen device or shared browser reads local stores | Device-only precise history leaked; stored tokens can extend breach to cloud | CSP/third-party review, dependency updates, device locks and clear/export controls; avoid exposing private tokens/data in console. Encryption with a key in the same compromised script context is not a complete fix |
| T13 Medium | Service worker serves old cached diagnostics after network fails | Private endpoints become accessible from device storage after policy change | New fetch paths do not consult caches even offline. Old stored responses are not purged by this patch. Dedicated user-approved cleanup and SW activation testing still needed |
| T14 Medium | Free-text community reports plus exact location/time/user-supplied identifier retained after display expiry | Reporter identification/spoofing; map display expiry mistaken for deletion | Separate report purpose and metadata, limit public fields, physical retention job with approved time bounds; do not blanket-delete public OSM/camera features |
| T15 Medium | Account deletion removes auth identity but leaves SQLite trips/Supabase snapshots/recordings/backups | Orphans and incomplete access/erasure response | Central data-class erasure inventory/export with verified subject, explicit holds, processors and restore replay; SQL snapshot delete policy is not complete product account-erasure workflow |
| T16 Medium | Supposed cache TTL only checked on reads; abandoned entries remain or grow | Memory/disk retention exceeds advertised maximum | Fixed creation expiry, bounded sweeps/capacity/bytes; test untouched expired keys and no sliding refresh. Existing lane map lacks size eviction; existing disk cache never purges by freshness |
| T17 Medium | Provider receives full route/history/account token unnecessarily | Additional recipient/linkage beyond feature purpose | Per-service minimal payloads; self-host when practical; no forwarding app JWT to map/routing providers; verify vendor audio/tile/GPS retention and transfer terms |

## Abuse-resistant acceptance criteria

- An unauthenticated or ordinary signed-in caller cannot enumerate stored routes,
  read another user's private route response, or probe another private cache's hits.
  The current patch closes diagnostic enumeration only; **T02 remains open**.
- Public route calculation, reroute, multi-stop ordering and offline local journey
  recovery continue without an account requirement or new navigation safety locks.
- Expiry prevents serving/copying data at its deadline and a bounded sweep removes
  idle entries; use tests that never access an expired key before the sweep.
- No raw coordinates, destination text, route body, voice transcript or vendor URL
  appears in structured log fields, exception strings, access logs or traces. This
  must be verified per layer, not asserted from one endpoint test.
- Dashcam auth, revocation, cross-owner delete/cleanup, media-path containment and
  cache restrictions cannot be weakened to simplify local-only uploads.
- User erasure removes live DB metadata, sidecars and media for the right owner
  without touching another owner's records. Restore cannot make the erased data
  live again. Backup expiry is evidenced, not inferred from settings.

## Non-goals / residual uncertainty

This branch does not perform a penetration test of production, inspect actual
identity/activity, prove processor compliance, establish legal access to roads,
implement end-to-end media encryption or promise forensic erasure of SSD/RAM/swap.
No cryptographic promise replaces ownership, minimisation, retention or disclosure.
