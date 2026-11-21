# Isolated GraphHopper 11.1 prototype

This is a local experiment, not a routing service or migration switch. Nothing
in the UK Flask application imports it. It opens no listener, has no provider
URL, downloads no map data, and imports only two generated five-node OSM XML
fixtures in a fresh temporary directory. The runner has no network code.

## Pinned runtime

Official release: https://github.com/graphhopper/graphhopper/releases/tag/11.1

Artifact: `graphhopper-web-11.1.jar`

SHA-256: `8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33`

Use a full Java 17+ JDK with source-file launching. GH11.0 must not be substituted:
https://github.com/graphhopper/graphhopper/security/advisories/GHSA-mg8w-mq9r-f9c6

No binary is committed. Supply an independently downloaded official artifact:

```sh
.venv/bin/python prototypes/graphhopper11/run.py --jar /path/to/graphhopper-web-11.1.jar
GH11_PROTOTYPE_JAR=/path/to/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_prototype.py
```

Without that environment variable the real-engine test is explicitly skipped;
adapter tests remain offline. The separate prototype CI job downloads only the
checksum-pinned runtime and uses Java 17. No production secret is required.

## What is exercised

`DirectedGraphProbe.java` imports three named bidirectional corridors between
the same endpoints, enables the car profile and turn-cost machinery, and disables
CH/LM. An isolated Java `WeightingFactory` decorator gives selected directed
edge keys infinite cost. Each weighting owns an immutable request-specific set;
the base graph is never mutated to change restrictions.

This is a Java extension, **not** a claim that the stock REST custom-model DSL
supports arbitrary edge-key exclusions. Virtual iterator wrappers must be
detached to resolve their original directed edge keys before applying exclusions.
The forward and reverse virtual-endpoint regressions guard that requirement.

GH's native alternative search need not discover all three available corridors.
A bounded exclusion search (32 routing calls maximum, three unique candidates)
supplements it. This is not a k-shortest algorithm, exhaustive general search or
proof of best alternatives. Search-budget exhaustion raises an error; it is not
reported as an established absence of compliant routes.

The fixture requires 3/2/1/0 candidates as its forward corridors are blocked.
It also checks the opposite direction, virtual endpoints, a later unrestricted
request, and 12 interleaved requests on two threads. `adapter.py` independently
checks every returned path's complete directed trace, geometry and metric units.
Incomplete evidence or any forbidden traversal rejects the response. Every
adapted result has `navigation_allowed=False`: no production or legal claim is
made from synthetic proof. No UI Start policy is changed.

The second fixture imports an actual OSM `no_left_turn` relation. The Java probe
checks that the relation exists in GH's turn storage. The complete route takes
the legal detour, while the reverse journey remains possible. Two independently
routed legs meet at the via node but form the forbidden turn when concatenated;
`validate_journey` rejects that join. A fixture-specific continuation with the
forbidden exit excluded passes the same validator. This demonstrates a validation
gate, **not** a general multi-stop planning or turn-aware leg-repair algorithm.

Journey validation checks every leg's directed trace, requested visit order,
endpoint continuity, synthetic graph version, internal turns and turns across
seams. The fixture's authoritative forbidden directed pairs are checked outside
the Java weighting implementation. Missing legs, graph-version mismatches,
missing turn evidence and partial coverage are refused. This assumes continuous
travel through the synthetic via; parking, stopping and U-turn policy are unverified.

The report records runtime, artifact, source and synthetic OSM checksums. Graph
files and raw import logs remain temporary. This is not a performance benchmark.

## Executed local evidence (21 November 2026)

- Official checksum-pinned GH11.1, OpenJDK 21.0.12.1, 512 MiB heap cap.
- Synthetic candidate counts: 3, 2, 1, 0 as exclusions increase.
- Reverse-direction and virtual reverse routes retained; all-forward-blocked
  virtual endpoint query returns no route. Every emitted trace is checked again
  by the independent Python adapter.
- Twelve interleaved restricted/unrestricted requests on two Java threads pass.
- Prototype regression suite: 35 passed, including both actual import/routing fixtures.
- Imported turn restriction, legal detour/reverse route and rejected illegal
  independent-leg join pass; the legal fixture continuation has two validated legs.
- Existing CI backend selection plus pure prototype tests: 2,582 passed,
  two skips, 94 subtests passed. One skip is the intentionally opt-in real-engine
  test, separately executed above; the other is the pre-existing selected-suite skip.
- JavaScript: 198 suites / 3,829 tests passed; test lint passed.

The initial directed-exclusion prototype passed Java 17 CI in PR #540. The
expanded turn/journey fixture must pass that job again before its Java 17
compatibility is claimed. Heap cap and tiny-fixture timing are
not UK/US capacity measurements. No browser or physical-phone test was performed.

## What remains blocked

Production migration remains **NO-GO**. This experiment does not establish:

- Real camera/signal/crossing association, coverage, freshness or licensing.
- General turn-restriction coverage (via-way, conditional and vehicle exceptions).
- General multi-stop planning/repair, stop optimization, reroutes or application cache binding.
- Parallel carriageways, intersection approaches or graph-region boundaries.
- Endpoint access/snap-gap acceptance, instruction/UI parity or physical-phone behavior.
- CH/LM compatibility, UK/US imports, realistic latency or server capacity.

Before any routing rollout: obtain sanitized GH8 deployment facts; add the
missing fixtures; keep mandatory refusal through every UI path; version graph,
hazards, compiler and validator together; and perform measured imports. Any
future service, dataset download, production selection or infrastructure change
requires separate approval. Preserve the GH8 service, JDK, graph and configuration
as a complete rollback bundle. This prototype provides no production switch.

## Existing-graph read-only regression

`ReadOnlyRouteRegression.java` loads an **already imported** matching graph using
`setAllowWrites(false)` and MMAP. It calls `load()`, never `importOrLoad()`, and
clears the OSM input path. Mount the graph read-only as an independent filesystem
barrier. No listener is created. Do not substitute a GH8 graph.

Arguments are the import configuration, existing graph directory and fixture JSON:

```sh
java -Xmx4g --class-path /path/to/graphhopper-web-11.1.jar \
  ReadOnlyRouteRegression.java /path/to/config.yml /path/to/graph uk-public-cases.json
```

`uk-public-cases.json` contains seven fixed public samples: forward/reverse
Sheffield–Leeds, native alternatives, a motorway exclusion, a continuous journey
via Barnsley, Birmingham–Coventry and Bristol–Bath. No personal location history
is used. These UK cases have not been run locally; the real UK execution requires
the separate VPS2 graph.

The runner checks every returned candidate's directed trace, vehicle access,
stored turn prohibitions, unique edge sequence and ordered visits (75m tolerance).
The motorway-exclusion case uses priority zero and independently rejects every
MOTORWAY edge. Native alternatives return up to three, not necessarily three.
Native alternatives plus intermediate visits are refused rather than downgraded.
Continuous-via tests do not establish general stop/parking semantics.

Each request defaults to 250,000 visited nodes and a 20-second routing timeout.
An explicit integer `max_visited_nodes` may select 1,000..1,000,000 nodes; values
outside that range or of the wrong type are refused before routing. Limits and
query timing are reported for provider errors as well as successes.
Query wall time excludes source compilation and graph loading; graph loading is
reported separately. These few sequential cases are not a capacity benchmark.
Failed, unsupported or incomplete cases are reported and cause nonzero exit.
Success is only `PASS_AVAILABLE_GRAPH_CHECKS`; production migration remains NO-GO.
Real camera/crossing association, missing restrictions and general hazard coverage
are still unverified. The directed-exclusion Java extension is not installed by
this runner.

The opt-in regression test imports a tiny synthetic graph, proves that motorway
exclusion forces a longer route, exercises alternatives and a continuous via,
and checks all graph file hashes are unchanged by the read-only run. It also
requires an unsupported native multi-point alternative request to fail closed.

Local validation for this addition: 36 prototype tests passed with the pinned
GH11.1 artifact on Java 21, including the real read-only import/query test.
The broader backend selection passed 2,582 tests and 94 subtests with three
skips (two opt-in real-engine tests, separately run above); JavaScript passed
3,829 tests across 198 suites, and test lint passed. Java 17 runs in the dedicated
CI job; use its latest result rather than an earlier commit's result.

VPS2's first seven public samples passed five cases; native alternatives and
motorway exclusion both exhausted 250,000 nodes. `uk-retry-cases.json` retries
only those two with 1,000,000 nodes and the unchanged 20-second timeout. Neither
mandatory motorway exclusion nor candidate/turn/visit validation is relaxed.
Their UK results remain unverified until that explicit retry is executed. The
graph remains read-only and no rebuild, app switch or listening server is needed.

## Selected public hazard source-way association

`uk-association-cases.json` records five short traversals derived from public
OSM records in the pinned PBF (checksum included in the fixture). These cases
have not been executed against the UK graph locally. They test source-road
association, not actual hazard avoidance or enforcement applicability:

- Camera node 50032464 lies on one-way motorway link 1183050528. The test follows
  the observed OSM node order through the camera; its direction tag is not used
  to infer an enforcement direction.
- Ecclesfield Road relation 15486512 identifies device 314037901 and from/to
  road nodes on way 1146841914. Relation 15486513 reverses those road nodes for
  device 9210340813. The device coordinate is not snapped to the nearest road.
- Castleford and Red Lane use the observed road approaches and intermediate
  level-crossing nodes. Adjacent tagged crossing nodes are not assumed to be
  independent physical hazards or deduplicated using distance alone.

These cases require endpoint and visit matching within **one metre**, and require
every traversed edge to carry one of the explicit `osm_way_id` values. Where
requested, every expected way must be encountered. A different snapped road,
missing evidence or tolerance failure remains UNVERIFIED_OR_FAILED. No automatic
tolerance increase or geographic polygon fallback is provided.

Matching candidates report directed edge keys, scoped to the currently loaded
graph only. Keys must never be reused on GH8 or a different graph build. They
are evidence for the next exclusion experiment, not an application-ready hazard
index. The fixture PBF checksum is source documentation, not automatic graph
attestation. No physical camera activity, legal applicability, inventory completeness
or freshness is established by matching these ways.

OSM node 414693 is on a footway omitted by this car import; node 417484 had only
railway parents in the inspected snapshot. Neither is silently promoted to a
motor-vehicle road hazard. General crossing coverage remains unverified.

GH11.1 stores `osm_way_id` as a 31-bit integer. This fixture is within range;
future source IDs exceeding that range need explicit importer review rather
than truncation. Opt-in tests verify exact way matching and reject wrong/empty
way evidence and invalid snap tolerances without enabling navigation.
