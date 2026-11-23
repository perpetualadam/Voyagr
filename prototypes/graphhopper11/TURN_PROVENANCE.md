# Profile turns and approach direction

23 November 2026. Isolated preview only; Milestone 3 remains in progress.

## Verified implementation

`ReadOnlyRouteRegression.validate` checks the original directed edge trace of
**every** returned candidate. Consecutive different original edges must share the
same graph node, permit car access and avoid the imported car turn restriction.
Successive intervals of the same original directed edge can represent a via point
splitting that edge; they do not create another turn. A reversed edge is distinct.

The checker now also evaluates each transition with a weighting constructed from
the car profile and that request's hints. Infinite, NaN or negative turn weights
refuse the candidate, and therefore the complete response. The earlier checker
only queried the imported boolean restriction at this step. The exact-node
Dijkstra diagnostic already checked finite turn weights, but is not a substitute
for validation of the normal response. Baseline and exclusion responses use their
respective request hints. Exclusions, alternatives, continuous-via routing and
read-only graph loading are unchanged.

A generated-graph regression compiles the actual checker and feeds it real forward,
reverse and via-U-turn paths. All three pass with the configured profile; the
profile retains its 60-second U-turn weight; this does not establish stopped-leg
seam timing. Test-only weighting injection then requires nine
refusals (infinite, NaN and negative costs on each path). The existing synthetic
imported-restriction fixture separately checks a prohibited independent-leg join
and legal whole-route/reverse/continuation paths. It is not general turn coverage.

## Approach direction remains unverified

The isolated complete-request adapter does not accept `heading`, `headings`,
`bearing` or `origin_heading`; regression tests require refusal rather than silent
omission. The actual UK request builders currently supply registered coordinates,
not a validated approach-heading constraint. A geometric initial bearing, a nearby
GPS fix and original-edge connectivity do not prove which road/direction the
vehicle occupies. Native heading hints can influence routing and must not be
promoted to mandatory directional enforcement without independent verification.

The current trace checks concern original graph edges. They do not attest the
Router QueryGraph's exact snapping choices, partial virtual-edge transitions,
initial/final headings, conditional/via-way restriction completeness, stop versus
pass-through semantics or missing legal restrictions in OSM. Coincident nodes and
parallel roads remain material cases. Imported restrictions describe the pinned
snapshot, not verified live road legality.

## Acceptance still required

Before guidance, bind live-origin provenance, graph/source/policy/settings and
requested approach constraints to each candidate; verify actual snapped directed
intervals and every internal/leg-boundary transition with consistent vehicle and
turn semantics. Cover opposite approaches, parallel roads, intersections,
conditional/via-way restrictions, partial edges, legal and forbidden U-turns,
stop/restart versus pass-through, all alternatives, reroutes and cache reuse.
Unsupported or missing mandatory evidence must refuse Start/selection/replacement.

No navigation authority, production integration, deployment, physical-phone check
or general legal/hazard guarantee is added by this change. Migration remains NO-GO.
