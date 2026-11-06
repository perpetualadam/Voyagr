# GraphHopper route and OSM lane connections

6 November 2026. Stock GraphHopper 8's [OSM lane-count parser](https://github.com/graphhopper/graphhopper/blob/8.0/core/src/main/java/com/graphhopper/routing/util/parsers/OSMLanesParser.java)
reads a numeric count, with a default of one and a cap of six. That is not native
per-lane turn guidance. Its [turn-lane feature issue](https://github.com/graphhopper/graphhopper/issues/1131)
remains open at research time. The app's enriched-provider adapter is conditional
compatibility, not proof that the deployed GraphHopper emits such objects.

This increment keeps the selected GraphHopper route and derives a separately
labelled **Mapped** recommendation only from positive OSM lane connectivity.
It does not request Valhalla instructions for a different route or upgrade a
lane count/turn heuristic to native GraphHopper evidence.

## Positive connection requirements

The [OSM connectivity specification](https://wiki.openstreetmap.org/wiki/Relation:connectivity)
uses from/via/to members and numbered lane connections. Parenthesized targets
require an extra lane change; this implementation never selects a starting lane
solely for a parenthesized target. It supports simple single-node via relations
with in-range numeric lane indices. Via ways, both-ways lanes, duplicate/conflicting
records, unsupported conditions/exceptions and malformed mappings remain unknown.

The matcher must establish a fresh stable unique incoming road/direction and a
bounded approach to the actual maneuver node on the selected route. The outgoing
route's first 30 metres are sampled against all observed incident ways using the
same node ID, geometry and travel direction. Exactly one outgoing source way
must match; restricted or count-unknown competitors are not silently discarded
to manufacture uniqueness. The junction and departure samples must remain inset
inside the acquired tile. Incoming/outgoing directional lane counts, road access,
supported lane attributes and simple observed turn restrictions must agree.

Exactly one supported positive connectivity relation must join the matched
incoming way, via node and outgoing way. Every recommended lane has a direct
connection to an in-range lane on that selected outgoing road. All such starting
lanes survive the text/visual/voice merge; none is claimed to be the driver's
occupied lane or the uniquely best lane for a later maneuver. No connection,
ambiguous branches, stale GPS/data, source disagreement or a relevant unsupported
restriction means neutral mapped layout or hidden guidance.

## Acquisition and compatibility

Only GraphHopper road-owner contexts request the optional relation enrichment.
The existing bounded shared Overpass way query remains unchanged. A separate
cached relation query includes connectivity and turn restrictions, with a
cooperative one-second budget, 512 KiB parsed metadata cap, 256 relations and
16 members per relation. It requires the same dataset timestamp as the way
context and retains the original retrieval time. Failure, oversize or a snapshot
mismatch disables relation-based recommendations while retaining the base speed
and layout context. No production URL, graph import, SCDB camera table or provider
route is changed. Operator evidence-file priority remains intact.

Generic map coverage remains PARTIAL and generic `attributes_allowed` stays false.
The dedicated `MAPPED_CONNECTIVITY` result is separate from native provider
guidance, legal-speed applicability, hazard association and navigation progress.
Existing native/reviewed guidance takes priority. Route changes, vehicle changes,
lost GPS and stale requests invalidate the context through its existing owner.

## Acceptance

Controlled tests exercise backend envelopes, source-clock mismatch/timeouts,
unsupported via ways, direct/parenthesized grammar, positive right/straight routes
through one junction, outgoing ambiguity, restrictions, route changes and actual
owner-to-overlay rendering/speech. Coverage floors apply to the new resolver.

Live acceptance is pending deployment. On a known junction, inspect the exact
from/via/to relation and selected GraphHopper geometry, drive the approach and
confirm the correct highlighted lane, route-change invalidation and GPS loss.
Many junctions have no explicit OSM connectivity relation: they intentionally keep
neutral mapped layout rather than a guessed lane choice. This is not camera-based
lane recognition or a surveyed legal-access guarantee.
