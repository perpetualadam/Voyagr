# GraphHopper HTTP 400: bounded validation diagnostics

## Finding and root-cause status

The reported Contabo `POST /route?ch.disable=true` HTTP 400 proves request rejection, not why it was rejected. **Actual production root cause remains unproven; the GraphHopper response body is still needed for classification.** No production service, configuration, graph or response was accessed here. Do not infer a specific GraphHopper version/profile/encoded-value configuration from repository examples.

`voyagr/services/routing/engines.py::route_with_graphhopper` constructs profile `car`, points in longitude/latitude order, and details `max_speed`, `lanes`, `road_class`. It merges camera, dynamic hazard/crossing, CAZ and costing models. Custom-model POSTs set `ch.disable` in both the JSON body (`true`) and query string (`true`). No parameter/model/version changes are made by this patch.

Previously a non-200 custom-model POST logged only HTTP status, then called `should_refuse_graphhopper_unfiltered_fallback`. Camera/hazard/area or hard-costing constraints cause an immediate `None`, allowing the caller's Valhalla path rather than an unfiltered GraphHopper retry. Constraint-free compatibility requests may still retry GET `point`, GET `points`, then POST without a model. Final failures return `None`; exception messages are not logged. These behaviors and mandatory route-compliance gates remain intact.

## Diagnostic contract

Every non-200 response on those four attempts now emits one WARNING in the **Voyagr backend application's logs**, using marker `[GRAPHHOPPER] validation_error`, fixed stage and numeric HTTP status. The GraphHopper access journal itself need not change.

Only fixed enum values reach the logger, including its deferred formatting arguments:

- `body_state`: json / malformed_json / unexpected_json / oversized / unavailable.
- `categories`: request_json_invalid, encoded_value_error, profile_error, custom_model_error, parameter_error, area_identity_error, or unclassified_http_error. Categories are heuristic clues, not proof of the precise defect. Several may apply.
- `error_types`: allowlisted Java exception types mapped to fixed labels such as invalid_argument, invalid_state, json_parse_error, unknown_property, json_input_mismatch. Unknown types are omitted.
- `names`: at most eight fixed allowlisted parameter/encoded-value tokens, e.g. custom_model, ch.disable, profile, max_speed, lanes, road_class, toll. Names indicate recognised mentions, not proven invalidity. Unknown names and actual profile identifiers are omitted.

Parsing is capped at 16,384 bytes of the **already buffered** response; larger bodies are not parsed or excerpted. At most four hint objects plus the top-level object are inspected, and at most 1,024 characters per message. Malformed/non-object/deeply nested JSON is reduced to a fixed body state. Logging does not call `response.json()` or print raw body/text, headers, URL, request payload, geometry, custom-model expressions, arbitrary class names or camera/area IDs. The fixed vocabulary bounds each diagnostic record; tests assert the emitted line stays under 700 characters. At most four diagnostic records occur in one compatibility chain; a rejected protected camera model emits one, then refuses the unfiltered retry. No new retries, global debug logging, network calls or production configuration changes.

This bounds diagnostic parsing and output, not HTTP transport download size: requests already buffers responses under the existing transport/time budget. No new streamed-response or hard total HTTP deadline claim is made. Unknown/localized/new GraphHopper message forms may remain unclassified; do not enable raw logging to compensate.

## Exact operator procedure after a separately approved deployment

This patch does not deploy or restart anything. After the operator has separately deployed the reviewed app release through the usual approved process:

1. Confirm the deployed **Voyagr application** revision contains `graphhopper_diagnostics.py` and the new `validation_error` calls. Identify the actual systemd unit that runs the Voyagr Python/Flask backend. The GraphHopper unit on port 8989 is a different logging source; do not assume its unit name or that its access log includes validation bodies.
2. Use your existing authorised journal-read access. No root is inherently required; use an account already permitted to read that unit's journal. Do not change groups, log levels, GraphHopper profiles, encoded values, CH settings, graph data or service configuration for this procedure.
3. Record a short local time window, then reproduce **one normal camera-avoidance route in the Voyagr UI** while stationary. Do not paste coordinates, full custom models, tokens or request bodies into shell commands or support messages. The UI may fall back to Valhalla; the new line is written before the protected GraphHopper fallback returns.
4. On the Contabo host, supply the real app unit and bounded time window (timezone-aware values from your observation); execute:

```bash
: "${VOYAGR_APP_UNIT:?actual systemd unit running Voyagr backend, not GraphHopper}"
: "${DIAGNOSTIC_SINCE:?start of the short observed time window}"
: "${DIAGNOSTIC_UNTIL:?end of the short observed time window}"
journalctl --unit="$VOYAGR_APP_UNIT" \
  --since="$DIAGNOSTIC_SINCE" --until="$DIAGNOSTIC_UNTIL" \
  --no-pager --output=cat --grep='\[GRAPHHOPPER\] validation_error' --lines=20
```

If the app uses another already configured log sink, use its equivalent marker/time/20-line filter. Do not redirect all journals into a support artifact. If no line appears, verify app revision, actual unit/log sink, warning visibility and that GraphHopper was attempted; absence alone proves no specific provider cause. A protected model should also retain its existing `refusing unfiltered fallback` behavior.
5. Share only the filtered diagnostic lines and deployed app/GraphHopper versions if independently known. Example **synthetic** output shape:

```text
[GRAPHHOPPER] validation_error stage=post_custom_model http_status=400 diagnostic={"body_state": "json", "categories": ["encoded_value_error"], "error_types": ["invalid_argument"], "names": ["max_speed"]}
```

`encoded_value_error` plus a known name supports investigation of that installed graph's encoded values; `profile_error` supports checking the actual profile/custom-model compatibility; `custom_model_error` supports checking syntax/condition support against the installed build. None authorises removing avoidance, deleting detail requests, rebuilding graphs or changing CH/profile configuration blindly. `malformed_json` describes the response representation, whereas `request_json_invalid` classifies the provider's reported request parse error. Generic/oversized/unavailable results mean the safe summary lacks sufficient evidence.

If fixed categories are insufficient, further response inspection requires a separately approved local, private review by the infrastructure operator. Do not paste the raw production response into the journal, this chat or a PR: it may echo route coordinates, model contents or credentials. Extend only known safe categories/names using sanitized examples and privacy regression tests.

## Validation

Regressions exercise real `requests.Response` parsing and the actual route function with transport mocked. Coverage includes malformed JSON/UTF-8, oversized/deep/non-object bodies, unsupported conditions, missing encoded values, incompatible profiles, generic HTTP failures, bounded hint/message processing, arbitrary sensitive field rejection, per-attempt logging and protected-model refusal without any GET or model-free POST. Existing camera/hazard/hard-costing tests remain unchanged.

Final local and hosted CI outcomes are reported in the PR and completion message. These are software/privacy regressions, not evidence that the production HTTP 400 has been resolved.

Local validation: backend CI selection **763 passed +68 subtests**; additional overlapping costing/hazard/fallback/privacy selection **33 passed**; Jest **94 suites /1,901 tests passed**, test lint and configured coverage thresholds passed; isolated SQL policy **11 passed**; `git diff --check` passed. Full historical desktop/native/live-service suites remain outside this web diagnostics task and unrun.
