# Complete app-request bridge — registered fixtures only

`RegisteredAppRequestBridge` is a direct Python adapter around the isolated local
GH11 bridge. It begins full request integration without enabling `/api/route`,
adding an arbitrary-coordinate HTTP endpoint, contacting a provider or changing
the UK app. The existing viewer and HTTP restore API reject its schema-3 refs.
This is not a completed real-app/browser or owner-store connection.

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

Every complete-request operation bypasses the existing public fixture cache,
including normal requests, reroutes and restore. It neither reads that cache nor
stores results into it. This conservative boundary avoids inventing complete
private-cache integration; private scopes, epochs, lifetime and request ownership
still need the existing production cache adapter. An engine failure refuses even
when old fixture evidence exists. No GH8/Valhalla/OSRM fallback is called.

Adapter source enters manifest policy identity and is copied into the isolated
container. Fresh manifests are required; old deployments are unchanged. The
network-disabled generated-graph container smoke checks direct calculation/restore.

Validation combines actual JavaScript builders using synthetic settings, strict
malformed/unsupported-request regressions, real GH11 initial/alternative/via/reroute
cases, all returned candidate/leg checks, fresh restore, cache bypass and refusal
of engine fallback, changed bindings and unsupported mandatory rules. The existing
real Chromium/HTTP tests continue to cover the older registered HTTP interface;
they do not exercise this new direct Python adapter through the production UI.

Next: a reviewed isolated frontend request connection for this complete contract,
followed by private-cache and owner-saved-store integration. Do not enable arbitrary
journeys or navigation until the missing capability/evidence gates are met.
Milestone 3 remains in progress; production migration remains NO-GO. No merge,
deployment, VPS access, production configuration or private-history change occurred.
