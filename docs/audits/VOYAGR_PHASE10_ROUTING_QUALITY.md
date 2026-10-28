# Phase 10 — Routing Quality

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## Confirmed defects and changes

The final assessment boundary did not enforce a consistent GraphHopper-first display policy after intermediate hazard sorting and same-road deduplication. GraphHopper is now retained until independent assessment; a complete eligible Optimised route precedes other engines. This is a product preference, not a safety or global optimality claim. An ineligible mandatory route cannot displace a compliant fallback. Exact eligible geometry duplicates are removed only after assessment.

Hazard deduplication omitted OSM way identity, provider/namespace and freshness fields. A reproducible conflicting-source fixture dropped the second applicable record after the first unrelated one and falsely reported SATISFIED. Preserve distinct evidence records; disagreement must remain visible, even when this increases observation counts.

Request-local deadline exceptions inherited provider Timeout and were converted to fallback failures. Propagate them through GraphHopper, Valhalla, retry and multi-stop boundaries; return an application-owned JSON 504 when Flask retains control. Browser HTML errors no longer log body snippets or invent a route-complexity explanation.

## Evidence and limits

Actual application functions and Flask response hooks are exercised with deterministic providers and clocks. Independent camera evidence and bounded route-comparison metadata follow each alternative and selected route; UI labels distinguish Nearby markers from assessed applicability. Existing mandatory, geometry, multi-stop, request-generation, GPS and style recovery safeguards remain tested.

The supplied production 20-versus-10 discrepancy is not independently reproduced. The successful custom model is operator evidence, not a Phase 10 real-engine measurement. No trusted live graph-backed driven-road fixture or physical-device run was available. See the six companion reports and the complete inventory below.

## Complete changed-file inventory

28 files (including this report and the raw synthetic benchmark artifact):

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE10_CAMERA_AVOIDANCE_ACCURACY.md`
- `docs/audits/VOYAGR_PHASE10_CONTABO_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE10_DEADLINE_RELIABILITY.md`
- `docs/audits/VOYAGR_PHASE10_GRAPHHOPPER_VALHALLA_PARITY.md`
- `docs/audits/VOYAGR_PHASE10_ROUTE_RANKING.md`
- `docs/audits/VOYAGR_PHASE10_ROUTING_QUALITY.md`
- `docs/audits/VOYAGR_PHASE10_SYNTHETIC_ROUTING_PERFORMANCE.json`
- `docs/audits/VOYAGR_PHASE10_TEST_RESULTS.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `static/js/__tests__/phase10-routing.test.js`
- `static/js/app/calculate-route-orchestration.js`
- `static/js/app/route-preview-orchestration.js`
- `static/js/modules/navigation/route-selection.js`
- `static/js/modules/navigation/routing-request.js`
- `templates/index.html`
- `tests/test_phase10_routing.py`
- `tests/test_route_enrichment.py`
- `voyagr/services/routing/engines.py`
- `voyagr/services/routing/enrichment.py`
- `voyagr/services/routing/integrity.py`
- `voyagr/services/routing/integrity_api.py`
- `voyagr/services/routing/multidrop.py`
- `voyagr/services/routing/orchestrator.py`
- `voyagr/services/routing/route_variety.py`
- `voyagr/utils/request_budget.py`
- `voyagr_web.py`
