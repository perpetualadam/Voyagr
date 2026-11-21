# Selected settings on every route option

## Problem and change

The primary Valhalla request already received the selected avoidance settings, but
some alternative/recovery paths could silently relax them. Scenic/Quiet fetching
retried without exclusions; Optimised ensure did not inherit road preferences;
Optimised Discovery used two endpoints and a subset of hazards; recovery reduced
exclusions and eventually omitted them. OSRM cannot request these avoids.
GraphHopper could omit selected costing rules for unavailable attributes or drop
soft costing models after rejection. The separate multi-stop endpoint also did
not forward selected signal/crossing observations to GraphHopper legs.

Every used Valhalla alternative/recovery path now inherits the primary request's
locations, travel mode, exclusions, departure time and costing settings. Variety
biases may fill unset options but cannot override selected options. Metadata-only
recovery remains available, but shrinking the selected exclusions is removed.
Scenic/Quiet and Optimised requests do not retry without supplied exclusions.
GraphHopper declines when a selected costing preference lacks an observed required
attribute, and a rejected custom model never falls back to unfiltered routing.

When the settings-capable engines fail, `/api/route` returns `success: false`,
`error_code: ROUTING_SETTINGS_UNSUPPORTED` and `automatic_selection_allowed: false`
instead of offering an unconstrained OSRM route. The existing frontend failure
handling retains the current journey. Unconstrained OSRM fallback remains available
when no avoidance or special optimisation is requested. Multi-stop legs likewise
skip unconstrained OSRM when settings are selected; the existing incomplete-journey
gate refuses a geometry-less estimate. Signal/crossing selections now reach both
multi-stop provider paths, independently of mapped-warning visibility.

## Limits

These are provider-request guarantees, not proof that every selected hazard has
been avoided. Valhalla still has a 50-exclusion limit; incomplete/stale map coverage,
road association and provider behaviour remain subject to the existing independent
assessment. Preference and mandatory modes retain their existing meanings; no
unknown evidence is promoted to verified, and no critical navigation gate is
relaxed. Existing max-detour/route-variety ranking policy is unchanged. Map markers,
spoken warnings, accounts, authentication and production configuration are unchanged.
A failed calculation may now produce fewer options or an explicit failure instead
of a route that silently discarded settings.

## Synthetic validation and phone acceptance

`tests/test_selected_route_settings.py` exercises the real Flask request/recovery
boundary with initial and reroute requests, checks all exclusions and waypoints on
every outbound Valhalla attempt, and proves no unconstrained fallback is requested.
It also covers the Optimised ensure/discovery interfaces, rejected Scenic/Quiet
requests and multi-stop preference on/off behaviour. Existing smoke, capability,
avoidance-integrity, warning and frontend tests remain required.

After approved deployment and a coherent asset update, while parked:

1. Select the desired camera, signal and crossing routing settings and calculate
   a synthetic/familiar journey. Inspect each offered route and its assessment;
   route names alone do not establish avoidance.
2. Repeat with the selected settings off and with a waypoint/multi-stop journey.
   Confirm each requested visit remains present and independent mapped warnings
   remain available in both cases.
3. Check rerouting as a passenger. If a capable engine fails, confirm the current
   journey remains and a settings failure appears instead of an unconstrained
   replacement. Provider outage simulation belongs in the isolated lab, not production.

Repository tests do not establish deployment, physical-phone behaviour or actual
hazard-free routing. No production change is part of this fix.
