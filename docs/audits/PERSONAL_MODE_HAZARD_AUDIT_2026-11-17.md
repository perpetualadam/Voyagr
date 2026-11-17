# Personal-mode hazard audit — 17 November 2026

Audited `origin/main` at **242c7fa29732cf1bfe9e5757711a74ea9fa80548**
(through PR #527). This is a code/test audit, not a deployment or phone certificate.
No production configuration, reports or private location history were accessed or
changed. This report changes documentation only.

## Conclusion

PR #524 preserves mapped cameras and does not introduce an account dependency for
mapped hazards. Personal mode removes submission and nearby consumption of
community reports, not the separate SQLite camera or Overpass overlay paths.
However, **all map icons working does not establish all warnings working**.
Existing warning/avoidance coupling, area limits, fallback preferences and audio
controls leave important gaps, independent of #524. They are not repaired here.

## Availability and paths

| Feature | Acquisition and map display | Warning/avoidance behavior in personal mode |
| --- | --- | --- |
| Mapped speed/red-light/average-speed/bus-lane/mobile/other cameras | SQLite `cameras` → `GET /api/cameras/area` → map-overlay owner → camera marker builders. Default map toggle on, zoom >=10, viewport span <=2 degrees, cap 500. This is a stored camera dataset, not a fresh Overpass camera lookup or real-time mobile-camera detector. | `GET /api/hazards/nearby` always queries cameras; personal mode omits only the reports query. GPS hazard owner combines nearby cameras with selected-route hazards. Alert type Off/Voice/Chime/Both, distance, deduplication and road association apply. GraphHopper camera polygons and Valhalla exclusion candidates are separate avoidance inputs. |
| Ordinary traffic signals | Overpass `highway=traffic_signals` via `GET /api/traffic-lights/area` → viewport markers. Separate `POST /api/traffic-lights` takes the selected route, keeps signals within 150 m of segments and mounts route markers. All OSM states are unknown/neutral. | Viewport/route markers do not feed the GPS warning collector. Signals can reach it through backend route `hazards` when acquisition and avoidance/preferences allow. Ordinary signals are classified as camera hazards in the alert helper, so camera-alert Off suppresses them too. There is no implemented OSM red-phase/countdown warning. |
| Road–rail level crossings | Overpass `railway=level_crossing` → `GET /api/railway-crossings/area` → crossing markers; default overlay on, zoom >=10. | Route preparation can acquire crossings and embed them for generic hazard notifications/voice. The viewport array is not a proximity-alert source; nearby API has no independent crossing acquisition. There is no live train/barrier state and no dedicated crossing chime path. |
| Route-embedded hazards | Route preparation → GraphHopper/Valhalla/OSRM route entry builders → `hazards` → selected `window.lastCalculatedRoute`; route-comparison owner mounts hazard markers. | GPS tick/refresh evaluates embedded hazards even offline. This works only for hazards actually retained in the selected route. Route/avoidance integrity assessment is not proof of a physical warning being delivered or a hazard being avoided. |
| Accidents, roadworks, closures and other provider incidents | `TOMTOM_API_KEY` → TomTom incidentDetails → incident buckets merged into route hazards → engine avoidance/scoring/route display as supported. Personal mode does not remove this key/path. Traffic-flow/reroute notifications have a separate owner. | Accidents/roadworks can enter route warnings when proximity preferences admit them. Closure/lane/jam buckets are used by avoidance, but default proximity preferences do not admit every incident bucket into the generic warning list. Live provider access/coverage was not tested. |
| Police, potholes and other shared reports | `/api/hazards/report` is refused before database work, including direct/voice attempts; report controls/help are omitted. Nearby `reports` remains empty in personal mode. | No promise of a replacement police/pothole source: initial camera acquisition leaves these buckets empty. Provider incident debris, if returned and enabled, is distinct from community reports. |

Signal/crossing area acquisition is capped at 200 displayed points and 0.35 degrees
per axis. Route-signal API accepts 2–10,000 coordinates, uses a 0.001-degree margin,
and caps display at 200; it labels association geographic only. The shared area
executor admits two tasks without a backlog and uses a 12-second work budget.
Overpass metadata distinguishes unavailable, partial and stale acquisition from
an empty result; an empty overlay is not proof of no hazards.

## Alert delivery, controls and independent dependencies

For average-speed camera types this audit establishes point-alert plumbing, not
verified section-speed measurement, section association or live enforcement state.

The live path is `route-progress` side-effect planning →
`gps-orchestration.processNavigationHazardAlerts` → `hazard-alerts` collector →
`VoyagrRoadMatchOrchestration.classifyHazard` → announcement execute plan →
`sendNotification`, `speakMessage` and/or Web Audio chime.

- Evaluation requires active GPS tracking **or** a route in progress. It can use
  selected route data; starting a route is not the sole gate. Simulation explicitly
  suppresses live hazard alerts. Merely viewing icons with GPS off proves no alert.
- Cameras default to Voice and 500 m; other hazards use a separate general warning
  distance. Route embedding has its own database proximity limits (fresh schema:
  speed/red-light/etc. mostly 100 m, traffic signals 80 m, crossings 100 m), which
  are not identical to announcement distance.
- Embedded hazards are evaluated first. Online nearby acquisition augments them;
  offline mode does not query the nearby API. It cannot conjure missing embedded
  signals/crossings. A selected route needs correct geometry and progress state.
- Thirty-second per-hazard debouncing applies. A comparable, fresh different-road
  observation is rejected; uncertain association keeps a **Possible ... nearby**
  warning. Current camera/route DTOs lack the road IDs/timestamps needed to assert
  applicability, so uncertainty is expected, not blanket suppression.
- Camera voice is requested at high priority; non-camera speech needs general
  voice announcements enabled and remains subject to speech frequency/throttle,
  voice-input coordination and browser/platform audio behavior. Camera chimes use
  Web Audio. A planned `speak=true` is not proof of audible output.
- Browser notifications need permission; in-app notifications are also attempted.
  The notification owner has a separate three-second global throttle. Screen lock,
  background execution and browser audio restrictions need device acceptance.
- None of these owners calls Supabase, account `/api/me` or checkout. Relevant APIs
  use SQLite/Overpass/TomTom, not account tables. Personal-mode auth overrides do
  not erase the camera table, camera polygons, hazard preferences or provider keys.
  Nginx website authentication is still required: 401/403 can stop online map/API
  acquisition even with account-free mode correctly enabled.

The active web import is `voyagr_web.py:958` from `voyagr.services.hazards`.
Legacy `hazard_service.py`/`hazards_blueprint.py` contain community-report logic,
but their presence is not proof of an active Flask route: the registered web
blueprint is `voyagr.api.hazards`. The route service also accepts a ten-minute
legacy route-hazard cache payload; provenance/mode isolation of restored cache
contents is not established. No production cache was inspected.

## Confirmed limitations and recommended regressions

These are audit findings, not fixes or new phone-tested guarantees.

1. **Warning data depends on avoidance settings.** `hazard_prep.py:97` clears
   camera buckets when camera avoidance is off; signal/crossing acquisition is
   conditional on their avoid flags. Route embedding further uses enabled
   `hazard_preferences`. Map toggles are independent, so icons can remain visible
   while route/offline warnings disappear. Online nearby acquisition can still
   restore cameras, but not ordinary signals/crossings. A synthetic call with all
   three avoid flags false retained zero cameras/signals/crossings and made no
   signal/crossing calls. Recommend separate observation/alert data from avoidance
   ranking, then regress avoidance-off + warnings-on online and offline for each
   engine and multi-stop leg. Do not simply change a test to accept missing alerts.
2. **Moderate routes can skip signal/crossing acquisition.** Route preparation
   takes endpoint bounds plus 0.1 degree on each side; services refuse spans >0.35
   degrees. An endpoint latitude difference >0.15 degree already exceeds that
   limit after buffering. A synthetic 0.37-degree box yielded zero signals and
   crossings with zero provider calls. The separate route-signal display API has
   a smaller margin and can still draw icons on such a route. Recommend bounded
   corridor/segment acquisition, explicit coverage reporting and tests for short,
   moderate, bent and multi-stop routes, plus refusal/deadline behavior.
3. **Fallback preferences omit railway crossings.** The initialized database
   enables crossings, but `_default_hazard_proximity_preferences` and scoring
   fallbacks omit them. A synthetic usable connection with empty preferences
   dropped an exactly-on-route crossing. A complete DB failure can drop all route
   hazard output. Add a crossing fallback regression (plus missing/disabled/failed
   preference cases), and keep failure/coverage diagnostics visible.
4. **Ordinary signals share camera alert controls.** `traffic_light` appears in
   `CAMERA_HAZARD_TYPES`. A synthetic camera-alert Off plan skipped both a speed
   camera and a normal signal; a crossing still announced with general voice on.
   Decide and document independent signal/crossing alert controls, then regress
   Off/Voice/Chime/Both against camera, ordinary signal and crossing separately.
   `checkNearbyTrafficLights` only logs for manually supplied red state and has a
   “Could trigger voice announcement here” comment; it is not a delivered voice
   feature, and normal OSM data never provides red state.
5. **Nearby radius mismatch and freshness coverage.** Frontend sends
   `radius_km=0.8`; backend reads `radius`, defaulting to 5 km. Later alert thresholds
   narrow announcements, but request extent differs from intent. Add a contract
   test for the actual URL and server bounds. Route DTOs drop observation metadata,
   and the nearby API is not a service-worker sensitive prefix; add stale/offline
   response and route-cache provenance regressions before claiming fresh evidence.

Highest-value missing integration test: a synthetic personal-mode Flask app with
in-memory camera/preferences tables and a community table spy that refuses every
read/write; synthetic Overpass and incident transport; real selected-route
serialization and GPS owner; notification/speech/chime spies at the platform edge.
Assert camera/signal/crossing warnings, route association, simulation suppression,
offline behavior, gate denial/recovery, alert settings, duplicate/late data and
zero account-service calls. Test a live-mode synthetic fix, not a simulation that
intentionally suppresses alerts. No real provider, private history or production
DB is needed.

## Automated evidence and its limits

Executed on the audited main snapshot:

- Declared CI backend selection: **2,437 passed, 1 skipped, 94 subtests**.
- Frontend: **194 suites / 3,747 tests passed**; `npm run lint:tests` passed.
- Temporary synthetic Python/Node probes reproduced findings 1–5 as described;
  no probe changed application code or a production store. Probe counts are
  observations, not passing tests for the desired future behavior.

Useful existing tests include:

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| `test_personal_nearby_keeps_cameras_without_reading_shared_reports` | Real personal Flask route queries cameras and does not query reports, with fixture DB results | Camera database populated on VPS1; GPS/audio delivery |
| `test_personal_mode.py`, `personal-mode.test.js`, `journey-modes.test.js` | Retired report calls refused; guest/account bootstrap separated; simulation hazard suppression | All mapped API and warning paths together with account services stopped |
| `test_traffic_light_overlays.py`, `test_railway_crossing_overlays.py` | Actual APIs/shared client with synthetic transport, tags/coordinates, coverage/cache/admission/deadlines; crossing snapshot/multi-stop integrity | Phone GPS-to-audio path or live provider coverage |
| `traffic-light-overlays.test.js`, `railway-crossing-overlays.test.js`, `camera-overlay-races.test.js` | Marker mounting, bounds/toggle/runtime races, empty/error/stale/neutral state handling | Marker lists feeding warnings; audio or real network |
| `hazard-alerts.test.js`, `phase7-road-matching.test.js`, `spoken-distance-preferences.test.js` | Pure collection, offline route hazards, classification, formatting, alert planning and uncertainty wording | Actual GPS owner dispatch through browser notification/speech/chime APIs |
| `test_graphhopper_camera_areas.py`, `test_optimised_camera_avoidance.py`, route-entry/integrity tests | Model construction, route scoring/embedding, qualification and conservative assessments under fixtures | Live engine imports matching deployed camera data, guaranteed avoidance or physical alerts |

Historic PR #524's 2,407/3,732 results are its snapshot's evidence, not a current
phone acceptance result. Some older `test_hazard_*` files target desktop Kivy,
mock-only scoring or standalone/live scripts; their names alone are not evidence
for the PWA. They were not substituted for the declared web suite here. No new
physical-phone test or full hazard browser/audio integration was performed.

## Deployment evidence

From the operator's supplied outputs: VPS1 personal-mode config returned true,
login requirement false and account/billing disabled; the Nginx prompt repair
was applied; a fresh owner login restored map access. Screenshots show mapped
camera and signal icons. They do not establish crossing warnings or audible
camera warnings. Account services were subsequently stopped on VPS2; account
records were deleted, not camera tables.

No supplied production `git rev-parse HEAD` plus coherent browser-release evidence
establishes deployment of every change through #524/#526/#527. Fetching and running
an Nginx helper is not deployment of its associated application release. This
audit reads the workspace main branch only; it does not contact production.

## Physical-phone acceptance — recommended, NOT performed

Record only release identifiers, settings, synthetic/test-point IDs and pass/fail
results; do not upload private trip/history data. Inspect configuration only if
the operator chooses to perform these checks. Do not alter production settings as
part of this audit.

1. Establish server commit and coherent browser release, personal mode true,
   account SDK absent, website gate still denying anonymous access. Confirm maps
   and APIs work after owner login with account services stopped. Check the normal
   browser/PWA context actually used; one context's credential cache proves no
   other context is authenticated.
2. In a stationary safe location, inspect a known camera, ordinary signal and
   level crossing separately at zoom >=10; pan/zoom and toggle each overlay. Check
   coordinates against public mapped fixtures, uncertainty/coverage messages and
   isolation of the three layers. Icons must not show inferred signal phase or
   barrier/train status.
3. With a passenger operating the phone, or an authorized synthetic-location
   device harness in live mode, approach a known candidate on the intended road.
   Do not manipulate the phone while driving. Verify each camera type actually
   represented in the local dataset, direction/parallel-road uncertainty, entry
   into configured alert distance, notification text and 30-second deduplication.
4. For camera Off/Voice/Chime/Both, verify actual audible output and visual notices;
   exercise OS notification permission denied/granted, device volume, browser audio
   unlock, general voice on/off and frequency modes. A passing helper plan or icon
   does not count as a sound heard. Explicitly check the ordinary-signal coupling
   from finding 4; treat that as a limitation, not a pass for independent controls.
5. Plan a short route containing a signal/crossing and verify its returned hazard
   list before expecting audio. Repeat with avoidance flags off and a moderate/
   long route: document findings 1–3 instead of passing an icon-only test. Check a
   multi-stop leg, route replacement and that behind/nearby parallel-road hazards
   are not asserted as verified ahead on the current road.
6. After a route is obtained, test offline, weak network and expired website login.
   Embedded camera warnings can remain available; no fresh remote observations
   should be claimed. Check unlock recovery and preserved device data. Document
   screen-locked/background behavior as observed; do not infer it from foreground.
7. In route preview/simulation, confirm no live hazard alerts or report submissions.
   For provider incidents, use public/synthetic fixtures rather than inventing a
   real incident or submitting a community report.

Acceptance remains open until those checks are actually run and recorded. Camera
imports, Overpass coverage, TomTom entitlement, engine behavior and phone audio
permissions are distinct operational dependencies; removing app accounts removes
none of those requirements.

## Source anchors (audited snapshot)

- `voyagr/personal_use.py:18`; `voyagr/api/hazards.py:259,312,340,380,425`.
- `voyagr/services/hazards.py:225,289,817,833,846,899,991,1049`.
- `voyagr/services/routing/hazard_prep.py:36`; `route_entries.py:252,391`;
  `valhalla_parsing.py:101`; `osrm_fallback.py:106`.
- `static/js/app/map-overlay-orchestration.js:112,250,292,371`;
  `static/js/modules/map/map-overlay-toggles.js:46`.
- `static/js/app/gps-orchestration.js:420,2017,2042,2072`;
  `static/js/modules/navigation/hazard-alerts.js:11,241,556,589`;
  `static/js/modules/navigation/road-matching.js:273`.
- `static/js/modules/traffic-lights.js:306`; `static/js/app/notifications-orchestration.js:46`;
  `static/js/app/voice-announcements-orchestration.js:162`.
