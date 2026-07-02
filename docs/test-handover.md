# Handover: Voyagr test rewrites / updates — remaining work

_Last updated: 2026-06-15_

> **2026-06-15 update (P1 done):** The large unwired `static/js/modules/{api,core,features,routing,storage}`
> trees plus the unwired `navigation/ui/services` files (41 modules) and their 13 module-only
> tests were **pruned** — they were a never-connected reimplementation of logic the
> `voyagr-app.js` monolith already runs (verified: no bundler; only 6 modules are loaded —
> 5 via `<script>`, `ar-navigation.js` via dynamic `import()`). Jest coverage is now scoped to
> the wired+tested files; the global floor was retuned to real numbers. Surviving JS tests:
> `camera-pitch`, `weather-layer`, `toggle-ui`, `google-plus-codes`, `road-labels`,
> `meta/no-tautological-tests` (62 tests, green). See commit `05537d9`.

## Current baseline (green)

- **JS (Jest):** All suites are behavior-first; the tautology guard
  (`npm run lint:tests`) passes clean. Run `npm test` to confirm the baseline.
- **Python (CI):** 4 suites are wired into `.github/workflows/ci.yml` (backend job):
  `test_graphhopper_sign_mapping.py`, `test_lane_recommendation.py`,
  `test_lane_guidance.py`, `test_speed_limit_detector.py` (optional backend; not a PWA user feature) → **71 passed in ~24s**,
  deterministic offline.
- **Coverage (`jest.config.js`):** after the P1 prune, `collectCoverageFrom` is scoped to the
  wired+tested files (`weather-layer`, `camera-pitch`, `toggle-ui`, `google-plus-codes-service`,
  `maplibre-helpers`). Global floor `statements/branches/lines: 24`, `functions: 20` (a regression
  FLOOR, just below real numbers — `maplibre-helpers.js` is a large grab-bag whose road-label slice
  is the only part under test, which pulls the function ratio down). Per-file locks on
  `map/weather-layer`, `navigation/camera-pitch`, `ui/toggle-ui`. `ar-navigation.js` and
  `traffic-lights.js` are **wired but untested** — next test targets.

## What's DONE (do not redo)

- **P1 prune (2026-06-15, `05537d9`):** deleted 41 unwired modules + 13 module-only tests.
  The running frontend is `voyagr-app.js` (no bundler); only 6 modules are loaded.
- 13 tautological JS tests rewritten to import real modules; `driver-perspective.test.js`
  retired (superseded by `camera-pitch.test.js`).
- UI toggle glue extracted to `modules/ui/toggle-ui.js`; weather raster overlay to
  `modules/map/weather-layer.js`; camera tilt/follow to
  `modules/navigation/camera-pitch.js` — all with behavior tests.
- CI pipeline + tautology guard (`scripts/check-tautological-tests.cjs` +
  `__tests__/meta/no-tautological-tests.test.js`) + `fake-indexeddb` IndexedDB
  round-trip coverage.

## REMAINING WORK

### 1. JS — extract & test the monolith glue (highest value)

`voyagr-app.js` / `voyagr-core.js` are excluded from coverage and hold untested
user-facing logic. Established pattern: extract a pure function → UMD module under
`modules/*` with an inline fallback in the monolith → behavior test → add a per-file
coverage lock.

**Done (2026-06-18):**
- ✅ Turn-by-turn **instruction text / arrow-icon** builder →
  `modules/navigation/turn-instructions.js`.
- ✅ **Voice announcement** text builder → `modules/navigation/voice-announcements.js`
  (`__tests__/voice-announcements.test.js`, 24 tests, per-file lock).
- ✅ **Lane guidance** (deterministic data + overlay view-model) →
  `modules/navigation/lane-guidance.js` (`__tests__/lane-guidance.test.js`, 35 tests, lock).
- ✅ **Reroute / GPS-tick** decision logic → `modules/navigation/reroute-decision.js`
  (`__tests__/reroute-decision.test.js`, 21 tests, lock). The pure decision returns the
  action + new tracking state; `checkRouteDeviation` applies the side effects.

JS baseline is now **165 tests across 10 suites** (was 109/8).

**Remaining extraction candidates in `voyagr-app.js`:**
- The "Then…" advance-maneuver instruction builder (chains the next maneuver onto an
  imminent announcement; still inline in `announceUpcomingTurn`).
- **ETA announcement** text builder.
- The **lane voice** message builder (lines ~9929-9965, still inline — depends on
  `speakMessage` + `_lastLaneVoiceKey`; extract the text, keep the speak call inline).

### 2. Python — only 4 of 108 files are in CI. Backlog by category:

- **`custom_router` not importable (4 files):** `test_ch_performance`,
  `test_custom_router`, `test_phase1_optimizations`, `test_router_performance` fail
  with `ModuleNotFoundError: custom_router`. Fix the import path / package init
  (+ a tiny offline fixture graph), then convert their print/return style to real asserts.
- **Kivy/`satnav` desktop stack (3 files):** `test_satnav`, `test_input_validation`,
  `test_hazard_avoidance` import `satnav`, which imports `kivy`/`kivy_garden`/`plyer`/`geopy`
  at module top (not in `requirements-web.txt`). `test_satnav` also fails on
  `sqlite3.OperationalError` (no DB init). **Recommended:** extract the pure logic these
  exercise (unit/temperature/fuel/cost conversions, hazard-penalty calc) out of
  `satnav.py` into an import-light module, then test that — unlocks ~3 files without Kivy.
- **Network/server/heavy-engine (~94 files):** hit Overpass/TomTom/OpenWeather, `localhost`
  servers, or `valhalla`/`graphhopper`/`sherpa`/`onnx`/`numpy`. Mostly
  `if __name__ == '__main__'` print-based scripts, **not pytest assertions**. Need
  rewriting with mocked network (e.g. `responses` / `requests-mock`) + real assertions,
  or split into a separate manual/integration workflow.
- **Tautological / source-grep Python tests:** `test_persistent_settings.py` (asserts on
  an inline dict, no real module) and `test_hazard_integration.py` (greps `voyagr_web.py`
  source text) — rewrite to assert real behavior or retire. Consider extending the
  tautology guard to Python.
- **Flaky:** `test_midterm_improvements.py::TestRealTimeTraffic::test_traffic_caching` —
  mock its network/timing before adding to CI.

### 3. Coverage floor raise plan

The per-module trees that used to live here were pruned (P1). To raise coverage now,
write tests for the **wired-but-untested** files and add them to `collectCoverageFrom`
with per-file locks: `modules/ar-navigation.js`, `modules/traffic-lights.js`, and the
untested parts of `maplibre-helpers.js`. As `voyagr-app.js` logic is extracted into new
wired modules (section 1), test each and bump the global floor accordingly.

## Gotchas the next agent must know

- **pytest collection is all-or-nothing:** one import error in a selected file aborts the
  whole run unless `--continue-on-collection-errors`. CI lists files explicitly on
  purpose — keep that pattern.
- **pytest 8 returning non-`None` from a test** raises a warning (future error). Many
  legacy Python "tests" `return True/False` — convert to `assert`.
- **jsdom quirks already handled** (keep in mind when adding tests): `structuredClone`
  polyfill in `jest.setup.js`; jsdom normalizes some CSS to `rgb()` (use regex matches);
  `localStorage` must be overridden via `Object.defineProperty` (it's a getter);
  `navigator.geolocation.clearWatch` must be mocked.
- **`modules/api/index.js`** needs the explicit `import { APIClient } from './client.js'`
  for the `createAPIClient` binding — don't "simplify" it away.
- **Network-tolerant Python suites** (`test_lane_guidance`, optional `test_speed_limit_detector` for backend)
  pass offline by design (fall back to defaults) but add a few seconds via timeouts.
  Optionally add an env flag to short-circuit network for speed/determinism.
- Windows-only `comtypes` shutdown log noise appears when `satnav`/`pyttsx3` import —
  harmless, absent on Linux CI.

## Suggested priority order

1. Extract & test remaining `voyagr-app.js` glue (turn instructions → lane UI → voice → reroute).
2. Fix `custom_router` import + fixture → unlock 4 routing test files.
3. Extract pure logic from `satnav.py` + fix sqlite init → unlock satnav/input-validation/hazard-avoidance logic without Kivy.
4. Rewrite a batch of network integration scripts to mocked behavior tests.
5. Retire/rewrite the 2 tautological Python tests; extend the guard to Python.
6. Raise the coverage floor + add per-file locks.

## Triage method (reproducible)

To re-derive the safe Python candidate set: classify each root `test_*.py` by
(a) network/server signals (`requests.get/post`, `localhost`, `:5000/:8080`, `urlopen`,
`subprocess`, `overpass`, `tomtom`, `openweathermap`, `.connect(`), (b) heavy/native
imports (`valhalla`, `graphhopper`, `sherpa`, `onnx`, `numpy`, `scipy`, `kivy`, etc.),
and (c) absence of real test functions. Then manually verify survivors actually import
real modules and tolerate missing network.
