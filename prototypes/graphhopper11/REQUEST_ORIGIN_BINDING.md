# Accepted-fix binding to the request origin

24 November 2026. Isolated browser boundary only; Milestone 3 remains in progress.

## Confirmed gap and change

The journey guard previously required a fresh accepted fix and checked that owner,
journey and fix stayed current, but did not compare the fix with the requested
start. A registered request for one location could therefore carry an unrelated
current journey token. This never granted navigation authority, but the token was
insufficient evidence that this request started at that accepted fix.

`journey_evidence.js` now exposes `captureForOrigin([lat, lon])`. It uses the same
owner/active/non-simulation/freshness checks as context capture, then requires exact
numeric equality with the accepted fix. The real UK routing-request builder's
`formatCoordPair` concatenates the numeric latitude/longitude directly; no new
rounding or accuracy-radius policy is invented. Malformed, missing, rounded or
displaced coordinates refuse. The request origin is copied into the token's private
WeakMap evidence; the frozen token contains no coordinates or other serializable
provenance. Existing `capture()` remains a context-only diagnostic, not a request
origin assertion. Request handling explicitly uses the origin-bound method.

The isolated viewer derives the start from its validated complete-request visits,
or the registered case template for legacy/settings-only requests. Every explicitly
journey-bound Calculate and Restore must capture origin-bound evidence before
preflight, route, restore or server routing-cache access. Anchor-only templates without a known
start refuse in this bound mode. Reroute/force-refresh flags do not bypass the
check. Unbound registered-case browsing continues without GPS, as before.

The existing token checks remain active after awaited work and immediately before
UI commit, alternative selection and saving. New accepted fixes, owner/journey
changes, expiration, simulation and closure invalidate previous work. No fallback
to a context-only token or to unbound routing is added. Refusal clears the isolated
preview/reference and save permission, retaining input choices, existing saved
records and the UK journey. It does not clear browser storage or stop GPS.

## Verification

Focused JavaScript tests cover exact/malformed/displaced/rounded coordinates,
uncertain accuracy, expiration, opaque copied tokens, complete/legacy/reroute and
restore paths, zero HTTP work on mismatch, and matching-origin delayed-response
invalidation through actual GPS/host APIs. The latter fixtures now start at their
registered synthetic origin so they still exercise a genuine late response; separate
negative tests explicitly cover initially unrelated fixes.

The real Chromium saved-plan scenario uses the actual guard and local GH11 service.
With a synthetic displaced fix, Calculate and Restore produce no policy/routing
requests; a saved entry remains. Returning the synthetic fix to the registered
origin permits preview calculation. A subsequent accepted-fix update during an
actual fresh restore still refuses the late UI result. The existing six Java
executions/six validations remain unchanged; GPS and owner inputs are synthetic.

## Limits and next evidence

This is a browser lifecycle guard, not signed server GPS attestation. Direct API
requests do not carry this opaque token and still return `gps_verification:
UNVERIFIED`, `app_integration_allowed: false` and disabled navigation. No new GPS,
accuracy, timestamp or heading fields are sent or persisted. Existing request
coordinates are sent only when the bound check succeeds.

Exact coordinate agreement does not establish physical accuracy, road identity,
travel direction or a legal approach. The request-graph parallel-road re-snapping
control remains applicable; see QUERY_GRAPH_EVIDENCE.md. Heading is not present in
the accepted-origin interface, and unsupported heading fields continue to refuse.
The registered-case prototype also does not gain arbitrary live-origin routing:
a moving real fix will generally not equal its fixed public test coordinates.

Future guidance needs independent live-origin road/direction and uncertainty
semantics, actual snapped-traversal and turn/leg validation, full settings/cache/
selection/restore acceptance and physical-phone checks. A future reviewed update
requires a fresh package/manifest; existing stored references are not migrated or
deleted. No production wiring, deployment or VPS changes are included. Migration
remains NO-GO and navigation remains disabled.
