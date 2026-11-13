# Location privacy verification report

Date: 2026-11-13. Baseline audited: `bf0b5883` (main, after logging PR #491).
Scope: local repository and synthetic tests; no production VPS/DB/provider account,
live user record, infrastructure change, migration, historical purge or deployment.

## Verdict

**NO-GO for claiming the proposed privacy-first retention architecture is complete.**
The small diagnostic-access patch is suitable for review on its own once CI passes.
This is not a direction to switch off the running navigation service. Server-route
persistence, shared private-response caching, cloud-sync/upload defaults, proxy/log
settings and backup erasure/restoration safeguards remain unresolved. The user must
choose the architecture/retention options before the remaining implementation.

## Implemented scope

- Fail-closed existing admin auth for persistent cache statistics, route-cache
  membership diagnostics, and global location-prediction GET/POST access.
- Private no-store responses for success/denial and service-worker network-only
  handling of these diagnostic GET paths; no cached offline replay.
- No changes to GPS precision, public routing/rerouting, route-shaping inputs,
  cost calculation, existing cloud records, dashcam storage or retention settings.
- Added real temporary-SQLite lifecycle checks for dashcam deletion/cleanup and
  metadata erasure, plus authorisation/logging tests for location diagnostics.

Existing local caches, historical databases, media and backups have not been
cleared. The new SW policy stops reading these diagnostic paths; it does not
retroactively wipe old CacheStorage data or activate itself on every open client.

## Executed checks

Commands run in `/workspace/Voyagr` using `.venv` and the existing npm lockfile.
No desktop/live-service suite is represented as production verification.

| Check | Result | What this actually verifies |
|---|---|---|
| `pytest tests/test_location_diagnostics_privacy.py tests/test_admin_auth.py` | **34 passed** | Real Flask handlers/admin gates; synthetic SQLite rows. Missing/wrong/admin-vs-bearer access, no-store/Vary and no coordinate reflection/logging; public cost endpoint remains usable |
| `pytest tests/test_location_diagnostics_privacy.py tests/test_dashcam_ownership.py tests/test_persistent_route_cache.py` | **68 passed** | Real local SQLite/files/JWT validation, owner read/upload/delete/cleanup, legacy quarantine and current persistent-cache freshness. Supabase session authority is mocked; no live auth/provider verification |
| Focused Jest `dashcam-service-worker.test.js` | **6 passed** | Actual SW fetch handler loaded with fake browser/network boundaries; private media and new diagnostics never touch cache storage offline |
| `npm run lint:tests` | **Passed** | Test quality guard, not privacy compliance |
| `npm run test:ci -- --maxWorkers=2` | **3,529 passed / 176 suites** | Existing route/reroute/waypoint, voice, lifecycle, offline/recovery and UI suites using simulated browser boundaries |
| CI-selected Python behaviour files via `.venv/bin/python -m pytest -q` | **2,300 passed, 1 skipped, 94 subtests passed** | Repository's web backend selection, including routing, rerouting/origin, multi-stop, cache, logging, ownership/security and new diagnostic tests. External provider boundaries are stubbed where declared by their tests |
| `.venv/bin/python scripts/test-dashcam-session-sql.py` | **11 passed** | Real isolated PostgreSQL SQL/session-policy checks, not production applied-RLS/session authority |
| `git diff --check` | Passed at review | Patch whitespace/integrity only |

The new diagnostics tests populate a **temporary** SQLite file with synthetic route
and prediction rows. They exercise the actual cost/ML handlers for an authorised
operator, then verify anonymous/wrong-key/ordinary bearer callers cannot receive
those values. They capture logs as well as HTTP bodies. These do **not** establish
private per-session isolation for the still-shared public `/api/route` cache.

New dashcam tests verify manual delete and cleanup remove the owner's recording
row, GPS metadata rows (foreign-key cascade), sidecar and video while another
owner's metadata/video remain. They do not claim to erase old backups, SSD remanence
or a user's downloaded device copy.

## Read-only lifecycle experiments (real local helpers, synthetic data)

Executed a temporary Python script with `TemporaryDirectory`, a synthetic SQLite
file, gzip backup fixtures, `BackupManager` and `CostCalculator`. S3 was explicitly
disabled; no SDK network request, live DB or production deletion occurred. These
are diagnostic observations of existing defects, **not passing privacy guarantees**:

| Observation | Actual result | Meaning |
|---|---|---|
| Backdate cached route to 72h; call current keyed reader | Reader returned `None`; SQL row still existed | Serving expiry works, physical retention is unbounded by that check |
| Back up a synthetic row; delete it from synthetic live DB; call existing restore helper | Deleted row present after restore | Existing restore has no deletion replay safeguard |
| Create two `.db.gz` filenames in the module's own naming format, one from year 2000; set daily count to 1; invoke cleanup | Old file remained; cleanup reported failure | Timestamp parsing does not enforce nominal backup retention |

Reproduction recipe (use a disposable directory only):

1. Create a synthetic SQLite table/row, construct `BackupManager` with explicit
   temporary DB/backup paths and `BACKUP_S3_ENABLED=''`, create the backup, close all
   DB connections, delete the synthetic row, restore the generated file, then count
   rows in the temporary DB. Existing helper moves/replaces the supplied DB, so
   **never supply a production DB path**.
2. Generate `voyagr_web_20000101_000000.db.gz` and a recent generated `.db.gz` file,
   set `daily_retention=1`, call `cleanup_old_backups()` and inspect its diagnostic
   plus the old fixture's existence. No real backup directory is required.
3. Create an in-memory `persistent_route_cache` with `cache_key`, `route_data`,
   `created_at`, `last_accessed` and `access_count`; insert a row 72 hours old; bind
   the cost service's DB context to it, call `get_cached_route_from_db`, then count
   the row. This substitutes only the DB connection, not the freshness logic.

## Not executed / not yet implemented

- Proposed 15-minute cache isolation/physical-expiry contract: **not implemented
  or claimed tested**. Existing tests use current 1-hour memory/24-hour DB freshness.
- Deletion-ledger replay or resurrection-resistant backup restore: **not present**;
  synthetic current-behaviour experiment establishes the gap.
- Production Nginx/Gunicorn/Cloudflare/provider access/error logs, TLS, host backups,
  Redis AOF/RDB, SQL grants/applied RLS, S3 expiry/versioning/replicas: **not inspected**.
- Complete all-endpoint logging redaction: **not established**. Existing route,
  geocoding-selection, voice and speed regressions cover specified sinks; residual
  lookup exception/proxy URL logging remains listed in the threat model.
- Physical Android/PWA offline journeys, real GPS driving, camera capture/download,
  tab/background eviction and service-worker upgrade with old cached data: **unrun**.
  Jest/fake IndexedDB/SW simulations are not mobile-device tests.
- Live Valhalla/OSRM/GraphHopper/Nominatim/Overpass/TomTom or voice-provider retention
  and deletion tests: **not run**. External services were not audited by probing
  actual user requests.
- Desktop/Kivy/custom-router/live-service test suites outside the CI web selection:
  **not run**, not included in reported passing totals.
- Production migrations/deploy, subject data export/deletion and historical backup
  cleanup: **not performed**, explicitly outside authorisation.

## Required evidence before the full-architecture GO decision

Approve the route-cache variant, opt-in migration/defaults and concrete upload
retention. Implement and test those separately. Then obtain authorised deployment
configuration evidence, verify processor/backup lifecycles and exercise isolated
restore with deletion replay. Validate on physical mobile devices without asking
anyone to use controls while driving. Update notices and operational runbooks to
match deployed behaviour; do not assert GDPR compliance from green tests.
