# Canonical UK planning legs — no navigation capability

The response adapter previously emitted `start_shape_index` in preview leg ranges.
The actual UK `JourneyPlan.inspection` helper requires `begin_shape_index`; the old
cross-language regression called only the geometry/instruction planner and therefore
missed this mismatch. Real-engine responses now pass both validators.

Each leg contains leg_index, begin_shape_index, end_shape_index and preview_only=true.
Waypoint indices must be integer, strictly increasing, bounded, start at the first
shape vertex and finish at the last. Collapsed waypoint boundaries refuse rather
than silently dropping a visit or creating a zero-index-length leg. The Java
transport validator and projection enforce these bounds separately. This does not
prove real-road stop/heading/turn semantics or eliminate sub-precision geometry.

The isolated viewer loads the authenticated/source-hashed real journey-plan module.
Before displaying any response it checks each candidate's canonical ranges against
that candidate's raw waypoint evidence, matches complete-request visit count and
calls actual UK inspection. A missing/legacy field, gap, collapsed boundary or
out-of-range endpoint on any alternative refuses the entire new response, retaining
an existing preview. Geometry completeness, instructions, binding and strict
navigation refusal checks remain active. No navigation, automatic selection,
simulation controls, arbitrary route handler or stop/time-window support is added.

The generated-graph backend regressions now feed actual primary, alternative,
ordered-via and reroute output through UK inspection. They verify every leg's
boundaries and unchanged preview flags, then require navigation and manual-guidance
preparation to fail. Independent corruption tests cover collapsed transport
waypoints and invalid projection inputs. Viewer tests cover a bad third candidate
and retain the previous route rather than partially accepting valid alternatives.
Existing actual Chromium routing/restore scenarios exercise the same renderer.

A fresh package/manifest is needed for a future reviewed update because adapter and
browser asset identities changed. Existing VPS2/phone installations are not changed;
no browser storage, saved plan or production setting is migrated or deleted.

Remaining Milestone 3 work is full UK guidance capability/provenance, broader
settings/alternative/stop/reroute parity, live request/cache/selection binding and
full saved-journey/outage/race/fallback acceptance. Positive GH11 guidance is still
NO-GO; canonical preview legs are not navigation or hazard/turn/legal evidence.

### Registered endpoint observations (23 November 2026)

The Python bridge now independently measures every registered requested visit
against the corresponding geometry vertex for every candidate, including via
points. The operator registry fixes the snap bound (default 75 metres, permitted
range 0.1–75); provider claims cannot increase it. A displaced visit or mismatched
visit count refuses the entire response. Cached reports traverse the same check.

`registered_visit_observations` records requested and resolved public fixture
coordinates, shape indices and recomputed distances. Anchor-only cases without
registered coordinates remain explicitly UNVERIFIED. These observations are
carried in `gh11_evidence`; they are not guidance authority, device GPS evidence,
heading evidence, turn/legal validation or proof of hazard coverage. The browser
still refuses navigation. No production or VPS deployment is included.
