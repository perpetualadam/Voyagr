# Phase12F-B — GPS and snapping tolerance

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** Base: merged Phase12F PR357 `8a01e63d98a15f56395bae5fae506cad0fb9cdf2`. GraphHopper remains preferred first eligible Optimised; Valhalla alternatives and honest OSRM fallback remain gated. No server access, deployment, dataset replacement, graph rebuild or restart. Live lab/device acceptance is NOT_TESTED.

The2m numerical allowance is unchanged. Precision5 half-cell rounding contributes at most about0.79m great-circle horizontal error per coordinate at the equator; the conservative stated1.6m bound also covers opposing half-cell differences. Precision6 rounding is smaller. A numerical comparison is not a GPS confidence interval or road-access radius. Existing1.999/2.001m boundary tests remain.

|Condition|What2m means|Risk/mitigation requiring evidence|
|---|---|---|
|Serialized origin/p5→p6|Tolerates numeric representation only|Confirm declared native precision; malformed/mismatched snaps quarantine|
|Normal GPS/urban canyon|Does not enlarge acceptance|Accurate road snapping may be rejected above2m; do not call uncertainty connectivity|
|Dual carriageway/junction|Cannot identify legal road/lane|Fresh directional graph/road association and legal turn/access evidence needed|
|Moving reroute|Request origin remains raw actual fix|Movement during calculation may cause conservative refusal; measure request age/motion on device before changing policy|
|Multi-stop|Every requested visit independently bound|Address entrance/road-offset false rejections require reviewed graph-backed access, not cached labels|
|Inside mandatory area|No compliant initial transition established|Quarantine; no silent removal/zero-length shortcut|

Safe-exit design is technically possible as a separately reviewed directed-edge transition with trustworthy vehicle road association, explicit treatment of unavoidable initial restricted travel, legal turn/access/one-way constraints, time/freshness and rejoin validation. It would require a reviewed mandatory policy, installed-graph proof and device lifecycle evidence; none was supplied. No implementation/exception is added.

Evidence-based mitigation sequence: measure real displacement/accuracy/age/road identity distributions; distinguish geocoded address access from vehicle origin; evaluate lawful directed connectors in isolation; review policy; add independent acceptance tests. Do not automatically increase2m or let confirmation/GPS uncertainty certify an unverified connection. Coincidence within2m still does not establish lane identity; existing GPS/road-match uncertainty pausing remains essential.
