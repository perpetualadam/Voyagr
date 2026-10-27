# Voyagr baseline audit

Audit date: 2026-10-27. Starting commit: `4c44f4de7bcbd2dbcb5acf2247887f452835263f`. Git status was clean before work. No production configuration, live databases or deployment operations are authorized or used.

## Architecture and discovery

The checkout includes a legacy Kivy/Android desktop application (`satnav.py`), a Flask PWA (`voyagr_web.py`), modular `voyagr/api`, `voyagr/services`, `voyagr/models`, static JavaScript, deployment helpers, self-hosted Supabase SQL, and many historical handoff documents. Active deployment documentation is `CONTABO_UPDATE_COMMANDS.md`; Docker installs `requirements-web.txt`. The desktop manifest includes Kivy, pyjnius, PyAudio and Buildozer and is distinct from the web requirements.

`satnav.py` owns desktop navigation/UI/GPS and background data integration. `voyagr_web.py` creates Flask, initializes SQLite, registers blueprints and implements `/api/route`. `route-selection.js` builds selection/display/navigation plans. `voyagr-app.js` binds browser state to extracted orchestration modules. `gps-orchestration.js` owns browser watchPosition, marker updates, ETA and rerouting side effects. `speed-gps.js` implements speed filtering, GPS/watch health and pure tick plans. `speed_limit_detector.py` consults TomTom Snap and Overpass with caches and inference. `routing_engines.py` is a separate provider abstraction; the active web route uses `voyagr/services/routing/engines.py`, orchestrator and fallbacks. `lane_guidance.py` is the legacy standalone lane inference implementation; web guidance also uses lane_recommendation and maneuver/JavaScript modules.

Providers include Valhalla, GraphHopper, optional OSRM, TomTom traffic/Snap/incidents, OpenStreetMap Overpass and geocoding/search services; MapLibre/Leaflet browser assets, SQLite local persistence, and Supabase auth/profile snapshots. Detailed provider use and boundaries are in the routing/security reports.

## Baseline validation before source changes

Actual cloud runtime: Python 3.12.14, Node 24.19.0; CI backend targets Python 3.11, frontend Node 24. Ran the exact backend file list from `.github/workflows/ci.yml` via `.venv/bin/python -m pytest -q`: **397 passed, 61 subtests passed in 3.93 seconds** (4.38 seconds including process startup). Ran `npm run lint:tests`: passed. Ran `npm run test:ci -- --maxWorkers=2`: **85 suites passed, 1,771 tests passed, zero snapshots; 4.817 seconds**; coverage thresholds passed. These are actual deterministic tests, many with mocked external providers; they do not establish live navigation accuracy.

CI comprises Python selected behavior tests and Jest/coverage; other workflows support Contabo operations and APK building. Playwright configuration exists, but no browser driving session or device/Android build was run. The full Python directory includes live-server/custom-router/desktop scripts and is not equivalent to the CI suite.

## Confirmed initial problems

- P1: `/api/route` prints/logs full incoming JSON and precise endpoints, with further coordinate/cache/error output.
- P1: `voyagr/utils/admin_auth.py:check_admin_request` allows protected operations when the admin secret is absent.
- P1: standalone lane guidance derives lane occupancy from compass heading and fabricates fallback lane counts; safety validation is absent.
- P1: speed detector treats unqualified OSM numeric maxspeed as mph in UK/US despite OSM default km/h; inferred limits also remain a separate safety concern.

Other findings require tracing and are documented in the final reports. No claim of complete production or real-world safety validation is made.
