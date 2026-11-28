# Milestone 3: opt-in browser refusal gates (development)

The production page does not enable strict mode or load its context module.
Legacy best-effort behaviour and tests remain unchanged when the runtime flag is
absent. The existing VPS2 release has not been updated by this code change.

## Shared gates

`strict-route-policy.js` holds a copied runtime context and revision counter.
The opt-in flag is `VOYAGR_STRICT_ROUTING === true`; it is never read from route
payloads or local storage. In strict mode, a missing/broken policy refuses.
A context must explicitly authorize navigation and bind graph, source, policy and
request identities, requirements and a bounded validity interval. Every candidate
must match those identities, freshness and rule selections; enabled mandatory
requirements must be SATISFIED. This is a binding check, not a hazard compiler or
proof that arbitrary server assertions are true.

The actual shared avoidance integrity code combines this with all existing
geometry/origin/snapshot/assessment checks. A strict context cannot upgrade a
legacy refusal. Both automatic and manual guidance candidate preparation use the
strict check; the manual guidance path no longer bypasses it in this mode.
Explicit Start retains REFUSED rather than converting it to ADVISORY. Select/Use
route check before modifying selection or map state. Existing automatic reroute
transactions also pass through the shared gate and preserve the old route/map on
failed replacement.

Request tickets capture the strict context revision as well as existing preference
and intent ordering. Context changes invalidate old responses. Reused/cached route
objects are rechecked against current context and existing assessment freshness.
The isolated backend now has a bounded 30-second public-fixture evidence cache,
revalidated on every hit; see [ISOLATED_APP.md](ISOLATED_APP.md). Production cache
integration remains pending. Existing UK
cache reassessment and explicit/reroute refresh rules are unchanged.

## Isolated viewer and manifest

The proposed viewer explicitly enables the opt-in mode and loads the actual
shared integrity/Start modules, with a preview-only context. Its Start control
therefore stays disabled, including if a candidate claims navigation permission.
Calculate/selection ordering uses the shared request tickets and discards an old
response after the selected case changes. The API still emits navigation_allowed
false for every envelope/candidate; no real navigation authority is introduced.

Schema-2 manifests now bind hashes of the shared browser policy, integrity and
Start scripts into the policy version, in addition to Java/Python/config/registry
identity. The files are copied read-only into a future image and served only as
allowlisted authenticated assets. Old schema-1 manifests are refused by the new
validator rather than being silently reused. The current VPS2 service retains its
old image and manifest until a separately reviewed update.

## Test evidence and remaining work

Jest exercises the real application modules and transition fixtures: mandatory
VIOLATED/UNVERIFIED/UNSUPPORTED, missing policy, stale evidence, changed versions,
changed request binding/rules, obsolete responses, manual guidance Start, explicit
Start, Select/Use alternative and automatic replacement. It checks that rejected
operations do not change the previous route or map. A context-bound synthetic
positive control and the existing best-effort suite prevent an always-refuse test
from being mistaken for working integration. Viewer DOM tests verify preview-only
Start and rejection of a superseded response. Python tests continue to exercise
actual Flask/Java registered-case routing and browser-asset manifest binding.

This is not yet milestone-3 completion: full UK app bootstrapping, authenticated
navigation-authority/evidence compilation, arbitrary real settings, production-cache and general GH11
cache wiring, saved/restored cases, all browser entry paths and deployed browser
acceptance remain pending. Active-guidance expiry/graphics-recovery UX and driving
behaviour are unverified. No physical check of these new gates has been claimed.
Keep the server in selected-fixture preview scope and production migration NO-GO.

Local package evidence: [STRICT_LOCAL_EVIDENCE.json](STRICT_LOCAL_EVIDENCE.json).
The generated-graph WSGI smoke passed authenticated shared-asset requests, route
and refusal cases, graph immutability, UID 10001, read-only root and network none.
The temporary service/data were removed. This is not an update of VPS2 or physical
browser acceptance of the new strict mode.
