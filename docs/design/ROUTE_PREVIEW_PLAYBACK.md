# Animated route preview

The existing isolated journey simulation now has a direct **Play route preview**
button on the selected route's preview panel and in the journey-mode chooser.
Static route preview remains available. Playback follows the complete copied
geometry, including validated contiguous multi-stop legs, with its own purple
directional marker and optional following map camera.

Controls provide pause/resume, restart, route-position seeking, camera follow and
0.5×, 1×, 2×, 5×, 10×, 20×, 50× and 100× speed. One-times playback follows the
planned duration when available using the existing average-speed model (otherwise
the existing 50 km/h preview default), not measured road speeds or current traffic.
The panel shows current/next instructions, distance, progress
and remaining preview time. Completion pauses playback; seeking backward or
restarting allows another inspection. Backgrounding pauses rather than jumping
ahead when the page becomes visible again.

The map camera captures its pre-preview center, zoom, bearing and pitch. Initial
follow uses a close tilted view, then preserves user zoom/pitch. It frames
the vehicle above overlapping phone controls using a camera offset rather
than changing shared map padding. Camera updates ease between preview frames.
Turning follow
off allows map inspection while the marker continues; exit or route invalidation
removes the owned preview layer/marker and attempts to restore the captured view.
Layer-removal verification and recovery behaviour are unchanged. Preview-camera
failure cannot authorize navigation.

The player uses a compact icon toolbar with 48 px button targets, a single
play/pause position, speed selector and labelled Follow checkbox. Close remains
in the header. The simulation label and next instruction stay visible; supporting
distance/timing text is expandable under Preview details. Keyboard focus follows
play/pause changes, with restart selected on completion when pause held focus.
Recovery feedback is outside collapsed details, and playback controls are disabled
until owned cleanup succeeds. Light/dark styling is scoped to the player.
This is the first increment in [UI_IMPROVEMENT_TODO.md](UI_IMPROVEMENT_TODO.md),
a parallel workstream that does not reprioritize existing functional acceptance.

Synthetic positions are never fed into GPS, navigation progress, lane/hazard
authority, reporting, or driven-trip recording. The existing explicit mode
transition retains an active journey before stopping live guidance; preview does
not automatically restart live guidance on exit. Live navigation still needs its
normal fresh-GPS and route-assessment workflow. Preview is labelled as simulation
and cannot grant permission to drive a refused/unverified plan.

Controlled tests cover camera follow/restoration, speed/seek/control state,
completion/restart, turns and arrival interpolation, cleanup failure,
background-pausing and unchanged live/trip boundaries. The isolated Chromium UI
check (`node scripts/check-preview-player.cjs`) uses the production panel, CSS
and controllers with a fixture map at phone, landscape and desktop sizes in both
themes. It checks layout, targets, keyboard and playback/recovery interactions.
Browser WebGL/device
acceptance remains pending: play a selected route, adjust speed and position,
pan/zoom with follow disabled, pause/restart, then exit and verify the normal map
view and fresh-GPS navigation workflow. No production deployment is included.
