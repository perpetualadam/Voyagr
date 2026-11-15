# Local-first full-candidate browser verification

Date: 2026-11-14. Builds on Phase 4 #497 and the isolated HTTP harness #498.
No production data, database policies, infrastructure or deployment changed.

## Delivered checks

`python3 scripts/privacy-http-lab/run.py --browser` starts a disposable full app
alongside its own GoTrue, PostgREST and Kong services, then uses real Chromium at
loopback. No production environment file or existing SQLite/media/browser data is
copied. No host port is published. The full app uses a temporary writable source
copy and fresh database; importing its real Flask app avoids __main__ routing
monitor startup. Its templates, executable release guard, scripts, private APIs,
Supabase SDK, service worker and IndexedDB remain active.

Forty browser assertions cover:

- Optional defaults OFF; actual history and distance-unit controls; consent,
  synthetic recent searches and units surviving reload.
- Two real tabs and history withdrawal; rejected new recording while old entries
  remain available. Owner generation is allowed to settle before user changes.
- Real synthetic signup/signout/sign-in and actual account callbacks; no automatic
  guest-data import or consent inheritance; A/B saved-place isolation.
- Actual export download and selected-category deletion; export omits SDK tokens;
  deletion survives reload. Saved-place fixtures are seeded through the actual
  coordinator, not through the add-favourite UI.
- Offline structured-route read/write, actual worker shell reload, and account-
  scoped saved routes remaining visible after offline startup.
- Actual worker-byte change through a fixture-only endpoint: a new worker waits
  while the page remains open; closing/reopening retains data and OFF choices.
- Full browser process restart with its real persistent profile and retained data.
- No optional private upload requests initiated in the normal scenarios, including
  real login/account switching. Necessary online processing remains a separate
  category. No live routing engine or map-data verification is claimed.
- Simulated IndexedDB.open failure in a fresh browser profile yields the storage
  warning, while anonymous invalid-route validation remains reachable (HTTP 400).
  This is not an actual quota exhaustion/eviction or successful live-route test.

The runner logs assertion labels and public diagnostic metadata, not storage dumps,
credentials, screenshots or videos. It records asset guard order failures without
altering its decisions. No hash/SRI or session check was disabled. The isolated
browser profile, downloads, records and media fixtures are discarded at cleanup.

## Issues reproduced and fixed

1. A delayed history-permission read could restore a checked UI after withdrawal.
   The actual recording transaction still rejected writes, but the checkbox could
   mislead the user. `historyEnabled` now checks the current OFF marker after its
   IndexedDB read. A regression test failed before the fix and passes afterward.
2. Offline full-page reload lost the active account's local-data view because auth
   initialization required a fresh `/api/config` request. Records were not deleted.
   The auth coordinator now remembers only the validated public Supabase URL/key,
   with schema, app origin and fetch time, for up to 24 hours. Network failure or
   the real worker's explicit offline response can reuse it; explicit online
   account disable clears it. HTTP permission/server errors, malformed data,
   unknown schema, foreign origins, future/stale timestamps, credential URLs and
   secret-key prefixes do not authorize fallback. An existing SDK session is still
   required. No extra token/password/email or optional grant is cached.

The second fix affects local startup, not server authorization. Revoked/expired
sessions remain rejected by backend/API/SQL checks. Local browser storage is not
app-encrypted, and offline viewing cannot prove a remote session has not since
been revoked. A hostile device owner or same-origin script is outside the normal
account-switch isolation claim. Reconnection is required when cached session or
bootstrap is unavailable/expired. No optional cloud sync capability is enabled.

## Verification evidence

Two consecutive isolated local runs passed all 40 browser assertions and all 42
real HTTP assertions. Browser: Debian Chromium 156.0.8078.79, Node v24.22.3,
Playwright 1.58.2. The managed environment blocked the Microsoft registry; the
runner therefore used its Node 24/Debian fallback. VPS2 already has the matching
Playwright image and will print its own browser/Node versions. No VPS2 browser run
has yet been claimed in this report. The earlier HTTP harness was independently
run on VPS2 successfully by the operator.

Focused tests cover the reproduced withdrawal race and public-bootstrap validation,
including lack of an SDK session and inability to write local storage. Final
frontend verification passed 182 suites / 3,583 tests, plus the quality guard.
The CI-selected backend suite passed 2,349 tests, with 1 skipped and 94 subtests
passed. Python/JavaScript syntax and whitespace checks passed. No labelled lab
containers or networks remained after cleanup.

## Manual verification after candidate installation

Use synthetic records and a separate browser profile. Never use production accounts
or real dashcam files in this lab. Record candidate commit, browser/phone version,
steps, expected result, actual result and PASS/FAIL/NOT TESTED. A reload or screenshot
alone cannot prove no uploads occurred; pair UI checks with the automated network
and backend assertions. Do not share raw HAR/console/storage exports containing
tokens, personal locations or voice recordings.

| Scenario | Action | Expected evidence |
|---|---|---|
| Fresh profile | Open Privacy & device data | Optional choices OFF; cloud controls unavailable |
| History | Enable, record a synthetic item, reload; withdraw in another tab | Existing record remains; new recording stops; both controls OFF |
| Saved data | Create synthetic saved places/routes and change units | Correct records/preferences return after reload/reopen |
| Account changes | Use test A, sign out, use B, return to A | No automatic import; only intended profile's data shown |
| Export/delete | Export, inspect locally, delete selected category, reopen | Expected records exported without tokens; deletion persists |
| Offline | Warm candidate shell, disconnect, reload | Cached shell and supported local data available; online-only work fails truthfully |
| Update | Use the harness's controlled worker revision | New worker waits; no data deletion or consent enable after reopen |

No browser-facing host endpoint is provisioned by this harness. Headless checks can
run on VPS2 now; hands-on candidate access requires a separately reviewed private
HTTPS/tunnel setup. Do not expose the fixture GoTrue/admin database or worker test
endpoint publicly. Do not test the live c902cb1d app as proof of these new changes.

## Remaining release gates

Physical-phone GPS/progress/ETA and sign comparisons need controlled passenger or
parked testing; never operate the phone while driving. Test Bluetooth audio,
wake-lock behaviour, Android app-lock interference, actual camera capture and
long recordings separately. No synthetic browser test proves those work.

Also outstanding: deployed gateway/role grants, external TLS/proxy logs, backups
and restore/deletion reconciliation, encryption at rest and public privacy-text
review (including older first-run wording). These are separate from browser test
success. Optional cloud remains unavailable.

No SQL migration changed. No user records are deleted. Rollback can revert the two
coordinator fixes; an unused public bootstrap entry is inert without its reader.
Do not roll back server owner checks or reopen plaintext optional uploads.

**Production readiness remains NO-GO** pending the remaining release gates. Passing
tests do not establish GDPR compliance or authorize a production deployment.

## Follow-up: delayed speed-context presentation (14 November 2026)

The disposable lab now also runs seven full-candidate speed-flow checks, for
47 browser assertions alongside the 42 real HTTP assertions. These passed
locally. GPS is synthetic Chromium geolocation, road-context responses and the
map style are controlled fixtures, and no production data/services are selected.
This is browser wiring verification, not physical Android or map-data coverage.

The prior candidate retained a 30mph observation internally but displayed unknown
after the delayed source response. The new regression fails against that code
and passes with response-driven presentation refresh, without another GPS
callback. It checks the Mapped est. label, empty legal-alert state, coherent asset
loading, GPS-stop clearing and no uncaught page exceptions. This adds no uploads,
precise-location logs or persistent location records. Production/phone retest
gates and the NO-GO verdict above remain unchanged.

## Follow-up: selected-route speed investigation

Nine additional full-candidate checks exercise the actual GPS/controller/widget
pipeline with a GraphHopper-shaped synthetic route and unavailable Overpass.
Lifecycle setters seed the selected navigation state; this does not verify the
Start transaction or make live GraphHopper requests. The displayed sequence is
unknown during reacquisition, then 30, 20, unknown on an untagged section, and 40.
Route labelling and the empty legal-alert state are preserved.

The existing collapsed route Info now reports only navigation-active state,
counts of route steps carrying numeric limits, GPS-derived step number, and
road-context/match status. It does not expose coordinates, provider names,
source URLs or credentials, and adds no logging/uploads. This is on-device
diagnostic presentation, not analytics. The user's persistent unknown display
remains unresolved pending private phone observation; no source-priority or
matching change is justified by this passing controlled route test.

Two repeated combined runs timed out during the added cold browser's bootstrap,
before route assertions. A local load test confirmed immutable-asset request 501
returns HTTP 429 and reproduces the same incomplete-page state. The harness now
spaces the extra cold-browser scenario across the existing 60s asset-rate window;
it does not disable rate limits, retry failed assertions or bypass integrity
checks. Bootstrap failures report module/asset state and failed asset statuses.
This controlled rate-limit reproduction does not establish the cause of any
real-phone bootstrap or speed failure.

Final paced run: 42 HTTP and 56 full-candidate Chromium assertions passed.
JavaScript regression suite: 184 suites / 3,623 tests passed. Backend selection:
2,349 passed, one skipped, 94 subtests passed; asset-release checks also passed.
The private phone candidate and production remain unchanged by this work.

## Speed-display resolver refactor

Source selection and widget rendering now share a pure resolver with a separate
legal-alert value. Source freshness/association stays in the existing producers;
priority remains applicable matched evidence, mapped observation, then route
observation. No acquisition endpoint, source permission, logging or retention
policy changes. The older provider-specific speed API is not newly integrated.

Actual unit-control browser tests preserve mapped/route source labels through
30mph → 48km/h → 30mph without another GPS callback or legal-alert authority.
The refresh reads fresh local source state rather than the intentionally empty
advisory alert number. Startup, stale-GPS and legacy formatting fallbacks remain.
These controlled checks do not establish the cause or resolution of the user's
physical-phone failure. See `docs/design/SPEED_LIMIT_REFACTOR_PLAN.md` for scope
and remaining review work. Production readiness remains NO-GO.

## Explicit speed outcomes

The next increment exposes stable, coordinate-free reason codes for unavailable
mapped observations in the existing collapsed Info. Compatibility getters still
return an observation or null; source priority and acceptance rules remain intact.
An unavailable map source retains its diagnostic reason while a usable selected
route value still displays. No new logging, retention or provider requests were
introduced.

Validation: 186 JavaScript suites / 3,664 tests; backend web selection 2,349 passed,
one skipped and 94 subtests passed; 42 HTTP and 63 full-candidate Chromium checks
passed. Browser inputs are synthetic, not physical-phone or production evidence.
The persistent phone speed-display issue remains unresolved, and neither the
private phone candidate nor production was updated by this work.

## Normal-widget primary-provider integration

The real GPS/road-owner/coordinator/renderer flow now issues a direct primary
provider observation request. The full-page test first displays its Overpass
fallback, then a delayed controlled TomTom response replaces it without a new
GPS callback; Provider est. labeling, unit conversion and null legal-alert state
are checked. A separate real GPS route flow keeps route values usable when both
primary and Overpass fixtures are unavailable. These are controlled provider
responses, not live key, road-sign or physical-phone validation.

Validation: 42 HTTP checks and 66 full-candidate Chromium checks passed, with
disposable containers/networks cleaned up. Backend CI selection: 2,383 passed,
one skipped, 94 subtests. JavaScript: 190 suites / 3,698 tests. No production or
private-phone deployment was performed. Actual phone behavior remains pending;
no optional cloud capability or privacy production-readiness claim changes.

## Native GPS serialization regression

The primary provider's first integration used `Object.assign` on native GPS
coordinates. Inherited getters are omitted, so request fields could be missing
even though hand-written server probes worked. Required fields are now copied
explicitly. The new inherited-getter regression fails against the original code
and passes after correction. The real Chromium provider fixture now validates
latitude, longitude, accuracy and vehicle in the outgoing request before returning
its controlled observation; it previously supplied success without checking the
request body. Freshness, movement, priority and legal-alert policies are unchanged.

Validation: 190 JavaScript suites / 3,699 tests; backend selection 2,383 passed,
one skipped and 94 subtests; disposable lab 42 HTTP and 67 full-candidate Chromium
checks passed. This establishes the native request fix under controlled conditions,
not actual-phone resolution or the cause of the earlier Overpass-only symptom.
No production deployment was performed.

## Stationary speed and refresh continuity

A controlled stationary trace reproduces 19.0145mph on the old raw picker from
a false 8.5m/s sensor value despite only 9m of displacement within 12m accuracy
radii. New tests verify rejection before movement is established, repeated-jitter
stability, explicit-stop reset, and preservation of established/confirmed travel.
The real GPS/controller/DOM browser trace remains at zero for four controlled
jitter samples and keeps a fresh primary estimate visible. No live GPS recording
was captured; these are deterministic inputs rather than proof of phone resolution.

Valid primary acquisition refreshes at six seconds while retaining the existing
ten-second expiry; pending/failed refresh cannot prolong stale data. Stationary
heading changes do not clear valid data, while moving-heading guards remain.

Validation: 191 JavaScript suites / 3,710 tests; backend selection 2,383 passed,
one skipped, 94 subtests; 42 HTTP and 72 full-candidate Chromium checks passed.
Disposable lab cleanup completed. No production deployment occurred.
