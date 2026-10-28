# Phase12F-B — Origin acceptance matrix

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** Base: merged Phase12F PR357 `8a01e63d98a15f56395bae5fae506cad0fb9cdf2`. GraphHopper remains preferred first eligible Optimised; Valhalla alternatives and honest OSRM fallback remain gated. No server access, deployment, dataset replacement, graph rebuild or restart. Live lab/device acceptance is NOT_TESTED.

|Acceptance area|Executed local evidence|Actual lab/device|
|---|---|---|
|Five displacement magnitudes, quarantine|12F regressions plus new five-case synthetic protocol PASS|Raw recorded/live NOT_TESTED|
|Native request/snap binding|Content/hash/shape/metric checks PASS synthetic|NOT_TESTED|
|No primary navigation from quarantine|Actual assess_response + JS manual/automatic gates PASS|NOT_TESTED|
|Memory/persistent reassessment|Actual Flask cache ingress, offline mocked backends PASS|Deployed caches NOT_TESTED|
|Empty/malformed geometry cannot clear restrictions|Three before-fail regressions now PASS|NOT_TESTED|
|Holes/envelopes/boundary/union|Independent GEOS100-point synthetic comparison + boundary tests PASS|Road-edge NOT_TESTED|
|Current requests/waypoints/provider alternatives|Existing12F real application-function tests PASS|NOT_TESTED|
|Shared deadlines/concurrent isolation|Index deadline/cancellation and16 finite independent contexts PASS|Sustained workers NOT_TESTED|
|GPS/urban canyon/moving-vehicle false rejections|Analysis, existing synthetic gates|NOT_TESTED|
|Legal safe exit/one-way/access/carriageway|No exception introduced|NOT_TESTED|
|Candidate matched graph pair|Hashes verified locally; operator12D summaries attributed|Fresh native import/production acceptance NOT_TESTED|

Controlled **operator acceptance preparation is ready**, conditional on reviewed captures, matching graph receipts and isolated service access. This is not full real-engine acceptance or production GO.
