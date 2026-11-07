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
