# Recovery actions for a retained stopped journey

## Report and diagnosis

After a map interruption, the operator calculated another journey and saw both
“Current journey retained” / “unresolved critical checks” and a navigation-stopped
explanation. They had not explicitly ended the previous journey, or were unsure.
These messages can coexist: live guidance is stopped, while the previous journey's
remaining intent is retained. This does not prove that the calculation caused a
new WebGL loss. No private route/history records were inspected.

`VoyagrJourneyModes.commitPlanning` refuses a candidate with unresolved critical
requirements/origin checks when replacing a live or retained journey. It preserves
that journey rather than silently discarding remaining visits. The screenshot
alone does not identify which candidate check failed, or prove the new route is
suitable for guidance. Those gates are unchanged.

The usability gap was that the existing `End previous journey` action lived only
inside `journeyModeChooser`. The newer direct-start flow hides that panel. A
stopped journey could thus leave a visible recovery instruction without a direct
map-check action and without an accessible explicit end action on Navigation.

## Source changes

- `templates/index.html`: put Check map recovery and End previous journey beside
  the existing Navigation start explanation, outside the hidden legacy chooser.
  Ending calls the existing journey-ownership/confirmation transaction unchanged.
- `navigation-safety-ux.js`: display the map-check action only for a recorded
  lifecycle failure and enable it only for a known stopped/non-starting lifecycle.
  Delegate to the existing verified resource reconciliation. Show persistent
  feedback for success/failure. A successful check clears stale start presentation,
  leaves Start refused until a new route is presented, and never starts guidance.
- `navigation-lifecycle-orchestration.js`: update recovery presentation after the
  synchronous stop flags are set, so the displayed action reflects the stopped
  lifecycle rather than the former active state. No stop/ownership gate is removed.
- `voyagr.css`: wrapping 44 px minimum touch targets for the two recovery controls.

Map reconciliation still checks the current style and route-resource cleanup.
Recovery retains old journey intent and requires a fresh calculation/GPS as before.
It does not prove map tiles/network/authentication work, nor automatically abandon
stops, delete saved routes/history, reload the page or grant navigation authority.
End previous journey remains an explicit action whose dialog warns about discarding
remaining stops. Declining leaves the durable record intact. A completed explicit
retirement removes that active journey record through the existing transaction;
this is separate from deleting saved collections or history.

## Verification

Focused commands:

```
npx jest static/js/__tests__/navigation-recovery-actions.test.js static/js/__tests__/journey-r9.test.js static/js/__tests__/navigation-failure-coherence.test.js static/js/__tests__/journey-r5-r6.test.js --runInBand
node scripts/privacy-http-lab/navigation-recovery-browser.cjs
```

The tests exercise the real lifecycle and existing durable IndexedDB abandonment
path, confirmation rejection, retained remaining visits, failed map checks,
subsequent recalculation requirement and unchanged mandatory-refusal behaviour.
The Chromium fixture uses production recovery markup, lifecycle and presentation
with synthetic map-resource checks. It checks failed/successful button activation,
retained intent/local marker, and 320/390/844 px layout with 200% text. It does not
claim phone navigation, real GPU recovery or live route acceptance.

Required backend selection, full Jest/lint and the isolated app/browser lab are
run separately. No production configuration, deployment or device data is changed.

## Acceptance after approved deployment

While parked, reload into the coherent updated shell without clearing browser
storage. After a stopped retained journey, the Navigation screen must expose both
a map-check action and an appropriate explicit end action. If map checks fail,
guidance stays stopped and the reason stays visible. If checks succeed, calculate
again; the old journey's remaining stops are still retained. Only confirm End
previous journey if discarding those remaining stops is intended. Cancel must
preserve the journey. Recalculate after explicit retirement, inspect any fresh
route limitations, and use Play preview for a simulation. Do not treat another
refusal as permission to disable checks or continue on an unverified route.

This change does not establish the original map-loss cause or guarantee that the
operator's new candidate will pass its critical checks. Phone acceptance and
production deployment remain unverified until separately recorded.
