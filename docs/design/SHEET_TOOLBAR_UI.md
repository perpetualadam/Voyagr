# Bottom-sheet toolbar accessibility increment

The nine existing toolbar actions retain their handlers and destinations: Saved,
Analytics, Share, Route Options, History, Dashcam, Premium, Settings and Collapse.
Labelled inline SVG controls replace emoji/colour-only buttons. This belongs to
the parallel [UI checklist](UI_IMPROVEMENT_TODO.md), not the functional/provider queue.

The toolbar is a single horizontally scrollable navigation region with at least
48 px targets, accessible names, visible keyboard focus and scoped light/dark
colours. `aria-current="page"`, an underline and the accent border indicate the
current page. Premium keeps its existing account/settings path; it does not act
as a selected page. Dashcam still opens its existing page.

Keyboard focus explicitly reveals the complete target, including partially
visible items. Pointer/touch gestures originating in the toolbar are excluded
from the sheet drag handler, so horizontal swipes do not collapse the drawer.
The original handle still expands/collapses it. Selecting a toolbar page expands
the existing sheet so that page is visible. Collapse retains its original action.

The default collapsed peek stays 110 px. Its handle has a 48 px target; the toolbar
uses labels beside icons within the remaining header space, including at 200%
text. The current-page heading remains accessible but is visually clipped while
collapsed; it is visible above the toolbar in the expanded sheet. Expanded tools
stack each label beneath its icon, with a scrolling hint below the row.

Validation: 2,815 JavaScript tests across 127 suites; backend CI web selection
1,902 passed, 1 skipped and 74 subtests; test lint and syntax/whitespace checks.
`node scripts/check-sheet-toolbar.cjs` covers 16 Chromium cases: four viewport
sizes, two themes and normal/200% text. It checks collapsed/expanded bounds,
48 px targets, at least 4.5:1 label contrast, full focus visibility, native Tab and
Enter, current-page markers, every action path, Collapse and handle expansion.
A real Chromium touch swipe also checks horizontal scrolling without collapse.
The production HTML/CSS/sheet/tab controllers run with fixture page loaders and
Premium actions; no live account, camera, GPS or routing acceptance is claimed.

Deployment and acceptance on real phones, including Firefox/WebKit, remain
pending. The remaining whole-app text/overlay/native-map control audit stays open.
