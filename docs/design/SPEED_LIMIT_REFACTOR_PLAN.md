# Incremental speed-display refactor

The phone's persistent unknown limit is unresolved. This plan preserves working
navigation while separating acquisition, interpretation and presentation. It
is not a claim that a refactor fixes missing map tags or the physical-device issue.

## Verified current pathways

| Responsibility | Existing owner |
| --- | --- |
| GraphHopper max_speed details to mph maneuvers | `voyagr/services/routing/route_entries.py` |
| Accepted GPS and current route-position evidence | `static/js/app/gps-orchestration.js` |
| Legal road attributes and labelled map observations | `static/js/app/road-match-orchestration.js`, `static/js/modules/navigation/road-matching.js` |
| Source selection, async context refresh and rendering | `static/js/app/speed-widget-orchestration.js` |
| Fetch/cache helpers and numeric/unit formatting | `static/js/modules/navigation/speed-limit-widget.js` |
| Fresh source-based unit refresh, with startup/legacy fallback | `static/js/app/units-preferences-orchestration.js` |
| Separate older speed API with provider-specific logic | `voyagr/api/navigation.py`, `speed_limit_detector.py` |

The normal browser path uses road-context observations with selected-route fallback.
It returns before calling the older speed endpoint. Having TomTom logic in that
endpoint does not establish TomTom participation in the current widget.

## First increment: one display resolver and renderer

`resolveSpeedDisplay` is a pure function in the existing speed-limit-widget module.
It returns a source kind, mph value, separate legal-alert value, observation,
badge/title and unavailable reason. It validates finite numeric values and source
kinds once. Source producers retain responsibility for freshness, direction,
geometry, applicability and GPS uncertainty; this increment does not loosen them.

Preserve normal priority: applicable matched evidence, mapped observation, route
observation, unknown. The coordinator evaluates fallback sources only when needed,
and the existing renderer consumes the same resolver. Observation values never
populate the limit used for legal-speed alerts. Invalid candidates may fall through
to a valid lower-priority source instead of preventing its display. The renderer's
badge and border now agree with the selected source even if competing inputs are
supplied. No engine/profile replacement, new persistence, network calls or public
provider-name disclosure is introduced.

Unit changes now re-resolve fresh local sources when the road coordinator is
available. This prevents a mapped/route observation from disappearing merely
because its legal-alert number is null. Keep the numeric-only formatting fallback
for startup, unavailable/stale GPS and legacy configurations; do not initiate
extra provider requests for unit changes.

## Further independently reviewable increments

1. Give acquisition, matching and display a shared diagnostic outcome contract;
   inspect the private phone's selected-route Info before changing matching rules.
2. Decide whether the older API/TomTom path is supported, wired explicitly or
   retired after checking actual callers/configuration and regression coverage.
   Do not claim a provider is integrated merely because its functions exist.
3. Remove obsolete duplicate helpers only after caller/compatibility checks.

Keep API signatures compatible during migration. Use the existing full-candidate
GPS/Overpass and route-section browser checks, including unknown gaps, freshness,
source precedence and legal-alert isolation. Retest on the private phone origin;
no production deployment or merge is authorized by this document. Rollback this
increment by reverting the resolver/coordinator/renderer changes together.
