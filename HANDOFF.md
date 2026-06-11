# Agent Handoff — Code Cleanup & Robustness

_Last updated: 2026-06-11. Latest related commit: `55e2c5d` (dedup work below is uncommitted)._

This document tracks the ongoing "clean up / fix bugs / make robust / refactor in
manageable chunks" effort on the live Flask app (`voyagr_web.py` + the `voyagr/`
package). Update it as work proceeds.

## Done so far (committed & pushed to `main`)

- **Dead-code/import hygiene** across live modules + 5 service/util modules
  (`routing_engines.py`, `lane_guidance.py`, `cost_service.py`, `hazard_service.py`,
  `database_service.py`) and the `voyagr/` package.
- **`voyagr/models/database.py` hardening**: lazy thread-safe connection pool,
  consistent `row_factory = sqlite3.Row`, and a leak-safe `db_connection()`
  context manager.
- **All DB connection leaks closed** in the package (`settings`, `navigation`,
  `hazards`, `costs`) and in `voyagr_web.py`'s inline call sites. Verified by an
  AST scan: 0 functions acquire a connection without `finally` / context manager.
- **sqlite3 date/datetime adapter deprecation** fixed (explicit adapters registered
  in `routing_monitor.py` and `voyagr/models/database.py`, preserving stored format).
- **`icalendar`** import made optional in `satnav.py` + pinned in `requirements.txt`.
- **Windows UTF-8 console guard** added to ~90 runnable test/utility scripts (no-op
  under pytest and on non-Windows).
- **f-string lint cleanup** in `voyagr_web.py` (0 pyflakes f-string warnings).
- **De-duplicated `CostCalculator` and `DatabasePool`** (was Remaining #1). `voyagr_web.py`
  now imports both from the package — `from voyagr.services.costs import CostCalculator`
  and `from voyagr.models import db_connection`. Its own `DatabasePool` class, eager
  `db_pool`, and inline `get_db_connection`/`return_db_connection`/`db_connection`
  helpers (plus the now-unused `from contextlib import contextmanager`) were deleted.
  The package `CostCalculator` was first made a superset (added `fuel_litres` to
  `calculate_costs()` and ported `predict_cost`, `optimize_route_cost`,
  `cache_alternative_routes`, `get_alternative_route_cache_info`) so the costs blueprint
  and all `costs['fuel_litres']` call sites keep working. Only **one** lazy pool now runs
  against the SQLite file. `voyagr_web.CostCalculator` / `voyagr_web.db_connection` are
  still importable (resolve to the package), so `test_toll_caz_fix.py` etc. are unaffected.
- **Stale `db_pool` re-export fixed** (was Remaining #2). `voyagr/models/__init__.py` no
  longer exports the module-level `db_pool` value; use the new `get_pool()` accessor
  (`voyagr/models/database.py`) which lazily creates and returns the shared pool.

## Remaining work (by priority)

### 1. (Low) Broader sweep — partially done
- Remaining debug/utility scripts likely still have unused imports (only the live
  path + 5 service modules were cleaned).
- ~~Dead backup files~~ **DELETED** (user-confirmed): `voyagr_web_backup.py`,
  `voyagr_web_backup2026.py`, `voyagr_web_old.py` (all were gitignored / untracked,
  no code imported them).
- JS frontend (`static/js/**`) review: **first pass done** — see "JS frontend review" below.

## JS frontend review (first pass)

Tooling state: `npm test` (jest) = **298 passing / 17 suites** (covers the modular
`static/js/modules/**` tree). `node --check` across all 78 JS files now passes.

Fixed (were broken JS, both dead/unloaded so zero runtime risk):
- `static/js/leaflet_shim.js` — file contained literal `\n` text instead of real
  newlines, so the whole file was invalid JS (would throw if ever loaded). Rewritten
  with proper newlines; logic unchanged.
- `static/js/modules/core/tree-shaking-config.js` — a nested `*/` inside a JSDoc block
  (`/* @__PURE__ */` in an example) prematurely closed the comment and broke the file.
  Reworded the doc comment.

Findings NOT changed (no active bug; flagged for a later deliberate cleanup):
- The live page (`HTML_TEMPLATE` in `voyagr_web.py`) loads, in order: `maplibre-helpers.js`,
  `modules/services/google-plus-codes-service.js`, `modules/traffic-lights.js`,
  `voyagr-core.js`, `voyagr-app.js`, `app.js`. All run in the global scope.
- 11 function names are declared in two loaded files each (later file wins globally):
  - 6 unit helpers (`convertDistance`, `getDistanceUnit`, `convertSpeed`, `getSpeedUnit`,
    `convertTemperature`, `getTemperatureUnit`) are **byte-identical** in `voyagr-core.js`
    and `voyagr-app.js` → harmless redundant copies (the core copies are dead).
  - `calculateDistance` **diverged**: `voyagr-core.js` returned km, `voyagr-app.js` returns
    **metres** (`* 1000`). **FIXED** — the 6 identical unit helpers + the dead km
    `calculateDistance` copy were removed from `voyagr-core.js` (they had no callers there;
    canonical copies live in `voyagr-app.js`). Cross-file duplicate fns dropped 11 → 4.
  - `toggle3DBuildings`, `toggleRoadLabels`, `set3DBuildingHeight`, `set3DBuildingOpacity`
    exist as low-level helpers in `maplibre-helpers.js` (also exposed via the
    `window.MapLibreHelpers` namespace, line ~1141) **and** as no-arg UI handlers in
    `voyagr-app.js`. Callers use the namespace (`MapLibreHelpers.x`) for the real logic and
    the global name for the UI handler, so the global override is intentional — not a bug.
Deep review of `voyagr-app.js` (763 KB) — **done**. Method: ran ESLint (via `npx`, not
added to the repo) with ~35 correctness-only rules across two passes (no-undef OFF due to
the shared global scope). Only real defect found and **FIXED**:
- **`await calculateRoute()` resolved early (real bug).** `calculateRoute` is `async`
  (defined ~line 4710) and is `await`ed in two places (~2995, ~9276, e.g. "Route calculated
  to <parking>" success toast). A monkey-patch wrapper near line ~18879
  (`const originalCalculateRoute = calculateRoute; calculateRoute = function(){ originalCalculateRoute(); }`)
  was non-async and **discarded the returned promise**, so `await calculateRoute()` resolved
  immediately and downstream code (e.g. the success toast) ran before the route finished.
  Fix: the wrapper now `return originalCalculateRoute.apply(this, args)` so the promise is
  forwarded. Fire-and-forget callers are unaffected.
- ESLint also flags the two function-declaration reassignments (`clearForm`, `calculateRoute`
  wrappers) under `no-func-assign`. These are an intentional sloppy-mode wrap pattern that
  works; left in place (`clearForm` is sync and never awaited).
- No other correctness issues (no dupe keys/args/else-if/case, no unreachable code, no
  `array-callback-return` misses, no unsafe optional chaining, no unmodified loop conditions,
  no loss-of-precision, `use-isnan`/`valid-typeof` clean, etc.).

JS review verification: `node --check` clean on all files; `npm test` (jest) = 298 passing.

## How to verify (the standard loop)

```bash
# Smoke test (app must import cleanly)
python -c "import voyagr_web; print('SMOKE OK')"

# Lint (ignore cosmetic-only warnings)
python -m pyflakes voyagr_web.py voyagr

# Focused regression tests
python -m pytest test_refactored_services.py test_cost_analysis.py \
    test_persistent_settings.py test_hazard_types.py -q
```

Leak check: scan for functions calling `get_db_connection()` that lack a `finally`
release or a `with db_connection()` block.

## Safety notes

- **Windows/PowerShell**: no bash heredocs — commit via `git commit -F <file>`.
- Blueprints use **positional** row indexing, so enabling `row_factory=Row` is safe.
- **Only commit when asked.** Never commit untracked `node_modules/`, model blobs,
  or `kws.tar.bz2`.
- Committing occasionally triggers an auto `git gc` (slow, harmless).
- Prefer small, verifiable chunks; run the smoke test after each.
