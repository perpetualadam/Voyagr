# Active UK journey boundary — preview refusal, not GH11 guidance

The active-journey regression starts a synthetic baseline through the actual UK
JourneyModes.startNavigation and lifecycle transaction. The baseline's authority
is synthetic test evidence, not a measured routing result or legal/hazard proof.
The mode reaches LIVE without replacing getState; the host context guard uses
actual mode, lifecycle and accepted-GPS APIs. Device/services/map boundaries are
controlled in the deterministic JavaScript test.

## Confirmed issue and narrow fix

An incoming isolated preview could be passed to startTurnByTurnNavigation while
another option remained selected. The lifecycle merged the selected option before
checking the incoming route, thereby substituting the existing route's authority
and reporting a successful redraw. This did not demonstrate that GH11 geometry
was followed, but it masked refusal and could trigger an unwanted redraw.

The lifecycle now refuses an incoming explicit navigation denial on an active
journey, or an isolated-preview scope/claim in any state, before selection merge.
It leaves the current journey unchanged. GPS-replacement ownership/gates remain
in their existing path; a regression verifies preview refusal there as well. A
positive control verifies legitimate current-route redraw still works.

Eleven deterministic regressions cover real Start/LIVE ownership, primary preview,
forged permission with preview metadata, saved restoration, missing leg metadata,
changed rule claims, all three alternatives, offline cached preview, GPS replacement,
legacy/non-strict bootstrap and legitimate redraw. They check geometry/selection,
state, persistence-call count and absence of engine requests. These are preview
shape fixtures consistent with the isolated response, not new GraphHopper results.

## Full UK page evidence

The disposable full-candidate browser test now invokes actual Start on a synthetic
baseline using the normally booted UK modules and real MapLibre mount transaction.
It then supplies a synthetic accepted fix through the actual GPS API and connects
the preview to the genuine LIVE host. The context guard accepts that host context
while preview navigation remains unauthorized. An isolated-preview-shaped candidate
is refused by the lifecycle and reroute paths without changing the active route,
steps or mode. Closing the preview retains the LIVE UK journey; the fixture stops
it explicitly afterwards. No mode getter or navigation gate is mocked.

This extends the eight earlier host/frame checks to twelve. Browser provider
responses and initial route/authority are synthetic; route HTTP calls are blocked
and must remain zero. The test does not verify engines, physical GPS, warning output
or selected settings against real roads. No production account/profile/history is
accessed, no deployment occurs and the test uses a disposable SQLite/browser profile.

## Remaining work

Positive GH11 guidance is still NO-GO: app_preview explicitly returns no navigation
permission and selected-fixture checks are not a guidance capability. Full rule,
origin/endpoint, leg/turn, stop-order and reroute evidence must be supported before
that contract changes. Its preview legs now use the canonical UK begin/end planning indices, but
that compatibility correction is not a complete leg/turn guidance contract. No flags are relabeled or mandatory rules relaxed here. UK settings and
positive engine/alternative/multi-stop/reroute parity remain pending; Milestone 3 is
still open. No physical-phone or production readiness is claimed.
