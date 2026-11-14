# Phase 4 — default-deny server enforcement

Date: 2026-11-14. Built on unmerged Phase 3 (#496), Phase 2 (#495) and audit (#494).
Actual backend: Flask/SQLite plus the existing separate Supabase/PostgreSQL stack.
No production database, data, infrastructure or deployment was accessed or changed.

## Result and architecture

The backend no longer treats login, localhost, an API key, an admin header or a
browser privacy flag as permission to retain new personal data. Existing plaintext
upload APIs are retired. They cannot be re-enabled merely by granting a future
cloud category. Necessary routing, rerouting, GPS lookups, hazards, ETA/cost and
anonymous navigation do not depend on the private consent service.

There are two enforcement boundaries:

1. **Flask/SQLite/files:** reject legacy optional writes before parsing payloads or
   opening private storage. Retain strictly authenticated owner reads/deletes and
   the ability to finish an already-existing interrupted dashcam session.
2. **PostgREST/PostgreSQL:** an additive migration closes direct legacy snapshot
   INSERT/UPDATE, retains live-owner SELECT/DELETE, and adds a minimal authoritative
   consent ledger plus transaction-local permission locking for future write RPCs.

A remote consent preflight followed by a SQLite/file write would have a withdrawal
race. This implementation deliberately does not use that pattern or invent a new
cloud transport in Phase 4. Phase 5 must use the permission assertion inside the
same SQL transaction as its payload/finalisation write, with explicit ownership.

## API changes

| Path | New behaviour |
|---|---|
| `/api/trip-history` POST | Strict live-user authentication, then 403 `CLOUD_UPLOAD_DISABLED` |
| `/api/search-history` POST | Same; no body/database processing |
| `/api/favorites` POST/PUT | Same; explicit saves now use the Phase 2 device store |
| Private trip/history/favourite reads/deletes and trip analytics | Verified signed-in JWT and live session; no localhost bypass; existing user filters retained; private/no-store responses |
| Dashcam start, metadata, upload and settings POST | Strict identity, then 403 before owner-service/storage access |
| Existing dashcam list, metadata/video, range/download, delete, cleanup, status and stop | Existing strict live-session/ownership safeguards retained; grants are not needed to manage old data |
| Global app-settings, gesture-event, ML prediction and traffic-pattern POST | Retired/unavailable, including for API/admin credentials; no optional collection or global preference overwrite |
| Global app-settings/traffic-pattern historical reads | Admin-only; these legacy shared stores are not a per-user sync API |
| `/api/privacy/consent` GET | Live signed-in user; minimal current server state via own-user RPC; no caller-supplied owner |
| `/api/privacy/consent` PUT | Explicit category/boolean/policy/expected epoch; strict input whitelist; stale withdrawals accepted by the authority; unavailable grants denied |

HEAD requests use the same authenticated read paths and never fall through to
legacy writes or consent changes. Historical global reads require admin checks for
HEAD as well as GET. Regression tests supply write bodies with HEAD to verify this.

The new endpoint forwards the verified user's Bearer token and configured public
Supabase key, never a service-role key. Upstream redirects are disabled, timeouts
are bounded and failures return generic errors without bodies, tokens or route
content. Authority output is type-checked and whitelisted. Missing/malformed RPCs
are unavailable, never consent. Responses are private/no-store and vary by
Authorization. The service worker bypasses cache/replay for consent, legacy
settings/traffic-pattern and trip-analytics paths, including anonymous requests.
Older cache copies are not erased by this change.

The same existing live-session RPC used by private dashcam now protects other
private location APIs; JWT signature, subject, session UUID, role and non-anonymous
identity checks remain. No positive authentication/grant cache was added. An
ordinary admin key or service-role JWT is not an authenticated user consent grant.

## PostgreSQL authority and migration

`supabase-selfhost/volumes/db/init/03-privacy-consent.sql` adds:

- `voyagr_privacy_policy`: category, policy version, availability and bounded grant
  lifetime. Four categories (`cloudSync`, `history`, `dashcamBackup`, `diagnostics`)
  start unavailable with policy `2026-11-14.1`. Analytics stays a separate browser
  choice, not an authenticated cloud grant.
- `voyagr_privacy_consent`: own user/category, explicit grant/withdrawal, policy
  version, monotonic epoch, expiry and server update timestamp. No location/media
  payload is stored here. No consent is backfilled from existing records or login.
- `voyagr_privacy_state`: authoritative current state; missing, disabled, expired
  or changed-policy grants report OFF.
- `voyagr_set_privacy_choice`: server-derived owner and policy, expected-epoch
  conflict protection for grants, and withdrawal even with stale client versions.
- `voyagr_assert_privacy_permission`: live session, category, current policy, epoch
  and expiry check under session/policy/consent row locks, held through commit.

Client roles cannot edit policy/ledger tables. Own receipt reads are RLS-limited;
mutations use the controlled RPC. Function search paths are empty and references
qualified. Privileges are explicitly revoked from PUBLIC/anon/service_role; RPC
execution is limited to authenticated users and still checks the signed-in role
and live session. Migration preflight refuses exposed roles with RLS bypass,
unexpected table owners or inherited service-role client privileges. Definer
functions are owned by the reviewed privileged migration operator.

Existing profile payloads and epochs are preserved. The snapshot table gets
restrictive policies in addition to privilege revocation, preventing a retained
permissive policy or accidental INSERT/UPDATE grant from reopening plaintext
uploads. SELECT/DELETE still require the actual live owner, independent of cloud
consent. Repeat migration does not reset reviewed capability settings or epochs.

Permission expiry is distinct from personal-data retention. The proposed default
maximum grant lifetime is 30 days, bounded/configurable in the unavailable server
policy. It does not delete records or apply a production retention policy. Review
that setting before enabling a future category. Epoch/withdrawal metadata remains
until an approved account-data lifecycle removes it; it must not be casually
cleared because that could permit replay. Full account removal and retention/
backup policy remain later release requirements.

## Concurrency guarantees and limits

A write RPC calls the permission assertion in its own payload transaction, not as
an HTTP capability. Session SHARE and consent UPDATE locks serialize session
revocation and category withdrawal against that transaction. Expiry/session/policy
are checked again after lock waits. The isolated tests cover both commit orders:

- A write holding the permission lock commits first; withdrawal waits and denies
  subsequent writes. Already completed processing cannot be recalled.
- Withdrawal wins first; the waiting write is rejected and creates no payload.
- Session timebox revocation has the same ordering against a pending write.

The synthetic payload function/table in the test script is a fixture only. No new
production payload table or cloud upload RPC is shipped. Future transports need
category-specific ownership, request/size validation, encrypted payload handling,
client epoch propagation, staged-media cleanup and server finalisation tests. A
helper returning true over HTTP cannot authorise a later cross-database commit.

## Files, schema and security impact

New implementation: `voyagr/api/privacy.py`, `voyagr/utils/privacy_enforcement.py`
and the reviewed additive PostgreSQL SQL file. Adapted private auth, dashcam,
trips/search/settings APIs and registration; service-worker private-path coverage;
updated privacy notice storage section to distinguish device data from old uploads.

New verification: `tests/test_server_privacy_enforcement.py` and
`scripts/test-privacy-consent-sql.py`. Existing API/media tests now seed pre-existing
clips through the real owner-bound service, retain authentication/ownership/
playback/deletion checks, and assert that new public uploads fail. They do not mock
the upload guard open. CI runs the new backend file and real isolated SQL suite.

**SQLite migration:** none. **Browser migration:** none. **PostgreSQL migration:**
new ledger/policy and restricted existing snapshot policies, prepared only.
**Production application:** not performed. Existing installations do not rerun
Docker init files. Code rollout alone cannot secure direct PostgREST until the
reviewed migration is applied. See the separate rollout runbook.

## Verification results

| Check | Actual result |
|---|---|
| JavaScript quality guard | PASS |
| Full Jest/coverage | 181 suites / 3,566 tests passed |
| CI web/backend selection including new enforcement tests | 2,349 passed, 1 skipped, 94 subtests passed |
| Existing isolated session-policy SQL | 11 passed |
| New real PostgreSQL/RLS/commit-race suite | 20 passed |
| Patch whitespace check | PASS |

The new HTTP suite uses real JWT verification and temporary SQLite/files, with
remote session/consent HTTP authorities mocked. PostgreSQL tests execute the actual
migration/RLS/functions/locks on a temporary server; JWT claims there emulate the
trusted gateway. These are complementary tests, not live PostgREST or production
verification. Existing frontend tests cover navigation, multi-stop, rerouting,
hazards, local history, media, recovery and units; the public route test confirms no
private authority is consulted even when it is unavailable.

Unverified: deployed PostgREST/JWT gateway/grants, applied production policies,
GoTrue session lifecycle/schema, old installed-PWA rollout, mobile/long-drive media,
infrastructure/proxy logs, storage encryption and external backup restoration.
Desktop/Kivy and live-service suites outside the CI web selection were not run.
No historical production deletion, production migration or deployment was tested.

## Readiness

Follow-up: [real HTTP integration report](phase-4-http-integration-report.md)
records 42 passing assertions through disposable GoTrue, Kong, PostgREST and
Flask services. This adds local gateway/session integration coverage; it does
not verify or apply the production rollout described below.
The [full-candidate browser report](phase-4-browser-verification-report.md) adds
40 passing Chromium assertions and documents fixes for stale withdrawal UI and
offline account bootstrap. Physical-phone and production release gates remain.

**Production verdict: NO-GO.** Server enforcement is implemented and locally
verified, but the migration, real gateway and coordinated client/server deployment
have not been approved/applied/verified. Cloud UI remains unavailable. Phase 5 can
build optional encrypted sync on this boundary after review; physical/infrastructure
release gates still apply. This is not a legal opinion or a claim of GDPR compliance.
