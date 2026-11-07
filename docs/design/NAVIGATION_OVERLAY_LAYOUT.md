# Combined navigation overlay layout

Controlled reproduction found three layout failures: long turn text intersected
the speed display on a 320 px phone, a large-text warning extended above the
viewport, and the current-road bar intersected the journey summary. Short
landscape layouts also allowed guidance to occupy the footer controls' area.

The existing turn/lane widget, limitations notice, current-road name and speed
display now share a bounded presentation container. Portrait places guidance,
the notice and road name in a left stack with speed on the right. Short landscape
uses columns for visible guidance/notice/road cards and reserves the right edge
for End/Map controls. Long text wraps and the bounded cards can be scrolled by
touch or keyboard. The warning heading is shortened to **Route limitations**;
its warning paragraphs, six-second timer, dismissal and route eligibility are
unchanged. Direction arrows remain at the top of long instructions.

Safe-area offsets and the existing offline-banner clearance contribute to the
available height. Journey-summary height scales with text size and is reused by
the existing floating-control positioning rules. The short-landscape action list
is compact and scrollable below speed information. The posted-value colour is
readable against its white circle in both themes; mapped labels and source-owned
border states are retained. This is layout/HTML/CSS only, with a stylesheet cache
version bump. Every previous element ID, handler and UI ownership path is retained.

## Validation and limits

- 2,816 JavaScript tests across 127 suites; test lint. Existing warning/gate tests
  now exercise the actual grouped HUD markup, including mandatory refusals,
  six-second expiry, replacement transactions and focus return.
- Backend CI web selection: 1,902 passed, 1 skipped, 74 subtests.
- `node scripts/check-navigation-overlay-layout.cjs`: 16 Chromium scenarios over
  four viewport sizes, both themes and normal/200% text. Each checks long turn and
  upcoming-turn text, five production-rendered lane arrows, mapped speed labels,
  warning visibility/dismissal, keyboard scrolling, footer text, safe areas,
  offline clearance and unobstructed End access. Notices are also checked hidden.
- Existing browser regressions: 24 map-action/POI cases and 8 playback cases.
- Syntax/whitespace checks and preserved source IDs.

The browser uses production markup/CSS, SVG helpers and warning dismissal with
fixture display values and a fixture stop action. It does not establish live GPS,
provider, legal speed, lane applicability or route safety. Large content requires
scrolling; long road names retain the existing ellipsis treatment. Real-phone,
Firefox/WebKit, full application-shell and live guidance acceptance remain open
in the parallel [UI checklist](UI_IMPROVEMENT_TODO.md), alongside the original
functional/provider queue. No production deployment is included.
