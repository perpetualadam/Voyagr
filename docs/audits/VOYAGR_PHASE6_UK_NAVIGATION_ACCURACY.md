# Phase 6 — UK navigation accuracy

Date: 2026-10-27. Baseline: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` (latest fetched main; Phase 5 PR #341 merged). Branch: `codex/phase6-uk-navigation-accuracy`. **PHASE6_PARTIALLY_VERIFIED; production NO-GO.** No deployment, production access/data/configuration change or paid provider call.

## Investigation before modification

The Flask/PWA route path is `voyagr_web.py` → routing services/adapters → provider manoeuvres/complete selected geometry → `route-selection.js`, `turn-instructions.js`, `lane-guidance.js`, GPS and voice orchestration. `navigation.py` exposes lane/speed endpoints; `lane_guidance.py` and `speed_limit_detector.py` acquire nearby candidate data. `satnav.py` is a separate Kivy path, not automatically covered by web tests.

Confirmed defects: road-class/heading guesses became actionable lane instructions; GraphHopper synthesized lanes looked provider-native; second roundabout exits overrode active provider lanes. Nearby OSM ways were treated as the driven directional road. Numeric speed candidates/defaults were presented as legal limits without vehicle/jurisdiction applicability; speed warnings invented road-class limits. OSRM dropped roundabout exit numbers and mapped forks/ramps into turns/exits. Geometry-only turns sounded definitive. Nearest-point snapping selected ambiguous branches, progress seeding looked five vertices ahead, and arrival could complete near an outstanding stop. Cached alternatives could resume the wrong geometry and retain an old verified avoidance claim. Desktop GPS exceptions substituted Barnsley coordinates.

The first new boundary regression run reproduced two public API defects (2 failed, 16 passed). Original baselines: 629 Python + 68 subtests and 1,828 Jest tests / 90 suites. Intermediate failures were investigated; tests of previously unsafe public numeric/guessed contracts now assert UNKNOWN and preserve candidate-value checks separately. Private legacy estimation tests remain; their passing does not prove live road accuracy.

## Implemented boundaries

- Canonical lane/legal-speed evidence separates observations, inference and unknown applicability. Public endpoints cannot turn request parameters into trusted road identity. Missing trusted internal match means no lane permission or legal numeric limit.
- Provider-active lanes survive; generated arrays carry INFERRED; all applicable active lanes are retained. No current lane is inferred from GPS heading.
- OSRM exit numbers and fork/merge semantics survive adapters; provider counts are positive integers ≤50, never angle-derived exit counts. Unknown exit side remains generic. Contradictory spoken exit numbers are replaced with canonical wording.
- GPS admission and route matching use age, accuracy, heading suitability, competing segment groups and causal progress. Uncertainty pauses progress/arrival/lane/turn speech; off-route evidence alone feeds existing hysteresis. Reroute resets cancel queued speech. Dense junctions no longer skip ahead.
- Arrival uses fresh reliable evidence, an accuracy-bounded 8–35 m radius and outstanding-stop checks. Offline restore retains the selected route, leg ranges/stops and provenance, rejects malformed/mismatched geometry and invalidates old SATISFIED claims. Fresh GPS is required after restore.
- Desktop exception handling retains last coordinates as stale and guards recording/sharing/new location markers; isolated source-handler tests do not establish Kivy application parity.

## Changed-file map

Backend: `voyagr/utils/navigation_evidence.py`, `lane_guidance.py`, `speed_limit_detector.py`, `voyagr/api/navigation.py`, `voyagr/utils/lane_maneuvers.py`, `voyagr/utils/osrm.py`, `voyagr/services/routing/{maneuvers,route_entries}.py`, `satnav.py`.
Browser modules: `static/js/modules/navigation/{lane-guidance,route-geometry,route-progress,route-selection,offline-navigation,turn-instructions,voice-announcements}.js`; orchestration: `{gps,lane-guidance,offline-navigation,reroute-map,speed-widget,voice-announcements}-orchestration.js`. `templates/index.html` versions changed assets. Tests/fixtures, replay/benchmark scripts, CI selection and linked audit reports accompany these changes. The final Git diff is the exact inventory.

## Evidence and remaining acceptance

Synthetic data exercises software contracts, not actual UK signs, topology, lane permissions or provider graph versions. No installed routing graphs/live road responses were validated. Roundabout exit counts are provider evidence, not independently surveyed connectivity; spiral/turbo/mini/multi-level/unusual roundabouts still need real fixtures. Route-only matching cannot detect an adjacent road absent from the route or prove bridge elevation/lane identity. Trusted matched-road acquisition is not implemented: normal lane/speed APIs intentionally return unknown rather than guess. National/conditional/HGV/towing/legal rules remain unverified. Browser camera/GPS/audio lifecycle, mobile battery/rendering, offline map/audio availability and complete desktop parity require devices.

Phase 7: obtain versioned engine/graph and legally usable matched-road fixtures; implement trusted directional road/vehicle/jurisdiction context; independently verify UK junction connectivity and signs; run supervised England/Scotland/Wales/NI replay and device acceptance. Separately complete dashcam deployed session/proxy isolation acceptance and avoidance coverage verification. Do not relax uncertainty guards to recover guessed UI output.

See [lane evidence](VOYAGR_PHASE6_LANE_GUIDANCE.md), [speed evidence](VOYAGR_PHASE6_SPEED_LIMITS.md), [GPS replay](VOYAGR_PHASE6_GPS_REPLAY.md) and [test/performance results](VOYAGR_PHASE6_TEST_RESULTS.md).
