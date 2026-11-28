# GH11.1 → Voyagr planning response adapter

Scope: registered public fixtures in the isolated service. No VPS2 update,
production endpoint change, strict-mode activation or navigation permission.
Milestone 3 remains in progress; production migration remains NO-GO.

## Actual data path

Pinned GH11.1 `ResponsePath` -> its registered Jackson instruction serializer ->
Java directed-route checks -> independent Python transport/interval validation ->
`app_preview.routes` -> the real shared `preparePlanningCandidate` -> isolated SVG
preview. The existing raw `candidates` remain available as evidence. No live
routing service or private journey history is consulted.

The runner exports the serializer's real instruction `text` and `interval`, not a
road name used as a fabricated turn instruction. It also exports the path's
`waypoint_indices`, verifying that each index matches its requested visit within
the configured snap tolerance. Python checks known signs, nonempty text, contiguous bounded
instruction intervals, complete shape coverage and ordered waypoint indices.
Unknown signs or missing/malformed coverage refuse the response without fallback.
Sign-to-maneuver types match the established application table, enforced by a
parity regression against `voyagr/utils/graphhopper.py` without importing the app.
This intentionally narrow mapping does not guess unknown signs as straight ahead.

## Planning shape and retained evidence

Each adapted candidate contains:

- A deterministic ID bound to the request fingerprint, original geometry and
  directed trace; alternatives cannot inherit an older candidate's identity.
- Encoded geometry at precision 6 and a matching decoded latitude/longitude
  polyline. Vertex count/order and shape indices are preserved, including duplicate
  vertices; quantization does not remove or simplify points.
- Real maneuver text/type, shape ranges, distance, time and street names.
- Consecutive `leg_geometry_ranges` from actual waypoint indices, explicitly marked
  `preview_only`. These do not assert general stop-versus-pass-through semantics.
- Original GeoJSON, edge intervals, directed keys, instruction metadata and waypoint
  indices in `gh11_evidence`; the standalone viewer matches it to the raw candidate.
- Graph/source/policy/request identities in `routing_context` with selected-fixture
  scope. The existing shared geometry fingerprint binds the rendered precision-6
  geometry; it is a consistency check, not cryptographic navigation authority.

`avoidance_assessment.geometry_valid` records the checked geometry shape only.
Its status remains `UNVERIFIED`. Legacy fixture requests have no canonical rows;
explicit policies retain their selected rows as described in
[SETTINGS_COMPILER.md](SETTINGS_COMPILER.md). No fresh GPS,
origin/endpoint integrity, complete hazard coverage or legal compliance is invented.
Both `navigation_allowed` and `automatic_selection_allowed` stay false. New
assessment timestamps record geometry revalidation, not fresh hazard data.

The result adds `app_preview` alongside the raw registered-case contract. Existing
request allowlisting, Basic authentication, version checks, body/deadline/output
limits, cache revalidation and restore-reference checks remain in force. The
adapter creates a new planning result on each verified response/cache hit, rather
than caching an authority claim. Inputs/raw evidence are not mutated.

The isolated viewer now renders prepared app-format candidates and real maneuver
text. It checks count, candidate identity uniqueness, precision, context, evidence
correspondence and the shared planning gate before replacing a preview. Restore
failures retain the previous preview. The real shared polyline codec is served as
an authenticated, allowlisted asset and bound into the manifest's browser hashes.
The container copies only this additional approved source asset.

## Automated evidence

Real-engine tests cover primary, alternatives, continuous-via and changed departure.
They send each actual Flask/Java adapter result through Node and the real planning,
selection and strict-policy modules: planning passes, while strict guidance and
navigation preparation and the gate refuse. A separate negative-half-coordinate
test checks Python precision/geometry-binding compatibility with the actual browser
codec. Fault injection rejects unknown signs, out-of-range instruction intervals
and missing waypoint coverage. Browser tests cover missing assessments, mismatched
request binding, changed geometry, malformed maneuver ranges, authority flags and
swapped raw evidence, retaining the previous preview on restore failure.

```sh
GH11_PROTOTYPE_JAR=/path/to/pinned/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_prototype.py \
  tests/test_gh11_integration_boundary.py tests/test_gh11_isolated_app.py \
  tests/test_gh11_container_package.py
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

Local validation passed 101 GH11 engine/boundary/package tests, 200 JavaScript
suites / 3,890 tests and lint. The workflow backend selection passed 2,548 tests,
one skip and 94 subtests. These are automated tests, not phone acceptance.

The CI Java 17 job exercises the pinned runtime. The generated-graph container
smoke also checks the new contract and restore, permitting only the new geometry
assessment timestamp to advance on repeat validation while checking all remaining
response fields exactly. Local container acceptance is not claimed for this
revision because of the previously recorded workspace filesystem limit; exact-head
CI results are separate evidence. No physical-phone acceptance of this revision
has been performed.

## Before any wider integration

The manifest policy changes with the runner, bridge and browser asset hashes;
old references/manifests must not be silently reused. A future isolated service
update requires a newly reviewed image, freshly prepared manifest and rollback
steps, followed by explicit approval. The accepted VPS2 milestone-2 image is intact.

This adapter has not connected the real `/api/route`, owner-scoped saved collections,
private RouteCache or full map UI to GH11. The standalone SVG is not a basemap or
proof of physical rendering/navigation. General settings compilation, hazard
association/coverage/freshness, GPS/endpoint and continuous-turn authority, traffic,
speed-limit enrichment, profile parity and production cache wiring remain pending.

The default UK explicit Start is advisory; simply passing these planning objects
to that path would not create strict enforcement. Keep this transport behind the
explicit strict preview bootstrap until the complete trusted authority contract
and all Start/selection/replacement paths are demonstrated. Do not enable live
navigation merely because planning/serialization tests pass.
