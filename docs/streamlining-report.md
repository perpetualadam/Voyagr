# Voyagr — Code Streamlining Report

_Last updated: 2026-06-15. Read-only audit + progress tracker._

## 0. How the app ACTUALLY runs (read first to avoid false assumptions)

- **No JS build step / bundler.** Only `.babelrc` exists (for `babel-jest`). `package.json`
  scripts are only jest/icons/picovoice.
- **Web frontend = one monolith:** `static/js/voyagr-app.js` (~17.6k lines) + `voyagr-core.js`
  (~0.9k) + `maplibre-helpers.js` (~1k), loaded as plain `<script>` (not ES modules).
- **`static/js/modules/` now contains only the 6 modules the app loads** (after the P1 prune):
  5 via `<script>` (`map/weather-layer`, `navigation/camera-pitch`, `ui/toggle-ui`,
  `services/google-plus-codes-service`, `traffic-lights`) + `ar-navigation.js` via dynamic
  `import()` at `voyagr-app.js:13174`.
- **Two Python monoliths share libraries but duplicate logic:** `satnav.py` (~9.2k, Kivy mobile)
  and `voyagr_web.py` (~7.7k, Flask/VPS — the deployed target). Shared root libs imported by
  both and by `voyagr/`: `speed_limit_detector.py`, `lane_guidance.py`, `overpass_helper.py`,
  `hazard_parser.py`, `routing_monitor.py`, `ml_*.py` (**legitimately shared — do not dedupe away**).
  The two monoliths independently define `calculate_route`, `calculate_toll_cost`,
  `calculate_caz_cost`, `calculate_multi_stop_route`, `validate_coordinates` (**real duplication**).
- **`voyagr/` is a half-finished refactor target** — `voyagr_web.py` uses it via a few top-level
  imports plus ~14 lazy in-function imports.
- **Root is cluttered:** ~214 root `.py` (≈106 non-test + 108 `test_*.py`). `.buildozer/` exists
  locally but is **not** git-tracked.

## 1. Status of the prioritized opportunities

### P1 — Dead/parallel JS module trees — ✅ DONE (2026-06-15, commit `05537d9`)
Verified the 42 unwired modules were a never-connected reimplementation of monolith logic
(`voyagr-app.js` already has 1,904 turn/maneuver, 429 caching, 213 lane, 53 routing, 26
tracking, 24 voice references). **Pruned** 41 unwired modules + 13 module-only tests; kept the
6 wired modules; scoped jest coverage to wired+tested files; retuned global floor. 62 JS tests
green; backend unaffected. (Chose prune over adopting a bundler — lowest risk for a working,
solo-maintained app.)

### P5 — Repo-root declutter — 🔄 IN PROGRESS (2026-06-15)
- `.gitignore` hygiene for large artifacts (`*.tar.bz2`, downloaded `sherpa-onnx-kws-*` model
  dirs, `playwright-report/`).
- Move `test_*.py` into `tests/` with a `pytest.ini` (`pythonpath = .`) so root-module imports
  still resolve; update CI backend paths; verify the 4 CI suites.
- **Deferred:** relocating the ~106 non-test root scripts — needs per-file classification
  (real modules imported by the app must stay at root; only genuine one-off scripts move to
  `scripts/`). Do this as a separate, verified pass.

### P2 — Extract & test `voyagr-app.js` glue — ⬜ TODO (highest user value)
Use the proven pattern: extract a pure function → UMD module (`modules/*`, CommonJS export +
browser global) → `<script>` tag with cache-busting `?v=` → delegate from the monolith with an
**inline fallback** → behavior test → per-file coverage lock. First targets: turn-by-turn
instruction text + arrow-icon selection; lane-guidance UI; voice-announcement text; reroute/GPS
decision logic.

### P3 — Finish `voyagr_web.py` → `voyagr/` migration — ⬜ TODO
Move duplicated inline route/cost/hazard logic into `voyagr/services/*`; replace lazy imports
with top-level ones where no circular-import reason exists (document the ones that remain lazy).

### P4 — De-duplicate `satnav.py` ↔ `voyagr_web.py` — ⬜ TODO
Diff the 5+ shared-name functions; extract the canonical version into a shared module; have both
entry points import it. Keep per-platform behavior identical (mobile vs web may diverge on units/offline).

## 2. Hard guardrails ("do not break the app")
- **Web is the deployed target** (`voyagr_web.py` on the VPS via `systemctl voyagr`). Validate
  backend changes with `python -c "import voyagr_web"` + the 4 CI pytest suites.
- **No bundler** — every new module is a `<script>` (cache-busting `?v=`) + inline fallback in
  the monolith.
- **Root shared libs are NOT duplicates** — leave them as the shared layer.
- **Lazy imports may be intentional** — confirm no circular dependency before hoisting.
- Incremental commits; run `npm test` + CI pytest set each time.

## 3. Method (reproducible)
Largest files: `git`-ignore `node_modules`, scan `voyagr/`, `static/js/modules`, root `*.py`.
Wired JS modules = `<script>` refs in `voyagr_web.py` ∪ dynamic `import()`/`require()` in
`voyagr-app.js`/`voyagr-core.js`/`app.js`. Safe Python tests = no network/server/heavy-import
signals, real test functions, tolerate offline. See `docs/test-handover.md` for test specifics.
