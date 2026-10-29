# Phase 12F-C staged Valhalla acceptance procedure

**PRODUCTION_NO_GO.** This is an acceptance programme, not a completed real-engine acceptance. See [implementation matrix](VOYAGR_PHASE12FC_VALHALLA_IMPLEMENTATION.md).

| Evidence class | Current state |
| --- | --- |
| Repository paths and offline adapter | Inspected; deterministic regression results in PR |
| Real Valhalla fixture execution | NOT_TESTED; no engine contacted |
| GH fixture 0 displacement (~46.31m) | Operator-reported; no inference about Valhalla |
| Private GH/OSM evidence | Unavailable here; do not modify or relabel it |
| Engine/tile/native-correlation provenance | UNVERIFIED |
| Independent review | NOT_PERFORMED; reviewed remains false |

## Stage 1 — establish identity before routing

An authorised operator must first identify an approved isolated Valhalla instance. No production/VPS access, capture request, restart, graph build or deployment is authorised by this programme. Obtain separate approval before contacting any VPS. Reuse existing read-only evidence where available; leave unavailable fields unresolved.

Privately record the exact executable/container digest, build version/source commit and build flags; service process/instance identity; observer, UTC collection interval and clock basis; launch command and hash of the configuration actually loaded by that process. A repository `valhalla.json` hash is not a loaded-config attestation. Bind active tile archive/directory manifest, per-file hashes, build/import receipt, tile generation time, source PBF/export hash and acquisition interval, traffic tiles/version, coverage bounds and completeness checks to that same service instance. Record import filters, turn/access/conditional/vehicle rule support and time zone behavior. `/status` alone does not prove active configuration, tiles or an authenticated build.

Record effective auto costing defaults/overrides, endpoint search radii, heading/tolerance, candidate-edge filtering, hierarchy limits, exclusion radius/node-snap behavior and supported exclusion features for the exact build. Preserve unsupported-option errors. Explain differences from GH's source/import timestamp; equal geography or a filename is not an identical dataset. Record camera-area dataset hash and mandatory category coverage independently of engine roads.

For transport, retain direct target identity (without publishing credentials), TLS/recording-hop identity as applicable, method, exact origin-form target, HTTP status, content encoding, UTC request interval and redirect policy. Bind each request/response byte hash and service identity into a separate unreviewed transport receipt. Any proxy needs its own ingress/egress byte binding, transformations and engine-hop attestation. A local declaration of `/route` and HTTP 200 is not that attestation.

## Stage 2 — privately specify the five fixtures

Use `scripts/fixtures/phase12fc/acceptance-plan.json` as an unreviewed inventory. Fill coordinates/OSM identities **only outside Git**. For every case retain original requested origin, destination, all stop order/type, exact segment pair/direction specifications, original request options, time/vehicle assumptions, complete export boundary and expectation source. Each row includes baseline and adversarial/restricted variants in a private variant ledger; run separate five-row replay bundles for variants and preserve every failed request.

| ID | Controlled experiment | Independent evidence and failure probe |
| --- | --- | --- |
| 0 | Original GH motorway-origin request, auto; original requested destination | Recover original requested coordinates from original request bytes, never GH snapped endpoints. Bind requested origin and Valhalla route-selected correlation separately; exact intended carriageway/direction, adjacent roads and ramps. Include reverse direction/no legal transition. Compare displacement with 2m gate and operator-reported GH ~46.31m without assuming either engine is correct. |
| 1 | Urban complex turns | Via-node and via-way, no/only restrictions, barriers, complete members; conditional time and vehicle exceptions. Include forbidden-turn candidate. Unresolved relation or missing member stays unverified. |
| 2 | Footway/pedestrian adjacency | Motorcar origin beside footway/service road; explicit access hierarchy, private access, bollard/gate, one-way and height/width/weight cases. Walking response cannot prove automobile eligibility. Separate walking/bicycle support from this initial auto-only adapter. |
| 3 | Mandatory camera area and hazards | Baseline through area, requested exclusion, boundary/tangent/crossing segments, railway and road-segment bans, >50 candidates, unsupported exclusion and no-compliant-route cases. Verify every returned segment, not just vertices or sampled cameras. A relaxed recovery response must not acquire navigation authority. |
| 4 | Multi-stop and alternatives | At least three requested locations with explicit stop order/type; all native correlations, all leg seams <=2m, all alternatives, geometric visits plus actual serviced stop evidence. Probe disconnected leg, omitted stop and mixed-provider fallback. A 75m geometric visit check is not native snap or stop-service proof. |

Use identical source data where possible. Compare original requested endpoints, native directed-edge identities and geometry endpoints as three distinct facts. A `trip.locations` echo, first shape vertex, `/locate` nearest candidate or later trace match is insufficient route-selected correlation evidence. If the installed build cannot expose it, document that limitation; native origin remains UNVERIFIED. No coordinate shift to manufacture a pass.

## Stage 3 — capture immutable private bytes

Only after the separate engine-access approval: an operator-controlled recorder sends the exact production-equivalent POST JSON body to the approved isolated `/route`, with redirects disabled and finite timeouts/request budget. Do not copy GraphHopper-specific hints into Valhalla. Capture ordinary, retry, baseline/minimal and alternative variants under their actual request contracts, not an invented merged request. Use no automatic unbounded retries; preserve refusals/status codes.

Record the actual prepared request body bytes before sending. SHA-256 those bytes directly; never hash a decoded/re-serialised object as wire evidence. Capture response entity bytes without automatic decompression (for Python requests, stream the response and read `response.raw` with `decode_content=False`); hash before parsing and preserve Content-Encoding and headers privately. This adapter consumes identity/uncompressed JSON entity bytes only. Keep encoded originals; compressed responses require a separately reviewed derived-byte binding, not replacement of originals. No credentials/raw headers in public reports.

Write raw records once, exclusively, outside Git and outside the existing 12F-B evidence directory, with private ACLs chosen by the operator. Do not change originals to satisfy a reader. Keep original bytes, preparation log, all statuses, wire hashes, engine/tile/import/source manifests and recording-hop receipts separately. A capture writer is intentionally not added: there is no authorised reachable engine or verified runtime contract here.

Construct a **new derived bundle** outside Git, leaving originals untouched. Exact schema:

```json
{
  "schema": "voyagr-valhalla-private-v1",
  "source": "DECLARED_RECORDING",
  "fixtures": [
    {
      "id": 0,
      "original_locations": [{"lat": 0, "lon": 0}, {"lat": 0, "lon": 0.001}],
      "request_base64": "<base64 of exact request bytes>",
      "request_sha256": "<SHA-256 of those bytes>",
      "response_base64": "<base64 of exact response bytes>",
      "response_sha256": "<SHA-256 of those bytes>",
      "transport": {"method": "POST", "target": "/route", "status": 200}
    }
  ]
}
```

Illustrative coordinates above are synthetic, not fixture 0. Supply exactly IDs 0–4 in order. Preserve failed/non-200 records in the private ledger; their adapter rows are refused, not repaired. Bind bundle hash to raw records and separate provenance ledger. `DECLARED_RECORDING` is an operator declaration, not authentication. `original_locations` must come from original request evidence; adapter equality with captured request detects inconsistency but cannot authenticate the declaration. Extra native locations in responses are ignored as proof. Never supply GH snapped locations as originals.

Limits: 24MiB bundle, 64KiB request, 2MiB response per fixture, two alternatives, 20 legs/locations; strict duplicate-key/nonfinite JSON rejection. Oversized or unsupported records need a reviewed format extension, not truncation of evidence.

## Stage 4 — offline replay and independent OSM work

From the repository root, no bundle prints five NOT_TESTED rows:

```powershell
.\.venv\Scripts\python.exe scripts\replay-phase12fc-valhalla.py
```

For a new private bundle (replace the absolute placeholder):

```powershell
.\.venv\Scripts\python.exe scripts\replay-phase12fc-valhalla.py --bundle 'C:\PrivateReview\Phase12FC\bundle.json'
```

This makes no engine calls, writes no source/output files and uses the existing no-atime reader. Unsafe links/reparse entries, no-atime capability or ACL failure must remain refused; do not elevate, weaken ACLs or add a normal-open fallback. Default no-input exit is 0; populated diagnostic replay exits 1 even for valid geometry because acceptance remains unverified; whole-input/read refusal exits 2. Row-level failures use fixed `REFUSED_OR_UNAVAILABLE`; public output never includes private coordinates, geometry, OSM IDs, filenames, wire bodies, exception text or credentials.

Replay verifies declared byte hashes, original/request endpoint equality, response shape/summary structure, all alternatives/legs, <=2m seams, ordered geometric visits and the existing endpoint gate. It does **not** contact or authenticate an engine, establish native snaps, verify all avoidance options, reconstruct OSM route-edge candidates or grant acceptance. It reports live engine NOT_TESTED even when bytes are declared recorded.

Separately run existing private OSM inspectors on a newly bound 12F-C specification. Reuse a byte-identical export only if its extent, source and completeness cover this route; record why. `RoadOracle.bind_capture()` is GH-specific: do not feed a Valhalla envelope to it or relabel its receipt. Standalone `RoadOracle.analyse()` topology with explicitly selected exact endpoint segments and candidate directed transitions can proceed independently of provenance acceptance. Label geometry-anchor comparisons as geometry anchors, not native snaps. Complete-route legality needs independently reconstructed directed segment candidates, restriction members, access/barriers, conditional/physical support and extraction completeness; no adapter here invents those candidates. Existing unresolved-restriction/global safeguards remain in force. No-path search exhaustion is not proof of a closed component; a known exported path is not navigation approval.

## Stage 5 — independent review and decision

An authorised reviewer independent of capture preparation must examine original wire bytes and hashes, original requested coordinates, all recording hops, installed executable/active config/tile/import/source bindings, camera dataset and complete exclusion coverage. Check all variants including failures/recovery, native route-selected edges, original endpoint segments, directed transitions, restriction completeness, every leg/alternative, origin displacement and original destination preservation. Verify frontend/API/cache refusal under mandatory failure; a raw engine route does not prove application navigation refusal.

An old unreviewed GH provenance receipt may support source identity if hashes/extent/time truly match. It cannot attest Valhalla build, import, transport or native correlation and cannot make a new receipt reviewed. Issue a separate 12F-C review record referencing immutable supporting hashes and explicit limitations; no existing flags are changed by these tools. `reviewed:true` requires actual authorised independent examination under the acceptance contract, not wire self-consistency or this replay's exit code. No accepted `oracle_sha256` is produced.

Operator checklist:

- Locally reviewable now: implementation matrix, synthetic adapter/gate tests, no-input five-row report and unchanged production diff.
- Missing: five real captures and variants, authenticated engine/config/tile/import bindings, independent recording-hop evidence, route-selected native correlations, complete OSM/camera coverage and full-area/no-compliant-route proof.
- Independently reviewable after collection: original coordinates and wire bytes, all sidecar bindings, exact directed-edge candidates/restrictions, exclusion parity, fallback/cache/UI refusals and discrepancies against GH with source differences recorded.
- Remains unavailable here: private Windows/VPS records, actual runtime filesystem/configuration, tiles and live routing outcomes. Synthetic wrong-carriageway/one-way tests do not establish the real motorway result.

Do not advance production while any mandatory requirement, provenance, native correlation or independent review remains unresolved. Final operational status: **PRODUCTION_NO_GO**.
