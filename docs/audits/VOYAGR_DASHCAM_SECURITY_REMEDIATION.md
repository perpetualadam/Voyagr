# Voyagr dashcam ownership remediation

## Before changes: investigation

Phase 2 begins with the prior audit changes still uncommitted; they are preserved. No production data/configuration/deployment is accessed. Repository HEAD remains 4c44f4de7bcbd2dbcb5acf2247887f452835263f; the working tree contains the reviewed audit fixes.

Dashcam endpoints in dashcam_blueprint.py under /api/dashcam: POST start, POST stop, GET status, POST metadata, GET recordings, GET recordings/<id>/metadata, GET recordings/<id>/video (download=1), POST recordings/<id>/upload, DELETE recordings/<id>, POST cleanup, GET/POST settings. None previously authenticated callers or checked ownership. Identifiers were timestamp-based. A shared service held one global active recording, metadata buffer and settings. SQLite dashcam_recordings had no owner column. Sidecars and video blobs lived under dashcam_recordings/ next to the app, outside Flask static. Uploads accepted raw video or multipart file; playback/download served files after an ID lookup. Deletion and retention cleanup traversed all rows. No thumbnail endpoint, signed URL, public sharing grant or scheduled dashcam background worker was found; cleanup was explicitly requested by the browser. Browser setInterval collects metadata every five seconds; MediaRecorder collects chunks locally and uploads on stop.

Frontend controls/capture/playback/list/settings are inline in templates/index.html. static/js/modules/navigation/dashcam-capture.js supplies media/stop/upload plans. Supabase auth is already managed in static/js/app/supabase-auth-orchestration.js; access tokens are available there. Existing server JWT verification is voyagr/utils/supabase_auth.py. Existing private-user decorator has a local-development bypass and does not establish session revocation, so it cannot be reused unchanged for private recordings.

The existing anonymous flow was not local-only: it created a server recording and uploaded on stop. The new UI will state clearly that server recording requires sign-in; it will not silently upload anonymous video. Existing camera capture and navigation integration will be retained for signed-in users.

Implementation and validation results follow below after changes are tested.

## Implemented security design

### Authentication

`voyagr/utils/dashcam_auth.py:authenticate_dashcam_request` reuses the existing Supabase JWT verifier. It requires a Bearer header, signed/valid/unexpired user claims, UUID subject/session identifiers, authenticated role and a non-anonymous user. No localhost, shared API key, query-token, frontend user-ID or cookie bypass applies to dashcam. This leaves other application authentication flows unchanged.

JWT signature/expiry alone cannot detect a revoked session. Every dashcam request additionally calls the configured project's `POST /rest/v1/rpc/voyagr_dashcam_session_active` with the same Bearer token and existing public SUPABASE_ANON_KEY. The new SQL function checks that auth.sessions contains the caller's own session and its not_after has not expired. Missing function/configuration, authority errors/timeouts and malformed responses never authorize access. No positive session cache is used; invalid/revoked credentials return 401, unavailable verification returns 503. Credentials and upstream error details are not logged or returned. Existing SUPABASE_URL, SUPABASE_ANON_KEY and signing-key/JWKS configuration are reused; no production values were read or changed.

`02-dashcam-session-check.sql` uses SECURITY DEFINER with an empty search_path, explicitly qualifies auth functions/table, revokes PUBLIC/anon execution, and grants only authenticated execution. It returns one boolean, not session rows, and accepts no user/session parameters. The caller cannot choose another subject through request JSON. The function must be installed by an appropriately privileged database owner; ordinary authenticated users receive no direct auth.sessions privileges. Tests validate these properties on real isolated PostgreSQL; the live GoTrue/PostgREST deployment and its logout behavior were not contacted.

### Ownership and durable state

`dashcam_schema.py:ensure_dashcam_schema` provides an additive, repeatable SQLite migration, called by the existing init_db and standalone service initialization:

- Nullable `dashcam_recordings.owner_user_id`, with NULL preserving/quarantining legacy rows.
- Owner/start-time index and one-active-recording-per-known-owner partial unique index.
- `dashcam_metadata` points referencing the recording with ON DELETE CASCADE.
- `dashcam_user_settings` keyed by owner, replacing global mutable settings.

`dashcam_blueprint.py` authenticates all registered dashcam methods before binding an owner-specific service via Flask g and app.extensions. No request identity is stored in the shared module global. `DashcamService.for_owner` accepts the server-verified subject. Every recording lookup/mutation filters by owner and identifier; list/status/stop/metadata/cleanup/settings are also owner-scoped. Another user's ID behaves like a missing ID (404), and lists do not enumerate other owners or expose filesystem paths. Optional trip associations must also belong to the caller. IDs use UUID randomness, but authorization does not rely on secrecy of those IDs.

Recording state and metadata persist in SQLite rather than a process-global buffer. Multiple service instances/workers see the same active session and points. Write transactions plus a partial unique index serialize conflicting starts; a concurrent four-thread test permits exactly one active session for an owner. Two owners can record simultaneously. Explicit recording_id on stop/metadata cannot select another owner's session; when omitted, only the caller's own active session is considered.

This retains the existing start/stop/list/upload/playback/settings feature and database rather than replacing authentication or switching storage providers. The state/storage refactor is necessary to eliminate cross-user and cross-worker global state.

### Files and associated resources

Videos and metadata sidecars remain local, outside Flask static. New owner directories are derived from a hash of the verified UUID (directory names are not authorization), created mode 0700; atomic writes use private mode-0600 temporary files followed by replacement. Paths must remain in that owner's directory, and symlinks/out-of-owner paths are rejected. Storage configured underneath Flask's public static directory is refused. SQLite metadata is read only after ownership lookup; stopping also writes the existing sidecar export within the owner directory. Deletion/retention affects only the caller's completed recordings and their associated metadata/files; unowned legacy files are untouched.

SQLite does not implement Supabase RLS; application-side SQL ownership checks and OS file permissions are its access boundary. No recordings or thumbnails are stored in Supabase buckets, so no bucket policy or signed-URL grant is introduced. Supabase is used for identity/session verification only. There is no public share route, signed media URL or thumbnail implementation. Unknown thumbnail routes return 404 and do not expose a derivative resource.

Video playback, range requests and attachment downloads pass through the authenticated owner check on each request. Query tokens and bare recording URLs cannot bypass it. API responses use Cache-Control: private, no-store, Vary: Authorization, and nosniff. Error responses do not disclose local paths. Uploaded media is served with a video content type, not interpreted as HTML. Existing Flask upload body limits remain in place.

The service worker treats every dashcam request as network-only, including POST/DELETE; failures return 503, never an apparently queued upload. Cache version v44 retires prior caches that may contain old anonymous API responses. This does not erase copies already downloaded or exported by users.

## Endpoint authorization inventory

All paths below have `/api/dashcam` prefix and require JWT plus the active-session check.

| Endpoint | Ownership decision |
|---|---|
| POST /start | Subject assigned server-side; optional trip must belong to subject |
| POST /stop | Caller-owned recording_id, or caller's own active session only |
| GET /status | Caller-owned active session only |
| POST /metadata | Caller-owned active recording; finite/range-checked GPS values |
| GET /recordings | Owner-filtered, bounded limit; no file paths/owner field exposed |
| GET /recordings/<id>/metadata | Owner lookup before GPS data read |
| GET /recordings/<id>/video, with optional download=1 / Range | Owner lookup plus owner-directory containment before send_file |
| POST /recordings/<id>/upload | Owner lookup before body processing and again in transactional storage update |
| DELETE /recordings/<id> | Owner lookup before scoped DB/file/metadata deletion |
| POST /cleanup | Caller settings and caller's completed rows only |
| GET/POST /settings | Per-owner persisted settings, accepted-field allowlist |

## Browser functionality and privacy

The existing MediaRecorder/getUserMedia controls remain. `dashcam-capture.js:privateFetch` obtains the current Supabase session, adds the Bearer header, restricts destination paths to same-origin dashcam endpoints, disallows redirects, and disables caching/cookies. Recording stop/upload/metadata are pinned to the account that started capture. After a response arrives, identity is checked again; list/settings/media consumers also check identity after reading the response body, preventing stale responses from repopulating a new account's UI.

Playback/download buttons fetch authorized bytes and use temporary blob URLs; no JWT appears in a URL or anchor. Account changes clear the recordings view, storage counters and playback resources. Supabase identity-change notifications do not fire on same-user token refresh, avoiding interruption of legitimate playback. A clip started by A cannot be uploaded under B's account. Session/authority failure can prevent a server save; the stop flow offers the captured clip through a local file download instead of silently discarding it. An interrupted server session can be ended explicitly by its owner from the recordings list; it is never automatically assigned to another user.

Anonymous server storage has been deliberately removed. The UI now explicitly offers “Record on this device only (no upload)”. In that mode capture/start/stop performs no dashcam API upload or GPS metadata submission and saves the video through a local browser download. Default server mode asks for sign-in before camera acquisition. The mode is fixed during recording. Browser/OS permission and actual download behavior still require real-device validation; automated tests use mocked browser media boundaries, not a real camera.

## Validation and evidence

Fresh Phase 2 baseline before edits: **494 Python tests + 68 subtests passed in 5.70s**; **1,777 JavaScript tests in 86 suites passed**. Earlier audit test results are preserved as historical baseline.

Final selected/expanded Python CI run: **538 passed + 68 subtests in 6.21s**, 6.69s including runner startup; no failed/skipped tests reported. This includes 44 new ownership/auth/storage cases in `tests/test_dashcam_ownership.py`, alongside all existing route/GPS/hazard/validation selections and the retained dashcam tests. Tests use real HMAC-signed JWT verification, temporary SQLite/files, and a mocked remote session authority. Expired JWTs, wrong signatures/audience/issuer, malformed/no tokens, anonymous/service-role credentials, spoofed user headers/cookies/query parameters, session-subject mismatches, revocation and authority outages are denied. All twelve dashcam method/path combinations are checked unauthenticated even with local bypass enabled elsewhere.

Two independent users are tested symmetrically for listing, status, metadata read/write, playback, Range/download, upload overwrite, deletion and explicit stop. Settings/retention stay isolated. Legacy rows survive repeated schema migration, cannot be claimed/read/uploaded/deleted by either user, and are excluded from cleanup. Tests also cover owner-directory/symlink containment, public-static refusal, ownership of trip references, cross-worker persistence and concurrent starts. No thumbnails exist; guessed derivative URLs return 404 rather than exposing another user's resource.

Final Jest: **88 suites / 1,796 tests passed in 3.665s**, zero snapshots, no failures/skips reported. Existing configured coverage thresholds pass: 82.67% statements, 75.42% branches, 80.93% functions, 84.54% lines. This is scoped helper coverage, not whole-app or camera coverage. Nineteen new tests run the private transport, actual inline capture controls and actual service-worker module: local-only/no-auth behavior, authenticated start/stop/upload, recorder-failure rollback, playback, account changes, URL/header safety and no cache/offline replay. Existing dashcam media-helper tests remain.

`scripts/test-dashcam-session-sql.py`: **11 tests passed in 0.609s on isolated real PostgreSQL**. Fixtures provide Supabase-shaped auth helpers/session table; the actual migration is applied twice. Checks cover active/expired/deleted/cross-user sessions, anonymous claims, permissions, inaccessible session rows and registration before GoTrue creates auth.sessions. The function uses PL/pgSQL to defer session-table resolution until invocation; missing GoTrue schema still fails closed. This is not a live Supabase/GoTrue end-to-end test. Test tools were installed in a separate temporary environment (pgserver 0.1.4, psycopg2-binary 2.9.13); runtime dependency manifests/lockfiles were not changed. CI now includes the ownership suite and an isolated PostgreSQL-policy job; the hosted workflow itself has not been run here.

Additional PWA/index/schema/ownership smoke selection: **62 passed in 1.05s** (overlaps other results and predates the final added concurrency case). Python compilation, node syntax checks, pip check and git diff --check passed. An initial service-worker test did not satisfy the existing real-import test guard; it was corrected to import the actual service worker and exercise its handlers. No security check or assertion was disabled. No failing or skipped tests remain in the final selected runs. Full desktop/Kivy, real device/browser permissions and production provider suites were not run.

## Legacy-recording migration requirements

NULL ownership is an intentional quarantine, not an assignment queue for arbitrary users. The migration never infers ownership from trip ID, IP, filename, timestamp, frontend claims or whichever user signs in first. It does not move/delete legacy files or automatically apply any owner value. Older in-memory-only settings cannot be attributed and are not copied to users.

Before any legacy recovery, an operator must establish trustworthy ownership through separately reviewed evidence, back up SQLite/files and validate the mapping to the current Supabase UUID. A reviewed offline migration must relocate the file/sidecar into the verified owner's directory, reconcile metadata into dashcam_metadata, update its DB path/owner in a controlled transaction, and verify owner-only read/delete behavior. Merely setting owner_user_id while leaving the path in a legacy/shared location is insufficient: path containment deliberately refuses it. Conflicting active rows require manual review before attribution. No automatic attribution or destructive recovery tool is supplied.

## Deployment considerations — not performed

1. Back up the SQLite database and recording directory. Review the additive SQLite schema changes and restart all application workers on the same version. Existing rows/files are preserved; private requests require a known verified owner.
2. Review/apply `supabase-selfhost/volumes/db/init/02-dashcam-session-check.sql` to the configured Supabase project with a trusted migration owner. Existing Docker volumes do not rerun init scripts automatically. The repository pins supabase/postgres 15.6, GoTrue v2.158.1 and PostgREST v12.2.3; verify auth.sessions/not_after and actual logout/session-removal behavior on the deployed versions. Never grant clients general session-table access.
3. Reuse existing Supabase URL/public key/JWT/JWKS bindings. Before the RPC is installed and reachable, private dashcam requests intentionally return 503; there is no compatibility bypass. Auth-service outage similarly blocks server storage/access while explicit device-only capture can continue.
4. Confirm HTTPS, correct proxy handling and no nginx/CDN/static alias/public bucket exposes dashcam_recordings, SQLite, WAL files or sidecars directly. App-level static refusal cannot enforce external reverse-proxy configuration. Restrict the service account and filesystem permissions; SQLite/database backup encryption and access controls remain operator responsibilities.
5. Ship the updated inline controls, dashcam helper and service worker together. Allow v44 activation and verify old private responses are not served from prior browser caches. Test two real accounts, anonymous clients, logout/revocation, a second worker, Range/download and all retention/metadata operations against the actual deployment.
6. Validate camera permissions, interrupted capture, local-file fallback and large-clip memory behavior on supported devices. Playback currently buffers an authorized blob in browser memory; it is not a new streaming/token-sharing system.

No deployment, production configuration change, production data mutation, paid API call or production migration was performed during this task.

## Remaining limits and release decision

The unauthenticated/cross-user dashcam defect is **remediated at application-code level**, backed by real JWT/SQLite/file tests and actual isolated SQL-policy tests. **Deployment acceptance is pending**: live Supabase identity/session revocation, SQL permissions, proxy/TLS and static-storage protection are unverified. Sessions already authorized for an ongoing download cannot revoke bytes already delivered; authenticated users may save their own video. Existing dependency advisories remain from Phase 1. Quotas/long-recording resource limits and orphan-file reconciliation need further hardening; this patch does not claim an enforced max_storage_gb quota or resistance to an attacker with service-account filesystem/DB access. Anonymous/local-only video has no server-side GPS metadata export.

Overall application release remains **NO-GO**. Lane inference, legal speed-limit estimates, fallback avoidance guarantees, dependency remediation and real-device/road validation are independent concerns. The next navigation engineering task is an explicit enforced/relaxed/unknown constraint contract across every routing fallback, followed by data-grounded lane guidance. Deployment acceptance of these dashcam protections remains a mandatory security gate before public exposure.

## Phase 2 changed files

- Backend: dashcam_blueprint.py, dashcam_service.py, dashcam_schema.py (new), voyagr/models/database.py, voyagr/utils/dashcam_auth.py (new).
- Supabase migration: supabase-selfhost/volumes/db/init/02-dashcam-session-check.sql (new).
- Browser: templates/index.html, static/js/modules/navigation/dashcam-capture.js, static/js/app/supabase-auth-orchestration.js, service-worker.js.
- Tests/CI: existing dashcam service/blueprint tests updated for verified ownership and no path disclosure; tests/test_dashcam_ownership.py (new); static/js/__tests__/dashcam-private-access.test.js and dashcam-service-worker.test.js (new); scripts/test-dashcam-session-sql.py (new); .github/workflows/ci.yml.
- Reports: this remediation report, existing remediation plan, final technical report, and security/test-results status notes. Prior audit changes elsewhere are retained unchanged by Phase 2.
