# Local-first storage and optional cloud sync — gated implementation plan

Date: 2026-11-14. Baseline: `c902cb1d`.
Companion: [Phase 1 audit](local-first-sync-audit.md).

**This delivery performs Phase 1 only.** All runtime changes and migrations below
are proposed. No production configuration/data, application logic or test source
is changed. The implementation must extend the existing MapLibre/Flask/SQLite/
Supabase PWA; no routing-engine replacement, new FastAPI service, new paid storage
service or unnecessary infrastructure is proposed.

## Invariants across every phase

- Anonymous route planning/navigation, GPS, rerouting, multi-stop routes, hazards,
  speed/lanes, cost calculation and current offline recovery remain independent of
  optional storage, sign-in, cloud permission and encryption-key availability.
- Preserve the already implemented private temporary route cache. Do not turn it
  back into a shared coordinate cache or use it as a history/sync outbox.
- Missing/unknown/imported/stale consent, unknown owner, missing backend policy or
  unavailable consent authority means **no optional upload**, never a route refusal.
- History recording, optional GPS traces, cloud sync, dashcam backup, dashcam GPS
  sharing, diagnostics and analytics are distinct permissions. Agreement to the
  privacy policy, browser sensor permission and sign-in grant none of the others.
- Record category-specific consent-policy version, decision, timestamp and revision.
  Client preferences express local intent; server-recognised permission remains
  authoritative for remote actions. Never sync privacy grants as ordinary settings.
- Do not infer ownership of legacy unscoped local histories. Do not silently upload
  a guest backlog, restore grants from an export, or automatically enable a grant
  after login/update/reinstall because a server account previously opted in.
- Existing cloud data stays manageable/exportable/deletable through explicit owner
  actions even when new sync is OFF. Do not auto-pull it into the active local vault.
- No production migration/deployment/historical purge without explicit approval of
  a concrete migration/rollout. Keep optional upload fail-closed during rollback.

## Target data and permission model (proposal)

Local operations should go through a small adapter, not a rewrite of navigation.
Use a separate versioned IndexedDB database (proposed `voyagr-private-local`, v1)
for destinations/favourites, saved routes, completed history, preferences, optional
traces, recording metadata, consent and a future outbox. Keep the existing
`voyagr-nav` active-route ownership/recovery database working throughout migration.

Every private local record has immutable owner namespace, category, opaque record
ID, schema version and revision. Guest storage is a local namespace; account
namespaces are selected from verified auth state. A string in an imported file is
not proof of account ownership. Unassigned legacy records go into a recoverable
local-only bucket for explicit assignment; no background claim/upload.

Provide separate UI controls, initially OFF:

| Control | Meaning / dependencies |
|---|---|
| Record journey history | Store new completed journeys locally; OFF does not remove current ETA/summary or active-route recovery. Manual Save is a separate explicit action |
| Record GPS trace, if implemented | Additional collection beyond necessary current-fix processing; separately OFF; not implied by recording history |
| Cloud synchronisation | Master permission for selected settings/saved places/routes/history/trace categories, all initially ungranted. Opting in does not enable history collection or upload old data without explicit selection |
| Dashcam cloud backup | Independent of ordinary sync and recording; explicit clip upload action, separate GPS-metadata permission. Local capture does not create a server recording session |
| Optional diagnostic uploads | Separate OFF choice; exclude raw coordinates, route bodies, tokens, transcripts and recording identifiers. Minimal necessary security logs are a separately justified operational purpose |
| Optional analytics | Preserve separate existing OFF-by-default analytics. Do not conflate it with diagnostics/cloud or import it from another account's settings |

The server needs a consent authority using the **existing PostgreSQL**, with
per-user/category grant state, policy version and monotonic revocation epoch. A
missing row must deny. Browser opt-in must also be present on the current device;
a server grant alone must not silently enable a reinstall/new device.

For direct PostgREST snapshots, RLS/RPC must enforce current consent in PostgreSQL,
not merely `auth.uid()=user_id`. Server-side read policies must distinguish permitted
sync pulls from explicit owner management of retained cloud data after withdrawal.
Keep the existing live-session check for dashcam; design equivalent checks for
cloud sync rather than trusting an unexpired JWT/local loopback bypass.

Do not claim an atomic revocation guarantee across a PostgreSQL consent lookup
followed by an unrelated SQLite/file commit. Prefer new cloud-record metadata and
small encrypted envelopes in the existing PostgreSQL transaction with consent.
For large media, use the existing private filesystem with authorised staged chunks
and a PostgreSQL-controlled finalisation receipt. Publish a recording only after
current consent/ownership/epoch is rechecked at commit. Bound and clean abandoned
staging safely. Decide the cross-store protocol before enabling uploads; do not
add a distributed transaction service or public unauthenticated file endpoint.

## Phases, files, migrations and release gates

Each phase must be delivered as a reviewable isolated branch/PR with its own actual
verification report. Suggested module names are proposals, not files already added.

| Phase | Changes / primary files | Migrations | Security implications / tests | Rollback / readiness gate |
|---|---|---|---|---|
| **1 — audit, this delivery** | Only `docs/privacy/local-first-sync-audit.md` and this plan. Inspect current app, schemas, SW, providers, logging and backups | None | Existing-suite baseline plus two local synthetic observations. New privacy acceptance criteria are **not satisfied by this audit** | Remove/revert documentation only. NO-GO for the complete architecture. No application code merged/deployed |
| **2a — local structured storage** | Proposed `static/js/modules/privacy/local-store.js`; adapters for route saving, trip history, recent destinations, favourites, profile/settings orchestration | New IndexedDB v1 with owner/category indexes and a migration journal; no production SQL migration | Tests: fresh storage, existing guest/account data, corrupt/oversize inputs, quota/denied storage, transaction abort, multiple tabs, old/new SW, no data loss or cross-owner reads | Keep verified old store as read-only recovery until migration commits; never resume automatic uploads through a legacy fallback. No deploy until client upload paths are stopped truthfully |
| **2b — local media and data management** | Extend `dashcam-capture.js`, progressively extract inline dashcam integration; proposed media store using OPFS when supported or bounded IndexedDB Blob chunks; local export/import/delete UI | Additive local media/chunk/metadata schema; existing server clips unchanged | Crash/interruption recovery, chunk ordering, quota failure, partial clips, completed-download confirmation, metadata delete, stream/device release, navigation unaffected. Storage errors stop/save optional capture safely, not GPS guidance | Reopen validated local records; explicit legacy download fallback if durable capture unavailable, no automatic server fallback. Physical mobile tests required before declaring reliable recording |
| **3 — defaults and privacy UX** | Extend existing settings/privacy section; proposed consent-state module; guard **all** profile/trip/search/settings/media senders | Local versioned consent records, all missing/unknown/new categories OFF. No grants imported from legacy settings/backups | Tests: first run, reinstall, version bump, storage refusal, login/import/export, independent controls, cross-tab withdrawal, history OFF with live summary/recovery still working | Fail closed with clear unavailable/off state. Never rollback to auto-sync or preselected consent. Do not publish a toggle that leaves another upload path active |
| **4 — server enforcement before cloud enablement** | `voyagr/utils/auth.py`, private trip/search/settings/dashcam APIs; Supabase snapshot RLS/RPC and session authority; minimal consent endpoint | Additive reviewed PostgreSQL consent/epoch schema and deny-by-default policies; preserve legacy owner records. No backfill of consent from login. New cloud record schema if selected; separate SQLite legacy management | Direct HTTP/PostgREST tests: no/missing/expired/revoked grant denied, category mismatch, ordinary JWT vs admin, A/B ownership, live-session failure, policy version, consent/commit race. No localhost privacy bypass in enabled cloud routes. Public routing works when consent DB is unavailable | Keep server deny rules; disable optional cloud if failed. Do not restore permissive old RLS. Manual approved migration plus isolated real PostgreSQL tests required |
| **5a — optional structured-data sync** | Proposed owner-bound sync coordinator/outbox; replace direct snapshot automatic upsert and completed-trip/search uploads; remove personal writes to shared `app-settings` | Additive outbox/conflict/tombstone schema locally; owner/category/versioned cloud records in existing PostgreSQL. Retained legacy plaintext manageable separately | Explicit opt-in, pre-send and commit consent checks, per-record idempotency, optimistic revisions, interrupted/offline queue, stale session/account switch, withdraw while waiting, deletion conflict/no resurrection, wrong key recovery. Tests must pass before enabling | Pause queue and retain local data; do not fall back to plaintext/legacy automatic uploads. Existing cloud copies not deleted without request |
| **5b — optional encrypted media backup** | Existing private media API with staged/resumable ciphertext chunks, consent receipt, owner metadata and client-side decrypt/playback | Versioned encrypted envelope/chunk manifests; private file layout references. No bulk re-encryption/deletion of legacy clips without approval | Upload/retry interruption, per-chunk and final ownership/consent, tamper/reorder/truncate, logout/revoke, abandoned staging, range/seek playback, local-only capture network silence, owner delete incl. sidecars/rows | Cancel new uploads; preserve local clips and manageable legacy clips. Never automatically send plaintext when crypto unavailable; no claim of reliable background capture until device-tested |
| **6 — full security/regression gate** | Existing Python/JS/SQL/browser suites plus dedicated privacy/queue/storage tests | Synthetic/temp stores only | Complete acceptance matrix below, property/negative tests and real isolated SQL; physical browser/mobile integration, proxy/log and encrypted-storage configuration evidence | NO-GO if a permission/ownership/migration failure remains. Mocked network tests never count as production verification |
| **7 — operator-reviewed release** | Updated notices, data inventory, runbooks and per-phase reports; coherent PWA assets/SW upgrade | Explicit migration/rollout approval and separate historical-data plan | Evidence of server/client policy-version compatibility, recovery drill, protected deployment configuration, key recovery and rollback; required GitHub checks | No automatic deployment. Keep uploads disabled if old clients/server cannot enforce consent; core navigation remains usable |

Do not release a sequence where the UI says “cloud OFF” while old automatic profile,
search, shared-settings or dashcam paths continue sending data. Local adapters,
truthful client suppression and default-deny server policy form a coordinated
minimum rollout. Optional cloud remains unavailable until all its gates pass.

## Safe local migration and large-recording design

1. Use additive stores and schema/data versions. `onupgradeneeded` alone is not a
   migration success guarantee. Handle blocked upgrades, `versionchange`, multiple
   tabs, transaction completion and an interrupted browser/SW update.
2. Copy records into the correct namespace, validate count/content and commit a
   migration journal before switching readers. Do not delete the source in the same
   unverified step. Do not reset corrupt/private data to an empty success state;
   retain a local recovery/export path and show the failure honestly.
3. Keep `voyagr-nav` recovery protocol/ownership intact. “History OFF” means no new
   completed archive; it must not disable GPS, speed matching, remaining mileage,
   journey summary or temporary active-route recovery. Finish/discard must clear
   only the intended current journey using existing concurrency guards.
4. Never migrate all `voyagrLocalTrips` into whichever account happens to log in.
   Associate known profile data correctly; put unscoped history into local-only
   unassigned storage for explicit user handling. Preserve guest operation.
5. Stream bounded media chunks into an available durable local sink, rather than
   accumulating a whole drive in RAM. Track “pending”, “partial” and “complete”
   metadata; acknowledge save only after durable transaction/sink completion.
   Request/estimate persistent storage, but handle denial and eviction honestly.
   Reuse the existing position controller for separately enabled local GPS metadata;
   video recording alone must not enable a journey trace or metadata upload.
6. With insufficient storage, preserve recoverable chunks and notify the user;
   never start uploading as a storage fallback. Provide export and per-category
   deletion, and avoid throwing a recording error into the navigation controller.
7. Exports need a versioned manifest, bounded parser and owner/category selection.
   Exclude auth tokens, SDK sessions, cloud grants, sync receipts, queued uploads,
   recovery secrets and diagnostic/analytics opt-ins. Import must not enable cloud.
   A separately readable privacy-decision summary may be exported for the user;
   importing such a summary must never confer executable permissions.
8. Local deletion removes the selected record's data, chunks and derived indexes.
   Cloud deletion is a separate explicit owner action. Do not automatically delete
   every browser database, another account's records or user-downloaded files.
9. Replace external QR generation with a reviewed local encoder. Retain explicit
   route sharing; consider fragment-based links to avoid sending the route payload
   in the initial server URL. Version support and old-link compatibility need tests.
   A fragment does not make a shared link encrypted or private from its recipient.

## Account isolation, queues and withdrawal

- Capture immutable owner/session generation and consent epoch **before** any
  await; recheck before local mutation, send and applying responses. Bind tokens
  to the intended owner, not “whatever user getSession returns later”.
- Fix the reproduced profile completion race before adding another queue. Ignore
  late A responses while B/guest is active; do not overwrite a fresh local store
  with a stale whole-store snapshot. Use scoped IndexedDB transactions.
- On logout/switch, increment a local generation, abort outstanding work, cancel
  timers and lock the outgoing account's vault. Use cross-tab notifications and
  persistent local OFF state. Do not expose the outgoing local history to guest or
  next account. Do not wipe user data or force a sign-in to use navigation.
- Outbox entries are bound to owner/category/record/revision/consent epoch; persist
  encrypted personal payloads only where designed. Retry with bounded backoff and
  explicit paused/error UI. Never silently relabel A's work with B's token.
- Preflight current local and server permissions before each send. Withdrawal must
  immediately stop this device's pending work and persist cancellation before any
  retry. On reconnect, send pending revocation before optional content.
- **Technical limit:** offline revocation cannot reach the server/other devices
  instantly. Aborting fetch cannot recall bytes already received or undo a commit
  that won the race. Serialise server grant checks/finalisation against revocation,
  reject later commits, and describe previously committed records truthfully.
  Existing cloud data is not automatically erased just because sync was turned OFF.
- Cloud management/export/delete must remain explicitly available to the owner
  with sync OFF, without background hydration or new uploads. Account removal must
  cover new records, legacy SQLite/Postgres/file copies and auth identity under an
  approved deletion plan, while keeping privacy-safe backup deletion state.
- Use server revisions/conditional writes rather than trusting device clock time.
  History is append-by-ID with deduplication; saved-record conflicts can preserve
  both versions for choice; deletion tombstones prevent offline resurrection.

## Encryption and key-recovery decision gate

Recommended for future optional personal backups: client-side authenticated
end-to-end encryption, versioned envelopes and unique nonces, with category/owner/
record/revision/chunk binding as authenticated metadata. The server stores ciphertext
plus only the metadata needed for ownership, limits, conflict handling and expiry.
Keep existing authenticated, no-store access; encryption is not authorisation.

Do not store an unwrapped key beside ciphertext and label it E2EE. Use a reviewed
key hierarchy and documented passphrase/recovery mechanism; validate mobile cost
before selecting a KDF or adding a library. WebCrypto/non-extractable keys do not
solve XSS. Ordinary account password reset must not imply recovery of a genuine
E2EE vault. The operator must not retain a hidden decryption backdoor.

Decisions before Phase 5 code:

- Account recovery key/passphrase versus device-only keys (loss consequences).
- Whether optional local-at-rest encryption is enabled, and when account vaults
  lock. Key lock must not block core live navigation or require typing while driving.
- How new encrypted cloud data coexists with existing plaintext snapshots/clips.
  Retain explicit legacy owner management; no automatic plaintext new-upload fallback.
- Which minimal metadata remains readable (owner ID, category, sizes, revisions,
  retention deadlines, network IP/timing). E2EE is not anonymity.
- Ciphertext backup expiry and restore of consent/deletion tombstones. Recovery must
  not resurrect erased data, a revoked grant or an old local upload queue.

Current host/volume encryption is not verified. HTTPS and optional S3 SSE alone do
not establish encryption at rest for SQLite, PostgreSQL, media or browser storage.
These decisions require user review before implementation and truthful public notice.

## Required acceptance-test matrix

| User criterion | Required evidence before GO |
|---|---|
| 1. New user cloud OFF | Fresh/cleared/denied IndexedDB, missing/stale policy version, login and reinstall; no optional request of any category; unknown server grant denies |
| 2. Anonymous navigation | Real local Flask request + browser flow with no account/consent service; GPS/live HUD and route start have no new key/sync requirement |
| 3. GPS does not create history | History OFF throughout completed navigation produces no local archive or server row/outbox entry; current recovery and final summary still work; no invented trace |
| 4. Route calculations independent | Provider-adapter, origin/integrity, cost/ETA, reroute and multi-stop tests with cloud OFF and consent authority unavailable; cache still isolated/ephemeral |
| 5. Dashcam stays local | Capture/metadata/stop perform zero server start/metadata/upload calls without separate backup permission; durable clip restart/playback/export and quota failure verified |
| 6. Backend rejects unauthorised upload | Direct Flask **and PostgREST/RPC** tests for anonymous, forged owner, category mismatch, absent/expired/withdrawn consent and old clients; real isolated PostgreSQL RLS |
| 7. Withdrawal halts work | Queued/delayed/in-flight requests, restart, background worker and cross-tab races; denial at server commit after revocation; document already-received/committed limits |
| 8. Cross-user cloud access denied | A/B list/get/update/delete/export, guessing IDs/paths, token/session revocation, admin misuse; preserve dashcam strict live-session authority and range safeguards |
| 9. Logout/switch isolation | Reproduce current A-to-B race then prove fixed; old callback/store snapshots, delayed token resolution, global local history, vault locks and guest import/export |
| 10. Existing app intact | Full existing CI web/JS/SQL suites plus navigation/reroute/multi-stop/hazard/units/speed/voice/ETA/summary and private-cache tests; preserve route safety reassessment |
| Offline and interrupted storage | Fake IndexedDB plus real browser tests for blocked migration, quota/transaction abort, old/new SW, active-route recovery, partial media, failed download and eventual retry |
| Encryption / backup recovery | Wrong/lost keys, nonce/tamper/reorder/truncation, large media seek, encrypted export restore, consent-version import denial, deleted-record restoration prevention |

Mocks and synthetic providers validate boundaries, not live road data, Android
capture reliability, real infrastructure encryption, applied production RLS or a
processor's retention compliance. Report actual failures/unrun tests for every PR.

## Phase 1 delivery record

**Files changed:** these two Markdown documents only. No runtime/test/schema code
changes; no database migrations or production operations. Rollback is document-only.

Baseline verification (existing suites, not new privacy acceptance tests):

- Python CI-selected web behaviour suite: **2,304 passed, 1 skipped, 94 subtests passed**.
  Command: `.venv/bin/python -m pytest -q` with exactly the file list in the
  workflow’s “Run Python behaviour tests” step.
- `npm run test:ci -- --maxWorkers=2`: **3,529 passed across 176 suites**.
  `npm run lint:tests`: **passed**.
- `.venv/bin/python scripts/test-dashcam-session-sql.py`: **11 passed** using
  temporary local PostgreSQL, not production-applied policies.
- Local synthetic profile-race experiment: reproduced A's saved-route snapshot
  being written into B's local profile after a deferred response; no network/users.
- Local synthetic QR builders: destination and geometry present in the external QR
  URL; no HTTP request was sent.

The first attempted profile experiment used a non-exported internal function and
was invalid; the reported reproduction uses the exported scheduler. Do not count
that failed harness invocation as an application test failure or hide it as a pass.

Not run: physical Android/iOS/Safari/Chrome storage/camera/background tests, production
logs/config/DB/backup queries, live provider checks, new consent/queue/E2EE/migration
acceptance tests (not implemented), or desktop/Kivy/live-service suites outside the
existing web CI selection.

**Readiness: NO-GO** for the full requested architecture. This branch supplies an
audited implementation plan only. Leave the audit PR open with auto-merge off;
no application changes should be merged/deployed as if future privacy acceptance
criteria had passed. Approval to start Phase 2 is a separate step.

## Phase 2 implementation

The device-store and durable-media changes are documented in
[Phase 2 delivery and verification](phase-2-device-storage-report.md).
This is an additive local schema, not a production PostgreSQL/SQLite migration.
Cloud consent authority and optional encrypted sync remain later phases; a local
OFF control does not establish backend enforcement. Production remains NO-GO.

## Phase 3 implementation

Independent, default-OFF local choices and policy-versioned records are documented
in [Phase 3 delivery and verification](phase-3-privacy-settings-report.md). History
permission is checked atomically with each new archive write. Unavailable cloud
and optional diagnostic services remain disabled, rather than accepting unusable
grants. Backend consent authority is still Phase 4; production remains NO-GO.
