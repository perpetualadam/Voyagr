# Phase 9 — deployed dashcam security acceptance

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

**DEPLOYED_DASHCAM_SECURITY_NOT_TESTED.** No production credentials/endpoints, accounts, recordings or deployed SQL were accessed. Existing JWT/session/ownership/path/proxy/browser controls were inspected; no confirmed dashcam defect found and no dashcam code or migration changed. Local selected ownership/blueprint/service tests, JS lifecycle/service-worker regressions and 11 real temporary PostgreSQL policy tests passed. These do not establish deployed GoTrue, reverse proxy or storage configuration.

## Approved operator acceptance procedure

Use a separately approved test environment, two dedicated accounts A/B and short synthetic recordings only. Obtain explicit environment authorization first; no production mutation is authorised by this report. Never use real-user IDs or recordings. Keep token values out of shell history, logs, screenshots and artifacts. Redact authorization headers, session identifiers, private paths and content. Do not dump service keys or database configuration.

| Check | Operator action on authorised test environment | Required evidence | Here |
|---|---|---|---|
| Session migration | DB owner reads existence/definition/privileges of `public.voyagr_dashcam_session_active()`; compare reviewed SQL; no migration execution | Exact deployed release/version and fail-closed RPC/grants, no general client session-table access | NOT_TESTED |
| Valid session | A accesses own synthetic fixture via normal authenticated API | Own access works; no-store/private headers; no path disclosure | NOT_TESTED |
| Revocation | Log out/revoke dedicated A session using normal test-account flow; retry previously issued access token | New private requests denied; already delivered bytes cannot be revoked | NOT_TESTED |
| Per-user isolation | A/B each enumerate and read only their synthetic fixture | Owner filter for list/status/metadata/video/Range/upload/retention; no cross-user disclosure | NOT_TESTED |
| Cross-user denial | B and anonymous client request A's synthetic recording ID/metadata/video | Denial without content or owner/path disclosure; mutation checks restricted to dedicated fixtures only | NOT_TESTED |
| Private storage | Operator reviews actual nginx/CDN/bucket rules; requests only a known synthetic fixture through suspected public/static path | No anonymous bypass; DB/WAL/sidecars/storage not public; do not scan arbitrary paths | NOT_TESTED |
| Proxy restrictions | Inspect known synthetic video via approved proxy routing and Range requests | Auth always required; no cache leak or exposed filesystem path | NOT_TESTED |
| Signed URL expiry | Only if deployment actually uses signed URLs, obtain one for a synthetic fixture and retry after expiry | Expired/foreign URL denied; record TTL without publishing URL/token | NOT_TESTED / applicability UNKNOWN |
| Device-only | Stationary phone test with camera permission, explicit device-only mode and observed network panel | No server start/upload/metadata/GPS submission; local lifecycle cleanup | NOT_TESTED |
| Browser lifecycle | Sign-out/account switch during pending start; stop/start; background and resume | Old tracks/timers stop; rollback addresses only the started fixture ID | NOT_TESTED |

Read-only SQL for an authorised DB owner (do not supply a production DSN to automated tests):

```sql
BEGIN READ ONLY;
SELECT to_regprocedure('public.voyagr_dashcam_session_active()');
SELECT pg_get_functiondef(to_regprocedure('public.voyagr_dashcam_session_active()'));
SELECT has_function_privilege('anon', 'public.voyagr_dashcam_session_active()', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.voyagr_dashcam_session_active()', 'EXECUTE');
ROLLBACK;
```

If the function is absent, stop and report BLOCKED; do not apply migrations here. Compare with `supabase-selfhost/volumes/db/init/02-dashcam-session-check.sql` and the deployed auth version. Existing-volume init is not proof of migration installation. Token revocation and recording creation/deletion inherently change dedicated test state, so perform those only in the separately authorised test environment. This task does not authorise creating accounts or changing production state. Keep every check NOT_TESTED until the operator returns sanitized observed results, exact build versions and timestamps. Existing Phase 2/external-review security reports remain applicable.
