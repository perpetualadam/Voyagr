# Phase 12B — Geometry Root Causes

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Confirmed diagnosis

Original inventory:128 unique feature IDs,0 missing/duplicate IDs,8301individually valid polygons,102 invalid MultiPolygons (Self-intersection),26 valid features. JTS reproduces102 features with positive-area component overlap,1911 overlap pairs and106 exact normalized duplicate components. GEOS independently diagnoses the same102 invalid features. Boundary-only edge/point touch pairs, nested non-identical pairs and tolerance-near non-identical pairs are all0in this snapshot. Synthetic regressions cover those cases nonetheless.

All source rings are closed by strict structural inspection; source exteriors are counterclockwise, and there are0 source holes. No invalid individual component was found. At8decimal numeric centre reconstruction,0 components are assigned to the wrong existing0.5degree grid_cell under the generator's UK grid calculation. This is a numeric grouping check, not camera positional accuracy or road identity. The actual checks are recorded in VOYAGR_PHASE12B_SOURCE_DIAGNOSIS.json and BASELINE_TOPOLOGY.json.

The generator creates30m half-width axis-aligned camera squares and concatenates them within each grid cell. Valid squares can overlap or repeat; a MultiPolygon cannot contain positive-area-overlapping members. This diagnosed aggregation operation, rather than ring closure, orientation, hole representation or misgrouped cells, explains the invalidity. Coordinate quantization is not implicated by these observations; no new rounding/snap is used. Overlap is not proof of duplicate physical devices, directions or average-speed sections.

## Per-feature evidence

`artifacts/camera-areas/phase12b/feature_metrics.json` records every feature, including all102 invalid IDs: original type/component count/validity/category, exact duplicates, overlap/touch/nesting/near-equivalence counts, ring orientation, proposed operation, candidate validity/components, union coverage checks and source authority UNKNOWN. Validation messages are reduced to categories without coordinate-bearing exception text. Every invalid feature is remediated by union of valid members within its own ID; every accepted candidate preserves the original represented set. No feature is joined to another feature's identity.

No camera record is removed or merged. Properties remain the original metadata, including camera_count; it continues to count source records, not candidate polygon components. Physical/source correctness is still UNKNOWN. The user-attested installed hash establishes the original file's identity, not which graph import or runtime geometry interpretation used it.
