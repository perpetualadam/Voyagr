# Phase 12B — 128 137 Reconciliation

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Reproduced reporting defect and limited correction

Before the fix, get_graphhopper_camera_areas_count() returned GRAPHHOPPER_CAMERA_AREAS_COUNT before inspecting loaded features. A deterministic regression loaded the actual128-feature source and set env count137: the reported total was137, although the request builder still referenced IDs from the128 loaded features. This is a reproduced count-precedence/reporting defect, not evidence of9 additional generated areas.

The minimal correction makes a present, nonempty loaded feature inventory authoritative for its count and emits a bounded static mismatch warning. It keeps the existing env/default fallback when the file is unavailable and does not change request conditions, avoidance strength, source data or engine configuration. The same regression now returns128 and retains in_camera_area_127 without inventing in_camera_area_128. Missing-file fallback137 remains explicitly tested, as unverified configuration rather than engine discovery.

## Source-to-consumer mapping

|Source|Consumer|Meaning / evidence|
|---|---|---|
|camera_areas.geojson /load_camera_areas|CAMERA_AREAS_DATA, bbox index/filter|128 grid feature IDs; filtering selects original IDs, does not create new sections|
|Loaded feature inventory|Custom model in_camera_area_N rules and reported loaded count|ID references come from the file when available; count now follows it|
|GRAPHHOPPER_CAMERA_AREAS_COUNT|Fallback count when local file is absent|Configured estimate, not loaded graph metadata; previously could override log total|
|Installed /opt/graphhopper/custom_areas/camera_areas.geojson|GraphHopper area/graph import and encoded references|Original file hash/128count operator-attested; all loaded/imported identities not probed|
|SCDB camera DB hazard buckets|Request-defined camera polygons and independent scoring|Separate from static grid-cell count; no DB change/read for provenance inference|
|cameras.geojson /CSV converter|Point export/content correspondence|8301 points; cannot establish source authenticity or runtime DB identity|
|generate_camera_areas_geojson.py|Legacy static area output|0.5degree grid +30m squares; inspected, never regenerated in place|
|New versioned candidate|Offline review/parser only|No automatic application/engine loader selection added|

## What remains unresolved

The operator's reported137can be reproduced by an env137override with the same128 feature file. However the actual deployed env, loaded app revision, in-memory inventory/hash and log request identity were not supplied/read. Therefore this is a proven application defect and plausible mechanism, **not a proven production incident attribution**. There is no observed code path adding9extra grid features during bbox filtering; do not invent a second dataset or assume intended equality. Compare actual deployed/config/graph metadata read-only before deciding whether production137was this defect, a different revision or another source. No production env/version was automatically changed.
