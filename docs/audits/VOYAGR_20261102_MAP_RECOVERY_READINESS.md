# Map recovery cancels healthy resource loading

The operator supplied an AbortError stack ending at Map.setStyle, called by
voyagrMapSoftStyleReload from the render heartbeat. The same log shows focus
recovery escalating to setStyle and traffic initialization timing out while
waiting for isStyleLoaded. These are distinct from the browser Cache Storage
errors handled by worker v52.

MapLibre isStyleLoaded includes source readiness. A false value does not by itself
establish that the style definition is missing or broken. Replacing a usable style
aborts requests and replaces route/traffic/label layers, so repeated recovery can
interrupt the work it is intended to repair.

The correction recognizes a serialized, non-bootstrap version-8 style definition.
The core refuses full automatic replacement when that definition is available,
including when a client has an older recovery helper. The heartbeat no longer
interprets pending source tiles as a missing style. Source retry remains available
for stationary, persistently unloaded sources, and excludes healthy sources and
GeoJSON overlays. Missing-definition fallback remains available. Movement and
recent-camera-motion guards apply to source retries with usable definitions.

Traffic initialization uses definition readiness rather than waiting for every
source to finish. Missing and bootstrap definitions still defer. Genuine errors
remain logged; no broad AbortError suppression is introduced. Core, recovery helper
and layer-orchestration script URLs are refreshed together. Worker v52, auth,
route integrity and navigation permission checks are unchanged.

Validation includes actual core-function and heartbeat execution for focus
escalation, optional traffic loading, preserved layer identities, moving-camera
behavior, older helpers and missing-style fallback. Actual traffic orchestration
is exercised for immediate mounting with busy base tiles, bootstrap deferral and
style-load callbacks. Existing recovery, navigation and privacy tests remain.

After the approved deployment, verify the HTML loads all three scripts with
v=20261102styleready1. In a stationary planning preview, switch tabs and return;
leave the map open for several heartbeat intervals. Confirm the base map and route
layers stay rendered and source loading does not trigger full style reloads.
Retain real map/network errors for investigation. This local work does not prove
real-device or production behavior before that verification.
