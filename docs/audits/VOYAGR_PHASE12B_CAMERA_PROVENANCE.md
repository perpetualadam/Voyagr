# Phase 12B — Camera Provenance

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Preserved facts and unknowns

The repository point export remains SHA256 `2244bd638c37aa356032f20645e43236c5b4e0dea48e0c0381ca3d7664a122af`,8301 points. Phase11C content comparison mapped all8301square centres to that point export, with106 duplicate positions and7references spanning multiple positions. The candidate does not alter the point file, references or original feature properties. Removing106 geometrically equal region members is not deleting106 camera records.

The export does not authenticate a source version/acquisition time, direction, road/carriageway/level identity or average-speed section pairing/length. Its converter labels all points speed_camera. Consequently zero colocated different-type labels is not evidence that real devices/types agree. Colocated differing references can be duplicate exports, multiple devices, opposing enforcement or other records; seven reused references could be section endpoints, identifier reuse or errors. No supplied evidence resolves these possibilities. They remain UNKNOWN, not automatically deduplicated or promoted to trusted absence.

The repaired area retains the original type-agnostic geographic coverage. It cannot recover missing direction, different road levels, source freshness or average-speed section meaning. No enforcement directions/average-speed section identities are combined or invented. Geometry validity and equivalence are independent of camera-source accuracy; no accuracy percentage, verified encounter count, camera-free claim or mandatory acceptance is inferred.

## New operator evidence

The user reports independent byte-for-byte repository/installed-file identity for the original65038de... file at the two stated Contabo paths. Record that as OPERATOR_REPORTED_MATCH_NOT_REPROBED. This narrows the installed-file provenance gap compared with11C but does not provide SCDB origin/date/licence, graph import revision, all128 loaded encoded areas or the reason for137in application logs. It does not establish that the new candidate is installed; it is not.

Before any data correction, obtain an approved source manifest linking export/import/generator/graph revisions, device/reference identities, road/direction evidence and section endpoints. Compare contradictory records without discarding uncertainty. The production20-versus10proximity count discrepancy remains unresolved; this union candidate is not proof of driven-road camera encounters or better route selection.
