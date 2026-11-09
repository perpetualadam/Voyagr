# UI improvement checklist

This is a parallel workstream. It does not replace, reorder or take priority over
the existing Overpass acceptance queue in [OVERPASS_CONSUMER_AUDIT.md](OVERPASS_CONSUMER_AUDIT.md)
or other navigation, deployment and acceptance checklists. Complete and verify
one UI increment at a time; retain outstanding functional acceptance items.

## 1. Route playback controls (implemented; deployed acceptance pending)

- [x] Replace the dense playback panel with a compact, icon-led player.
- [x] Show only the applicable play/pause action; retain restart, speed, follow,
  seeking and exit, including recovery behaviour.
- [x] Keep the simulation warning visible; move supporting text into expandable
  details. Use consistent inline SVGs, accessible names and keyboard focus.
- [x] Provide 48 px control targets, narrow-screen wrapping and dark-theme styles.
- [x] Run regression checks for playback, GPS/trip isolation and icon controls.
- [ ] Check phone/desktop rendering, keyboard operation and map framing in a real
  browser after deployment. Automated checks do not establish live acceptance.

Repository validation: 2,802 JavaScript tests, 1,902 backend tests (1 skipped,
74 subtests), test lint, and the isolated Chromium player check at 320×640,
390×844, 844×390 and 1280×800 in light/dark themes. The browser check uses the
production markup, stylesheet and playback controller with a fixture map; it
checks touch targets, horizontal overflow, keyboard focus, controls and cleanup
recovery. It does not establish live WebGL/GPS or deployed-device acceptance.
Re-run with `node scripts/check-preview-player.cjs` (Chromium required; optionally
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`). No production deployment is included.

## 2. Selected route preview (implemented; deployed acceptance pending)

- [x] Lead with duration/distance and a clearly labelled navigation action.
  Navigate retains the existing journey chooser and fresh-GPS permission path.
- [x] Group the preview's secondary map/settings/edit actions under a labelled
  More route tools disclosure. Save/Share retain their existing screens; they
  were not previously preview actions. Keep Overview, Parking and Compare visible.
- [x] Make estimated costs and route details expandable without concealing route
  limitations. Keep planning, avoidance, arrival, CAZ and hazard assessment notices
  outside disclosures. Keep the estimated total visible on the cost summary.
- [x] Verify route choices, panel hydration and journey-mode permission checks
  through controlled regression tests.
- [ ] Accept the deployed preview on a real phone: select alternatives, open costs
  and tools, find parking, play a route and enter the journey chooser. Retain all
  previous Overpass, lane/speed and route-access acceptance items.

This increment changes preview HTML/CSS only; existing action handlers, route
selection, provider acquisition and navigation permission logic remain unchanged.
Controlled validation includes 2,806 JavaScript tests, the backend CI web selection,
and `node scripts/check-route-preview-panel.cjs`: four viewport sizes plus a 2×
zoom case in light/dark themes (10 Chromium cases). Browser checks use production
panel markup/CSS, hydration, alternative cards and navigation entrypoints with
fixture device/map/provider actions. They cover horizontal overflow, touch targets,
native disclosure keyboard operation, route switching, notices and action wiring.
They do not establish live WebGL/GPS/provider or production acceptance.

## 3. Map controls (implemented; deployed acceptance pending)

- [x] Audit existing controls, including Parking POI, before changing placement.
  See [MAP_CONTROL_UI_AUDIT.md](MAP_CONTROL_UI_AUDIT.md) for owners and preserved paths.
- [x] Replace mixed emoji in map actions and Nearby Places with consistent SVG
  icons and accessible names. Keep native MapLibre/optional AR owners intact.
- [x] Keep frequent actions discoverable; use icon-and-label controls when an
  icon's meaning is ambiguous. Preserve selected/pressed states.
- [x] Check bounded scrolling, touch targets, keyboard/pointer operation and
  turn/lane/speed overlap with controlled phone/landscape/desktop fixtures.
- [ ] Accept on deployed phones with live maneuver/lane/speed/hazard overlays,
  long instructions, text zoom, safe areas and real GPS. Verify Parking results,
  camera visibility, Follow/Overview, Help/long-press and End Navigation. This
  remains alongside every previous functional/provider acceptance item.

## 4. Wider UI consistency and acceptance

- [ ] Apply shared spacing, restrained colours, focus and touch-target rules in
  small increments rather than a global restyle.
- [ ] Check contrast, text zoom, keyboard access, reduced motion, portrait and
  landscape layouts, safe areas and light/dark themes.
- [ ] Run relevant regressions for each increment and record browser acceptance
  separately. Do not automatically deploy or change routing/GPS/data behaviour.

### 4a. Bottom-sheet toolbar (implemented; deployed acceptance pending)

- [x] Audit and retain all nine existing action handlers/destinations.
- [x] Replace emoji controls with labelled SVGs, scoped theme colours, 48 px
  targets, visible focus and current-page markers.
- [x] Keep the toolbar within the collapsed peek; use horizontal scrolling and
  reveal focused buttons completely. Protect toolbar swipes from drawer gestures.
- [x] Verify normal/200% text, contrast, keyboard/touch, scrolling, page selection,
  Premium action wiring and collapse/expand through controlled regressions.
- [ ] Accept the deployed toolbar on real phones and Firefox/WebKit, with long
  text, native font scaling, touch scrolling and the live application shell.

See [SHEET_TOOLBAR_UI.md](SHEET_TOOLBAR_UI.md) for scope and validation. This
completes one UI increment only; the wider checks above, previous phone/provider
acceptance and GitHub notification identification remain open alongside it.

### 4b. Combined navigation overlays (implemented; deployed acceptance pending)

- [x] Reproduce long-turn/speed, warning/viewport and road-name/summary collisions.
- [x] Group existing display regions into a bounded layout with wrapping and
  keyboard/touch scrolling, safe-area/offline clearance and scalable footer space.
- [x] Retain source labels, source-controlled border states, warning timing,
  dismissal, navigation refusals and End access.
- [x] Check four screen sizes in light/dark mode at normal/200% text, with long
  instructions, five lane arrows, mapped speed, warning on/off and offline space.
- [x] Run full web/JavaScript regressions plus existing map-action and playback
  browser checks. See [NAVIGATION_OVERLAY_LAYOUT.md](NAVIGATION_OVERLAY_LAYOUT.md).
- [ ] Accept on deployed phones and Firefox/WebKit with real guidance, different
  evidence/urgency states, offline notifications, gestures and dynamic orientation.
  Continue the remaining whole-app and native-map accessibility checks above.

### 4c. Optional arrival controls (implemented; deployed acceptance pending)

- [x] Group existing arrival/intent/parking-search controls in a native disclosure.
- [x] Keep selected arrival, unfinished search, preview-only intent and parking
  search filter visible in its closed summary; update on selection/edit/clear/restore.
- [x] Retain access/entrance and onward-connection limitations outside the disclosure.
- [x] Check keyboard operation, long names, four viewport sizes, light/dark themes
  and normal/200% text using production markup/CSS and selection handlers.
- [ ] Accept on deployed phones and Firefox/WebKit with actual parking results,
  saved-route restoration and destination changes in the full app shell.
- [x] Review via-points/stops as the next separate form increment (4d below).

This presentation-only increment preserves endpoint provenance, request cancellation,
parking filters and live-navigation gates. Existing IDs and action handlers remain.
`node scripts/check-arrival-options.cjs` runs 16 controlled Chromium cases; provider
calls are fixtures. All earlier functional, deployment and UI acceptance stays open.


### 4d. Via-points and stops (implemented; deployed acceptance pending)

- [x] Group optional waypoint tools in a native disclosure with visible stop/via
  counts, stop time and active map-pick/edit mode when closed.
- [x] Preserve address/map/GPS entrypoints, coordinate/provenance records,
  reorder/remove/clear, stop duration and route editing. Fix the independently
  reproduced address-add helper reference error (`WP.build...` versus `wp.build...`).
- [x] Add labels, accessible row-action names, scalable scoped light/dark styling,
  48 px targets and narrow-screen wrapping without horizontal overflow.
- [x] Check actual owner add/reorder/remove/clear and selected/geocoded address
  paths, plus 16 Chromium viewport/theme/normal and 200% text cases.
- [ ] Accept in the deployed full shell on phones and Firefox/WebKit: address,
  map and GPS additions, drag/keyboard ordering, dwell times and saved journeys.

Run `node scripts/check-waypoint-options.cjs` for controlled browser checks using
production markup/CSS, waypoint plans and owner with fixture map/provider/GPS
boundaries. This does not establish live provider, GPS or WebGL acceptance.
Existing functional/Overpass acceptance remains separate and unchanged.

## Parallel functional follow-ups agreed 8 November 2026

These additions sit alongside the original Overpass, arrival and UI lists; they
retain all existing deployment/device acceptance items. Work one increment at a
time. Agreed next order: Food POI verification, app-wide unit consistency, then
dynamic fuel-cost accuracy. The remaining Overpass category queue remains open.

### App-wide unit consistency (pending)

- [ ] Inventory every unit-bearing input, API field, stored value and displayed
  label against the user's settings; document canonical internal units and
  conversion boundaries before changing calculations.
- [ ] Check distance and speed across planning, alternatives, route playback,
  navigation, maneuver prompts/voice, speed limits/alerts, map scale and POIs.
- [ ] Check fuel consumption, fuel quantities/prices, currency, route costs,
  statistics/history/saved trips and share/export views. Distinguish UK and US
  gallons explicitly; settings changes must not silently reinterpret saved data.
- [ ] Check other available unit settings, including temperature and vehicle
  dimensions/weights where applicable. Preserve legal/profile constraints and
  evidence values; display conversion must not change routing decisions.
- [ ] Verify changes immediately after selecting settings, after reload/profile
  changes, and with saved/restored route previews. Cover rounding and threshold
  boundaries, missing/invalid data and metric/imperial combinations.
- [ ] Fix confirmed issues separately, with focused regressions, full required
  checks and a separately authorized deployment/device acceptance.

### Dynamic route-preview fuel-cost estimates (pending, after unit audit)

- [ ] Trace existing distance, vehicle consumption, fuel type, unit conversion,
  price/currency and rounding through preview/alternative-route calculations.
- [ ] Research current UK price sources, including Northern Ireland; establish
  coverage, fuel grades, timestamps, licensing/terms and operating limits before
  choosing an integration. Overpass station locations do not establish prices.
- [ ] Define local versus national estimate selection, user-entered price
  precedence, provenance/age display, bounded refresh/caching and offline/stale
  fallback. Source failure must leave route planning usable.
- [ ] Implement one reviewed increment at a time. Keep estimates clearly labelled;
  add consumption/route-condition refinements only where supported by evidence.
- [ ] Validate unit/currency/consumption combinations and fallback behavior, then
  retain live-provider and actual-device acceptance as separate pending checks.

## Unit audit, first increment — distance labels (8 November 2026)

This is the first correction in the app-wide unit task, not a claim that every
unit-bearing view is consistent. Dynamic fuel pricing remains pending until the
unit/cost boundaries below are resolved. Initial source tracing found these owners:

| Surface | Canonical values / owner | Audit disposition |
| --- | --- | --- |
| Preferences and persistence | `units-preferences-orchestration.js`, `settings-orchestration.js`, `settings-snapshot.js`; local `unit_*` keys and backend unit settings | Distance selection persists through the existing owner; import/profile/reset refresh and invalid stored values still require dedicated coverage. `app.js` also binds unit change events and should be reviewed with that work. |
| Main and selected preview distance | `route-comparison-orchestration.js` and `route-preview-orchestration.js` store `data-km`; `units.js` converts for display | Existing refresh retained and regression-tested alongside new distance labels. No route/provider numbers are converted in storage. |
| Playback remaining distance and upcoming turn | `journey-modes.js`, `journey-plan.js`; metres and metre/second simulation clock | Fixed hard-coded km/m. Current setting determines mi/ft or km/m, including a paused preview. Unit changes cannot move the seek position, start live guidance or hide cleanup recovery. |
| Nearby result list and along-route map popup | `poi-search.js`, `poi-search-orchestration.js`; `distance_m` | Fixed metric-only popup. List/popup labels retain canonical metres and refresh on a unit change; detached popups reformat when opened. Provider acquisition and route selection are unchanged. |
| Arrival parking radius and result offset | `geocoding-orchestration.js`, `journey-plan.js`; 2,000 m search radius and metre geodesic distance | Fixed hard-coded km copy. Existing displayed radius/offset labels refresh while the actual search radius and chosen coordinates remain unchanged. |
| Route comparison, saved routes, sharing, trip history and statistics | `route-selection.js`, `route-sharing.js`, `trip-history.js` and their orchestration; distance_km and explicit format callbacks | Rendering paths use format callbacks; already-open cards/tables and profile changes need a separate refresh audit. No complete acceptance claimed. |
| Navigation, rerouting, alerts and voice | `turn-instructions.js`, `eta.js`, `hazard-alerts.js`, `reroute-decision.js`, `voice-announcements.js` | Existing mi/km branches found. Cross-view rounding thresholds, utterances and unit changes during real navigation remain pending controlled/device acceptance. |
| GPS speed and limit widgets | `speed-gps.js`, `speed-limit-widget.js`, `speed-widget-orchestration.js`; m/s input, canonical mph, selected display conversion | Keep evidence, matching and alert authority independent of display units. Mixed distance/speed settings and settings restore still need dedicated acceptance. |
| Currency and route costs | `units.js`, unit preference owner, `route-selection.js`, `services/costs.py`; supplied price × litres/kWh, plus toll/CAZ amounts | Confirmed follow-up: changing the currency currently substitutes symbols; no exchange-rate conversion/provenance mechanism was found. Resolve canonical cost currency and conversion/fallback policy before dynamic prices; do not treat symbol substitution as conversion. |
| Fuel/energy consumption and price inputs | `route-prefs.js` reads `fuelEfficiency`, `fuelPrice`, `energyEfficiency`, `electricityPrice`; backend uses L/100 km, currency/L, kWh/100 km and currency/kWh | Preserve canonical stored values. `units.js` MPG helper uses the US factor 235.214 but labels only MPG; no display consumer beyond the wrapper was found. Explicit UK/US gallon policy and input/label coverage remain pending. |
| Temperature and weather | `units.js` has Celsius/Fahrenheit conversion; preference refresh currently logs only. `weather-layer.js` is a provider raster overlay | Do not assume changing preference converts provider raster colours. Numeric temperature displays/legends, if present, require explicit source units and refresh wiring. |
| Dimensions, weight and other physical units | Routing/profile constraints and any corresponding forms | Inventory actual exposed inputs and canonical API contracts before introducing conversions. No restriction/profile values were changed in this increment. |

Implemented labels use `data-distance-meters` plus optional style/prefix/suffix
metadata. Refresh reads canonical metres each time, never previously rounded
text, and only changes leaf label text. No conversion is applied to API search
radii, route geometry, hazard thresholds, speed evidence, simulation timing,
route costs or saved trip values. Recovery copy drops distance metadata so a
later unit change cannot overwrite the refusal message.

Verification: focused tests exercise the real unit preference owner, persistence
request, modal/popup builders, arrival result renderer and paused simulation.
They cover round trips, zero/short distances, invalid values, unchanged canonical
coordinates/distances, detached popup opening and retained planning/live gates.
`node scripts/check-distance-units.cjs` exercises the actual unit selector and
POI/arrival renderers at 390×844 and 844×390 with fixture data and no live
network/GPS/routing calls. Browser checks passed. Full local checks: 138 JS
suites / 2,989 tests, lint and coverage requirements passed; declared web backend
selection 1,983 passed, one platform skip and 74 subtests passed.

Production deployment and live phone acceptance remain pending. Continue the
unit task with currency/cost provenance, remaining view refresh and settings
restore, then consumption/temperature/other exposed unit controls before marking
the app-wide checklist complete or integrating dynamic fuel-price data.

## Unit audit, second increment — truthful cost currency (8 November 2026)

The current backend costing contract uses GBP: fuel/energy costs multiply the
configured GBP-per-litre/kWh prices by canonical quantities, and toll/CAZ charges
are GBP. `services/costs.py` includes an explicitly named GBP-per-litre fuel
utility; `route-prefs.js` supplies the app's canonical price/consumption defaults.
No exchange-rate or currency-conversion mechanism was found. Previously the
unit owner used the preferred currency's symbol for these unchanged amounts.
Selecting USD/EUR therefore relabelled GBP values without converting them.

- [x] Separate preferred currency from current cost display currency. The pure
  `getCostCurrencyPresentation` plan explicitly retains source/display GBP and
  reports NOT_REQUIRED or UNAVAILABLE; it never claims a conversion took place.
- [x] All existing app cost consumers of the unit owner receive the GBP symbol,
  including previews, comparison, trip summaries, history, saved routes and
  sharing. Keep the separate ISO-code-to-symbol utility for explicitly identified
  currencies; it does not establish the currency of an amount.
- [x] Preserve USD/EUR preferences in local/backend settings and restored profile
  state. Selecting them reports that conversion is unavailable and estimates
  remain GBP. Invalid select values cannot overwrite a saved preference.
- [x] Add linked settings help and a route-preview cost notice. Selecting a
  currency does not reinterpret price inputs, costs or saved trip values.
- [ ] Implement actual foreign-currency display only after a dated rate source,
  supported currency contract, rounding policy and complete cost-view conversion
  are established. Cover totals/components, price inputs, already-open views,
  restored/share/export data, stale/unavailable rates and original provenance.
  No fabricated/static rate or new network dependency was added in this increment.
- [ ] Continue the remaining view/profile refresh and consumption/temperature/
  physical-unit audit before claiming app-wide consistency. Dynamic fuel pricing
  remains separate; future quotes must carry currency, price unit and timestamp.

This correction covers the app's current GBP costing contract. It does not add
foreign-currency imports or rates, rewrite old costs, refresh fuel prices or
change route selection/navigation authority. A future multi-currency cost schema
must replace the fixed GBP presentation contract before accepting foreign amounts.

Focused regressions exercise the real unit preference owner, settings restoration,
summary/comparison/share builders, unchanged canonical values, unsupported/invalid
preferences and GBP round trips. `node scripts/check-cost-currency.cjs` uses the
actual currency selector, help and preview markup with the production unit owner
and cost builders at 390×844 and 844×390; fixture backend only, no live rate/GPS/
provider calls. Controlled browser checks passed. Full local validation: 139 JS
suites / 2,997 tests, lint and coverage floors passed. Production deployment and
actual-phone acceptance remain pending.
Declared web backend regressions also passed: 1,983 tests, one platform skip and
74 subtests. No production settings, data or deployment were changed.

## Unit audit, third increment — restored settings and open views (8 November 2026)

Restoring settings applied runtime values without invoking unit display refresh.
Already-mounted comparison, alternative preview, saved-route and trip-history
rows also lacked canonical values for the existing leaf-label refresher. The
analytics summary had the same gap for total distance and average speed.

- [x] Batch supported restored unit fields, then refresh once through the existing
  settings owner. The local profile-switch path uses that owner. Sync the four
  unit selectors and existing distance/cost/speed labels without recalculating or
  replacing a route. Existing non-unit settings and traffic restore policy remain
  unchanged; the new display refresh performs no acquisition or settings writes.
- [x] Ignore unsupported unit values in saved/imported snapshots rather than
  overwriting valid runtime or individual unit-storage keys. Invalid standalone
  unit keys receive supported startup defaults; legacy `km/h`/`kph` preferences
  normalize to `kmh`. Missing snapshot fields retain existing behavior.
- [x] Comparison cards/tables, alternative preview rows, saved routes, history
  and frequent-route rows retain canonical metre metadata on leaf text nodes.
  Analytics retains canonical distance and km/h speed metadata. Unit refresh
  changes text in place, preserving rows, controls, route selection and values.
- [x] Refresh analytics speed independently of distance preference, through the
  existing speed converter. A speed-unit refresh can no longer use a road-class
  fallback to create a displayed posted limit; unknown remains unknown and
  existing canonical posted-limit values remain available for display conversion.
- [x] Avoid registering a second unit change listener when the production selector
  already has its inline handler. Keep listener fallback for markup without one.
  This removes duplicate persistence/status effects for a single selection.
- [ ] Accept a deployed phone profile round trip with open comparison/history/
  analytics, a paused preview and real GPS guidance; verify current posted/mapped/
  unknown widget states retain their evidence and units. Controlled tests do not
  establish actual GPS/device acceptance.
- [ ] Continue consumption/UK-versus-US gallon policy, temperature/other physical
  displays, explicit per-distance cost rates and remaining live/voice/summary
  edge cases before claiming app-wide consistency. Actual foreign-currency
  conversion and dynamic fuel-price integration remain separate pending work.

Focused tests use the real settings/profile owners, unit refresh, distance/card
builders and analytics renderer. They check metric/imperial round trips, selector
and storage consistency, invalid/legacy preferences, stable DOM nodes/handlers,
unchanged route values/destination, canonical speed and unknown posted-limit
preservation, startup defaults and one dispatch per unit control.
`node scripts/check-restored-unit-views.cjs` uses the actual unit selectors and
entry-point listener setup, plus production profile/settings owners and card
builders at 390×844 and 844×390, with fixture state only. Controlled browser
profile round-trip and single-change checks passed. No live route/GPS/account/
rate/provider calls are made by this browser fixture.

Full local JavaScript validation: 140 suites / 3,008 tests, lint and coverage
floors passed. No production configuration, data or deployment changed.
Declared web backend validation also passed: 1,983 tests, one platform skip and
74 subtests. Production deployment and real-device acceptance remain pending.

## Unit audit, fourth increment — consumption labels, temperature and cost rates (8 November 2026)

The comparison report displayed a canonical `cost_per_km` value under a fixed
Cost/km heading even when the distance setting was miles. Its table now uses the
shared pure rate formatter: currency/km × 1.609344 becomes currency/mile. Both
initial rendering and already-open table refresh update the amount and heading
from canonical data. Rate cells retain source values/symbols; totals, route
ranking, currency, stored prices and consumption inputs are not recalculated or
reinterpreted. Missing/invalid rates display unknown in either unit.

- [x] Convert per-distance comparison rates in the correct direction and refresh
  their headings/leaf values on explicit unit changes and restored settings.
  Keep canonical rate metadata for round trips without accumulated rounding.
- [x] Clarify the existing fuel-economy helper's gallon basis: its historical
  conversion uses US gallons (235.214 divided by L/100 km), so its label is now
  `MPG (US)`. Positive numeric conversion values are preserved. This helper has
  no current web reading/input consumer beyond its wrapper; this increment does
  not add a consumption widget or claim UK MPG support. Any future selectable
  UK-gallon display must be explicit and leave stored L/100 km unchanged.
- [x] Missing, invalid, non-positive or overflowing fuel-economy input no longer
  formats as zero/infinite MPG. Missing/invalid/overflowing temperature input
  displays unknown rather than treating missing Celsius as freezing. Zero and
  negative valid Celsius values still convert correctly.
- [x] Trace temperature consumers: the current weather view uses OpenWeatherMap
  raster tiles; weather notifications use descriptions, and no current numeric
  temperature reading renderer was found. Keep the preference and pure numeric
  converter, and explain next to the selector that provider map colours do not
  change with it. No image recolouring, provider URL change or new weather request
  is implied or implemented.
- [ ] Accept deployed comparison-rate round trips and existing unit/profile flows
  on an actual phone, including live guidance/voice/summary edge cases from the
  earlier audit. This does not establish complete live app-wide acceptance.
- [ ] Research dynamic UK fuel-price sources, including Northern Ireland, before
  choosing a provider. New quotes must carry fuel grade, currency, price unit and
  observation time, with explicit freshness/fallback rules. Canonical prices
  remain GBP/L (or GBP/kWh) and consumption remains L/100 km (or kWh/100 km).
  No quote ingestion, foreign exchange or price refresh was added here.

Regressions cover per-km/per-mile arithmetic, zero/missing rates, already-mounted
row identity, unchanged totals/source values, consumption input preservation,
explicit US-MPG labels, valid/missing Celsius values and temperature preference
persistence without weather calls. `node scripts/check-consumption-rate-units.cjs`
uses actual unit selectors, the real comparison table and production unit/cost
helpers at 390×844 and 844×390 with fixture state; no live routing, weather,
pricing or GPS requests. Controlled browser checks passed.

Full local validation: 141 JavaScript suites / 3,042 tests, lint and coverage
requirements passed; declared web backend selection 1,983 passed, one platform
skip and 74 subtests passed. Production deployment and actual-phone acceptance
remain pending. No production configuration, data or deployment changed.

## Dynamic fuel-price source research (8 November 2026)

Primary-source research and the implementation sequence are recorded in
[DYNAMIC_FUEL_PRICE_RESEARCH.md](DYNAMIC_FUEL_PRICE_RESEARCH.md). Fuel Finder is
the preferred later station source and its statutory scope includes Northern
Ireland. First implement a bounded public DESNZ weekly-average snapshot with
manual/configured fallback; then add opt-in automatic/manual and fuel-category
selection without overwriting legacy prices. The current browser sends a fixed
price even without a user override, so a server-only default update is insufficient.

The official Fuel Finder developer portal returned 403 through the research
browser; current recipient API schema, quotas and full dataset terms remain
unverified. No account/credential action or runtime integration was performed.
Keep earlier unit/Overpass/device acceptance items open. This research completes
source assessment, not dynamic fuel pricing or live station-price acceptance.

## Dynamic fuel prices: parser/cache layer (8 November 2026)

The inactive weekly-average parser/cache and explicit operator command are
implemented; see [the implementation record](DYNAMIC_FUEL_PRICE_RESEARCH.md#implemented-step-1-inactive-parsercache-and-explicit-operator-command).
The first increment kept quote reads free of HTTP and did not wire routing;
the selection/request increment below now reads a configured snapshot. Fixture checks
cover source/redirect bounds, dates/units, last-good atomic publication, stale
quotes, retries, deadlines and thread/process locking. Live Python refresh could
not be verified through this runner's proxy; deployed-source acceptance remains
pending. Next is the separately reviewed automatic/manual/fuel-category request
and UI contract, keeping legacy overrides and existing route fallback behavior.

## Dynamic fuel prices: selection/request integration (8 November 2026)

- [x] Add explicit automatic/manual and petrol/diesel controls; preserve legacy
  manual prices and retain them when switching to automatic.
- [x] Persist the selection in settings/profile snapshots and isolate profiles.
- [x] Freeze one dated quote per calculation, attach provenance to alternatives/
  legs, explain fallback in the preview and retain original saved-route quotes.
- [x] Include resolved price/consumption/source in route-cache identity; prevent
  old cached costs being relabelled with a new price.
- [x] Keep EV tariffs unchanged and settings changes separate from active-route
  geometry, GPS and recalculation.
- [ ] Verify live GOV.UK acquisition on the deployment host, configure a readable
  snapshot and separately arrange one bounded refresher. No job or deployment
  was performed in this increment; automatic mode falls back transparently until
  a usable cache is configured.
- [ ] Complete actual-phone/VPS journey acceptance, including Northern Ireland.
  A UK national average is not a local pump quote or NI-specific observation.

This continues alongside the existing UI, Overpass, unit and device checklist.
See [the implementation record](DYNAMIC_FUEL_PRICE_RESEARCH.md#implemented-step-2-automaticmanual-selection-and-frozen-route-quotes).

## Floating Start action (8 November 2026)

- [x] Move the existing route-owned `startNavBtn` out of the collapsed Map actions
  panel and float it directly above the hamburger. Keep its ID and initial hidden
  state so existing route/active-navigation controllers still own visibility.
- [x] Invoke `startNavigationFromPreview()`, exactly like the preview Navigate
  button. Keep the production journey chooser, selected-route synchronization,
  fresh-GPS checks, refusal/acceptance prompts and fail-closed missing-protocol
  guard. This shortcut does not itself authorize live navigation.
- [x] Retain a labelled 56px action, keyboard focus and safe-area placement. Offset
  the expanded menu to avoid covering Start; retain direct End during navigation.
- [ ] Accept on the deployed device later, alongside the user's deferred sat-nav
  testing. Controlled checks do not establish real GPS/navigation acceptance.

### Remaining feature work, separate from deferred road testing

1. Continue the Overpass consumer queue: charging, pharmacy, hospital and groceries
   POIs, then along-route coverage, one category/path per increment. Fuel/Food
   already have the reviewed fallback work; do not redo or assume other categories
   share that behavior.
2. Extend the compact UI treatment to remaining saved-route/history/statistics/
   settings surfaces, preserving their existing actions and accessibility.
3. Complete remaining unit audit decisions, including UK vs US gallon policy and
   any additional physical-unit inputs discovered. Real foreign-currency costs
   need a separately reviewed dated exchange-rate source and conversion contract.
4. Later, add station-level fuel prices only after official Fuel Finder API access,
   schema/terms and UK/NI coverage are verified. Current national weekly estimates
   are not station-price or cheapest-fuel recommendations.
5. Keep arrival/entrance evidence work and original lane/speed/Overpass acceptance
   items on their existing trackers; the floating shortcut does not relax them.

Operator evidence in this conversation confirms live GOV.UK acquisition on VPS1,
service-account snapshot reads, the app restart/HTTP 200 and installation/enabling
of the refresh timer. Its first service run was correctly THROTTLED. A due-time
scheduled acquisition and browser route-source verification remain to be recorded;
no production changes were made from this development workspace.

Floating-action validation: 142 JavaScript suites / 3,056 tests, test lint and
coverage floors passed; declared backend selection 2,073 passed, one platform
skip and 74 subtests. The production map-action browser harness passed at
320×640, 390×844, 844×390 and 1280×800 in light/dark themes, with selected-plan
and live-overlay fixture states. It checked Start above Map while the panel is
closed, the production chooser wrapper and missing-protocol refusal, keyboard
activation, menu/overlay bounds, touch targets and unobstructed End access.
No real GPS, camera permission, provider call or live navigation was exercised.
No production deployment was performed.


## Nearby charging POI increment (8 November 2026)

- [x] Continue the existing EV Charge button's nearby search: usable TomTom first,
  bounded shared Overpass nodes/ways/relations on empty/unavailable primary and
  existing Nominatim last resort after map acquisition failure.
- [x] Preserve source/cache dates, validate geographic/radius bounds and retain
  unknown/partial coverage rather than treating failure as no chargers.
- [x] Show reported operator/network/socket details without live availability,
  compatibility, tariff, charging-speed or entrance guarantees. Preserve EV costs.
- [x] Use stale-result cancellation, selected distance units and the existing
  route planner; qualify empty/error states and escape provider text.
- [ ] Record live VPS/provider and device acceptance after deployment. Controlled
  Northern Ireland cases do not establish live national coverage.

See [Overpass item 6c](OVERPASS_CONSUMER_AUDIT.md#item-6c--nearby-ev-charge-2026-11-08)
for validation and scope. Next category: Pharmacy, followed by hospital and
Groceries, each separately. The existing UI, unit, arrival and deferred road
acceptance workstreams remain alongside this queue.


## Nearby Pharmacy POI increment (8 November 2026)

- [x] Preserve usable TomTom first; add bounded shared Overpass pharmacy nodes/
  ways/relations after empty/failed/unusable primary results and keep the existing
  Nominatim last resort after failed map acquisition.
- [x] Retain source/cache timestamps, exact pharmacy category semantics and
  independent distance/radius checks. Separate mapped-empty from unknown coverage.
- [x] Label hours/operator as reported and services/stock/access as unverified;
  keep selected distance units, stale-result protection and existing route planning.
- [ ] Complete live VPS/provider and device acceptance after deployment; synthetic
  Northern Ireland samples do not prove live UK-wide coverage.

See [Overpass item 6d](OVERPASS_CONSUMER_AUDIT.md#item-6d--nearby-pharmacy-2026-11-08).
Next nearby category is Hospital, then Groceries. Existing arrival, unit, UI and
user-deferred sat-nav acceptance work remains alongside this increment.


## Nearby Hospital POI increment (8 November 2026)

- [x] Keep the existing hospital/clinic scope and usable TomTom first; add bounded
  shared Overpass nodes/ways/relations after empty/failed/unusable primary results,
  with the existing Nominatim last resort after failed map acquisition.
- [x] Distinguish reported hospitals/clinics and retain unknown third-party types;
  do not infer current services, emergency care, opening or vehicle entrances.
- [x] Preserve source/cache timestamps, radius/distance checks, selected units,
  escaped reported details, stale-result protection and existing route planning.
- [ ] Record live VPS/provider and device acceptance after deployment. Synthetic
  NI coordinates and controlled browser checks do not establish live coverage.

See [Overpass item 6e](OVERPASS_CONSUMER_AUDIT.md#item-6e--nearby-hospital-and-clinics-2026-11-08).
Next nearby category is Groceries. The existing arrival, unit, UI, along-route
and user-deferred sat-nav acceptance work continues alongside this increment.


## Nearby Groceries POI increment (8 November 2026)

- [x] Preserve supermarket/greengrocer/convenience categories and usable TomTom
  first; add bounded shared Overpass nodes/ways/relations after empty/unavailable/
  unusable primary results and retain the existing Nominatim last resort.
- [x] Show mapped shop types/hours/operator as reported; retain unknown third-party
  shop types and unverified stock, current opening and vehicle access.
- [x] Preserve source/cache provenance, radius/distance checks, selected units,
  escaped text, stale-result protection and the existing route planner.
- [ ] Record live VPS/provider and device acceptance after deployment. Synthetic
  NI records and controlled browsers do not establish live nationwide coverage.

See [Overpass item 6f](OVERPASS_CONSUMER_AUDIT.md#item-6f--nearby-groceries-2026-11-08).
The listed nearby quick-button category increments now have controlled checks.
Next in the original functional queue is bounded along-route POI acquisition,
without several unbounded provider queries per route. UI/unit/arrival follow-ups
and the user's deferred sat-nav acceptance remain alongside this work.


## Along-route POI increment (8 November 2026)

- [x] Bound requests and route geometry; use at most three distance-spaced windows,
  one batched shared Overpass query after unusable primary results and one last-
  resort lookup, under a cooperative whole-operation budget.
- [x] Retain original category meanings, provenance, truthful provider sources,
  independent route-relative proximity and incomplete/sampled coverage labels.
- [x] Preserve unverified access/entrance/stock/service/compatibility status; do not
  label straight-line offsets as driving detours or ahead-of-driver results.
- [x] Remove fabricated GPS-origin fallback; bind requests, panels and markers to
  the captured plan and clear stale results when geometry or search changes.
- [x] Preserve existing planning and selected units; state clearly that selecting
  a result replaces the destination, rather than silently adding a stop.
- [ ] Accept on the deployed VPS/device with real long routes, provider outages,
  sparse gaps, selection changes and Northern Ireland data. Controlled tests do
  not establish live coverage, reachability or GPS/navigation behavior.

See [Overpass item 7](OVERPASS_CONSUMER_AUDIT.md#item-7--bounded-along-route-poi-search-8-november-2026).
Keep arrival/access and remaining SCDB/source maintenance acceptance separate.
The parallel compact saved/history/settings UI and remaining unit-policy work
can continue while the user defers road testing.

## Compact saved routes and trip history (8 November 2026)

- [x] Replace full-width row actions with wrapping icon-and-text controls, visible
  labels, keyboard focus and minimum 48px targets; retain save, search and Map.
- [x] Support light/dark themes, narrow/landscape screens and enlarged text;
  wrap long journey names and addresses without horizontal scrolling.
- [x] Escape stored display text and serialize typed action IDs safely; preserve
  saved-route review, fresh-GPS eligibility, local/server history, confirmations,
  stored costs and canonical distance metadata for selected-unit refresh.
- [x] Validate 2,221 backend tests (one skipped), 3,097 JavaScript tests with
  coverage, lint and 16 controlled browser combinations (four viewports,
  light/dark, 100%/200% text). Browser fixtures exercise production renderers,
  CSS and unit helpers with action spies; they do not establish deployed
  authentication, persistence, live navigation or GPS acceptance.
- [ ] Accept on the deployed app/device. Deployment is a separate user action.

Continue the parallel settings/statistics UI, remaining unit-policy and
source-maintenance work; retain the user's deferred sat-nav acceptance tasks.

## Compact Settings controls (8 November 2026)

- [x] Replace ordinary full-width actions with compact, wrapping icon-and-label
  controls: Back/Map, privacy notice, zone information, traffic update, departure
  analysis, app refresh/update and route recalculation. Keep existing handlers.
- [x] Associate native select labels, name empty toggle buttons, enlarge toggle
  hit areas without changing the controller-owned active class, and provide
  visible keyboard focus, wrapping native controls and readable dark help text.
- [x] Preserve all existing control IDs, values, options/defaults, hidden account
  and billing sections, avoidance refusal text and selected-unit persistence.
  Authentication, billing and preference-controller behavior is unchanged.
- [x] Validate 2,221 backend tests (one skipped), 3,102 JavaScript tests with
  coverage, lint, and controlled browser checks at four viewports in light/dark
  with 100%/200% text. Browser uses production markup/CSS and the unit controller;
  account, navigation and API boundaries are fixtures, not live acceptance.
- [ ] Accept on the deployed app/device, including signed-in/premium views and
  screen-reader state announcements. This increment names switches but does not
  replace their existing class-based state ownership with ARIA switch semantics.

Keep statistics UI, remaining units/source maintenance and the user's deferred
sat-nav acceptance alongside this work. No production deployment is automatic.

## Group Settings by effect (8 November 2026)

- [x] Add nine native expandable groups: Units & currency, Smart routing, Route
  preferences, Traffic & navigation, Stops & departure, Map & display, Voice &
  alerts, Parking, and Account & app. Units opens initially; groups remain mounted
  so existing controllers can restore preferences while a group is closed.
- [x] Move speedometer visibility out of Units; place avoidance enforcement and
  charge-zone information beside mapped avoidances. Explain that enforcement also
  applies to road-type avoidances and that map layers/alerts are separate.
- [x] Move traffic-aware planning/closure/incident controls out of Multi-Drop;
  retain stop/departure controls together. Label destination predictions as
  suggested journeys, separately from hazard routing.
- [x] Preserve control IDs, values/options/defaults, handlers and persistence;
  open the account disclosure before existing sign-in/Premium shortcuts scroll.
  Unconfigured Premium remains hidden and retains its existing status message.
- [x] Validate 2,221 backend tests (one skipped), 3,104 JavaScript tests with
  coverage, lint, and controlled browser layouts/keyboard disclosures/actions/unit
  persistence plus account shortcuts across four viewports, light/dark, and
  100%/200% root text. API/auth/navigation are fixtures, not live acceptance.
- [ ] Accept on deployed devices with signed-in/Premium views and assistive
  technology. Deployment remains separate; no routing policy or schema migration.

Statistics remains the next UI milestone. Keep source maintenance, remaining unit
policy and the user's deferred live sat-nav acceptance alongside this increment.

## Compact Statistics (8 November 2026)

- [x] Replace inline dashboard styling and full-width return action with semantic
  summary/breakdown cards, wrapping frequent-route cards and a compact Map action.
  Match existing collection light/dark tokens, focus styles and 48px action targets.
- [x] Preserve all metric IDs, analytics requests, authentication/Premium refusal,
  calculations, cost presentation and canonical distance/speed metadata. Retain
  ranking/count/average cost; escape frequent-route text with a safe default.
- [x] Verify production renderer/controller and unit helpers with 3,108 JavaScript
  tests, coverage and lint; 2,221 declared backend tests passed (one skipped).
  All 16 browser combinations passed (four viewports, light/dark, 100%/200% root
  text), including API response rendering, keyboard return, distance/speed changes,
  long addresses and empty history. API/auth/navigation boundaries are fixtures.
- [ ] Accept deployed account/Premium data and real device rendering. No production
  deployment, analytics calculation change or new filters in this increment.

Keep source maintenance, remaining units/accessibility work and deferred live
sat-nav acceptance alongside these UI increments.

## Settings switch state accessibility (8 November 2026)

- [x] Give all 34 Settings pill controls `role="switch"` and an initial boolean
  `aria-checked`, retaining native button keyboard activation and existing names.
- [x] Synchronize checked state in the shared toggle helper and legacy AR/route
  traffic-light owners. Keep ordinary pressed buttons and native checkboxes intact;
  do not add click handlers, observers, duplicate persistence or routing changes.
- [x] Restore the route-traffic-light control from its existing saved state on DOM
  readiness, so its default active markup cannot contradict a saved off choice.
- [x] Check preference restoration, pending/confirmed/rejected API changes, fallback
  rendering, keyboard Enter/Space and Chromium accessibility-tree checked state.
  Validate 3,115 JavaScript tests with coverage/lint, 2,221 backend tests (one
  skipped), and all 16 browser viewport/theme/root-text combinations.
- [ ] Confirm spoken announcements using real screen readers on deployed devices.
  Browser accessibility-tree checks do not establish VoiceOver/TalkBack/NVDA speech.

Keep source maintenance, remaining unit policy and deferred sat-nav acceptance
alongside this UI work. Production deployment remains a separate user action.

## Settings distance-option units (9 November 2026)

- [x] Add canonical metre metadata to the 24 options in six controls: parking
  walking allowance, three turn-announcement distances, hazard warning distance
  and roadside alert distance. Reuse the existing distance-label formatter for
  feet/miles or metres/kilometres; mark the parking distance as approximate.
- [x] Refresh labels on first Settings entry as well as unit changes and profile
  restoration. Keep select/option nodes, values, selected/default choices and
  handlers intact: parking remains minutes and alert thresholds remain metres.
  Label refresh dispatches no preference changes and performs no acquisition.
- [x] Validate production controllers/formatter with 3,121 JavaScript tests and
  coverage/lint, plus 2,221 backend tests (one skipped). Controlled browser checks
  exercise first entry, unit round trips, stable option values/selections and
  accessible combobox labels alongside existing Settings regressions.
- [ ] Accept on deployed devices, including native option pickers and saved profiles.
  No new distance policy, alert trigger change or production deployment is included.

Keep the other unit-policy/source maintenance and deferred live navigation and
screen-reader acceptance work alongside this focused fix.

## Spoken distance preferences (9 November 2026)

- [x] Audit the route-to-speech path: Valhalla requests use kilometres, while its
  verbal alert/pre-transition strings previously overrode selected miles wording.
- [x] Reject conflicting recognised English distance clauses in provider speech
  and use existing unit-aware maneuver fallback wording. Preserve compatible and
  distance-free provider guidance, canonical road names and roundabout exit checks.
  Do not rewrite arbitrary instruction text or translate unrecognised/localised
  phrasing; this guard covers the English distance forms used by this integration.
- [x] Verify hazards/destination milestones already read the selected distance unit.
  Keep canonical metre thresholds, existing rounded speech, hysteresis, deduplication,
  priorities, camera mute/chime policy and stored route data unchanged. Speed-unit
  wording is not reinterpreted as a distance clause.
- [x] Add regression cases for metric/imperial aliases, numeric/word/fractional
  quantities, imminent/keep/roundabout guidance and preference changes. Controlled
  Chromium checks pass through production preference/announcement/speech controllers
  to a captured native-TTS bridge, without actual GPS, audio or provider acquisition.
- [ ] Accept actual spoken audio on deployed devices. Native-TTS capture does not
  establish real speech pronunciation, hardware output or live navigation behaviour.

Continue the separate parking-result/shared-route/summary unit audit and source
maintenance alongside the user's deferred live sat-nav and screen-reader checks.

Spoken-unit validation: 3,141 JavaScript tests passed with coverage/lint; 2,221
backend tests passed (one skipped). The controlled speech-pipeline check passed
mi/km/mi changes with stable thresholds and captured turn/hazard/destination text.

## Navigation uniformity and map theme follow-up (9 November 2026)

User-requested additions; complete each increment separately and preserve existing
handlers, persisted choices, permissions, navigation safety and device acceptance.

- [ ] Navigation routing controls: align Auto/Walk/Bike, Calculate route and
  Use current GPS as start with the app's compact labelled-icon design. Preserve
  the primary calculation action, selected routing mode and real-GPS permission path.
- [ ] Voice control card: align Listen, Test speech, transcript/status and Example
  phrases with the same action styles, retaining microphone ownership and feedback.
- [ ] Clear All: use a consistent compact labelled action and preserve the existing
  clearing scope/confirmation and GPS/navigation cleanup.
- [ ] Save Location: use the same labelled-icon treatment and retain the saved-place
  behavior. Do not confuse this with saving a route or starting navigation.
- [ ] Map contrast, first increment: fix verified low-contrast Dark-style paths,
  overview roads and water/place labels; test actual MapLibre rendering separately
  from live tile/font coverage. Standard/Satellite need their own acceptance.
- [ ] Theme controls, next investigation: verify UI/map coupling (default linked),
  Satellite persistence on startup, rapid theme changes, style-load callbacks and
  raster fallback. The current fallback can select a light raster for Dark; inspect
  this separately rather than silently changing preference behavior in a palette fix.
- [ ] Map UI follow-up: investigate inherited text/control contrast and existing
  selectors written as `html.dark-mode, body.dark-mode .component`; verify scoped
  styles and actual rendered map controls before changing global CSS.
- [ ] Deployed acceptance: confirm the affected theme(s), readable roads/labels at
  overview and street zooms, dark/light UI combinations and route-overlay contrast.

This queue runs alongside remaining units/source maintenance and deferred live
sat-nav/screen-reader acceptance. No automatic deployment is included.

User clarification: the unreadable theme was the UI theme. Dark UI should pair
with Dark map; investigate lost route polylines on Dark/Satellite as the next
functional increment. Prioritise Dark UI component scoping/readability first.
The basemap palette finding is recorded separately and is not part of this fix.

- [ ] Restore route polylines after Dark/Satellite style changes, including both
  planning alternatives/selected previews and active-navigation overlays. Reproduce
  style-replacement removal and verify geometry, selection and layer ordering.

## Dark UI readability, first focused fix (9 November 2026)

- [x] Correct 133 component selectors so `html.dark-mode .component` targets the
  component rather than `html` itself. Retain intentional root variables/rules and
  the body-class path; cover early boot before the body class is applied.
- [x] Improve dark Navigation action text contrast and native MapLibre zoom/compass/
  attribution controls. Filter only native control icons; never the map canvas,
  tiles, route lines or vehicle markers. Preserve handlers and existing layouts.
- [x] Verify existing default UI/map linking: selecting Dark UI loads Dark map, and
  selecting Standard map returns to light UI. No new preference/coupling policy.
- [ ] Next functional increment: reproduce/fix lost selected/alternative/navigation
  polylines after Dark/Satellite style replacement. MapLibre removes custom sources
  and layers during `setStyle`; preview mounting currently listens once when a
  route is drawn, rather than restoring every later theme change. Active-navigation
  recovery is separate and needs its own regression before changing ownership.
- [ ] Continue the queued Navigation icon/layout items and remaining inline-panel/
  popup/theme-fallback contrast acceptance one increment at a time.

Browser checks use real MapLibre controls and theme controllers with empty local
style fixtures. They establish UI contrast/keyboard/default linking, not live
roads, labels, tiles, Satellite imagery or route-overlay restoration. No deployment.

Dark UI validation: 3,146 JavaScript tests passed with coverage/lint; 2,221 backend
checks passed (one skipped). Sixteen real-MapLibre UI cases cover four viewports
with html-only/body-only/both Dark classes and light mode; tested Navigation text
contrast is at least 4.5:1. Ten route-preview cases also retain controls/notices.
These measurements are scoped checks, not an app-wide accessibility certification.
The existing 16-case Settings matrix also passed after the shared CSS correction,
including unit labels, keyboard actions, switch accessibility and account shortcuts.
