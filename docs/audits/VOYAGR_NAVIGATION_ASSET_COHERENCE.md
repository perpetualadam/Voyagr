# Navigation asset cache-coherence remediation (draft)

Base: `f36e8e947156e7ac322b88b9516b073533a2f95f`, tree `dbf6c8ac3c2281a4a0ba80cf5dcb70b48d09f58f`. This is a separate development branch and draft PR. No production, Contabo or Cloudflare access/configuration changes, cache purges, restarts, merges or deployment are authorized by this implementation.

## Root cause and limits

The shipped Nginx templates advertised mutable `/static/` URLs as seven-day immutable, while navigation query labels and worker v51 did not change in PR #380. Worker network-first `fetch(request)` could obtain a still-fresh browser HTTP-cache body or stale Cloudflare HIT. Offline `ignoreSearch` could borrow an older script for a different query version. Vendor JS was cache-first. Successful precaching was not evidence of a complete matching executable release.

The owner reported matching origin/edge hashes after purging but a continuing original error. Previously supplied browser source contains the old calculate-route block; its fresh request/source chain and the affected production cohort are not fully correlated. This draft fixes the demonstrated identity/coherence failure mechanisms, not a claimed all-user outage. Cloudflare rules, actual loaded Nginx configuration and live client scheduling remain unverified. No new navigation-authority defect is asserted.

## Implementation

### Immutable public snapshots

`voyagr/asset_release.py` captures the template and referenced public executable inputs once per Gunicorn worker lifetime. The worker therefore does not read changing checkout files into later pages. The snapshot includes every local classic JS/CSS dependency in the rendered page, plus the dynamically loaded AR ES module and local Picovoice `.pv`/`.ppn` sidecars. Runtime models are public existing application assets, not user journey data or credentials.

Each rendered asset set has a deterministic release ID from source hashes, template identity and builder implementation. Every output has its own SHA-256 and a path:

`/_voyagr/assets/<release-id>/<body-sha256>/<indexed-name>`

The public immutable endpoint checks the retained manifest and actual bytes before serving, returns 404/no-store for wrong/corrupted identities, and gives valid bytes `public, max-age=31536000, immutable`. A query string is not the identity. Server snapshots are published with an atomic directory rename and retained; subsequent healthy requests do not rewrite them. Concurrent workers can publish the same deterministic snapshot. The default store is Flask's `instance/asset-releases`, overridable with `VOYAGR_ASSET_RELEASE_DIR` to a persistent service-owned location outside an ephemeral deployment directory.

Classic JS stays in separate classic script tags with `defer`, preserving document order, global lexical scope and source strict directives. Each output has a release/order precheck and completion marker; a failed/missing predecessor blocks later entry execution. HTML pins each script/style with SHA-256 SRI, so a stale edge/HTTP/worker body cannot execute under a new identity. Unrecognized unpinned local executable tags fail preparation instead of bypassing the release. The guard displays a non-destructive update error, with no reload loop or user-storage clearing.

The AR ES module retains module semantics. It is fetched and hash-verified before a Blob module import; relocation does not silently change its relative URL base. It has no relative module imports in the current source. Voice model configuration resolves to the same release's immutable sidecars, and redundant legacy mutable warm-up is skipped for release-managed pages. Embedded vendor WASM remains part of the pinned vendor JS bytes.

This is byte/order coherence, not a new navigation authorization policy. It does not sandbox hostile code from a compromised same-origin delivery root or guarantee arbitrary runtime bugs cannot occur. Early coherent modules may have initialized definitions/listeners before a later failure, but an absent predecessor prevents the later application entry from executing; existing navigation evidence/ownership gates remain authoritative.

### v52 worker and offline commit

Worker v52 discovers the embedded release manifest and checks its shape, same-release paths, unique assets and required navigation modules. It can reuse valid immutable HTTP-cache bodies and verifies every dependency before committing an offline shell, with a 10 MiB per-asset and 32 MiB per-release declared budget. Critical misses or wrong successful bytes fail installation; no partial release becomes the offline current shell. Candidate partial asset caches are inert until a shell commits. A wrong successful HTTP/edge body gets one bypass retry; invalid bytes never execute. Reusing verified immutable bodies avoids doubling every initial script download at the origin. Cold-release capacity and origin rate limits still require staging verification. Offline fallback returns the last fully verified shell, and executable requests use exact release paths and digest-verified cache entries only.

Install and activation do not call `skipWaiting`, `clients.claim` or delete caches. Legacy `SKIP_WAITING` and `CLEAR_CACHE` messages cannot force an update/reset. A new worker waits for existing controlled tabs/windows to close naturally, including background tabs. Manual update checking only explains how to finish navigation and reopen safely. Registration uses `updateViaCache: none`. A waiting worker alone does not set the existing controller-mismatch navigation-block flag; coherent current pages can continue normal authorized use.

A page newly rendered while v51 still controls it uses new path identities and SRI/order checks. The old worker cannot safely substitute other bytes for those scripts. v51 may be unable to start a new release offline before v52 has installed; that session gets an availability error or its old cached page rather than fabricated navigation permission. Previously loaded code is not retroactively replaced. A fully old offline installed page remains old until a safe online update.

Public map tiles continue using the existing `voyagr-tiles-v51` cache because this release does not alter the cartography contract. Old executable caches and retained snapshots are not deleted. This avoids throwing away existing offline data during migration; it also means disk/quota growth needs a later, separately reviewed app-owned garbage collector with client/release retention evidence. No unbounded automatic refresh/reload cycle is introduced.

### HTTP/edge policy

Both repository Nginx templates now make mutable `/static/` resources revalidate, hide conflicting upstream Cache-Control/Expires headers, and reserve immutable semantics for the origin's hash-addressed endpoint. Existing HTML and worker no-store/revalidation headers remain. Live Cloudflare settings are untouched. Actual rollout must ensure the edge respects HTML/worker revalidation, full hash path identity and unmodified bytes. A worker version bump alone would still be able to install stale mutable URLs; SRI, paths and verified offline commits address that gap.

## User-data and navigation invariants

No changes to mandatory avoidance, two-metre endpoint integrity, connectivity evidence, navigation refusal, GPS authority, IndexedDB compare-and-swap/ownership, completed-stop continuation, or stale route-response cancellation. No migration, backfill, authentication reset, saved-journey deletion or browser-storage clearing occurs. Legacy journeys remain subject to existing inspection/recovery policy.

The actual captured Sheffield–Doncaster fixture remains unchanged: route 1 prepares with binding `7b82209c`; all 18 silent edge updates survive preparation; all five alternatives remain independently navigation-refused. Planning preview, simulation and live GPS authorization remain distinct. A cached executable release is not fresh road-connectivity or avoidance evidence. New live starts still require their existing online assessment/GPS gates.

General API response caching, offline POST queue wording, optional unrelated cache mechanisms and broad future private-API allowlisting identified in the audit are not silently redesigned here. This PR is scoped to executable release delivery and safe worker migration. Never advertise authenticated or user-specific APIs as publicly cacheable. The offline root remains the current public PWA shell/configuration, not private journey or auth records; future personalized server-rendered HTML needs an explicit separate privacy review before being included in offline shell storage.

## Deterministic validation

- Python release tests: content-derived paths, SHA/SRI, changing query labels without changing bytes, retained old versions, corrupt/wrong/traversal identities, all real critical dependencies, Nginx policy, pinned worker inputs, no rewrite of published releases, endpoint headers, rejection of unrecognized executable tags and public model sidecars.
- Actual worker source in a VM: fresh install, v51/unrelated cache retention, rejection of stale Cloudflare-style 200 bodies, interrupted update/last-good shell, incomplete manifest, exact query fallback, corrupt cached bytes and offline-to-online commit.
- Browser-boundary VM probes: ordered classic-script execution, missing predecessor and error blocking app entry without touching saved state; legacy force/reset messages cannot activate/delete; manual waiting plan does not request forced activation.
- Existing full suite: captured response preview, GraphHopper metadata, all five navigation refusals, mandatory safety, stale asynchronous responses, multi-stop continuation, durable ownership and simulation/live separation.

Executed locally: test lint passed; 116 JS suites / 2,585 tests passed; declared 76-file web Python selection / 1,668 tests passed, one Windows-only skip, 68 subtests passed; isolated SQL policy 11 passed. An earlier complete Python run caught a late background audit event from another request in a correlation test; the callback's finished event was observed to precede the wrapper's final audit record. That test now owns and joins its executor before returning, preventing spillover into the next test's capture. No assertion or production audit/hazard logic was changed. This verification-only cleanup is recorded rather than hidden.

Real Chrome/Edge/installed-PWA, WebGL, AR, voice-engine and physical-device acceptance have not been performed. VM tests model browser cache, integrity and worker boundaries; they are not proof of real multi-tab scheduling or controller lifetime. Hosted CI on the draft head is separate evidence and must be checked before independent clearance.

## Deployment and migration plan — not executed

1. Independent review first. Do not merge/deploy this draft as authorization for production navigation.
2. Record the live source/tree, origin and ordinary edge responses, cache rules/query keys/transform rules, worker/controller versions and privacy-safe failure rates. No payloads, precise journey coordinates, cookies or auth tokens in evidence. Unknown impact must not be reported as an outage.
3. Stage a clean immutable candidate checkout, required retained asset snapshots and a persistent service-owned release directory. Verify ownership and write access using the existing non-root app account; do not grant broad permissions or run a root-owned builder then hand unreadable 0700 directories to Gunicorn. Check disk/memory/quota with room for staging and retained releases. Do not change code under starting workers: the startup snapshot is pinned, but reading a half-updated checkout at startup is not a valid deployment protocol.
4. In isolated staging, render with the intended public configuration and verify all content-addressed URLs, SRI, actual decoded body hashes, JavaScript syntax/initialization and no-store shell/worker headers. Confirm scripts, CSS, AR and model sidecars are complete. No production DB or provider calls are needed for this phase.
5. Review and apply cache-header/edge policy only through separate owner-authorized operations. New asset URLs must preserve their complete paths. Disable transforms such as JS rewriting/auto-minification/Rocket Loader for the executable delivery chain unless separately proven compatible. Origin header changes do not retroactively expire existing browser immutable entries; new paths are the migration mechanism. No blanket browser/site-data reset is required or permitted by this plan.
6. Canary in parked/user-controlled Chrome/Edge fresh and preserved profiles, ordinary/installed PWA, an existing live session, an idle second tab, background/resume, offline starts and interrupted updates. Require consistent module/SRI identities, unchanged saved ownership/preferences/auth state, no forced active-session reload, clear mismatch feedback and no new live authority from the captured refused response. Test map/voice/AR relocation and vendor loading explicitly.
7. Stage rollout only after these gates and separate deployment approval. Existing sessions continue until users finish and close all controlled tabs. Do not force clients to acknowledge readiness by clearing caches or storage. Verify post-rollout source/edge bytes, release headers and privacy-safe client versions. Retain previous snapshots and compatibility assets during observation.

## Rollback plan and constraints

Do not simply restore worker v51 or clear v52 caches. v51's immediate skipWaiting/claim and broad cache cleanup would undo the protection for existing users. Do not remove `/_voyagr/assets/` service or its retained store while any pinned client may need it. Do not restore older databases over new writes.

Before any deployment, prepare and independently review a compatibility rollback package that retains the v52 publication/asset endpoint and AR/model adapters while selecting the approved previous application inputs as one coherent release. Test it against both fresh and already-controlled v51/v52 clients, and prove that required backend contracts remain compatible. A source reset without that compatibility plan is not an acceptable rollback. Since this PR changes delivery rather than routing logic, a rollback may first pause further rollout and preserve existing coherent sessions while the owner chooses the tested package; it must not invent a browser-storage repair or navigation approval.

Disk snapshots and browser asset caches are not user database backups. Retain normal operational rollback/backup protection separately. Missing/corrupt release bytes fail closed and need verified snapshot restoration or a new reviewed release, not mutation of immutable bodies or deletion of saved journeys.

## Independent-review readiness and remaining gates

The draft contains implementation and deterministic regressions, with no production modification. Review should focus on classic global scope/strictness, complete dependency inventory, digest/path enforcement, stable public-shell privacy, concurrent publication, resource/quota bounds, manual-update compatibility and actual browser worker timing. Retention currently favors safety over automatic cleanup. Cloudflare transforms/rules, runtime directory permissions, active-client migration, staged rollback compatibility and real-browser acceptance remain deployment gates.

`DRAFT_REVIEW_ONLY`

`BROWSER_ACCEPTANCE_PENDING`

`PRODUCTION_NAVIGATION_NO_GO`


## Changed-file inventory

- `voyagr/asset_release.py`: frozen inputs, generated identities, retained snapshots, classic chain/SRI, dynamic module verification and immutable reads.
- `voyagr/api/core.py`: pinned shell rendering, immutable asset endpoint, release header and recoverable no-store 503 on preparation failure.
- `service-worker.js`: v52 verified offline commit, exact release fallback, retained tiles/caches, no forced activation/reset.
- `static/js/app/service-worker-orchestration.js`: update discovery without HTTP cache reuse and waiting notice.
- `static/js/app/pwa-lifecycle-orchestration.js`, `static/js/modules/ui/pwa-install.js`: manual update waits for tabs rather than forcing activation.
- `static/js/app/ar-navigation-orchestration.js`: verified manifest-bound dynamic module import.
- `static/js/modules/navigation/porcupine-wake.js`: pinned voice model URLs and no redundant mutable warming for release pages.
- `deploy/nginx-voyagr.conf`, `deploy/nginx-vibevoyager.org.conf`: mutable static revalidation templates only; not applied.
- `tests/test_asset_release.py`, `static/js/__tests__/asset-release-worker.test.js`, `static/js/__tests__/pwa-install.test.js`: release, migration, cache-boundary and waiting behavior regressions.
- `tests/test_phase11_overpass_audit.py`: join the owned test executor to prevent a late audit record leaking into the next test; assertions unchanged.
- `.github/workflows/ci.yml`: include the new release backend suite.
- `.gitignore`: omit development runtime snapshots.
- This report: architecture, root causes, evidence, migration/rollback and remaining acceptance gates.

Generated output syntax was checked locally for **152 JavaScript outputs** across **156 release assets**. This is syntax verification, not browser initialization or device acceptance. Preparation failures return a bounded no-store 503; no unhashed fallback shell is served and no user data is changed.
