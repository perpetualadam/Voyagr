# Independent route warning observations

This implements the first two priorities from the 17 November personal-mode hazard
audit: retaining warnings independently of avoidance, and bounded signal/crossing
acquisition for larger planning extents. It does not certify phone audio or complete
hazard coverage.

## Data paths

`prepare_route_hazards` retains a mapped observation snapshot before filtering its
camera subtypes and avoid flags. The returned HazardDataset still iterates only
the preference-filtered engine/scoring inputs; `warning_observations` is a separate
attribute. GraphHopper/Valhalla exclusion builders do not iterate the observation
snapshot. Explicit avoid points and incident handling retain their existing paths.

Route warning serialization uses the snapshot with a 150 m geographic corridor
around the actual returned route segments, independent of avoidance preferences.
It retains available source/time/association metadata. Geometry proximity alone
does not prove road, direction or vehicle applicability. The GPS owner continues
its Possible/Unrelated policy and alert settings. Warning rows and avoidance
hazard counts/penalties are separate: zero avoidance penalty can coexist with
warning observations.

GraphHopper, Valhalla primary/alternate parsers and OSRM fallback serialize the
warning rows and coverage. Existing private route caching therefore retains the
serialized data rather than depending on Python-only attributes after delivery.
Multi-drop summary, comparison route and legs receive the same independent data;
when avoidance is off, its warning acquisition follows successful valid geometry
and does not supply exclusions to the engine. Frontend route normalization and
selection retain coverage and clear it when a replacement route supplies none.

## Bounded acquisition

Small planning extents use their bounds plus 0.002 degrees, replacing the former
0.1-degree margin that could push moderate routes beyond the 0.35-degree guard.
For larger journeys, at most four 0.30-degree areas are sampled across the planning
visit chain (actual returned geometry for multi-drop with avoidance off). Both
signal and level-crossing queries share one eight-second child budget: no more
than eight synchronous provider calls, with the existing helper output caps and
cache. Parent deadlines still abort the request. Invalid/dateline-crossing sample
geometry does not trigger a guessed query.

This is incomplete acquisition for long/bent journeys, not an assertion that every
road between samples was checked. Duplicate observations are merged. Failed or
unattempted categories stay unknown; sampled coverage stays partial. Single-area
coverage retains the original provider status/bounds/provenance so the existing
avoidance assessment can evaluate the returned geometry conservatively. Stale
source status remains stale even when several areas are combined. Expired work
cannot publish observations. No coverage is promoted to complete by an empty list.

The existing route Info disclosure shows signal and crossing warning coverage,
independently of the speed-widget toggle. It does not claim live light phases,
train/barrier state, or verified absence of hazards.

## Validation and limits

Focused synthetic regressions cover avoidance off and disabled camera subtypes,
empty/unavailable preference storage, real GraphHopper/Valhalla route serialization,
multi-drop summaries/legs and unchanged engine flags, moderate/long/bent planning
areas, duplicates, unavailable/stale coverage, output provenance and child/parent
deadlines. The GPS owner is exercised in personal live mode with synthetic fixes:
retained offline observations call notification/speech spies; simulation and
verified unrelated-road association still suppress them; deduplication remains.
These are requested platform actions, not sounds heard on a physical phone.

The full-candidate browser lab checks coverage through real frontend normalization
and the GPS owner; its existing map/speed/privacy checks remain. Physical phone
acceptance remains open, using the audit's checklist. No production configuration,
account records or private history are changed by this implementation.

Remaining audit items include nearby radius parameter mismatch and legacy datasets
without independent snapshots,
and broader freshness/rolling coverage tests. This change does not create an
independent GPS-nearby acquisition source for every crossing/signal along a very
long journey. Refresh an older selected/cached plan after deploying the new code;
an old offline route cannot gain observations it never acquired.

## Follow-up: selected-route geometry

The bounded planning samples above remain the initial observations. The optional
[selected-route corridor scan](ROUTE_CORRIDOR_WARNING_COVERAGE.md) subsequently
queries the actual route and reports geometric query coverage separately from
source completeness. This improves warning acquisition for long and bent routes;
it does not expand engine avoidance coverage or establish live hazard state.


## Ordinary signals and camera alert controls (20 November 2026)

`traffic_light` is a general mapped hazard, not an enforcement camera. Removing it
from `CAMERA_HAZARD_TYPES` makes the existing shared helper select the general
warning distance, ordinary route-hazard wording and general voice preference.
Camera Off no longer skips these observations. No new preference or storage
migration is introduced. `camera_red_light` and `traffic_light_camera` remain
camera types; Off suppresses them, while Voice/Chime/Both retain their behaviour.
Railway crossings retain their existing general-hazard path.

Route planning observations (`warning_observations.py`) and selected-route scans
(`route_warning_scan.py`) assign ordinary OSM signals the `traffic_light` type.
Route collection/serialization keeps these observations independently of avoidance
settings. Browser route/nearby lists merge by location AND type, so a co-located
signal and enforcement camera remain distinct; type-specific debounce keys remain
unchanged. `processNavigationHazardAlerts` applies distance and road association,
then `buildHazardAnnouncementPlan` chooses camera vs general output preferences.
Notifications still pass through the existing notification module: browser-system
notifications require granted permission, and its toast/throttle policy is intact.
General voice Off suppresses speech but does not suppress the in-app notification.
POSSIBLE association still says uncertain, UNRELATED suppresses the warning, and
simulation suppresses the GPS warning dispatcher.

The nearby camera endpoint previously returned raw camera-table labels. A legacy
camera record can itself be labelled `traffic_light`; the endpoint now normalizes
only rows from the camera table with `normalize_camera_hazard_bucket`, as routing
and viewport camera output already do. Such a row becomes `camera_red_light`.
This does not run camera normalization over ordinary OSM signals or mixed warning
lists. Old offline records lacking provenance cannot be disambiguated from their
bare `traffic_light` string; refresh the selected route after deployment. No stored
records are rewritten or deleted.

### Regression commands

- `npx jest static/js/__tests__/hazard-alerts.test.js static/js/__tests__/independent-hazard-warnings.test.js --runInBand`
- `.venv/bin/python -m pytest -q tests/test_personal_mode.py tests/test_route_warning_observations.py tests/test_route_warning_scan.py`
- `node scripts/privacy-http-lab/signal-warning-browser.cjs`
- Full checks: backend selection in `.github/workflows/ci.yml`, `npm run lint:tests`,
  `npm run test:ci -- --maxWorkers=2`, and the isolated HTTP/browser lab.

The browser fixture uses production GPS, collection, announcement and notification
modules with synthetic route/nearby records and controlled platform outputs. It
checks 80 cases across Camera Off/Voice, general voice On/Off and notification
permission Denied/Granted, plus debounce and simulation. Unit tests cover camera
Chime/Both, all supported camera keys, different camera/general distances and
co-located types. Python tests retain signals, red-light cameras and crossings
with avoidance enabled/disabled and camera-subtype avoidance disabled.

### Post-deployment acceptance (not yet performed)

1. Preserve device storage; update the application shell coherently. Refresh a
   selected route so camera records have current typed provenance.
2. While parked with synthetic fixes, or as a passenger near known mapped points,
   choose Camera Off and general voice On. Ordinary signals and crossings must
   retain their general warnings; enforcement cameras must stay silent.
3. With general voice Off, signals/crossings must not speak. Their in-app warning
   may still appear. Denied browser notification permission must not cause a prompt
   or prevent the in-app warning; granted permission follows the existing throttle.
4. Camera Voice/Chime/Both must retain the configured camera outputs independently
   of general voice. General and camera distances must each apply to their types.
5. Repeat with route avoidance Off/On, allowing for changed route geometry. Verify
   repeated ticks do not repeat within debounce, uncertain association retains its
   wording, unrelated roads suppress warnings and route simulation stays silent.

Automated platform requests are not sounds heard on a physical phone. These
changes do not establish live light phases, complete map coverage, production
installation or real-world audio delivery. No production deployment is authorized
by this repository change.
