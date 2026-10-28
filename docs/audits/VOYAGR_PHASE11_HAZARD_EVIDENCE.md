# Phase 11C — Hazard evidence

Decision: **PHASE11_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Acceptance date:2026-10-28 UTC. Tested application baseline: `a0d004a1a85a34714b535456d733d47b202caf9e` (Phase11B PR353), with Phase11A PR352 `d0482d3eb00ba883b74b362692f67a69eb873372` and Phase10 preserved. Both prerequisite PRs are MERGED; their main CI runs [40620379597](https://github.com/perpetualadam/Voyagr/actions/runs/40620379597) and [40616521365](https://github.com/perpetualadam/Voyagr/actions/runs/40616521365) completed successfully. **Deployed Contabo revision is UNKNOWN.** Merge/CI do not establish deployment.

This phase changes only acceptance documentation, offline audit tools/tests and their CI selection. No production access, query, SSH, service restart, dataset repair, graph rebuild, config change, deployment or physical-device execution occurred. No approved graph-backed fixture or live routing service was available here. Repository hazard files remain byte-identical.

PASS below means the stated local check passed, not production acceptance. FAIL means a measured check failed. PARTIALLY_VERIFIED combines local checks with missing deployment/source/device evidence. NOT_TESTED means no qualifying execution occurred; it is not PASS.

## Inputs and provenance

All new measurements concern checked-in files, not Contabo files or a fresh SCDB/OSM export. Raw coordinates, descriptions, references and geometries are not printed by the new audit tools. The offline summaries preserve byte hashes and aggregate counts. No production database was opened.

|Repository input|Bytes|SHA256|Features|
|---|---:|---|---:|
|camera_areas.geojson|1706076|65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f|128 MultiPolygons|
|cameras.geojson|2943236|2244bd638c37aa356032f20645e43236c5b4e0dea48e0c0381ca3d7664a122af|8301 Points|

`generate_camera_areas_geojson.py` groups point cameras into0.5degree grid cells, constructs30m squares and concatenates them into MultiPolygons. These are geographic buckets, not necessarily road sections or average-speed sections. The repository128 areas have8301 components and declared camera_count totals8301. Every component's axis-aligned-square centre corresponds to the point export as a multiset at8decimal numeric quantization:8301 matched,0 unmatched,0 unrecognised. Numeric correspondence is not a GPS accuracy claim, source authenticity or proof of installed identity. The two files therefore cannot serve as independent sources for camera truth.

The code permits GRAPHHOPPER_CAMERA_AREAS_COUNT to affect a reported count independently of the loaded/local ID inventory.137was a production observation, not a count measured here. An env override, changed source/version, loaded-file divergence or representation difference remain possible. No cause is assigned without the actual installed checksum, source manifest and deployed revision.

## Measured topology failure

The official GraphHopper8 Jackson/JTS parser was used offline, with six pre-existing dependency jars SHA256-matched against the committed prior parser manifest. It is not a GraphHopper engine instance. `AuditCameraAreas.java` returned exit2 / statusFAIL:

- 128 areas and128unique IDs.
- 102 invalid MultiPolygons; every validity category was Self-intersection.
- 8301individual polygon components,0 invalid individually.
- 102areas have positive-area component overlap;1911 overlapping component pairs.
- 106exact duplicate normalized polygon components.

The generation mechanism concatenates valid camera squares without resolving overlap; overlapping components violate MultiPolygon topology. This reproduces a repository data-generation defect and explains the observed offline invalidity. It does **not** prove which file was imported by production, what a particular graph excluded, or that the production HTTP400/502/504 incidents were caused by these geometries. Do not silently union, buffer, deduplicate, rebuild/import or replace data. A reviewed data remediation must preserve camera identity/coverage and be verified against the actual graph separately.

## Point evidence and uncertainty

All8301 points have a reference property, but no feature ID, source/provenance field, acquisition timestamp, road/graph identity, direction or average-speed section identity in this export. `duplicate_feature_ids=0` does not establish uniqueness: no feature IDs are present. The audit found106 duplicate point positions,106 colocated distinct-property groups and7 reference identifiers associated with multiple positions. No colocated different-type candidates were found, but the converter sets every point's type to speed_camera, so that result cannot establish absence of conflicting real camera classifications.

Colocated records can represent legitimate devices/lanes/directions or duplicate imports. Reused references across positions can represent sections or bad identifiers; neither conclusion is proven. Do not automatically delete them. `convert_cameras_to_geojson.py` preserves description/reference/location but flattens type and does not carry source timestamps, direction or section pairing. Database ingestion also creates timestamp fields, but that does not independently date the source export; no database provenance was authenticated here.

Average-speed enforcement requires trustworthy paired section identity, direction, road geometry and source validity. The current export cannot establish those. Opposing/adjacent carriageway clearance requires trusted road/direction evidence, not nearest-marker distance. Existing application MATCH/POSSIBLE/CLEAR regression fixtures pass but are synthetic; no real independently sourced hazard snapshot was road-matched during this acceptance. The production20-versus10marker discrepancy is still unresolved.

Traffic-light and crossing acquisition now preserves classification/time/coverage; unknown or stale OSM cannot become verified absence. Nevertheless, live Overpass bounds, extract date, data completeness and road association remain NOT_TESTED. Zero elements, a valid count query, HTTP200, a fresh acquisition timestamp or a camera-area match do not independently establish full coverage or avoidance.

## Evidence matrix

|Finding|Status|Practical limit|
|---|---|---|
|Repository inventory and hashes|PASS|Installed identity NOT_TESTED|
|Component/point content correspondence|PASS|Derived correspondence, not independent provenance|
|MultiPolygon topology|FAIL|102 invalid; production graph impact NOT_TESTED|
|Duplicate/ambiguous source records|PARTIALLY_VERIFIED|106positions/components and7reused references require manual source review|
|Independent acquisition/version/source authentication|NOT_TESTED|No trusted source manifest supplied|
|Real driven-road camera/rail/signal encounters|NOT_TESTED|No private route + independent graph-backed oracle supplied|
|Conservative ambiguity/stale/missing-data assessment|PASS in synthetic regressions|Real-world association accuracy NOT_TESTED|
|Average-speed section integrity|NOT_TESTED|No trustworthy endpoints/direction/length metadata|

## Reproduction

```sh
.venv/bin/python scripts/audit-phase11-hazards.py camera_areas.geojson
.venv/bin/python scripts/audit-phase11-hazards.py cameras.geojson
.venv/bin/python scripts/audit-phase11-hazards.py camera_areas.geojson --compare-points cameras.geojson
java --class-path "$GH8_PARSER_CLASSPATH" scripts/AuditCameraAreas.java camera_areas.geojson
```

The Java tool exits2 for invalid topology; this is the expected measured failure, not a passing data-acceptance test. Set the classpath only to pre-provisioned checksum-verified GH8/Jackson/JTS artifacts. `scripts/fixtures/graphhopper8/README.md` documents the earlier parser-only setup. Python ring/size checks explicitly output topology NOT_TESTED; they cannot replace JTS. Seven unit cases exercise malformed/oversized input rejection, ring uncertainty, coordinate-free aggregate summaries and correspondence without authenticating source truth.

Raw aggregate artifacts: VOYAGR_PHASE11C_CAMERA_AREAS.json, CAMERA_POINTS.json, CAMERA_TOPOLOGY.json, CAMERA_CORRESPONDENCE.json and PARSER_PROVENANCE.json. None contains a private route or grants release authorization. See CONTABO_ACCEPTANCE for exact operator actions.
