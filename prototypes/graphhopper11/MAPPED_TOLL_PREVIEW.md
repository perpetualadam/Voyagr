# Registered mapped toll exclusion — Milestone 3

This is an isolated settings-parity slice of PR #540. Production/GH8 remain
untouched; navigation and automatic selection remain false. General journeys,
hazard coverage, physical-phone acceptance and production migration remain NO-GO.

## Implemented contract

An operator-owned registered case must set literal `no_tolls: true`. Only then
can the policy compiler compile the selected `tolls` requirement. Client settings,
a positive graph attribute inventory or a truthy string cannot grant this capability.
Other unsupported mandatory rules still refuse before engine/cache use.

The pinned GH11.1 runner uses flexible routing with `toll != NO` priority zero,
combined with the existing motorway model when requested. This excludes ALL, HGV
and MISSING values. Excluding HGV-only toll roads for the car profile is deliberately
conservative, preserving the existing application's ALL/HGV selection semantics;
it is not a truck or vehicle-specific toll entitlement feature. The existing UK
preference helper uses a 0.01 penalty, which is not a mandatory prohibition; that
production helper is unchanged.

Every returned primary/alternative/whole multi-stop path is independently checked
against the loaded base graph's toll enum on every directed original edge. Virtual
segments retain original-edge evidence. Missing encoded values refuse, rather than
silently omitting a rule. Python checks the native flag and an ordered NO observation
for every trace edge, including cache revalidation. One bad candidate refuses the
response. The case, settings, source, graph and compiler hashes remain bound into
cache identities and saved references. References do not confer navigation authority.

## Data limitations and authoritative sources

GraphHopper 11.1's open-source enum is `MISSING, NO, HGV, ALL`:
[release-tagged Toll.java](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/routing/ev/Toll.java).
The [release-tagged OSMTollParser.java](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/routing/util/parsers/OSMTollParser.java)
maps `toll=yes` to ALL, selected heavy-vehicle tags to HGV and `toll=no` to NO.
It replaces unspecified toll values with country defaults; the generic default is
NO. Therefore an imported NO does **not** prove an explicitly surveyed toll-free
road. This feature promises exclusion of non-NO graph values only, not complete
real-world toll avoidance, current prices or conditional toll schedules. General
coverage/freshness and legal restrictions remain UNVERIFIED.

No graph rebuild, new import, configuration update or VPS action is performed by
this patch. Existing graphs without `toll` stay unsupported/refuse if opted in;
this is not authorization to rebuild or activate them.

## Acceptance and next gate

Synthetic acceptance must demonstrate ALL/HGV direct paths being excluded, a NO
bypass, bounded alternatives and complete intermediate visits, virtual endpoints,
no-compliant-path refusal, missing attributes, retained full app settings, cache
revalidation, corrupted observations and saved-reference restoration. Existing UK
browser acceptance must continue passing, with Start disabled and storage retained.
Test results are recorded on the PR for the exact revision; none constitute a phone
or production check. Next settings gaps include ferries and correctly classified
unpaved surfaces. They are separate capabilities, never implied by toll support.
