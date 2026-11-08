# Map control UI audit

This increment belongs to the parallel [UI improvement checklist](UI_IMPROVEMENT_TODO.md).
It does not replace functional/provider acceptance or authorize production deployment.

| Existing control | Existing action retained | UI/state handling |
|---|---|---|
| `startTrackingBtn` | `startGPSTracking()` | GPS tracking icon and label; visibility remains controller-owned. |
| `startNavBtn` | `startNavigationFromPreview()` | Floating Start icon directly above Map; same entry as preview Navigate. Retains `data-journey-choose`, initial hidden state, controller-owned visibility and journey permission path. |
| `zoomFollowToggle` | `toggleZoomAndFollow()` | Follow SVG survives runtime redraw; `aria-pressed` follows existing active state. |
| `recenterVehicleFab` | `recenterOnVehicle()` | Recenter SVG and label; existing visibility is retained. |
| `journeyOverviewBtn` | `toggleJourneyOverview()` | Overview SVG survives redraw; pressed state and existing return-view title update together. |
| `currentLocationFab` | `getCurrentLocation()` | My location label distinguishes it from navigation Recenter. |
| `voiceFab` | `toggleVoiceInput()` | Voice SVG and label; existing listening class, title and pressed updates remain authoritative. |
| `showCamerasFab` | `toggleShowCameras()` | Camera SVG and label; shared toggle UI updates its existing pressed attribute. Camera data still comes from the app camera database. |
| `roadReportFab` | `openRoadReportModal()` | Report SVG and label; report submission/GPS guards are unchanged. |
| `mapControlsHintFab` | `openMapControlsHintModal()` | Help SVG/label; guide copy describes the labelled action panel. Long-press binding still uses the existing IDs/classes. |
| `endNavigationBtn` | `stopTurnByTurnNavigation()` | Explicit End label and accessible name, retained outside the scrollable action panel. |
| `navMenuToggle` | Existing pointer/touch/click debounce | SVG open/close states and labels survive redraw. Keyboard opening enters the action group; Escape closes it and restores focus. This is a disclosure/group, not an ARIA menu requiring arrow-key navigation. |
| Nearby Places shortcuts | `quickSearch(category)` | Parking, fuel, food, charging, pharmacy, hospital and groceries retain categories/order/labels with SVGs in a compact three-column grid. Parking still uses its existing nearby search and provider path. |

The floating actions use a two-column scrollable panel. Root Map/Close and End
buttons, and the independent Start action, are 56 px; panel buttons have at least 48 px targets and visible labels.
Pressed states also have a check mark. Opening the panel reads existing owner
getters so restored camera/Follow/Overview/voice states are reflected without
flipping preferences or requesting device permissions. Light/dark styles are scoped to these
controls and the Nearby Places group; existing visibility owners, map gestures,
follow camera, provider calls, reporting and navigation lifecycle are preserved.

The panel reserves top space during the existing journey-summary-visible state.
Short landscape layouts place it beside the root controls. Controlled layout
checks cover the production turn/lane and speed widgets, safe-area offsets,
scrolling all actions into view, and unobstructed End access. Expanded controls
use some map space. Deployed acceptance must also cover unusually tall maneuver
instructions, device text scaling, browsers and changing live overlay content.

MapLibre's native zoom/compass controls, bottom-sheet toolbar icons, optional AR
camera controls and navigation information displays keep their existing owners
and are outside this icon increment. Their wider touch/zoom/layout audit remains
in checklist item 4. No GPS/camera permission is requested by the icon changes.

## Validation

- JavaScript regression suite: 2,811 tests across 126 suites; test lint.
- Backend CI web selection: 1,902 passed, 1 skipped, 74 subtests.
- `node scripts/check-map-action-icons.cjs`: 24 isolated Chromium cases over four
  viewport sizes and both themes: planning/live fixtures plus Nearby Places.
  Production markup/CSS/UI controllers with fixture map/device actions; no live
  WebGL/GPS/provider acceptance is claimed.
- SVG retention, keyboard/Escape, pointer duplicate-event handling, pressed state,
  hidden controls, stop access and all POI category wiring are checked.

Real-phone/provider acceptance and production deployment remain pending.
