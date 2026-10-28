# Phase 12B — Graphhopper Validation

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Executed offline validation

Six existing GH8/Jackson/JTS JARs were SHA256-verified against the committed parser manifest. The new reproducible parser driver uses only those verified files, never a service or production URL. Baseline original:128 areas,128 unique IDs,102 invalid geometries, expected exit2. Candidate:128 areas,128 unique IDs,0 invalid, exit0. Independent AuditCameraAreas JTS inspection also reports0 overlap/duplicates and6452 valid components.

A self-contained model containing all128 candidate areas and a hard multiply_by:0 rule deserializes. A model composed by the actual collision-safe helper with the mixed SCDB/OSM/eight-CAZ fixture deserializes with140 unique areas and0 invalid geometries. A regression forces a camera-area name collision and verifies129 unique IDs, rewritten rule identity and all hard blocks retained. Existing toll capability, profile/fallback and diagnostic regressions pass unchanged.

These are **GraphHopper8JSON deserialization and JTS geometry checks**. They are not Java expression compilation, installed encoded-value availability or actual routing. Invalid original geometry is explicitly reported by validation, not silently accepted as valid. No production file/profile/graph/areas were loaded/changed. The candidate inline model is for offline parser testing: do not send it to a live engine already holding the same area IDs, because loaded/inline name collision semantics must be reviewed independently.

## Acceptance matrix

|Requirement|Evidence|Status|
|---|---|---|
|Candidate structure/all128 IDs|Official GH8/JTS offline parser|PASS offline|
|MultiPolygon validity/interpretation|GEOS and JTS agree on128 valid candidates|PASS geometry, runtime NOT_TESTED|
|Hard-block JSON /mixed model/collision safety|Offline parser and actual composition regressions|PASS schema/composition|
|Unsupported toll /capability/profile rules|Configured existing application tests|PASS synthetic application behavior|
|All128installed in_camera_area_N expressions compile|No isolated engine/graph available|NOT_TESTED|
|Hard-block execution /invalid runtime geometry behavior|No actual engine execution|NOT_TESTED|
|Unrestricted/original/candidate route comparison|No reviewed graph oracle or engine|NOT_TESTED|
|No compliant alternative /boundary/sparse-vertex crossings|Only existing geometry/oracle-safety regressions, no engine|NOT_TESTED graph-backed|
|Adjacent/opposing carriageways|Conservative road/direction tests, source identity missing|NOT_TESTED real-world|

The workspace has no provisioned routing listener on the usual ports and no approved graph copy or reviewed fixture was supplied. Existing replay was executed without service approval,0routing calls; its NOT_TESTED artifact is not an enforcement pass. No mocked provider result substitutes for actual graph acceptance. Even spatially equal source/candidate sets do not prove equal original-invalid and candidate runtime behavior: observe and document inconsistencies explicitly on an isolated clone.
