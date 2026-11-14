# Phase 4 follow-up: real HTTP integration

Date: 2026-11-14. Candidate builds on Phase 4 PR #497 and the preceding local-first
and privacy-choice PRs. This follow-up adds test infrastructure only. No application
runtime file, production setting, retained user record or deployment was changed.

## What changed

- `scripts/privacy-http-lab/run.py`: stdlib Docker orchestrator with fresh synthetic
  credentials, internal-only networking, resource limits, no host ports or volumes,
  disposable database, and cleanup restricted to resource IDs created by the run.
- `app.py`: test HTTP server registers the actual consent/history/search/dashcam
  blueprints and uses actual JWT, live-session and consent authority calls. Only
  storage selection points to temporary SQLite/media fixtures.
- `probe.py`: 42 real HTTP assertions against GoTrue, Kong, PostgREST and Flask.
- Runbook and a separate least-privilege CI workflow, restricted to harness changes
  or explicit manual dispatch. No repository/environment secrets are needed.

No new application database migration. Existing migrations 01/02/03 are applied
only to a fresh tmpfs database. GoTrue runs its own actual schema migrations and
creates real synthetic users/sessions. The fixture uses privileged GoTrue migration
access; production DB role configuration is deliberately not claimed as verified.

## Actual verification

| Check | Result |
|---|---|
| Full frontend Jest suite | 181 suites / 3,566 tests passed |
| Existing frontend quality guard | Passed |
| CI-selected backend behaviour suite | 2,349 passed, 1 skipped, 94 subtests passed |
| New isolated real HTTP suite | 42 assertions passed |
| Python syntax and patch whitespace | Passed |
| Disposable resources after successful run | No labelled containers/networks remained |

The HTTP suite verifies signup and signed access tokens; anonymous, malformed,
expired and forged tokens; service-role denial as a consent owner; default OFF and
unavailable categories; explicit withdrawal; no-store private responses; denied
legacy plaintext writes; A/B isolation for snapshots, SQLite history and media;
owner read/delete while cloud is OFF; byte-range playback; and actual GoTrue global
logout followed by rejection of the old, still-unexpired token. A retained owned
snapshot is readable before logout and hidden after it, so the revocation assertion
does not pass merely because the table was already empty. User B remains signed in.

These are real local container-to-container HTTP tests, not mocked HTTP services.
They are not tests of the existing VPS Supabase installation. No real people, GPS
traces, recordings, accounts or support messages were used.

During preparation, dependency downloads required the managed environment's trusted
CA bundle. The harness supports an explicit public `--ca-file`; TLS verification
was not disabled. Startup corrections kept GoTrue migrations in the auth schema,
made public gateway config readable by its unprivileged user, limited Kong to one
worker, and prevented injected host proxies from diverting internal HTTP. These
are fixture/environment corrections, not changes to production authentication.

VPS2 separately reported 3,566 frontend tests, 178 focused backend tests and 31
isolated PostgreSQL policy tests passing at Phase 4 commit bc482b03. The new HTTP
harness has not yet been run on VPS2 as of this report.

## Remaining release gates and rollback

Still unverified: applied production migrations and actual grants, existing gateway
configuration and external TLS, backup restoration/deletion reconciliation,
infrastructure logs, storage encryption, full-app browser/offline upgrades,
physical GPS and long recordings. Do not publish test accounts, fixture services
or their credentials, and do not use this stack as a production deployment template.

No optional cloud capability is enabled. Normal exit/Ctrl+C attempts to remove only
the resources created by this run. Base images remain cached; a killed process or
daemon failure may require operator cleanup of the printed unique lab name. There
is no application rollback or user-data deletion associated with this follow-up.

**Production readiness: NO-GO** until the remaining release gates are reviewed and
verified. The local integration gap is now covered, but this is not GDPR
certification or permission to migrate/deploy production.
