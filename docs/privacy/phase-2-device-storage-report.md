# Phase 2 — device storage implementation

Date: 2026-11-14. Scope: the existing MapLibre PWA, Flask/SQLite service and
separate Supabase account system. No routing engine, server schema, production
configuration or production data was changed. This branch also includes the
Phase 1 audit and implementation plan from PR #494.

## Implemented architecture

The new `VoyagrLocalStore` module owns IndexedDB `voyagr-private-local`, schema
version 1. Stores are `data`, `journal`, `clips` and `chunks`. Structured categories
are routes, destinations, favourites, history, preferences, API preference
compatibility, dashcam settings, optional traces, local recording options and
legacy recovery. Keys include `guest` or `sb:<account-id>`; these are local UI
namespaces, not cryptographic access controls. A script running on this origin or
someone with access to the browser profile can inspect its databases.

`local-data.js` coordinates captured owner generations, asynchronous transactions,
export/delete controls and explicit history recording. Existing collection
controllers now use it rather than silently writing personal collections to the
server. Saved routes retain their existing inspection/start behaviour. Core GPS,
routing, rerouting, hazard reporting, ETA, final cost and navigation startup do not
wait for this store, account login, a cloud grant or an encryption key.

| Data | Behaviour in this version |
|---|---|
| Saved routes and places | Explicit saves to the current device profile; transaction commits before success feedback |
| Journey history and recent searches | Recording OFF when the local setting is absent; explicit local enable; retained history bounded to 50 entries and recent searches to 15 |
| Current navigation recovery | Existing `voyagr-nav` database and route recovery protocol remain separate; history OFF does not erase recovery |
| Preferences | Owner-scoped IndexedDB snapshots; existing synchronous controls retain localStorage projections for compatibility. Outgoing saves use a tab-local snapshot, not another tab's projection |
| Account changes | Increment owner generation, clear private collection views and reject stale asynchronous results; explicit guest import cannot overwrite existing account collections |
| Optional cloud transports | Profile push/pull, collection uploads, and legacy worker trip/route queue replay disabled. Old queue data is retained, not transmitted or deleted |
| Dashcam | New captures commit Blob chunks locally; no server start, GPS metadata POST or upload on stop/sign-in. Audio starts OFF. GPS metadata is separately selected and uses an existing fresh GPS reading |
| Existing uploaded dashcam clips | Explicit authenticated management remains available, including private playback and deletion; strict owner/session transport checks preserved |
| Geocoding cache | Tab memory only; old disk lookup cache is retained until explicit legacy cleanup. Previously cached address lookups do not survive a new tab/reload; saved places and active-route recovery are separate |
| Traces | Reserved scoped category; no new automatic GPS trace collector introduced |

Necessary routing, traffic, geocoding, voice commands and explicitly submitted
community reports can still transmit location. Device-first storage is not a claim
that navigation is entirely offline or anonymous. Existing backend endpoints and
old clients are not protected by category-specific consent yet: that is Phase 4.

## Migration and recovery

Migration reads only named application keys, never enumerates SDK tokens or all
localStorage. Recognised owner-labelled profile routes/settings are copied into
scoped collections. Shared or malformed legacy input is retained separately under
`legacy:unassigned`. A single transaction commits records and a versioned migration
receipt; retries do not reimport deleted records. Original sources remain intact.
No migration claims an unlabelled route/history for the next account that logs in.

The user can explicitly copy unassigned routes/history/recent searches into the
current device profile, or export the retained source. Copying is atomic,
idempotent per profile and removes old server history identifiers. Malformed input
aborts the whole copy. Legacy settings are preserved for inspection/export; unknown
ownership is not inferred. A separate confirmed action removes legacy recovery
copies and old collection/profile/lookup keys from this browser. Current settings
projections and cloud copies are separate. No historical records were deleted by
this implementation or its tests.

Structured exports are versioned JSON, include only the selected device profile,
and exclude authentication storage. Recording metadata is included; media is
explicitly downloaded per clip. Individual recordings can be played, downloaded,
deleted, or explicitly cleaned up by age. There is no automatic backup import or
full browser disaster recovery in this version. A browser accepting a download is
not proof that the user has safely stored the file.

## Media durability and failures

Capture requests storage before opening the camera. MediaRecorder events are
committed as bounded 4 MiB stored chunks with atomic metadata updates, rather than
collecting the whole journey in a JavaScript array. A write backlog exceeding
8 MiB stops capture; a single oversized browser event can itself exceed that
threshold, so this is not a guaranteed total-memory ceiling. Quota or transaction
failure stops recording without a cloud fallback. Successfully committed earlier
chunks remain available. Zero-byte clips are never labelled complete.

A clip left recording after interruption is shown as interrupted on reopening.
Owner changes/page exit stop capture; a late camera-permission result cannot start
capture after cancellation. Unexpected browser/process termination can lose the
last uncommitted chunks, and partial media is not guaranteed to play in every
container/decoder. The UI does not promise reliable background or locked-screen
recording on Android.

## Encryption, eviction and backups

HTTPS protects transport, not local data at rest. This implementation adds no
local encryption and stores no claimed encryption key beside plaintext. Browser or
OS disk encryption, device security and downloaded export protection are outside
this verification. Browser eviction, clearing site data, private mode, storage
quotas, device loss and uninstall can destroy local data. Export important data.

Client-side encryption would need an independently reviewed key/passphrase and
recovery design; keys kept with browser ciphertext do not protect against an
origin script compromise. Do not introduce a key-unlock requirement into navigation.
E2EE/cloud recovery decisions remain before Phase 5. Production backup expiry and
restoration safeguards remain unverified. Restoring an entire old browser profile
can restore deleted data; the migration journal prevents ordinary reruns, not a
forensic erasure or external-backup restoration guarantee.

## Files and migration impact

New implementation: `static/js/modules/privacy/local-store.js`,
`static/js/app/local-data.js`, `static/js/app/device-dashcam.js`.

Adapted controllers: profile store, authentication sequencing, saved routes,
favourites/search, history/statistics, recent destinations, geocoding, settings,
units, battery, gestures, map theme and suggested journeys. `voyagr-app.js` passes
immutable settings snapshots to the profile adapter. `service-worker.js` retains
old personal queues without replay. `templates/index.html` loads the new modules
and adds device controls; `templates/privacy_policy.html` describes actual
local/default behaviour and retained old cloud data.

New tests: private-local-store, local-data-coordinator, device-dashcam-local and
local-worker-sync; existing unit/settings/saved-route/dashcam tests updated for
local persistence. The authenticated existing-cloud media transport tests remain.
`jest.setup.js` supports real Node-environment IndexedDB/Blob tests as well as
jsdom. `scripts/browser/test-device-storage.cjs` reproduces isolated Chromium
persistence, offline reads, owner separation and media deletion.

**Server database migrations:** none. **Local migration:** new additive IndexedDB
schema only. Existing navigation, tile and personal legacy stores are not dropped.
No production database was connected and no production deployment occurred.

## Verification

See final results appended below. Automated tests use temporary databases,
synthetic routes/media, mocked providers/camera boundaries or an isolated real
Chromium browser as specified. They are not production or physical-device tests.

Reproduction:

- `npm run lint:tests`
- `npm run test:ci -- --maxWorkers=2`
- `.venv/bin/python -m pytest -q` with the web/backend file list in CI
- `.venv/bin/python scripts/test-dashcam-session-sql.py` (temporary PostgreSQL only)
- `node scripts/browser/test-device-storage.cjs` (Chromium + loopback fixture)

Required but unrun: physical Android/iOS capture, real camera/audio/Bluetooth,
locked-screen/backgrounding, long-drive disk/memory stress, genuine device quota
and eviction, full installed-PWA upgrade with real map/provider traffic, and
production proxy/log/backup encryption evidence. No deletion of production records
or external backup-restoration test was performed. Consent-revocation/in-flight
cloud-upload tests await Phases 3–5; this version creates no new optional cloud
upload queue.

## Rollback and readiness

Keep the new IndexedDB and source/legacy records intact. A safe rollback must keep
optional client uploads and worker personal-data replay disabled. Blindly deploying
the old client can resume its automatic cloud uploads, ignore new local saves and
reintroduce account-switch races. Prefer a forward fix; export affected device data
before any deliberate downgrade. Do not remove IndexedDB or migration receipts as
a rollback step. No server schema rollback is needed.

**Production verdict: NO-GO.** Phase 2 supplies the local-first implementation for
review; it does not complete server consent enforcement, secure optional cloud
sync, physical-device integration, infrastructure backup safeguards or a legal
compliance assessment. Keep this PR unmerged/unreleased until its checks and review
are complete; no automatic production rollout is authorised.

### Final local results

| Check | Actual result |
|---|---|
| JavaScript quality guard | PASS |
| Full Jest/coverage selection | 180 suites, 3,538 tests passed |
| Existing CI web/backend file selection | 2,304 passed, 1 skipped, 94 subtests passed |
| Isolated PostgreSQL session/ownership policy | 11 passed; temporary local instance only |
| Real Chromium storage fixture | PASS: reload persistence, offline reads, history OFF, owner separation and media/metadata deletion |
| Patch whitespace check | PASS |

The new privacy tests cover atomic/idempotent legacy migration and recovery,
concurrent writes, aborted transactions, owner-switch races, tab-local preference
snapshots, local favourites/history, default-OFF recording, zero-upload capture,
camera cancellation, fresh optional GPS metadata, partial media and scoped deletion.
The Chromium fixture uses real IndexedDB and synthetic Blob content; its media is
not a real camera recording and it is not a full installed-PWA road test. Existing
web/navigation tests use their documented provider boundaries. Desktop/Kivy and
live-service suites outside the CI web selection were not run. Remote GitHub check
status is separate from these local results.
