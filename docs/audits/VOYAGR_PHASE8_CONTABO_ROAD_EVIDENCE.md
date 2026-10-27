# Phase 8 — Contabo road evidence

Date: 2026-10-27. **PHASE8_PARTIALLY_VERIFIED — production NO-GO.** Integration baseline: latest main `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` plus existing Phase 6 `c5c67686` and Phase 7 `0701f4df`; these changes are not present on fetched main. PR refs #343/#344 still point to those commits; current PR state/rules cannot be read because GitHub API access returns HTTP 403. Phase 8 branch: `codex/phase8-evidence-and-pwa-acceptance`, based on `0701f4df`. No previous changes duplicated. No Contabo access, production configuration/database/graph/service mutation, deployment, paid API call, Kivy/native Android change or deployment automation change.

## Evidence actually acquired

**No trustworthy real-road extract was acquired.** No approved offline XML/PBF/graph export is present in the workspace, no production endpoint was accessed, and no new public OSM request was made after the earlier HTTP 403. Synthetic unit XML/JSON is never reported as real evidence. Real-road coverage, source versions and labelled accuracy remain UNKNOWN. The export/QC implementation is usable locally; acquisition stops at the operator permission/data boundary.

## Existing integration inventory

| Source | Repository evidence | Suitable evidence / limits |
|---|---|---|
| Valhalla | `voyagr/config/settings.py`, `valhalla.json`, Contabo setup docs/scripts; default loopback 8002, documented `/opt/valhalla/tiles` | Actual tiles/build/profile unknown; route geometry does not prove full OSM tags or source way identity |
| GraphHopper | settings, `/opt/graphhopper` scripts and custom areas; default loopback 8989 | `/info` may expose version/profile/encoded values; actual graph cache/restrictions unknown |
| OSRM | settings and `voyagr/utils/osrm.py`; configurable service, public defaults also exist | Loopback replay default 5001, unavailable; graph metadata typically requires reviewed build manifest |
| Overpass | `OVERPASS_API_URL`/rate settings in detector, separate lane fetch still has legacy public URL | Best existing bounded OSM-tag source when operator approves local service; not presumed running |
| Nominatim/maps | deployment plan documents separate map/geocoder roles and port distinction | Geocoding/tiles are not complete directional road/turn restriction evidence; actual data paths unverified |
| TomTom | legacy detector candidate lookup/quota integration | No new request or paid provider dependency; not used to establish legal applicability |
| PBF/existing XML | scripts reference graph builds and downloaded extracts; no usable extract in this checkout | An approved small offline export can be QC'd without touching a database or rebuilding graphs |
| Road context | Phase 7 POST endpoints plus `VOYAGR_ROAD_EVIDENCE_FILE` | Operator-selected source only; no request path/ID grants trust; v1 format preserved |
| Hazards | existing route/nearby/OSM ingestion and mandatory evaluator | Missing road/direction/age is POSSIBLE, not proof of clear coverage |

Configured URLs are not evidence installed services are running. No secret values, production configuration or SSH credentials were read or requested. Existing deployment discovery remains applicable; no Docker assumption was introduced.

## Implemented read-only workflow

`scripts/export-phase8-road-evidence.py` reuses Phase 7 XML normalization. It accepts either approved offline XML with its original observation timestamp or an explicitly approved literal-loopback Overpass URL. Bounds are ≤.01° each dimension; source cap 4 MiB, output 10 MiB; Overpass query has 10 s/maxsize limits, connect/read timeouts, one sequential request, no redirects/retries/proxy/netrc credentials. Only interpreter paths are accepted. DTD/entities, malformed/error XML and unresolved malformed evidence are refused. Files are created exclusively; existing inputs/review files/configuration are never overwritten.

The output preserves real source node/way IDs and tags, direction, lanes/speed/access, bridge/tunnel/layer and supported restrictions; complex/multi-via restrictions remain unsupported. Source-node hazards retain raw tags and possible way associations, not invented orientation/section certainty. SHA256, licence/attribution, bbox and observation/export timestamps are explicit. Export time cannot silently refresh an old source observation; an older OSM base timestamp also limits freshness. Coverage remains PARTIAL and hazard coverage UNKNOWN until independently reviewed.

`scripts/validate-road-evidence.py` checks v1 metadata/geometry/identity/connectivity/age/restrictions and reports errors, warnings and applicability. The real loader now invokes the same QC. Malformed data is refused; valid but stale/partial/unsupported evidence cannot acquire attribute authority. Python/browser indexes reject conflicting coordinates for one node and duplicate unsegmented way identities. Graph edge namespaces remain distinct from OSM ways. QC is structural/provenance checking, not a survey or a legal-rule certification.

The legacy Phase 7 CLI now also bounds local reads, refuses overwrites, requires offline source observation time and retains complex restrictions rather than discarding members. Prefer the Phase 8 exporter because it includes QC. Older Phase 7 example commands without `--source-acquired-at` now require that additional argument.

## Exact operator-run commands

Run only through your existing authorised access, using an existing app virtualenv. These commands do not establish SSH access or change services. Supply values from an approved real source; none are invented here. Keep outputs in a new review directory, not a live data/configuration path.

```bash
# Operator supplies approved values; bbox order is west,south,east,north.
# APPROVED_BBOX: at most .01 degrees per dimension.
# APPROVED_OSM_XML: existing bounded export, not a huge whole-country XML.
# SOURCE_ACQUIRED_AT: original timezone-aware timestamp, e.g. from the export manifest.
.venv/bin/python scripts/export-phase8-road-evidence.py \
  --input "$APPROVED_OSM_XML" --bbox="$APPROVED_BBOX" \
  --source-acquired-at "$SOURCE_ACQUIRED_AT" --jurisdiction England \
  --output /tmp/phase8-road-review.json
.venv/bin/python scripts/validate-road-evidence.py /tmp/phase8-road-review.json
```

For an existing operator-approved local Overpass, substitute `--overpass-url http://127.0.0.1:12345/api/interpreter --approved-local-service` for input/timestamp, **only if that is its confirmed local endpoint**. Do not open ports or assume the example port is installed. The tool does not read a production URL from `.env` or connect automatically.

If only an approved existing PBF is available and `osmium` is already installed, first make a small read-only extract: `osmium extract --bbox="$APPROVED_BBOX" --strategy=complete_ways --output=/tmp/phase8-source.osm "$APPROVED_PBF"`. Do not install/rebuild/restart anything or use overwrite options. Preserve the PBF's original snapshot/acquisition date; run the bounded exporter on that XML. An unresolved relation requires source review or a suitably approved bounded area, not an unbounded download.

`scripts/fixtures/phase8/fixture-area-requests.json` requests Doncaster/South Yorkshire urban, dual-carriageway, motorway/slip, roundabout, parallel, bridge/tunnel, rail, signal and camera areas. Bboxes/source revisions remain null until supplied by the operator. No invented coordinates/topology are presented as acquired fixtures. Review licensing, restriction completeness, directional lanes/limits, camera association and source age before any later deployment decision. Do not mark COMPLETE just because HTTP/QC succeeded; do not point production at these files as part of Phase 8.
