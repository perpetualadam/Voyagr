# Voyagr security and privacy audit

Audit date: 2026-10-27. Scope: current checkout, local deterministic requests, configuration/deployment source review and dependency advisory queries. No production systems accessed; no credentials or real user recordings printed. Findings are not a penetration-test certification. Starting commit and baseline are in VOYAGR_BASELINE_AUDIT.md. Exact endpoint/file/line inventory: VOYAGR_ROUTE_INVENTORY.json (122 rules, including Flask static routes).

## Phase 2 status

SEC-03 application-code remediation is complete; see [dashcam ownership remediation](VOYAGR_DASHCAM_SECURITY_REMEDIATION.md) for owner-scoped SQLite/files, strict Supabase JWT/session checks, legacy quarantine, browser privacy and tests. Deployed Supabase/GoTrue/proxy acceptance remains unverified and mandatory. The original findings below record the pre-remediation evidence; overall release remains NO-GO for outstanding security acceptance and navigation concerns.

## Confirmed findings and disposition

| ID | Severity | Evidence / root cause | Disposition |
|---|---|---|---|
| SEC-01 | P1 | Baseline `voyagr_web.py:1227,1229` emitted request JSON; calculation/cache/OSRM paths printed exact endpoints or URL. Provider bodies and exception strings could repeat requests. | Fixed targeted web route logging: event fields, counts, elapsed milliseconds, generic/type-only provider failures. Regression tests exercise memory/persistent caches, invalid bodies, validation, provider failure and exception paths at DEBUG level including stdout/stderr and structured log fields. |
| SEC-02 | P1 | `voyagr/utils/admin_auth.py:check_admin_request` returned None for absent secret, exposing debug, monitoring and cache operations. | Fixed: 503 when unconfigured, 401 for absent/wrong key, constant-time comparison when configured. Public navigation/settings stay public. |
| SEC-03 | P0 (original finding) | Original recording/metadata/video/upload/delete routes lacked ownership gates; a synthetic record was returned anonymously with HTTP 200. | Phase 2 implements and tests strict JWT/session checks and owner scoping on all resources. Legacy rows quarantined. Deployment/migration acceptance remains required; no production exploitation performed. |
| SEC-04 | P1 review priority | Advisory scanners identify vulnerable pinned Python dependencies and npm packages. | Open upgrade batch with compatibility testing; advisory presence is confirmed, application exploitability is not. See JSON artifact. |
| SEC-05 | P2 | `voyagr/api/support.py:create_stripe_checkout_session` documents same-domain redirects but accepts any HTTPS URL and localhost-prefix strings; client-supplied account reference is not verified here. | Open: enforce parsed origin and authenticated reconciliation before granting entitlements. No paid API calls made. |
| SEC-06 | P2 | `voyagr/utils/supabase_auth.py:_issuer_for_pyjwt` skips configured issuer verification if the signed token omits iss; decorator returns exception detail. | Open: require issuer consistently with existing Supabase issuer contract, remove unnecessary verification detail, add token fixtures. Signature/expiry/audience checks do exist. |

P0 here means confirmed application-level exposure if these APIs are reachable; actual production reachability, reverse-proxy policy and whether recordings exist were not tested. Do not expose this build publicly until the Phase 2 deployment/session-policy/storage acceptance checks are complete.

## Administrative surface

The shared gate protects `/monitoring`, all `/api/monitoring*`, `/api/test-routing-engines`, `/api/debug-route`, `/api/cache-stats`, `/api/cache-clear`, `/api/fallback-chain-health`, `/api/fallback-chain-status`, `/api/parallel-routing`, `/api/routing-performance-report`, `/api/batch`, and method-specific gates registered by other blueprints (including ML writes). `/api/admin/promo-coupons` uses a separate coupon secret and already returns 503 when absent. Existing decorator names retain `if_configured` for import compatibility, but now fail closed. Operator-visible behavior deliberately changes: missing secret no longer enables privileged APIs. Tests assert denial before handler execution. `admin_auth_enabled()` reports whether a credential exists, not whether the authorization policy is optional.

## Other reviewed controls and remaining uncertainty

- Authentication/privacy: trip history uses `require_private_user` and SQL `WHERE user_id = ?`; a remote unauthenticated trip-history request returned 401. Local development bypass and forwarded-client trust depend on deployment settings; verify nginx and `VOYAGR_TRUST_PROXY` together. Dashcam now has its own strict owner/session gate; trip-history protection remains separate.
- CORS: explicit allowed-origin lists in web/config code; not an authorization boundary. Flask-CORS dependency has advisories. Production response policy was not fetched.
- Rate limiting/body size: Flask-Limiter defaults 500/min and 10,000/hr, plus route limiter; in-memory storage is per process. Early request-body rejection and 413 handler exist and tests pass. Shared Redis configuration is needed for multi-worker enforcement. Proxy body limits must be validated separately.
- SQL: parameterized SQLite examples in trips, caches and dashcam are present. No confirmed injection exploit identified in traced active paths; this is not proof every historical script is safe.
- XSS: reusable escaping helpers and injected escapeHtml callbacks exist alongside many dynamic innerHTML sinks. The CSP source allows unsafe-inline/unsafe-eval; a complete taint analysis/browser exploit suite was not run. Treat remaining sinks as review work, not confirmed vulnerabilities.
- SSRF: routing/geocoding destinations are predominantly configured server-side, with request timeouts. No confirmed arbitrary destination exploit found in examined public routing paths. Operator-configured webhook/Overpass/provider URLs remain trusted configuration inputs; redirects/private-network egress were not exhaustively tested.
- Path traversal: dashcam deletion resolves paths and checks storage containment, and existing dashcam tests pass. Recording authorization is now owner-scoped in Phase 2; deployed storage/proxy validation remains outstanding. Monitoring exports are now admin-gated. No blanket traversal-free claim.
- Subprocess/debug: no shell=True/eval/exec call was found in the searched active Flask/service files. Flask entry point uses debug=False. Deployment/build helpers were inventoried but not executed. No live deployment settings inspected.
- Secrets: no environment values or tracked env-file contents were dumped. Runtime presence was checked during setup; tracked `.env.production` and deployment secret-printing helpers should undergo a separate secret-history/rotation review. This audit does not assert credential validity or absence of historic leakage.
- Supabase RLS: `supabase-selfhost/volumes/db/init/01-voyagr-schema.sql` enables RLS for profile snapshots with auth.uid() ownership policies on SELECT/INSERT/UPDATE/DELETE. No live PostgreSQL roles/policies were verified. Service-role bypass and additional production tables are unverified.
- Stripe: Checkout session creation exists; no Stripe billing-event webhook receiver found in the Python source search. Signature verification is therefore not demonstrated; entitlement synchronization is unfinished, rather than a confirmed unsigned-webhook exploit.
- Logging: targeted route/provider logging improved; exact location logging remains elsewhere (speed detector, browser reroute events and desktop paths), and multidrop errors need a dedicated privacy pass. Do not describe this patch as application-wide log redaction.

## Dependency checks

`npm audit --json`: 11 vulnerable package entries (8 high, 1 moderate, 2 low; zero critical). All reported high entries are transitive: @babel/plugin-transform-modules-systemjs, brace-expansion, browserslist, form-data, js-yaml, minimatch, picomatch, ws. npm reports fixes available; no automatic update applied.

`pip-audit --path .venv/lib/python3.12/site-packages --vulnerability-service pypi`: 9 affected installed packages, 63 raw advisory records, 38 distinct (package, advisory ID) pairs after exact-ID deduplication. Packages: Flask, Flask-CORS, geopy, gunicorn, pip, protobuf, PyJWT, python-dotenv, requests. Distinct IDs may still refer to related issues; these are not 38 proven independent exploits. pip is environment tooling. Version/fix metadata is retained in VOYAGR_DEPENDENCY_FINDINGS.json. Scan initially failed writing a read-only home cache and completed after using a workspace cache. Nonzero scanner exit indicates advisories, not a passing security check.
