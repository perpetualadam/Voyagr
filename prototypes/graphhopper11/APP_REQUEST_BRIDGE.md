# Complete app-request bridge — registered fixtures only

`RegisteredAppRequestBridge` wraps the isolated local GH11 bridge. The standalone
viewer now connects through dedicated authenticated `/api/prototype/app-policy`,
`app-route` and `app-restore` endpoints. This does not enable the UK `/api/route`
handler, contact a provider or permit arbitrary journeys. Every request still must
match the selected operator-owned public case exactly. The legacy `/restore` API
continues to reject schema-3 references; the new complete-request path accepts them.
This is not the production UI, private-cache or owner-store connection.

The audit traced `buildInitialRouteRequestBody`, `buildRerouteRequestBody` and
`route-prefs.getRouteCostParams`. Their contracts include `lat,lon` coordinate
strings, ordered via-point metadata, include/avoid flags, pricing choices,
optimization, time/stop semantics and reroute/refresh intent. Existing legacy
parsers can coerce/drop malformed values; this isolated adapter instead refuses
unknown fields and unsupported semantics explicitly.

The adapter accepts an operator-selected registered case, a complete app request
and exact current graph/source/policy identities. Start, end and ordered via points
must exactly match that case; changed origins, reversed visits and arbitrary routes
refuse. It retains every accepted supplied field, including labels/provenance and
pricing metadata. Declared GPS provenance does not establish a fresh GPS fix.

Ordered pass-through vias are supported within the current five-point registry
limit. Nonempty stops (even zero duration), time windows/departure requests, round
trips, nonempty avoid points and intermediate-visit optimization refuse rather than
being flattened into ordinary waypoints. An optimization flag with no intermediate
visits has nothing to reorder and remains in the request identity. General
multi-stop arrival/departure/heading/turn semantics remain unverified.

Avoidance/profile normalization reuses the shared settings adapter and compiler.
Unsupported mandatory exclusions and non-car profiles refuse before Java. Costs
and pricing choices are retained as UNVERIFIED metadata; no cost estimate is
fabricated, including when a manual fuel price is missing. Existing supplemental
scenic/quiet/optimization/detour preferences remain explicitly unverified. This is
preview evidence, not proof of general routing preferences or legal restrictions.

Each complete original request and normalized visits bind into a new request
identity, candidate IDs/contexts and a schema-3 reference. Restoring recomputes the
identity, recompiles policy and routes/validates afresh. Changed costs, flags,
versions, visits or rules cannot replay the old binding. References remain selectors,
not authentication or saved compliance verdicts. No persistent or owner storage is
read/written. Navigation, automatic selection and app-integration authority stay off.

Complete requests now use a separate HTTPS capability-scoped cache instance that
reuses the actual app cache implementation. Every hit revalidates raw evidence;
HTTP, reroutes, forced refresh and restores retain fresh calculation. No UK
singleton or private owner store is connected. See PRIVATE_COMPLETE_CACHE.md for
ownership, retention, corruption refusal and transport boundaries.

Adapter source enters manifest policy identity and is copied into the isolated
container. Fresh manifests are required; old deployments are unchanged. The
network-disabled generated-graph container smoke checks direct calculation/restore.

Validation combines actual JavaScript builders using synthetic settings, strict
malformed/unsupported-request regressions, real GH11 initial/alternative/via/reroute
cases, all returned candidate/leg checks, fresh restore, cache bypass and refusal
of engine fallback, changed bindings and unsupported mandatory rules. The original real Chromium/HTTP tests continue to cover the older registered
interface. A third scenario now exercises complete normal/via/reroute/alternative
requests, fresh restoration and cross-case restoration through the new interface.
It still does not load the production UI.

Next: owner-saved-store integration and current accepted GPS/journey ownership. Do not enable arbitrary
journeys or navigation until the missing capability/evidence gates are met.
Milestone 3 remains in progress; production migration remains NO-GO. No merge,
deployment, VPS access, production configuration or private-history change occurred.

## Standalone complete-request mode

The separate complete-request checkbox loads an explicit public template on first
use. Its JSON editor preserves all supplied supported fields, including costs and
reroute flags. Coordinate/via changes must match the chosen case before any HTTP
request; unknown fields, credentials and unsupported semantics refuse locally.
The server independently repeats validation. Older anchor-only cases without
explicit coordinate lists retain their legacy metadata/preview path and do not
publish complete-request templates. No graph-anchor inference is presented as GPS.

The browser snapshots the entire request, checks the preflight policy/context/
reference, then verifies those identities against every returned candidate before
commitment. Cost warnings remain UNVERIFIED and Start stays disabled. Input edits,
programmatic edits and case changes invalidate old responses. A failed restore
retains the prior request/preview; successful schema-3 restoration loads its exact
request, including across cases. Older references cannot silently remove active
complete-request intent. No browser storage is written. Explicitly loading another
case template replaces only the editable test input, not the current preview.

All new endpoints use the unchanged Basic, Origin, no-store and 4 KiB guards.
Preflight never runs Java. Complete calculation always independently validates; restoration always
re-executes. HTTPS calculations may reuse only revalidated private raw evidence. Client proofs, custom models, private origins outside
the registry and legacy reference downgrades cannot grant routing authority.
