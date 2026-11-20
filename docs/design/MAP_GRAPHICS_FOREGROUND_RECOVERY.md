# Map graphics recovery after returning to the app

## Incident evidence and limits

The operator reported that the map disappeared about seven minutes into a journey,
with a loading/recovery message while buttons and text directions remained. The
exact message was not captured. The power button was pressed afterwards while
trying to take a screenshot. Neither the initial graphics-loss cause nor eventual
uninterrupted automatic recovery is established. This report is consistent with,
but does not prove, WebGL loss. Authentication and tile/network failures are other
possible causes; the change below does not repair those failures.

No seven-minute shutdown timer was identified in the inspected recovery path.
Production deployment/version and physical-phone behaviour were not inspected.

## Reproduced defect

The context-recovery owner attempts restoration after 1, 3 and 10 seconds. It pauses
while hidden. After the third attempt it reports unavailable, but previously kept
that exhausted budget across later hidden-to-visible transitions. Unlocking the
phone could therefore never request another GPU restore, even if resource pressure
had subsided. A regression reproduces exactly three calls before the fix, with no
fourth call after a synthetic unlock.

## Change

`static/js/modules/map/map-context-recovery.js` allows one additional three-attempt
burst after a genuine hidden-to-visible transition while a lost current context
has exhausted its initial burst. There are at most six requests per loss; repeated
focus/visibility notifications cannot replenish the budget. Hidden pages pause
work. Duplicate loss/restoration events are idempotent, unavailable is reported
once per burst, and disposed/replaced maps cannot restart. After successful
restoration, the extension is reacquired for a later independent loss.

`static/js/voyagr-core.js` shows a specific retry message for that resumed burst.
If recovery remains unavailable, it suggests reopening the app when safely stopped.
The existing passive overlay does not intercept controls. No page reload is
initiated, no map is recreated, no style is reset by this owner, and navigation,
route resource ownership, credentials and stored device data are unchanged.

This is a bounded recovery improvement, not a guarantee against browser/OS GPU
failure or proof that this defect caused the reported seven-minute incident.

## Validation

- `npx jest static/js/__tests__/map-context-recovery.test.js static/js/__tests__/map-recovery-orchestration.test.js static/js/__tests__/map-recovery.test.js static/js/__tests__/navigation-wake-lock.test.js --runInBand`
- `node scripts/check-map-context-recovery.cjs`
- Required repository backend selection, `npm run lint:tests`,
  `npm run test:ci -- --maxWorkers=2` and the isolated app/browser lab.

The Chromium script uses real MapLibre and real `WEBGL_lose_context` events with
controlled refusal of restoration. After the first three refused calls, a
synthetic hidden/visible transition permits restoration on the same map. It checks
retained route rendering, retained synthetic journey state, cleared overlay and
mobile canvas density at 390 px and 1280 px. It does not model real handset heat,
OS process eviction, physical lock/unlock or live route progress. Unit regressions
cover caps, duplicate events, unsupported extensions and retired map ownership.

## Phone acceptance after approved deployment

While parked, confirm the deployed shell is current, then verify map, GPS and
existing saved device data without clearing browser storage. Lock/unlock during a
test journey and check that the map and route return, controls remain usable and
navigation is not restarted. If a failure recurs, record the exact overlay text and
Info's map-renderer status after stopping safely; note whether the basemap, route
line, text directions and GPS each continued, and whether foregrounding restored
anything. Authentication/resource failures need their own diagnosis.

No forced GPU loss, screenshots or recovery interactions should be attempted by
the driver while travelling. A successful desktop synthetic test does not certify
phone audio, battery/thermal behaviour or uninterrupted navigation.
