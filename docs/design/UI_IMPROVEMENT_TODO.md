# UI improvement checklist

This is a parallel workstream. It does not replace, reorder or take priority over
the existing Overpass acceptance queue in [OVERPASS_CONSUMER_AUDIT.md](OVERPASS_CONSUMER_AUDIT.md)
or other navigation, deployment and acceptance checklists. Complete and verify
one UI increment at a time; retain outstanding functional acceptance items.

## 1. Route playback controls (current increment)

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

## 2. Selected route preview

- [ ] Lead with duration/distance and a clearly labelled navigation action.
- [ ] Group secondary actions such as Save/Share under a labelled More menu.
- [ ] Make costs and preferences expandable without concealing route limitations.
- [ ] Verify all route choices and journey-mode permission checks still work.

## 3. Map controls

- [ ] Audit existing controls, including Parking POI, before changing placement.
- [ ] Replace mixed emoji with consistent SVG icons and accessible names.
- [ ] Keep frequent actions discoverable; use icon-and-label controls when an
  icon's meaning is ambiguous. Preserve selected/pressed states.
- [ ] Check overlap with maneuver, lane, speed and hazard displays on phones.

## 4. Wider UI consistency and acceptance

- [ ] Apply shared spacing, restrained colours, focus and touch-target rules in
  small increments rather than a global restyle.
- [ ] Check contrast, text zoom, keyboard access, reduced motion, portrait and
  landscape layouts, safe areas and light/dark themes.
- [ ] Run relevant regressions for each increment and record browser acceptance
  separately. Do not automatically deploy or change routing/GPS/data behaviour.
