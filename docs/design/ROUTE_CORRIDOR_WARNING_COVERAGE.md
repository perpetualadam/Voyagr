# Selected-route warning coverage

The initial planning lookup samples a few small areas. It cannot establish coverage
of a long or bent road route. A separate optional POST to
`/api/route-warning-observations` now uses the selected route's actual geometry.
It never changes routing exclusions, avoidance assessments or navigation permission.

## Acquisition and honest status

The scan queries stored cameras and Overpass traffic signals and level crossings
within 150 metres of the unsimplified route. Overpass uses overlapping polyline
chunks, 25 m simplification and a 200 m query buffer, then filters results against
the original geometry. Queries are split below 60,000 bytes, preserving the existing
65,536-byte transport cap. Successful exact-query cache entries allow subsequent
refreshes to reuse completed chunks after an interrupted scan.

`ALL_SEGMENTS_QUERIED` describes the geographic query, not completeness of OSM or
the camera database. The Info disclosure distinguishes this from partial, stale
and unknown evidence. Camera import age remains unverified. A fresh empty result
never proves the absence of hazards. Geographic proximity does not verify the
road, direction, live signal phase, barrier state or camera enforcement.

Bounds: 100,000 input points, 12,000 simplified query points, 12 query batches,
5,000 returned observations, 50,000 candidate database cameras and an 8-second
cooperative work budget inside the existing bounded executor. Source retrievals
older than 300 seconds remain stale. Unsupported extents, truncation, malformed
records, admission limits and deadlines cannot produce a complete-query claim.
The spatial index has a bounded grid with checked fallback scanning.

## Client lifecycle

Selected-route synchronization and active GPS ticks request a scan independently
of route calculation. Info includes a manual refresh action. Requests use same-origin
credentials, no-store and an 11-second abort; automatic retries are spaced by at
least 30 seconds. Offline mode, simulation and navigation startup skip acquisition.
The service worker never caches or queues this geometry POST.

Geometry binding and generation checks reject late results for replaced routes.
Fresh whole-category results replace earlier mapped points; partial, stale or
failed acquisition retains earlier observations. Nonmapped incidents are preserved.
Selected-option data is kept consistent, and active navigation uses its existing
local persistence owner. Large new result sets use a cheap distance prefilter before
expensive along-route alert calculations. This scan does not change alert controls.

## Verification and limits

Synthetic Python tests cover bent and long geometry, chunk-buffer coverage,
transport limits, local-camera independence, empty results, truncation, malformed
records, cache-assisted retries and deadline handling. Jest covers selection,
late-response rejection, startup/offline guards, failure retention, stale wording
and alert prefiltering. Chromium exercises the actual modules and refresh control
with intercepted responses at phone widths and 200% text; the isolated app lab
checks existing personal-mode, routing and private-access flows.

These checks do not establish live provider latency, complete national mapping,
production deployment or audible warnings on a phone. After deployment, calculate
a long route with bends and intermediate stops, refresh Info, inspect coverage for
each category, and test known mapped locations as a passenger or in simulation.
Verify failed/offline refresh preserves the route and earlier warnings, route
replacement does not inherit old coverage, and existing camera/signal/crossing
controls and audio still behave as configured. Do not infer safe road access from
these warnings. Very detailed or dense routes can still correctly show limited
coverage; the bounded scan deliberately reports this instead of hiding gaps.
