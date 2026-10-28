# Phase12F-B — Recorded transport compatibility

Production remains **NO-GO**. GraphHopper remains the preferred eligible primary engine. No production or lab access, routing change, deployment, graph/data replacement, service restart or genuine capture rewrite occurred.

## Confirmed semantics and defect

The old replay validator required JSON `request['ch.disable'] is True`, so it rejected URL-only captures before considering independent transport evidence. A query-capture regression failed against merged PR358 and now passes with the required separately reviewed evidence. No genuine capture bytes/objects/hashes were supplied to this task or changed. The five genuine hash-verified captures are **user-reported**, not replayed here.

Official GraphHopper8.0 source is pinned to commit `1e224ae6bb1807ebc5037fb8de07c4f7cfaee749`; file hashes and links are in TRANSPORT_SOURCE_EVIDENCE.json:

- [RouteResource](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-bundle/src/main/java/com/graphhopper/resources/RouteResource.java#L167): POST accepts a deserialized GHRequest, transforms it, resolves profile and routes; it does **not** merge URI query hints. GET separately calls `initHints` with query parameters at108.
- [GraphHopperBundle](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-bundle/src/main/java/com/graphhopper/http/GraphHopperBundle.java#L144): stock transformer is identity `req -> req`.
- [GHRequest](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-api/src/main/java/com/graphhopper/GHRequest.java#L183): JSON unknown properties enter request hints via JsonAnySetter.
- [Router](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/core/src/main/java/com/graphhopper/routing/Router.java#L183): CH selection reads request hints; CH is enabled when the loaded CH graph map is nonempty (88). Lack of CH for car alone is not sufficient if other CH graphs are loaded. Without CH it can use LM or flexible routing; this is not proof of a particular solver. CH custom models are rejected at455.

Consequently `/route?ch.disable=true` on stock POST records a sent flag, not an applied request hint. HTTP200 cannot prove URL hint consumption, custom-model enforcement, absence of CH or safe connectivity. A custom adapter/transformer may behave differently; the installed build/proxy/graph must be independently evidenced. No such installed evidence was obtained here.

## Sidecar contract and immutable captures

Keep `request`, `response`, `request_sha256` and `response_sha256` unchanged. Append a separate `transport` object plus canonical `transport_sha256`; do not insert `ch.disable` into an old body and rehash it. Existing five unique cases/pairs, engine8/car/build/graph/import/road/oracle/dataset bindings, native snaps, camera75 hard-zero restrictions, origin/ranking/browser gates remain mandatory.

Transport schema1 contains `reviewed`, exact `method`, complete origin-form `request_target`, request/response SHA bindings, HTTP status, engine-build/graph SHA bindings, and independent transport-record `evidence_sha256`. Canonical sidecar hash uses the existing `sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode())` convention. This hash binds metadata; it is **not** independent evidence that invented metadata is true. Independently retain exact original byte hashes and the raw wire/capture receipt, including request/response pairing and recording point/hop. The operator reviews those receipts; missing records cannot be reconstructed from a successful response or recollection of a command.

All recorded fixtures now require complete reviewed transport, including body-true captures, so unrecorded query conflicts cannot be assumed away. The template remains `reviewed:false` at bundle and transport levels, with null targets/receipts/hashes. The code never marks operator evidence reviewed.

|Representation|Disposition|
|---|---|
|Boolean body true, recorded POST /route|Accept transport; unchanged origin checks still required|
|Body true and exactly one query true|Accept; body supplies stock POST hint|
|Query true only, transport receipt alone|Refuse: POST effect unverified|
|Query true + reviewed POST_QUERY_HINT_APPLIED evidence|Accept only with matching build/graph/car, effective_ch_disable:true, adapter SHA and independent evidence SHA|
|Query true + reviewed NO_CH_GRAPHS_LOADED evidence|Accept as recorded URL plus independently established global CH absence; require integer ch_graphs_loaded:0 and matching build/graph/car/evidence SHA; do not claim URL was consumed|
|Only car lacks CH, or assumed successful custom model|Insufficient; refuse|
|Body/query disagreement; duplicate flags (even identical/encoded aliases)|Refuse|
|Missing activation, string/numeric body booleans, empty/unknown query values, case variants|Refuse|
|Missing/stale/unreviewed/mismatched sidecar, wrong method, invalid target/fragment, duplicate JSON keys|Refuse|

Query proof is independently reviewed evidence of **effective routing setup**, not an inferred query flag. A source/config receipt must identify the loaded instance/graph and what it actually establishes; source/proxy changes need exact adapter identity. These are operator attestations, not automatic native runtime attestation. Never fabricate import receipts/oracles or set reviewed true just to pass validation.

## Offline and cache scope

The old harness imported `voyagr_web`, triggering `init_db()`. It now builds a minimal Flask fixture around the existing production `register_avoidance_integrity` response gate with stale in-memory cache-tier stubs. This is **response-boundary cache reassessment**, not the complete production cache lookup/database path. Shipped origin assessment, ranking and JS gates are unchanged. Existing full application cache tests remain in the configured regression suite separately.

Replay guards block Python HTTP/socket connection APIs, SQLite connections and known application DB helpers, including aliases/preexisting pool paths used by the gate. Node receives only private route JSON on stdin and executes the shipped local JS gate; no engine network mode is added. A fresh-process test imports/replays with network and DB operations forbidden and verifies that `voyagr_web` was never imported. No database is initialised by recorded replay. Failed inputs log fixed error types, not URLs, bodies, coordinates or secrets.

## Operator decision

1. Retain all five original files/objects/hashes unchanged; keep bundle/sidecar reviewed false.
2. Locate independent contemporaneous transport evidence (exact POST target, method, original body/response pair, statuses/hashes/build/graph).
3. For URL-only requests, obtain independent installed query-adapter proof or proof of **no loaded CH graphs**, tied to the same build/graph. A URL trace alone is insufficient for stock POST.
4. If missing/ambiguous, keep old captures unverified and collect **new, separate**, bounded complete captures using body boolean true (optionally matching query true). Do not overwrite old captures or receipts. Follow the updated operator report.
5. Independently review capture/provenance/native snap bindings before changing reviewed flags. Re-run five-case offline replay; any changed metric/geometry or missing oracle needs review, not a fabricated receipt or adjusted expected result.

Actual genuine five-case replay, installed transport semantics and real-road connectivity remain NOT_TESTED. Production remains NO-GO regardless of synthetic test/CI success.

## Validation and inventory

Before fix:query compatibility regression failed; missing proof already refused. After fix:58 targeted cases pass (38 new transport/offline cases +20 existing12FB cases). Configured backend1196 passed,68 subtests; Jest100 suites/1935 tests with coverage, lint and isolated SQL11 passed. No required check/coverage/assertion was weakened. Hosted PR and main CI outcomes are recorded in final delivery. Tests cover query/body/matching/conflicting/missing/duplicate/invalid representations, reviewed/build/hash binding, global CH absence versus adapter proof, original object/hash immutability, duplicate JSON refusal and clean-process no-network/no-database replay. No actual captures were supplied; synthetic results are not real replay results.


Complete changed-file inventory (11 files):

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE12FB_CONTABO_OPERATOR.md`
- `docs/audits/VOYAGR_PHASE12FB_FIVE_FIXTURE_REPLAY.md`
- `docs/audits/VOYAGR_PHASE12FB_TRANSPORT_COMPATIBILITY.md`
- `docs/audits/VOYAGR_PHASE12FB_TRANSPORT_SOURCE_EVIDENCE.json`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `scripts/fixtures/phase12fb/recorded-bundle-template.json`
- `tests/test_origin_replay_transport.py`
- `tests/test_phase12fb_acceptance.py`
- `voyagr/utils/origin_replay.py`
