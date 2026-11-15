# Phase 3 — independent privacy choices

Date: 2026-11-14. Built on the unmerged Phase 2 implementation in PR #495; Phase 1
and Phase 2 commits remain dependencies. No production changes, deployments, data
deletions or server database migrations were performed.

## Delivered behaviour

The existing Settings section now groups independent optional choices using native,
labelled checkboxes and collapsed explanatory information:

| Category | Default and availability | Persistence / scope |
|---|---|---|
| Cloud synchronisation | OFF, disabled/unavailable | No grant accepted and no transport enabled |
| Dashcam cloud backup | OFF, independently disabled/unavailable | Separate category; cannot inherit a sync permission |
| Journey/recent-search recording | OFF until explicitly selected | Current guest/account device profile, IndexedDB `localOptions.privacy` |
| Optional diagnostics | OFF, disabled/unavailable | No optional diagnostics collector added or enabled |
| Optional analytics | OFF until explicitly selected; unavailable if deployment analytics is not configured | Browser-wide versioned localStorage receipt; separate from profile/history |

Unavailable services deliberately cannot be switched on. This is not an upload
implementation disguised behind working-looking switches. Necessary routing,
traffic, geocoding and explicit community-report requests remain independent of
these choices. Existing operational/security logs are not an optional diagnostics
collector and are not switched off by this UI.

## Policy records and defaults

`consent-policy.js` defines schema 1 and policy version `2026-11-14.1`. It accepts
only a matching schema/policy, an explicit boolean grant, an `explicit` source and
a finite nonnegative client timestamp for a currently available category.
Default-OFF entries have `source: default` and no recorded-choice timestamp;
explicit refusals are distinguishable from defaults. Client timestamps are local
preference evidence, not authoritative server consent or proof of legal compliance.

Missing, malformed, legacy and unknown-policy records fail closed. The old
`recordHistory` flag and plain `voyagrAnalyticsConsentV1=granted` string do not
silently become current permission. A fresh explicit choice is required. The
analytics key is retained, with a versioned JSON receipt replacing its old value
only on a user choice. Profile imports, settings restoration, login and legacy
recovery do not create permission. Available choices are not coupled to privacy
notice acknowledgement. Existing explicit current-version choices can be restored
for their intended profile/browser; another account does not inherit local history
permission. Installing/reinstalling a PWA does not necessarily erase browser site
storage; no promise is made that uninstalling alone clears existing records.

Structured exports/imports do not enable optional grants. Old data remains
available under the Phase 2 management/recovery rules. No optional cloud upload
queue is created. All Phase 2 client upload and legacy worker replay gates remain
closed; existing authenticated uploaded-dashcam management remains separate.

## History withdrawal and concurrency

History and recent-search recording now use `recordWithPermission`, which reads the
privacy receipt and writes the collection in one IndexedDB transaction. Normal
collection mutations, explicit import and deletion are separate: switching recording
OFF must not prevent managing existing records.

Withdrawal immediately denies new work in the current page, writes a minimal
browser-local OFF marker, and sends an origin-local BroadcastChannel notification.
Other tabs re-read state on privacy/storage notifications. The marker contains an
owner namespace, policy version, time and a change marker; no coordinates,
route, voice content or credentials are sent through notifications. Receipt reads
and transactional writes fail closed when required choice storage is unavailable.
An older enable callback checks the captured withdrawal marker before committing,
so it cannot overwrite a newer withdrawal. Owner generations also prevent an
account switch from completing an earlier profile's checkbox operation.

A failed withdrawal leaves this page off and reports that the choice could not be
saved. No implementation can guarantee durable revocation when every durable
storage mechanism fails; retry/clear site data as appropriate. Already committed
history is retained rather than deleted, and already completed processing cannot
be recalled. A local OFF marker is not a revocation message to a future cloud
server; server authority remains Phase 4.

## Analytics

Both the app and the server's local analytics bootstrap load the policy module
before the consent controller. With missing/unknown permission, no Google tag is
inserted. Existing URL-query/fragment/referrer omission and advertising-signal
restrictions are preserved. Analytics remains separate from history and cloud.

The Settings checkbox can withdraw without reloading live navigation. It sets the
vendor disable flag, removes the tag, clears queued app analytics and accessible analytics cookies while
retaining essential cookies. The existing standalone privacy-page decline action
can still reload that page to discard already loaded vendor handlers. Cross-tab
changes are re-read; failed writes never enable collection. Already sent requests
cannot be recalled, and these tests are not an audit of the third-party vendor's
internal processing/retention.

## Changed files and schema impact

- New `static/js/modules/privacy/consent-policy.js` and its direct tests.
- `local-data.js`: versioned choice handling, recording gates, withdrawal signals,
  owner-aware UI, and truthful failure feedback.
- `local-store.js`: atomic permission-check/write transaction.
- `trip-history-orchestration.js`: use the recording transaction.
- `analytics-consent.js`, `voyagr/ga4.py`: policy-aware independent analytics receipt
  and local bootstrap ordering.
- `templates/index.html`, `templates/privacy_policy.html`, `static/css/voyagr.css`:
  grouped accessible controls, unavailable-service states and updated explanations.
- Coordinator, analytics, completed-journey and backend HTML/bootstrap tests updated;
  Chromium fixture extended for two-tab withdrawal and reload persistence.

No server tables, RLS, SQLite/PostgreSQL schemas, routing caches or infrastructure
configuration changed. The existing additive IndexedDB schema from Phase 2 is
unchanged; privacy is a versioned value in its existing `localOptions` category.
Old options/receipt values are not automatically deleted or treated as new grants.

## Verification results

| Check | Actual result |
|---|---|
| JavaScript quality guard | PASS |
| Full Jest/coverage suite | 181 suites / 3,562 tests passed |
| Existing CI backend/web file selection | 2,306 passed, 1 skipped, 94 subtests passed |
| Isolated PostgreSQL session-policy regression | 11 passed; temporary local instance only |
| Real Chromium fixture | PASS: current choices survive reload; cross-tab history withdrawal, default OFF, offline reads, scoped data and media/metadata deletion |
| Patch whitespace check | PASS |

Tests cover unknown versions, explicit versus default choices, independence,
unavailable grants, legacy flags, account changes, settings imports, storage
failures, delayed writes, stale enables racing withdrawal, analytics cookies,
bootstrap ordering, and owner-aware checkbox completion. Existing routing,
rerouting, multi-stop, hazard, navigation recovery, units, costs and authenticated
media tests remain in the full existing selections.

Chromium uses a loopback-only fixture, real IndexedDB and synthetic media, not a
physical phone/camera or full installed-PWA journey. Vendor collection/retention,
actual device storage eviction, Android/iOS backgrounding, old installed-PWA rollout
and live infrastructure are unverified. Desktop/Kivy and live-service tests outside
the CI web selection were not run. No production database was connected. Remote CI
status is reported separately from local results.

## Rollback and production assessment

Preserve the new receipt values, local data and Phase 2 upload gates. Do not downgrade
to an old client that resumes automatic optional uploads, imports a raw legacy grant,
or records history without the new permission transaction. Prefer a forward fix.
No server migration rollback is required. Missing policy code must deny optional
recording/analytics while leaving necessary navigation usable.

**Production verdict: NO-GO.** Phase 3 implements local preferences and sender gates;
it does not provide authoritative, category-specific backend consent. Phase 4 must
reject missing/stale/revoked grants for direct APIs and PostgREST independently of
these browser controls, preserve ownership and cloud-data management, and test old
clients. Optional encrypted cloud transports and their revocation queues remain
Phase 5; physical/infrastructure security and integration verification remain part
of the overall release gate. No GDPR compliance claim follows solely from tests.
