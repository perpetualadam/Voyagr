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

- [x] Navigation routing controls: align Auto/Walk/Bike, Calculate route and
  Use current GPS as start with the app's compact labelled-icon design. Preserve
  the primary calculation action, selected routing mode and real-GPS permission path.
- [x] Voice control card: align Listen, Test speech, transcript/status and Example
  phrases with the same action styles, retaining microphone ownership and feedback.
- [x] Clear All: use a consistent compact labelled action and preserve the existing
  clearing scope/confirmation and GPS/navigation cleanup.
- [x] Save Location: use the same labelled-icon treatment and retain the saved-place
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

- [x] Restore route polylines after Dark/Satellite style changes, including both
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
- [x] Next functional increment: reproduce/fix lost selected/alternative/navigation
  polylines after Dark/Satellite style replacement. MapLibre removes custom sources
  and layers during `setStyle`; preview mounting currently listens once when a
  route is drawn, rather than restoring every later theme change. Active-navigation
  recovery is separate; its regression passed without changing ownership (see below).
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

## Preview polylines across map themes, second focused fix (9 November 2026)

- [x] Restore successfully mounted selected/single previews or all alternatives
  after a complete MapLibre style replacement. Retain displayed geometry/colour
  identity and arrival markers without selecting a route, moving the camera,
  recalculating, fetching traffic/hazards or granting navigation authority.
- [x] Revoke restoration on clear/replacement; refuse stale maps, pending journey
  commits, active navigation, surviving/foreign resources and renderer re-entry.
  Clean up failed preview batches while preserving newer work.
- [x] Regress the existing verified active-navigation style recovery separately;
  leave its ownership and eligibility checks unchanged.
- [ ] Confirm these changes on deployed live Satellite imagery and real devices.
  Navigation icon/layout, basemap palette, theme persistence/fallback and remaining
  inline-panel/popup contrast work remain queued above.

This completes the local preview-restoration increment recorded above. Validation:
3,156 JavaScript tests passed with coverage/lint; 2,221 backend tests and 74 subtests
passed (one skipped). Twelve real MapLibre browser cases cover single/all previews
at mobile/desktop sizes across Dark, Satellite and Standard, plus rapid changes
and clearing during reload. Fixtures use local styles/raster tiles, not live map
coverage. No production deployment or configuration changes.

## Theme overlay parity and GPS start order (9 November 2026)

Completed sequentially: overlay investigation/repair, then the requested GPS layout
move. Existing compact Navigation action redesign remains a separate queued item.

- [x] Restore missing enabled traffic/weather raster layers on the current idle
  map, including differential style changes that do not run the style-load path.
  Respect traffic backoff and available credentials; do not repeatedly acquire
  configuration on idle or turn disabled overlays back on.
- [x] Restore already displayed along-route congestion segments after a complete
  style replacement. Retain route geometry identity and refuse cleared, disabled,
  loading, replaced-map or coincident-resource contexts. Reuse the displayed data;
  normal refresh scheduling/data provenance remain unchanged.
- [x] Prevent late/outdated camera viewport results from repopulating disabled
  cameras, overwriting a newer viewport or mounting on a replaced map/runtime.
- [x] Verify speed/red-light/average-speed camera, traffic-light, railway-crossing
  and route-hazard HTML marker icons/popups across all three themes. These DOM
  markers survive style changes and do not require layer remounting.
- [x] Move the existing Use current GPS as start checkbox above Routing Mode and
  Calculate route. Preserve its ID, associated label, handler and GPS permissions.

Validation: 3,178 JavaScript tests passed with coverage/lint; 2,221 backend tests
and 74 subtests passed (one skipped). Real MapLibre browser checks cover twelve
single/all-route and mobile/desktop theme combinations, interactive marker popups
and overlay toggles, traffic/weather layers, rapid theme changes and cleared
previews. Existing verified-navigation recovery is regressed for all three themes.
Sixteen Navigation layout/theme cases verify GPS control order and existing dark
UI contrast/linking. Browser map/API data and tiles are local fixtures: this does
not establish live provider availability, real GPS accuracy, SCDB freshness or
complete OSM coverage. Satellite remains an imagery basemap; vector-only native
labels/3D buildings require their source and are not fabricated. Deployed/live
map and device acceptance remain outstanding. No production deployment.


## Compact Navigation routing controls (9 November 2026)

- [x] Replace emoji-only decoration and expanding mode buttons with distinct
  decorative SVG icons plus visible Auto/Walk/Bike labels and 68px touch targets.
  Keep the existing button IDs, mode values, event handlers and vehicle selection.
- [x] Keep a selected check mark and synchronise aria-pressed from the existing
  mode handler, including restored settings. Native buttons retain Enter/Space
  keyboard behavior; decorative icons/checks do not alter accessible names.
- [x] Make Calculate route a compact labelled-icon primary action. Scope the layout
  to Navigation planning controls, preserving dashcam, saved-place and journey
  chooser controls which share older button classes. GPS start stays above modes.
- [x] Verify wrapping, focus rings, contrast and keyboard-triggered mode persistence/
  calculation in the existing 16-case light/dark Navigation browser matrix at
  320px, 390px, landscape and desktop sizes. No horizontal overflow; tested action
  text has at least 4.5:1 contrast. Map/provider/GPS boundaries are fixtures.
- [x] Voice controls, Clear All and Save Location completed as separate increments.

Validation: 3,178 JavaScript tests with coverage/lint and 2,221 declared backend
checks plus 74 subtests passed (one skipped). Existing calculation, GPS permissions
and live navigation authority remain unchanged. No production deployment.


## Voice controls and provider-independent transcription (9 November 2026)

- [x] Compact labelled microphone, Test speech and Cancel actions; accessible
  status/transcript, engine choice, keyboard focus and Example phrases disclosure.
- [x] Investigate Picovoice licensing/dependencies: Porcupine is optional wake
  activation; Listen already uses browser recognition. Keep existing wake support.
- [x] Fix UK language, duplicate end handlers/commands, interim-only execution,
  microphone/start errors, cancellation/background/provider races and mic/TTS
  competition without changing the command parser or navigation eligibility.
- [x] Add an optional server-configured OpenAI-compatible transcription adapter,
  supporting compatible self-hosted or hosted engines. Browser remains default;
  model, endpoint and credentials stay on the server. No automatic engine fallback.
- [x] Bound recording/upload/response size, recording time, provider transport,
  same-origin access, request rates and concurrent upstream work. Release microphone
  tracks and reject late results after cancellation; store no recordings in Voyagr.
- [ ] Choose/configure and benchmark an actual AI service before enabling it.
  Validate codecs, quotas, target phones, real microphones, UK accents/places, road
  noise, interruptions and wake handoff. No provider was contacted in tests.
- [ ] Investigate a separately licensed, browser-suitable wake phrase replacement;
  transcription support does not replace Porcupine wake detection. openWakeWord's
  browser porting and pre-trained model licensing need separate evaluation.
- [x] Clear All and Save Location completed individually in the following increments.

Research, source links and the disabled-by-default configuration contract are in
[VOICE_PROVIDER_RESEARCH.md](VOICE_PROVIDER_RESEARCH.md). Eight real browser cases
use generated audio through actual MediaRecorder and production controllers;
recognition/transcription/synthesis boundaries are fixtures. Sixteen existing
Navigation cases retain dark/light contrast, GPS order and mode keyboard behavior.
Validation: 3,198 JavaScript tests with coverage/lint; 2,244 declared backend tests
and 74 subtests passed (one skipped). No deployment, model download, new paid
subscription or production configuration change.


## Compact Clear All action (9 November 2026)

- [x] Replace the full-width action with a compact labelled eraser icon button,
  preserving Clear All's existing handler. Scope styles to its Navigation wrapper;
  retain light/dark contrast, 48px hit height and a visible keyboard focus ring.
- [x] Fix the existing missing-result-node exception: current Navigation markup no
  longer contains the legacy `result` element. Treat it as optional so parking
  cleanup and automatic GPS refresh can complete. Retain legacy-node support.
- [x] Regress existing form/pending-address clearing, marker/route handle removal,
  parking cleanup calls, map reset, automatic/manual GPS choice and active-journey
  refusal. Keep saved locations and settings outside the clearing scope. Do not
  redesign remaining visits, durable journey ownership or planning state here.
- [x] Verify native keyboard activation, compact width, touch target, focus and
  contrast in the existing sixteen Navigation viewport/light/dark browser cases.
- [x] Save Location completed in the next separate increment below.

Validation: 3,201 JavaScript tests with coverage/lint; 2,244 backend tests and 74
subtests passed (one skipped). The focused Clear All and durable-journey regression
selection passes. Browser map/device boundaries are fixtures; deployed/device
acceptance remains pending. No production deployment or configuration change.


## Compact Save Location action (9 November 2026)

- [x] Replace the expanding purple/emoji button with a compact labelled SVG star
  action consistent with Clear All and the rest of Navigation. Keep the existing
  handler, button class, name/category prompts and favourites API/authentication.
- [x] Scope light/dark surface, icon, text, hover and keyboard-focus styles to the
  Save Location wrapper; retain 48px touch height and a visible text label.
- [x] Exercise the production favourites owner through the rendered button with
  native keyboard activation: one authenticated create request, unchanged address/
  coordinate/category payload and favourites grid refresh. Cancelling the name
  prompt sends no request. Transport/identity/location are test boundaries.
- [x] Complete the listed Navigation action styling queue: routing modes and
  Calculate route, voice controls, Clear All and Save Location.

Validation: 3,201 JavaScript tests with coverage/lint, 2,244 backend tests and 74
subtests passed (one skipped). Sixteen real Chromium Navigation cases cover four
viewports and light/html-only/body-only/both Dark classes, with 44px+ targets,
compact widths, keyboard focus, no horizontal overflow and at least 4.5:1 tested
action text contrast. Existing GPS start order, theme linking and Clear All checks
remain in the matrix. Saving semantics, real location acquisition and navigation
permissions are unchanged. No production deployment or configuration change.
Remaining source/provider work and deployed map/device acceptance stay separate.

## Satellite selection persistence (9 November 2026)

- [x] Identify two overwrites: early inline startup derives mapTheme from ui_theme,
  then UI restoration/system application can replace Satellite through linked themes.
- [x] Preserve a saved Satellite map during early boot, settings restoration and
  automatic UI/system theme updates. Keep the chosen light/dark/auto UI preference.
- [x] Retain explicit Light/Dark UI picker/toggle behavior: with linking enabled,
  an explicit UI choice still selects the corresponding Standard/Dark map. With
  linking disabled it leaves the selected map alone. No new preference/migration.
- [x] Keep the early-boot helper aligned with the actual inline boot path; update
  theme script cache tags. Existing route/marker ownership code is unchanged.
- [x] Dark mode raster fallback completed in the following independent increment.
- [x] Dark vector road/label palette completed below; live map/device acceptance remains pending.

Validation: 3,222 JavaScript tests with coverage/lint; 2,244 backend tests and 74
subtests passed (one skipped). Eight real MapLibre browser configurations cover
light/dark/automatic UI, light/dark system preference and linking on/off. Each
checks boot, theme settings restoration, two real reloads, active map picker,
explicit UI choices and an explicitly reselected Satellite map; automatic UI
also follows OS changes without replacing imagery. The browser exercises the
production early boot snippet/controllers/settings helper, with unrelated Settings
side effects outside this fixture. Styles/raster tiles/settings transport are local
fixtures, not live Satellite availability or a full installed-PWA acceptance test.
The existing twelve route/traffic/weather/marker theme cases and sixteen Navigation
UI cases pass. This preserves future selections; it cannot infer a Satellite choice
that an earlier release already overwrote. No production deployment/config changes.

## Dark map raster fallback (9 November 2026)

- [x] Confirm the session fallback URL was the light OSM raster style and was reused
  by Dark selection and missing-style recovery. Preserve session fallback mode while
  resolving the current theme independently in both paths, including older helpers.
- [x] Add a bundled monochrome Dark raster style using the same OSM tiles and
  attribution. Use native raster saturation/brightness endpoints to give light tile
  backgrounds a dark tone and dark label pixels a light tone. This paint applies
  only to the basemap raster layer, never the canvas, route lines or HTML markers.
- [x] Keep Standard's existing fallback/custom URL compatibility and Satellite's
  own imagery style. Preserve theme storage, once-per-session fallback gating,
  existing source-loading protections, camera state and navigation ownership.
- [x] Regress actual glyph-error fallback and theme switching with real MapLibre:
  sampled raster background/label pixels, route colour/geometry, marker/popup and
  camera preservation. Cover missing-style recovery with current/missing helpers.
- [x] Dark vector road/label palette completed below at street and overview zooms.
- [ ] Deployed live-tile/device acceptance remains separate.

Validation: 3,229 JavaScript tests with coverage/lint; 2,244 backend tests and 74
subtests passed (one skipped). Ten real-renderer fallback/switch stages start from
Standard or Dark failure, then exercise Dark/Standard/Satellite choices using the
production core error/fallback/idle hooks and preview/theme owners. Raster pixels
are generated fixtures; a light background turns dark, dark label shapes turn
light and the blue route/red marker remain unchanged. Twelve existing route/
traffic/weather/marker theme cases also pass. No live tile availability, complete
raster label coverage or installed-PWA/road test claim; no production deployment.
Vector-only features still require vector data as with the existing raster fallback.

Native paint reference: [MapLibre raster layer properties](https://maplibre.org/maplibre-style-spec/layers/#raster-brightness-min).
The brightness endpoints are deliberately reversed for this tested monochrome
night treatment. Recheck the pixel regression when upgrading the bundled renderer;
no canvas CSS filter or additional tile provider has been introduced.

## Dark vector road and label contrast (9 November 2026)

- [x] Correct near-background paths and overview roads, black water labels and
  dim place text. Use distinct light road interiors, darker casings and pale text
  with dark halos. Align static road text with the existing runtime Dark treatment.
- [x] Preserve source URLs, geometry filters, layer order, zoom ranges, road widths,
  text placement and font stacks. Only Dark vector paint changes; Standard,
  Satellite, overlays and raster fallback retain their existing behavior.
- [x] Version the Dark vector style URL and theme helper script for browser caches.
- [x] Add palette contrast regressions and a real MapLibre browser fixture with
  licensed offline glyphs at mobile/desktop widths and zooms 5, 8, 14 and 17.
- [ ] Check the deployed map with live tiles/fonts and on a real navigation device.
  No deployment or road acceptance is included in this increment.

Validation: 3,250 JavaScript tests with coverage/lint; 2,244 backend tests and 74
subtests passed (one skipped). Nominal composited road interiors reach 3:1 against
selected Dark land surfaces and tested label inks exceed 4.5:1 against their halo
and water background; this is scoped palette verification, not app-wide contrast
certification. Eight offline browser cases exercise actual Dark paint, filters and
label layout with synthetic geographic features, real glyph rendering, sampled
road/path pixels, a blue route and camera popup. The runtime road-label paint helper
is included; live tile density, full production fonts and label collisions still
need deployed acceptance. Twelve existing theme/route/traffic/marker cases and all eleven isolated SQL policy
tests also pass. Pixel sampling runs within a renderer callback to avoid reading
a stale frame.

## Screenshot follow-up: journey chooser (9 November 2026)

- [x] Replace the older chooser's large plain buttons and heading with compact,
  labelled icon actions, a header close control and shared Light/Dark treatment.
  Bound the panel to the viewport and retain internal scrolling for large text.
- [x] Keep all action handlers, status announcements, verified-start visibility,
  GPS accuracy threshold and durable journey ownership checks unchanged.
- [x] Add bounded GPS accuracy improvement below, retaining the 30 m requirement.
  The screenshot confirms refusal, not the real device/location cause.
- [x] Reproduce and prevent plain-plan abandonment from latching false storage
  recovery (see following increment). Existing mismatches still require recovery.
- [ ] Validate the user's actual restored journey if recovery persists after reload;
  the screenshot alone cannot establish a corrupt record.
- [ ] Check the deployed chooser on the user's mobile browser/PWA.

Validation: eight real Chromium cases cover mobile/desktop widths, Light/Dark UI
and 150% root text size, viewport bounds, horizontal overflow, minimum action
height, unchanged handler dispatch, hidden verified start and keyboard close.
3,250 JavaScript tests pass with coverage/lint; 2,244 backend tests and 74 subtests
pass (one skipped). This increment changes presentation
only; the GPS and storage warnings remain separate functional investigations.

## Plain-plan abandonment and false recovery (9 November 2026)

- [x] Reproduce End previous journey on a fresh inspection plan without live
  guidance, a continuation, journey identity or observed storage ownership. The
  old flow confirms, enters abandonment, then latches durable recovery because it
  cannot find an owner. That unnecessarily blocks subsequent GPS navigation.
- [x] Hide the action for this case and return a no-op explanation on direct calls,
  before confirmation, intent cancellation, guidance stops or persistence staging.
  This does not prove IndexedDB is empty and does not grant navigation permission.
- [x] Preserve existing behavior for live/retained/restored journeys, observed
  ownership, missing/legacy modules, owner changes and failed rollback. Never adopt
  a newer owner, clear records or reset an existing recovery flag in this fix.
- [x] Version the journey modes script; retain all GPS/route safety checks.
- [ ] Deployed device validation. A session already latched in recovery still needs
  a reload and inspection; this change does not silently clear that flag or storage.
- [x] Bounded GPS acquisition completed below; retain the 30 m requirement.

Focused regressions use production journey/persistence logic and fake IndexedDB:
plain-plan no-op leaves the intent token and store unchanged, the next GPS attempt
still reaches the accuracy gate, an unobserved record from another session remains
untouched, and an unrelated selection with known ownership still requires recovery.
Existing stale-owner, legacy-record, timeout, rollback and abandonment tests remain
in force. This is a reproduced cause of the warning, not proof of the precise
sequence in the user's screenshot. No production data/configuration changes.

Validation for this increment: 3,253 JavaScript tests with coverage/lint; 2,244
backend tests plus 74 subtests passed (one skipped); eleven isolated SQL policy
tests and eight existing chooser browser/layout cases passed. No deployment.

## Bounded GPS accuracy improvement (9 November 2026)

- [x] Keep the immediate path for a fresh accurate initial fix. When the first
  observation is coarse/stale/invalid, use a temporary high-accuracy watch if both
  watchPosition and clearWatch are available; otherwise retain visible refusal.
- [x] Keep the existing 12-second total acquisition budget, fresh timestamp checks,
  valid coordinates and 30 m accuracy requirement. Repeated readings never extend
  the budget, and a wall-clock check refuses callbacks after browser suspension.
- [x] Release the owned watch and timer on success, cancellation, permission denial,
  deadline or startup failure. Fence late callbacks and unregister cancellation.
  Transient watch errors may recover within the remaining budget.
- [x] Apply to the existing initial GPS, post-response GPS and GPS-stop acquisition
  callers. Route assessment, location-movement checks, lifecycle transactions,
  durable ownership and continuous navigation GPS tracking are unchanged.
- [x] A cancelled GPS-stop request cannot add a stop or overwrite newer status.
- [x] Version the journey script for caches; no new provider or location storage.
- [ ] Real-device/browser GPS acceptance outdoors and with coarse indoor readings.
  Waiting cannot guarantee that the receiver achieves the required accuracy.

Validation: 3,268 JavaScript tests with coverage/lint; 2,244 backend tests plus 74
subtests passed (one skipped); eleven isolated SQL policy tests passed. Fifteen
new journey regressions cover improvement to the 30 m boundary, persistent coarse/
stale/invalid updates, the unextended deadline, wall-clock expiry, transient errors,
denial, cancellation/late callbacks, synchronous adapters, watch-start failure,
post-response acquisition and GPS stops. A real Chromium integration exercises the
production GPS-stop caller with deterministic position callbacks and verifies
watch release, no premature stop addition, cancellation, denial and expiry. These
fixtures do not measure actual satellite reception or guarantee road navigation.
No production deployment or configuration/data change.

## Mapped-road waiting and concise journey information (9 November 2026)

- [x] Add a cancellable Waiting for a mapped road state for fresh GPS starts whose
  returned route has a start-only endpoint gap. Guidance stays off; the selected
  plan and durable journey are not replaced or saved while waiting.
- [x] Retry the full GPS/request/assessment/lifecycle path after at least 10 seconds
  and 5 m movement, or after 30 seconds with a fresh stationary reading. Movement
  triggers a request, never permission. Keep a five-minute total wait budget across
  retries and release the owned watch on retry, exit, timeout or error.
- [x] Cancel on destination/selection/simulation/planning changes. Preference changes
  invalidate the captured request; offline, denied or failed location callbacks end
  waiting. Reopening controls preserves waiting and disables competing start actions.
- [x] Do not treat destination gaps, another unresolved leg, invalid geometry,
  mandatory conflicts or unrelated origin failures as start-only waiting. Existing
  active guidance replacement retains its prior behavior.
- [x] Put static explanations and full diagnostics behind native keyboard-accessible
  Info disclosure. Keep a short announced status and primary actions visible, with
  explicit guidance-off wording during waiting. Version CSS/journey scripts.
- [ ] Deployed car-park/road acceptance. The existing backend numerical continuity
  threshold and live GPS/movement checks are unchanged. This is a waiting/retry
  workflow, not a new road-matching algorithm or proof of legal car-park access.
- [ ] Investigate arrival/destination access separately when that is the blocker;
  waiting at the origin cannot resolve a destination gap.

Validation: 3,284 JavaScript tests with coverage/lint; 2,244 backend tests plus 74
subtests passed (one skipped), and eleven isolated SQL policy tests passed. New production-mode regressions cover no guidance/persistence while
waiting, movement and stationary retries, successful full lifecycle after a new
checked response, exit/endpoint/preferences/selection/simulation cancellation,
non-start-gap refusals, five-minute timeout and reopening controls. Eight Chromium
chooser cases check Light/Dark, mobile/desktop, enlarged text, collapsed/open Info,
action dispatch, viewport bounds and keyboard close. Location/provider inputs use
fixtures; real mobile GPS/road matching and deployment remain unverified.

The final retry rechecks the intent, selection and preference-bound request after
the movement promise resolves; a destination change in that microtask gap cannot
start a fresh request. The timing regression is included in the totals above.

## Immediate navigation view (9 November 2026)

- [x] Wire the floating and preview Start actions to one immediate startup owner,
  rather than opening the mode chooser first. Keep simulation as a separate action.
- [x] Validate usable selected geometry, reveal the map and compact Navigation card
  synchronously, then acquire/reassess in the background. Repeated Start taps share
  one pending promise; cancel/restart cannot let an older completion hide a new one.
- [x] Fast-path a still-valid selected route with a fresh actual fix at its origin
  through the existing lifecycle without another GPS call or route API request.
  Retained/restored continuations continue through their existing fresh-GPS path.
- [x] Show an owned marker only from observed GPS coordinates and center the entry
  view on that position. Never synthesize vehicle movement from route geometry.
  Success/cancellation removes the temporary marker without removing the plan.
- [x] Show concise finding/updating/starting status, Retry after a refusal, Cancel,
  and full details behind Info. Keep chooser and pending card from overlapping.
- [x] Preserve lifecycle ownership, persistence and route/movement checks. Entry
  presentation is separate from permission to issue location-dependent turns.
- [ ] Deployed mobile acceptance. The map opens without GPS/network delay, but
  spoken/turn guidance still depends on a usable position and the existing checks.
  Physical GPS/provider availability and car-park road matching are not established
  by the fixture tests. No automatic production deployment is included.

Validation: 3,291 JavaScript tests with coverage/lint; 2,244 backend tests plus 74
subtests passed (one skipped); eleven isolated SQL policy tests. Seven new startup
regressions cover immediate view, duplicate taps, cached-fix lifecycle start without
network, denial/retry, route changes, observed marker cleanup, missing route and
cancel/restart ownership. Four real MapLibre browser cases cover mobile/desktop
Light/Dark, synchronous view before GPS, background acquisition, observed position,
keyboard cancellation and selected-polyline preservation. Start action integration
checks now target the common immediate owner. No safety assertions were weakened.

## GraphHopper route recalculation — investigated

- [x] Investigate GraphHopper route recalculation: triggers during navigation,
  requests/responses, off-route detection, repeated or stale requests, remaining
  stops, selected avoidance preferences and safe replacement of the active route.
  Reproduce and report findings before changing behavior; handle one issue at a
  time and preserve existing navigation functionality.

Findings: [GraphHopper recalculation investigation](GRAPHHOPPER_RECALCULATION_INVESTIGATION.md).

- [x] Trace the final outgoing request: normal canonical remaining-stop
  preservation is present in integrity augmentation; intermediate-builder omission
  alone is not a stop-loss defect.
- [x] First fix: assess eligible alternatives before the first returned route can
  block a usable GraphHopper candidate; retain all integrity gates.
- [x] Clarify engine continuity within known selected route types and established
  preferences; retain permitted best effort as fallback and announce engine changes
  only after confirmed replacement (see following increment).
- [ ] Extend coverage for legacy/malformed leg metadata and durable replacement
  while retaining normal stop/provenance preservation.
- [ ] Capture a real-device recalculation trace after fixes; separately exercise
  slow/hanging transport and report actual engine timings.

## Automatic reroute eligible alternatives (9 November 2026)

- [x] Validate geometry/instructions and integrity for every returned candidate,
  then apply the existing source/name picker to eligible routes. A refused or
  malformed first candidate cannot veto a permitted later GraphHopper candidate.
- [x] Ignore non-object response entries before request provenance tagging.
- [x] Retain the current route when none qualify; provide a refusal reason and
  clear the in-progress flag without opening a confirmation while moving.
- [x] Retain the map owner's independent final verification and existing engine
  fallback policy. Stop/order/provenance augmentation is unchanged.
- [x] Update the GPS script cache tag and the read-only investigation probe. The
  probe now observes one map update, with pending/completed-stop behavior intact.
- [ ] Deployed real-device deviation/recalculation acceptance remains pending.

Validation: 3,302 JavaScript tests with coverage/lint; 2,244 backend tests plus 74
subtests passed (one skipped); eleven isolated SQL policy tests. Eleven new real
GPS -> selection -> map/lifecycle integration cases use a synthetic renderer and
network: refused/malformed first routes, all-refused/all-malformed retention,
existing engine/name preference, stale preferences and final map-owner rechecking.
A coherence regression now requires malformed directions to be rejected before
any map attempt; prior geometry/resource and no-success-announcement checks remain.
No production deployment, routing-server change or engine-fallback redesign.

## Engine continuity and fallback notice (9 November 2026)

- [x] Preserve engine family within the known selected type (Optimised, Fastest,
  Shortest, Scenic or Quiet), including emoji/spacing and Optimised/Optimized label
  variants. Never select Scenic instead of Optimised solely to keep GraphHopper.
- [x] Prefer satisfied preference evidence within that type over a best-effort
  option, including when the unresolved option has an exact name match. Keep
  existing permitted best-effort fallback if no matching type establishes them.
- [x] Retain explicit primary selection, mandatory checks, prior eligible-alternative
  filtering and final map-owner verification. Unknown route types retain exact-name
  fallback; names are currently the available type contract, not new authority.
- [x] Use the existing route-update notification for a short controlled-name notice,
  such as “Using Valhalla for this route.” It is sent after successful replacement;
  preserve hazard warning text/severity and do not announce a refused replacement.
- [x] Update decision-script cache tag, investigation and diagnostic variant probe.
- [ ] Deployed device acceptance remains pending; no engine availability claim.
- [ ] Prefer structured backend route-type metadata over label inference when that
  contract becomes available. Current matching deliberately recognizes only known
  English route labels; unknown labels do not imply an equivalent type.

Validation: 3,327 JavaScript tests with coverage/lint; 2,244 backend tests plus 74
subtests passed (one skipped); eleven isolated SQL policy tests. New pure decision
and production GPS/map/lifecycle cases cover compatible variants, different intent,
unresolved preferences, permitted best effort, explicit primary choice, other
engine families, hazard warning retention, actual replacement before notice, and
no notice after failed map verification. No production deployment/config changes.

## Recalculation responsiveness — investigation (10 November 2026)

- [x] Trace thresholds, GPS cadence, dwell/debounce, grace, retries and shared timeout.
  [Report](REROUTE_RESPONSIVENESS_INVESTIGATION.md) and read-only replay script added.
- [x] First: reset stale off-route streak/timer when evidence becomes unknown or
  untrusted; prove fresh reacquisition cannot borrow the old confirmation window.
- [ ] Then: replace blanket 90-second post-reroute suppression with confirmed-
  deviation handling while retaining duplicate/in-progress protection.
- [ ] Measure real accepted GPS cadence and end-to-end engine timings before tuning
  distance thresholds or dwell. Exercise actual abort/error/retry integration.
- [ ] Separately review zero/unknown accuracy handling; no real-device fault proved.

Replay: 12 seconds after threshold at one-Hz updates, 20 seconds at five-second
updates, 96 seconds in the immediate post-success case. These are synthetic inputs,
not measured wrong-turn/provider latency. The existing four failure retries bypass
normal debounce correctly, and the shared client abort timer is 35 seconds.
Runtime behavior is unchanged by this investigation; handle fixes one at a time.

## Fresh off-route confirmation after GPS uncertainty (10 November 2026)

- [x] Clear only the active deviation streak/start timer for unknown road association,
  unknown/reacquiring geometry, rejected GPS fixes and GPS errors. Preserve known
  OFF_ROUTE accumulation so continuous wrong turns still reach the existing dwell.
- [x] Start a fresh confirmation episode when the watch restarts or accepted readings
  resume after the existing 15-second freshness window. Use wall-clock age so a
  delayed but individually fresh receiver fix cannot borrow an old window.
- [x] Reset the pure deviation helper's untrusted-accuracy result consistently.
- [x] Preserve join state, progress, remaining visits, attempt/success timestamps,
  retries, in-progress ownership and all thresholds. No 90-second grace change.
- [x] Version GPS/decision script tags. Keep existing invalid/ambiguous-fix regressions
  strict about protected state while explicitly allowing the two intended resets.
- [x] Evaluate and improve confirmed-deviation handling during the post-reroute grace period.
- [ ] Real-device outage/reacquisition and deviation acceptance remain pending.

Validation: 3,340 JavaScript tests with coverage/lint; 2,244 backend tests plus 74
subtests passed (one skipped); eleven isolated SQL policy tests. Thirteen new
production watch/decision cases cover known/unknown road and geometry evidence,
invalid/stale/inaccurate readings, watch errors/restarts, silent and delayed-fix
recovery, nonzero progress preservation and normal continuous rerouting. The
read-only replay now reports zero saved streak/null timer and a waiting first
restored reading. Normal one-Hz timing remains 12 seconds; post-success remains
96 seconds in the existing synthetic scenario. No deployment/config/data change.


### Confirmed deviation during grace — 10 November 2026

A fully confirmed new GPS deviation now ends post-reroute grace before invoking
its guarded request. Distance, accuracy, route join, arrival, dwell, 30-second
debounce and in-progress checks remain unchanged. Unconfirmed readings and direct
triggers retain the 90-second grace guard. Failure retries retain their existing
schedule. No production deployment or configuration/data changes.

The synthetic post-success replay requests at 31 seconds instead of 96; ordinary
first-deviation scenarios remain 12 seconds at 1 Hz and 20 seconds at five-second
updates. These measure request timing after threshold crossing, not live guidance
latency. Real-device acceptance remains pending.

Validation: test lint; 3,353 frontend tests; declared web backend selection 2,244
passed, 74 subtests passed, one skipped; 11 isolated SQL checks; diagnostic replay.


### Reroute failure recovery — 10 November 2026

- [x] Verify route/layer/instruction retention on network failure and timeout.
- [x] Suspend offline reroutes without draining the timed failure-retry budget or
  reporting exhausted network requests that were never sent.
- [x] Resume the deferred attempt once on reconnect or a subsequent accepted GPS
  fix, using a fresh trusted off-route position. Retain request/map safety gates.
- [x] Cancel deferred recovery for changed route/destination/preferences/intent,
  navigation end, disabled automatic rerouting, cleared retries or return to route.
- [x] Verify the existing four-delay online retry burst and 35-second timeout.
- [ ] Real-device network outage/reconnect and GPS recovery acceptance.

Eighteen production watcher/request/map-owner regressions were added, including a
reconnect case that fails on the previous code. Validation: lint and 3,371 frontend
tests; declared backend selection 2,244 tests and 74 subtests passed, one skipped;
11 isolated SQL checks; responsiveness diagnostic. No deployment or production
configuration/data changes. Browser online status is advisory: a server outage
while reported online still uses the existing bounded timed retry burst; subsequent
confirmed GPS deviations can start a later attempt.


### Continuous navigation, observed GPS and ETA — 10 November 2026

This user-requested policy supersedes earlier entries that made a fresh safety
assessment, 30 m accuracy or confirmed road association prerequisites for explicit
Start or continuous guidance.

- [x] Explicit Start follows the selected usable geometry/directions immediately,
  through the existing owned lifecycle/map/persistence transaction. GPS runs in
  background; no fresh provider request or 30 m reading is required.
- [x] Keep route limitations informational and Start available. Preserve original
  assessment fields; do not relabel an unresolved route as verified. Automatic
  replacements still use their existing assessment contract and retain the current
  route on refusal/failure.
- [x] Accepted GPS always updates coordinates, marker, follow camera, directions and
  countdown. Unknown road identity is advisory, with geometry fallback for progress
  and deviation. Uncertain geometry shows observed coordinates rather than forced
  road snapping. Coarse accuracy no longer rejects otherwise current valid fixes.
- [x] Restore the ETA/remaining-distance bar for active journeys. Countdown follows
  current route progress in the selected units and does not reset to the full trip
  after a stop. Unknown GPS does not erase the current route/bar.
- [x] Let Start cancel an older explicit road-wait request, and refresh the redraw
  record after attaching durable ownership metadata so theme recovery keeps working.
- [x] Update regression expectations for the requested advisory policy while retaining
  strict automatic replacement, malformed geometry, cancellation and ownership tests.
- [ ] Real-device GPS/permission, driving and reconnect acceptance after deployment.

Validation: 3,391 frontend tests with coverage/lint; declared web backend selection
2,244 passed plus 74 subtests, one skipped; 11 isolated SQL tests. Real Chromium/
MapLibre replay passed phone/desktop sizes in light/dark with a moving observed
marker and visible ETA/decreasing miles or kilometres. Device/provider boundaries
are synthetic. The old code fails the marker/countdown regression. No deployment.


### Concise endpoint information — 10 November 2026

- [x] Remove the legacy endpoint-gap paragraph telling users navigation cannot
  start or asking them to choose an entrance/recalculate. The brief matching note
  is now “Locations are matched to nearby roads.”
- [x] Journey controls say “Start navigation or play a preview.” Assessment summaries
  no longer contradict the explicit-Start policy with preview-only instructions.
- [x] Keep endpoint-only snapping from raising a generic hazard banner at startup;
  actual unresolved hazard/preference information retains its existing warning path.
- [x] Preserve coordinates, offset/assessment data and automatic-selection decisions.
  Verify the reported 8 m start / 7 m destination case starts through the real
  lifecycle without a refusal paragraph or extra routing/location request.

Validation: 3,394 frontend tests with coverage/lint; declared web backend selection
2,244 tests plus 74 subtests passed, one skipped; 11 isolated SQL checks. Browser
script tags versioned. No deployment; VPS update/app reload and device acceptance
remain pending.


### Planning preview across clock differences — 10 November 2026

- [x] Trace the uploaded log: successful `/api/route` response followed by idle
  preview rejection `future_assessment`. The log does not expose the amount of
  clock skew; any negative assessment age was sufficient for the wrong validator.
- [x] Use planning-specific candidate validation in Calculate and planning commit.
  Preserve identity, assessment shape, geometry binding and instruction checks;
  preview does not depend on browser/server wall-clock agreement or navigation age.
- [x] Preserve supplied timestamps/assessment fields and strict automatic-navigation
  freshness checks. Explicit Start keeps the existing advisory policy.
- [x] Update the read-only planning diagnostic to observe the actual planning
  validator, while retaining compatibility with older navigation-validator hooks.
- [x] Cover 1 ms/1 minute/1 hour future timestamps, older assessments, no-previous-
  journey fresh-session preview, actual delayed preview display and owned active
  journey replacement; malformed candidates and stale request owners remain refused.

Validation: test lint and 3,410 frontend tests; declared backend selection 2,244
passed plus 74 subtests, one skipped; 11 isolated SQL checks. The previous Calculate
path fails the new future-timestamp preview regression. Browser script tags updated.
No deployment or production clock/configuration/data changes.


### Public route-source labels — 10 November 2026

- [x] Present routing providers as Route source A/B/C in route evidence, profile
  titles, fallback notices, routing errors and comparison recommendations.
- [x] Keep canonical source/name fields, provider diagnostics, geometry precision
  and engine-family selection unchanged. Avoid rewriting destinations or directions.
- [x] Use generic routing-service language in public privacy text; retain technical
  names in developer/operator diagnostics.
- [x] Load the shared public presentation helper before its consumers and version
  changed browser assets. A missing helper uses generic public wording.

Validation: 3,422 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed, one skipped; 11 isolated SQL checks. Twelve
new presentation regressions cover visible aliases, raw-data preservation,
provider matching, error diagnostics and script ordering. No deployment.

### Reported persistent unknown speed limit — route fallback

- [x] Investigate the speed-limit widget showing `--` for an entire established-road
  journey. Trace acquisition, road association, route edge limits and rendering;
  obtain the affected road/location where possible. Keep this separate from the
  provider-label change and preserve the existing navigation fixes.
- Reported journey: Bromcliffe Park to North Street, Barnsley. No device trace or
  route response was supplied, so the exact live failure and mapped limits on that
  journey remain unverified. Road age does not establish available maxspeed tags.
- [x] Restore the current maneuver's numeric route speed as a display-only fallback
  when road enrichment has neither an applicable limit nor a mapped observation.
  Label it `Route`, retain mph/km/h conversion, and keep legal alert state empty.
  No road-class default is substituted for missing numeric data.
- [x] Require fresh GPS associated with the current route geometry for this
  fallback, clear it on uncertainty or route replacement, and exclude simulation.
  These display checks do not block navigation, GPS movement or ETA updates.
- [ ] Confirm on a real-device repeat of the reported journey after deployment;
  missing limits in both mapped and route data must still display as unknown.

Validation: 3,426 frontend tests with coverage, test lint, declared backend selection
2,244 tests plus 74 subtests passed (one skipped), and 11 isolated SQL checks.
Asset-release tests passed after versioning both changed browser scripts.

### Route preview technical information — on demand

- [x] Move planning endpoint offsets, traffic-light coverage status, route advisory
  text and the arrival-coordinate/gap panel into one initially collapsed `ⓘ Info`
  disclosure. Preserve IDs, current-route updates, endpoint markers and evidence.
- [x] Use a native keyboard-accessible summary labelled `Route information`; retain
  readable light/dark styles and existing navigation, parking and route actions.
- [x] Verify closed/open visibility, keyboard toggling, disclosure state preservation,
  layout at mobile/desktop sizes and 200% zoom. No navigation rules changed.

Validation: focused preview/arrival tests and ten real Chromium layout/theme
scenarios passed. Full frontend/backend and isolated SQL results are in the PR.

### Arrival distances follow settings

- [x] Format planning start/destination offsets and arrival straight-line gaps with
  shared distance formatting: miles use feet for short gaps, kilometres use metres.
- [x] Refresh existing arrival labels and planning summaries when distance settings
  change; preserve canonical metre values, selected points, Info disclosure state
  and navigation behaviour. No route recalculation is needed for unit changes.
- [x] Add a real settings-action regression covering miles → kilometres → miles,
  both offset summaries and arrival labels, without mutating route evidence.

Validation: 3,427 frontend tests with coverage/lint, 2,244 backend tests plus
74 subtests passed (one skipped), 11 isolated SQL checks and ten Chromium
preview scenarios. No deployment.

### GraphHopper speed follow-up — accepted GPS timestamps

- Operator checks on deployed `ba356174`: GraphHopper 8 advertises `max_speed`;
  a direct test route returned numeric limits plus unknown segments. Voyagr's
  hazard-enabled test response retained 36 numeric speed maneuvers out of 48 on
  its GraphHopper route. Its Valhalla alternatives contained no maneuver limits.
  This confirms the tested backend path retains values, not the affected phone's
  actual GPS state or every segment of the reported Barnsley journey.
- [x] Reproduce an actual GPS-watch → route-planner → visible-widget mismatch:
  an accepted fix timestamp 250 ms ahead reaches reliable geometry association,
  but the route-speed display rejects it and shows an unknown limit.
- [x] Align route-speed display with the existing GPS validator's one-second future
  timestamp tolerance. Keep stale-fix, route identity, geometry association,
  simulation and numeric-value checks; retain display-only authority.
- [x] Test the full GPS/widget chain with zero, fractional-millisecond, 250 ms and
  1,000 ms timestamp offsets. No navigation eligibility or backend changes.
- [ ] Retest the affected phone after deploying and loading the updated release.
  This defect is reproduced; its role in the whole reported trip is unconfirmed.

Validation: 3,431 frontend tests with coverage/lint; 2,244 backend tests plus
74 subtests passed (one skipped); 11 isolated SQL checks. No deployment.

### Mobile speed diagnosis and completed journey estimates

- [x] Add a live speed-display status inside the existing collapsed Route Info
  disclosure: source availability, whether the current route section supplies a
  numeric limit, GPS association state/reason and accuracy in selected distance
  units. No coordinates, background telemetry or navigation-rule changes.
- [ ] Obtain that status from the affected phone while the speed limit is unknown.
  Backend speed values and a reproduced timestamp fix do not establish the cause
  of the remaining live-device failure. Do not substitute guessed road limits.
- [x] Fix completed-summary costs reading only `total_cost` even though normalized
  selected routes carry `fuel_cost`, `toll_cost` and `caz_cost`. Sum valid component
  estimates, retain legacy total-only support, keep genuine zero and show unknown
  rather than manufacture zero when no valid estimate exists.
- [x] Regress selected API route → traveled patch → actual summary DOM; test numeric
  strings, missing totals, stale zero totals, unknown costs and unchanged route data.

Validation: 3,440 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed (one skipped); 11 isolated SQL checks and ten
Chromium preview scenarios. Speed-limit root cause on the phone remains open.

### Confirmed mobile speed blocker — coarse GPS

- Phone status: a route-section limit is supplied but GPS route association is
  UNKNOWN with reported accuracy 253 ft (about 77 m). The 35 m matching threshold
  explains the display refusal; this is now live-device evidence, not speculation.
- [x] Add a separate display-only route estimate when fresh accepted GPS is coarse
  and every route edge inside its reported uncertainty area explicitly supplies
  the same numeric limit as the current route hint. No estimate across conflicting
  or missing values, outside that area, after route replacement, or for stale GPS.
- [x] Label it `Route est.` and explain imprecise GPS in Info. Keep road/position
  matching UNKNOWN, real marker coordinates, lane/legal authority, speeding alerts
  and all navigation eligibility/progress rules unchanged.
- [x] Regress the actual GPS-watch/planner/widget path at 77 m in mph and km/h;
  verify conflicting/missing nearby limits, distant routes, route changes, stale
  fixes and confirmed deviation stay unknown.
- [ ] Retest the affected phone after deployment and loading the new release.

Validation: 3,449 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed (one skipped); 11 isolated SQL checks and
16 real Chromium navigation HUD cases including the longer estimate badge.
No production deployment.

### Keep-screen-on recovery during navigation

- Confirmed keep-screen-on remains implemented with the Screen Wake Lock API and
  is requested after navigation starts. Visibility/pageshow recovery already exists.
- [x] Coalesce overlapping requests, recognize released sentinel references and
  retry transient request failures or automatic releases with a bounded backoff.
  New foreground/focus activity can retry after the bounded budget is exhausted.
- [x] Restore the lock on visible window focus, covering overlays that return focus
  without a document visibility transition. No tap or navigation restart required.
- [x] Discard/release acquisitions arriving after navigation changes or the page
  becomes hidden. Late releases cannot clear a newer sentinel. Stop cancels retries.
- [x] Preserve existing journey-summary wake-lock ownership and navigation/GPS rules.
- [ ] Test on the affected Android/Bitdefender device while parked. Browser wake
  lock does not override OS/app-lock policy, battery restrictions or security UI.

Validation: 3,457 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed (one skipped); 11 isolated SQL checks and
four real Chromium navigation-entry/GPS/ETA cases. Eight focused wake-lock tests
cover races, foreground/focus recovery and bounded denial retries. No deployment.

### Mobile white map and repeated unknown Optimised-route speed

- Phone screenshots show the basemap absent while DOM controls, GPS/turn guidance
  and ETA continue. The completed journey now correctly displays a £0.79 estimate.
  A GPU/context failure is consistent with the image, but its exact phone cause
  is not established by screenshots alone.
- [x] Fix a recovery gap: context-loss handling previously waited for browser
  restoration; the heartbeat's style-reload path skips intact style definitions.
  Cache the optional WebGL restore extension before loss and request bounded
  restoration while visible, without replacing map/route or navigation state.
  Resync/redraw on restoration; show a recovery message if graphics stay unavailable.
- [x] Bound coarse-pointer/mobile rendering density to 2x to reduce framebuffer
  memory pressure while retaining CSS layout and desktop defaults.
- [x] Fix coarse-GPS speed estimates tied to an old snapped index/hint. Resolve a
  common explicit limit from nearby route sections inside current GPS uncertainty,
  independently of an earlier missing/different hint. Keep missing/conflicting
  candidates unknown and keep GPS/road association and alert authority unchanged.
- [x] Add mobile Info map-renderer status for a future failure capture. Preserve the
  working completed-cost path and regression coverage.
- [ ] Retest on the affected phone after deployment; if still blank or unknown,
  capture the current Map renderer and Speed display lines inside Route Info.

Validation: 3,463 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed (one skipped); 11 isolated SQL checks. Real
Chromium/MapLibre tests deliberately lose and restore WebGL at phone/desktop
sizes, retain the selected route and journey state, and verify mobile 2x density.
No production deployment; physical-device acceptance remains open.

### End journey immediately resets planning inputs

- [x] Restore visible start/destination clearing when End finishes stopping an
  active journey, after the completed summary/history data has been captured.
  Reset coordinate/search metadata, driving-arrival and typed via/stop inputs,
  dismiss suggestions and invalidate pending endpoint requests.
- [x] Reuse one input-values reset from End and the existing Clear/Done path.
  The End-only reset does not remove map resources, fly to London, restart GPS
  or change saved preferences/history. Internal mode switches retain their plan.
- [x] Keep existing Clear cancellation semantics even when active guidance blocks
  map/form removal. A failed stop or idle End cannot clear newly typed inputs.
- [x] Regress synchronous summary capture and history persistence with a pending
  token lookup, preserving completed addresses and fuel/toll/CAZ estimates.

Validation: 3,467 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed (one skipped); 11 isolated SQL checks and four
real Chromium navigation/GPS/ETA regressions. No production deployment.

### Navigation form explanations behind Info

- [x] Place static arrival/access/onward-connection and parking-fee guidance in a
  closed Arrival Info disclosure. Preserve original help IDs and link parking
  controls to their description for assistive technology.
- [x] Use the same small native Info control for waypoint, GPS-start and voice
  instructions. Keep field labels, selection summaries, search feedback, recording
  status and actionable errors visible; fuel controls retain their existing
  collapsed section and dynamic pricing status.
- [x] Preserve controls/handlers and arrival summary/selection state; add keyboard
  and disclosure-state regressions and theme-aware inherited styling.

Validation: 3,469 frontend tests with coverage/lint; declared backend selection
2,244 tests plus 74 subtests passed (one skipped); 11 isolated SQL checks; 16 real
Chromium arrival/Info viewport/theme/text-scale cases. No deployment.

### Car and headphone audio (implemented; physical acceptance pending)

- [x] Add compact audio checks/input selection under Voice & alerts, with setup
  details collapsed behind Info and no startup microphone permission request.
- [x] Share the exposed input selection with wake listening and AI recording;
  keep current system-managed speech output and browser-recognition input.
- [x] Handle selected-input removal, pending checks and interrupted recordings.
- [ ] Accept real cars/headphones on Android Chrome and installed PWA: audible
  directions, exposed/default microphone, wake handoff, disconnect/reconnect,
  calls and speaker echo. See [CAR_HEADPHONE_AUDIO.md](CAR_HEADPHONE_AUDIO.md).

### Speed limit visible before navigation

- [x] Keep the existing map speed widget visible before tracking/navigation when
  enabled in settings. Show dashes and GPS off rather than a stale speed/limit.
- [x] Add a 44 px Use GPS action reusing the existing tracker without starting a
  journey, another watcher or automatic permission request on page load.
- [x] Keep existing mapped/route observation labels, configured mph/km/h display
  and legal-alert evidence rules. Display unavailable limits explicitly.
- [x] Cover idle, tracking, stopped and disabled states in controller/browser
  checks; retain combined navigation HUD acceptance checks.
- [ ] Accept on deployed phones with live GPS before starting a journey. Numeric
  limits still require available data and usable position evidence; stationary
  or ambiguous road association may remain unavailable. This feature does not
  infer a road's legal speed from its class or the map viewport.

Reproduce controlled checks: `node scripts/check-map-speed-widget.cjs` and
`node scripts/check-navigation-overlay-layout.cjs`. Location/evidence fixtures
verify UI wiring and layout, not physical GPS or live data coverage.

### Privacy, attribution and legal-risk review (first increment)

- [x] Default-off, separately chosen optional analytics with withdrawal controls;
  preserve navigation without tracking consent.
- [x] Correct voice/audio disclosures, remove affected raw voice console logs and
  clarify that cache freshness and dashcam retention settings are not proof of
  automatic deletion. Preserve statutory rights in the first-run safety notice.
- [x] Restore linked local OSM/dark-style credits and upstream licence notice.
- [ ] Supply public operator identity/contact and verify contracts/licences,
  retention/deletion, paid subscription fulfilment and public-report handling.
  See [risk review](../audits/LEGAL_AND_PRIVACY_RISK_REVIEW.md) for evidence,
  remaining technical work and operator/legal inputs. This is not certification.

### Private phone candidate findings (14 November 2026)

- [x] Keep privacy checkbox indicators at 20px while preserving label touch
  targets of at least 44px. Generic mobile input minimums and padding caused
  the oversized controls. CSS fix verified in Chromium at 360, 576 and 1024px
  in light/dark themes; disabled states preserved. Phone retest pending.
- [x] Stack expanded sheets above the speed widget/navigation HUD, preserving
  the collapsed map layout and disabled-widget preference. Real Chromium hit
  testing covers phone, tablet, landscape and desktop in light/dark themes;
  candidate phone retest pending. Reproduce with
  `node scripts/check-sheet-widget-layering.cjs`.
- [x] Collapse the startup route-limitations explanation behind a native Info
  disclosure. Preserve explanatory text, keyboard access and explicit dismissal;
  do not expire the disclosure while someone is reading it. Phone retest pending.
- [ ] Review the separate volume reminder and remaining route-preview diagnostics
  so supplementary information does not cover the map/instructions.
- [ ] Replace misleading incomplete-route wording when no route is selected;
  preserve useful errors for actual incomplete route results.

These findings concern the isolated candidate. Live movement, rerouting, speed
limit coverage, dashcam and Bluetooth still require their separate checks.
