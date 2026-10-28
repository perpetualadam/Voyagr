# GraphHopper 8.0 combined custom-model investigation

Date: 2026-10-27. Baseline main `995ee7a0`. No production access, deployment, service restart, graph/configuration change or camera-area file modification. Official parser libraries were downloaded only into temporary local review storage; no routing service or graph was installed.

## Confirmed cause and production boundary

**Confirmed application defect: SCDB and OSM builders independently generate `hazard_0`, `hazard_1`, …; their merger concatenates these areas and rules unchanged. A combined request therefore contains duplicate FeatureCollection IDs and ambiguous area references. GraphHopper 8.0 rejects this exact output during custom-model deserialization.**

Actual local reproduction using GraphHopper 8.0's released Java/Jackson classes:

```text
Original:  REJECTED type=IllegalArgumentException duplicate_area=true
Corrected: PARSED areas=4 unique=4 invalid_geometry=0
Mixed:     PARSED areas=12 unique=12 invalid_geometry=0
```

The root exception from the official parser is `Cannot handle duplicate area <id>`. Only its fixed classification is printed by the supplied harness. Original unit regressions against the actual builder and actual route request assembly: **4 failed**, all on duplicate area identity. This is not a guessed incompatibility with `multiply_by: 0`, flexible routing, request polygons or all MultiPolygons.

**The exact deployed failing request/response has not been inspected.** A request containing both SCDB inline camera zones and OSM inline hazard zones deterministically has this defect before the fix, which fits the supplied combined-only failure. The production `unclassified_http_error` does not independently prove it was the only rejection. Unknown installed area references, different base-profile data, size limits or other engine conditions remain possible until the operator verifies the actual combined request. Real-engine routing/avoidance verification is still required.

## Upstream evidence: pinned GraphHopper 8.0

Tag 8.0 resolves to `1e224ae6bb1807ebc5037fb8de07c4f7cfaee749`.

- [CustomModelAreasDeserializer](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-api/src/main/java/com/graphhopper/jackson/CustomModelAreasDeserializer.java) accepts a FeatureCollection or named-area map, requires feature IDs and invokes `CustomModel.getAreasAsMap` to detect duplicates.
- [CustomModel](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-api/src/main/java/com/graphhopper/util/CustomModel.java) throws `Cannot handle duplicate area …` if insertion replaces an earlier ID. Its base/query merge separately rejects conflicting installed/request area names.
- [StatementDeserializer](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-api/src/main/java/com/graphhopper/jackson/StatementDeserializer.java) expects exactly two entries: if/else_if/else plus one operation; operation values are read as text. Voyagr's generated two-field rules and zero-valued blocks satisfy this schema.
- [CustomModelParser](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/core/src/main/java/com/graphhopper/routing/weighting/custom/CustomModelParser.java) validates area variable IDs, resolves referenced areas and requires Polygonal geometry. Despite a diagnostic mentioning Polygon, the actual type check is Polygonal, which includes MultiPolygon. Do not convert/drop MultiPolygon sections based on that wording. It also rejects a compiled-model cache-key string over 100,000 characters; this is **not** a 100,000-byte HTTP body limit.

The actual parser test uses `graphhopper-web-api:8.0`, its Dropwizard 2.1.6-managed Jackson 2.13.5 libraries, `jackson-datatype-jts:2.14` and JTS 1.19.0. Runtime: OpenJDK 21.0.12.1 source-file launcher. No javac executable/Maven was required; a compiler-capable Java runtime is needed. Exact artifact URLs, SHA256 hashes, inputs, sizes and outcomes: [parser evidence](VOYAGR_GRAPHHOPPER8_PARSER_EVIDENCE.json). No jars are committed and Python/Jest CI does not download them.

## Actual request construction and audit

`engines.route_with_graphhopper` sends profile `car`, details `max_speed`, `lanes`, `road_class`, points and a merged custom model, with `ch.disable` in both query and JSON. This patch does not change these fields.

| Part | Actual construction | Identity / rule behavior |
|---|---|---|
| Camera sections | `build_graphhopper_camera_avoidance_model` selects local GeoJSON IDs by expanded route bbox; without local data it uses configured/default count | One OR expression over installed `in_camera_area_N` references, multiplier `'0'`; no section geometry copied into request |
| SCDB filters | `build_graphhopper_filtered_camera_model` selects enabled camera buckets and calls `build_graphhopper_custom_model` | 30 m seven-coordinate polygon rings; starts at `hazard_0`; hard multiplier `'0'` |
| Selective camera types | `build_graphhopper_combined_camera_model` skips type-agnostic sections when map-data filters disable types | Existing caps/selection remain; no avoidance dropped by this patch |
| OSM / live hazards | Separate `build_graphhopper_custom_model` call for traffic lights, railway crossings, avoid points and incidents | Independently restarts at `hazard_0`; this collides with SCDB |
| CAZ | `build_graphhopper_caz_avoidance_model` selects bbox-overlapping configured polygons | `caz_<sanitized-zone-id>`, closed rings; existing multiplier `'0.02'` unchanged |
| Costing | `build_graphhopper_costing_preference_model` appended after hazard/CAZ models | Existing hard/soft avoid preferences unchanged |
| Merge | Camera combined model is merged again with OSM/CAZ/costing parts | Formerly simple feature/rule concatenation, now collision-safe composition |

Priority order remains camera sections → SCDB → OSM → CAZ → costing; speed statement order and conditions are preserved. The new token rewrite handles both if and else_if, preserves quoted literals and does not confuse `in_hazard_0` with `in_hazard_01`. Installed references with no inline declaration are left unchanged. Inputs are deep-copied, so nested merges cannot corrupt shared models.

The minimal fix renames only a later part's colliding inline feature IDs (`hazard_0_part_1`, etc.), allocating a suffix if that name is already declared or referenced. Only that owning part's matching condition tokens are rewritten. No geometry is unioned, simplified, dropped or moved; no block multiplier is softened and no schema/profile/CH setting is changed. A duplicate already within one part is inherently ambiguous and is rejected, rather than silently choosing a geometry. The existing outer route handler returns failure and retains fail-closed fallback.

The safe diagnostic classifier now recognises `duplicate area` / `area … already exists` as **area_identity_error**, without exposing IDs or raw provider text. This explains why the previous classifier could show unclassified_http_error for this class of error. It is not retrospective proof of the production error body.

### IDs, geometry, datasets and size

- Four-area reproduction: 4 features / 2 unique IDs before; 4 features / 4 unique IDs after. JSON sizes **1,633 → 1,661 bytes**. Geometries and all four zero-multiplier blocks preserved. The original request fails at duplicate-ID parsing at this small size; no payload-size guess is needed.
- Mixed model: two SCDB zones + two OSM zones + all eight repository CAZ polygons = **12 unique inline areas**; section references remain separate. Official parser accepts it; JTS reports zero invalid inline geometries. The evidence JSON records its byte size/checksum. Deserialization does not compile its expressions, load installed sections or prove route avoidance.
- Repository CAZ inventory: 8 zones, no sanitized-ID collisions observed. Rings from the mixed model are closed and geometrically valid in this fixture.
- Repository `camera_areas.geojson`: 128 unique IDs, all MultiPolygon, SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`. The official mapper accepts the inventory, but **JTS reports 102 geometries invalid**. No geometry was repaired or file changed. Structural deserialization success and JTS validity differ; invalidity alone is not proof this file caused an HTTP 400. It is not included inline in the combined request, and installed-file equivalence is unverified.
- Production evidence says its installed file has 128 features and Voyagr separately logs 137 sections. Those counts do not establish identity. `GRAPHHOPPER_CAMERA_AREAS_COUNT` can override the reported total even when bbox IDs come from a different loaded local file; if no local file is loaded, count-based IDs are generated. Compare actual files/IDs/checksums before claiming missing server sections. This patch does not truncate IDs to 128 or assume `camera_area_0` success proves every other reference exists.
- Legacy root `custom_model.json` has different tags-based statements, but it is not what this request path reads/builds. It was not substituted or edited.

## Local reproduction

Synthetic fixtures and parser-only harness are committed. These are not live geographic/routing oracles. With the reviewed official parser dependencies already available in an isolated review environment:

```bash
: "${GH8_PARSER_CLASSPATH:?reviewed GraphHopper 8 parser jars or compatible bundle}"
java --class-path "$GH8_PARSER_CLASSPATH" scripts/CheckGraphHopper8Model.java \
  scripts/fixtures/graphhopper8/duplicate-areas-before.json
# Expected exit 1, duplicate_area=true.
java --class-path "$GH8_PARSER_CLASSPATH" scripts/CheckGraphHopper8Model.java \
  scripts/fixtures/graphhopper8/unique-areas-after.json
# Expected exit 0, areas=4 unique=4 invalid_geometry=0.
java --class-path "$GH8_PARSER_CLASSPATH" scripts/CheckGraphHopper8Model.java \
  scripts/fixtures/graphhopper8/mixed-after.json
# Expected exit 0, areas=12 unique=12 invalid_geometry=0.
```

The Java harness never starts a graph/service or performs networking. It emits only counts/fixed rejection classification, not coordinates, custom models or raw error bodies. Parser success is weaker than installed-profile expression compilation, HTTP acceptance and enforcement.

## Operator procedure for the actual 8.0 installation

Use existing authorised access only. No installation, restart, deployment, graph rebuild or configuration change is part of this procedure.

1. Identify the actual already-installed GraphHopper build/profile and camera-area file selected by its running service, plus the camera-area file loaded by Voyagr. Do not dump environments, command lines with secrets or full configuration. Record only build/version, reviewed file paths locally, SHA256, feature/unique-ID counts and ID-set equality. Keep the files unchanged. A 128/137 count mismatch or a single working area reference is insufficient evidence of equivalence.
2. In a separate tools/review directory, run Python composition regressions and the optional parser harness against the synthetic fixtures above. Do not copy these synthetic geometries into a live routing fixture. Obtain a private, operator-approved actual combined request built by the reviewed application code (after any separately authorised deployment, or from an approved isolated test setup with the same inputs). Verify unique inline IDs and one-to-one rule/geometry mapping without printing coordinates or full models. Do not attempt to repair a flattened ambiguous old request by deleting duplicate features.
3. Only where the operator explicitly approves read-only local routing checks on this installation, use its known `127.0.0.1:8989` origin and an approved request file. Keep routes/response bodies private and do not put them in shell history or journals. Issue at most one request at a time, no retries, bounded response/time:

```bash
: "${APPROVED_COMBINED_REQUEST:?private approved request JSON, not synthetic parser fixture}"
umask 077
GH8_REVIEW_DIR=$(mktemp -d /tmp/voyagr-gh8-review.XXXXXX)
curl --silent --show-error --request POST \
  --connect-timeout 2 --max-time 15 --max-filesize 2097152 \
  --header 'Content-Type: application/json' \
  --data-binary "@$APPROVED_COMBINED_REQUEST" \
  --output "$GH8_REVIEW_DIR/response.json" --write-out '%{http_code}\n' \
  'http://127.0.0.1:8989/route?ch.disable=true'
```

Do not follow redirects or use public/paid fallback endpoints. Verify the local curl supports the streaming size cap; otherwise use an already approved bounded HTTP client rather than an unbounded capture. Do not publish the response file: success geometry and errors may echo private inputs. Record HTTP status, input byte count/digest, feature/unique-ID counts, safe diagnostic category and installed build/profile only. Do not log authentication headers or full models. Request-local curl output files are review artifacts, not graph or service mutations.

4. Run a bounded matrix using the same approved endpoints: basic car; previously successful single installed section; two SCDB + two OSM zones; same with a CAZ polygon. Use actual installed-area IDs checked in step 1. Separate calls by at least five seconds. Do not change avoidance, model caps, details, profile or engine configuration to make acceptance pass. `area_identity_error` should be absent for corrected requests; another rejection must be investigated on its own safe evidence. Use the existing [Voyagr journal diagnostic procedure](VOYAGR_GRAPHHOPPER_HTTP400_DIAGNOSTICS.md) when reproducing through the PWA after a separately approved release.
5. For each accepted combined request, validate every returned route/alternative against the reviewed hazard/CAZ oracle, installed graph scope and expected hard blocks. HTTP 200 is only schema/request acceptance, not proof of avoidance. A known infeasible mandatory case must fail safely; Voyagr must never issue model-free GraphHopper recovery when constraints would be lost. CAZ's pre-existing soft preference and mandatory compliance gates remain separate semantics.
6. Return only sanitized results: versions, digests/counts, safe error categories, and reviewed geometry/avoidance PASS/FAIL/NOT_TESTED outcomes. If installed references differ or repo/installed geometries fail independent QC, stop that acceptance case and request a separately reviewed data decision. Do not edit the production camera file or restart/rebuild anything as an automatic response.

No actual Contabo combined request, route geometry or avoidance outcome was tested here. This remaining operator check is required before declaring the production failure resolved.

## Validation and files

New tests preserve all camera/OSM geometries and hard blocks, mixed camera/CAZ ordering, exact token boundaries, speed/else_if conditions, non-mutation, collisions with reserved names, rejection of within-part ambiguity and route-level refusal of unfiltered fallback. The known duplicate error is also covered by the privacy diagnostic integration regression.

Local outcomes: **771 Python tests +68 subtests** in the backend CI selection; **53 focused Python checks**; **97 Jest suites /1,918 tests**, test lint and coverage thresholds passed; **11 isolated SQL policy tests** passed; whitespace check passed. Full desktop/Kivy/native/live-service suites are outside this web task and unrun. Actual Java deserialization/JTS checks are reported separately above, not counted as graph-backed routing tests. Required hosted CI and PR/merge state are verified at publication.

Changed files: `voyagr/services/hazards.py`, `voyagr/services/routing/graphhopper_diagnostics.py`, `tests/test_graphhopper_model_composition.py`, `tests/test_graphhopper_diagnostics.py`, `.github/workflows/ci.yml`, `scripts/CheckGraphHopper8Model.java`, the three JSON fixtures and README under `scripts/fixtures/graphhopper8/`, this report, `VOYAGR_GRAPHHOPPER8_PARSER_EVIDENCE.json`, and the existing HTTP400 diagnostic report's category list. No production/graph/camera-area data or routing avoidance configuration changed.

## Subsequent toll capability finding (2026-10-28)

Operator evidence separately confirms the installed graph rejects the unavailable toll encoded value. The duplicate-ID fix remains valid; it was not the only compatibility issue. See [verified capability construction, cache policy and operator procedure](VOYAGR_GRAPHHOPPER_TOLL_CAPABILITIES.md). No camera-area or production graph/configuration changes accompany that fix.
