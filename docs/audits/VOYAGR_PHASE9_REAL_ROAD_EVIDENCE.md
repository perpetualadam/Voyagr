# Phase 9 — real UK road evidence

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

## Observed capability and boundary

**SOURCE_UNAVAILABLE. No real UK road evidence acquired.** No bounded OSM XML/PBF, engine graphs, approved fixture bundle or device artifact was found in the repository or workspace shared/library/scratch locations. The operator does not know of an available export. Existing fixture coordinates are synthetic examples, not source-grounded geographic selections. No public map download or Contabo probe was made.

Python 3.12, Node 24.19.0, the web virtualenv, npm dependencies and a temporary PostgreSQL test server are available. Docker 28.4.0 responds on the explicitly selected local socket; no containers/images are present. Valhalla/OSRM binaries, GraphHopper JAR, osmium, adb and Podman are absent from inspected tools; Java alone does not establish GraphHopper. Local port inventory found only platform port 1040; 8002/8989/5001 metadata connections were unavailable. No USB device or browser installation was found in inspected device/cache locations. No credential bindings, outbound identities, VPN or TCP grants are configured; this is not evidence of Contabo access. GitHub API access is separately verified. No secrets or .env contents were printed.

## Confirmed defect and source states

The XML normalizer used a last-value-wins dictionary for tags. A way containing both `oneway=yes` and `oneway=no` became a normal two-way road, concealing contradictory source evidence. Node hazard and relation restriction tags had the same problem. Three regressions failed on the baseline. `source_tags` now rejects contradictory values on nodes, ways and relations; identical repeated values remain usable. Both exporters use the same normalizer, and hazard export uses the same tag reader. Existing conflicting-coordinate and duplicate-way guards remain.

QC now reports `SOURCE_VALIDATED` only when its existing freshness, complete-coverage, supported-attribute and approved-source-kind checks permit attributes; this is structural/provenance validation, not surveyed accuracy. Valid incomplete/synthetic/unsupported evidence is `SOURCE_PARTIAL`; valid expired observations/snapshots are `SOURCE_STALE`; malformed/contradictory input is `SOURCE_CONFLICTING`; missing/unreadable input is `SOURCE_UNAVAILABLE`. Invalid evidence takes precedence over age. Exported evidence stays PARTIAL; no automatic promotion. Missing files and invalid JSON receive explicit states from the QC CLI.

## Operator-run acquisition: no deployment required

Use existing authorised access only. Run from a separate reviewed tools snapshot at the Phase 9 commit, with an existing compatible Python environment. Do not change the production checkout or its environment. A normal account needs read access to the selected bounded source or permission for one query to its existing local Overpass. No root, database write permission, service restart, new port, graph rebuild or new country download is required.

Supply values from your own inventory; placeholders below are deliberately unset. `REVIEW_PYTHON` is an existing Python with requests/Flask web dependencies; `REVIEW_TOOLS` is the separate reviewed repository snapshot. `APPROVED_BBOX` is west,south,east,north, at most .01 degrees each dimension, selected from the actual source/map and recorded in the area request manifest. `SOURCE_ACQUIRED_AT` is the original timezone-aware observation time, not today's date for an old export.

```bash
: "${REVIEW_TOOLS:?path to separate reviewed tools snapshot}"
: "${REVIEW_PYTHON:?existing compatible Python executable}"
: "${APPROVED_BBOX:?operator-reviewed west,south,east,north}"
: "${APPROVED_OSM_XML:?approved existing bounded XML file}"
: "${SOURCE_ACQUIRED_AT:?original source observation timestamp}"
cd "$REVIEW_TOOLS"
umask 077
PHASE9_REVIEW_DIR=$(mktemp -d /tmp/voyagr-phase9-review.XXXXXX)
# Read-only input preflight: reject XML larger than 4 MiB.
"$REVIEW_PYTHON" -c 'import sys; from voyagr.utils.road_evidence import read_bounded; read_bounded(sys.argv[1])' "$APPROVED_OSM_XML"
cp -n -- "$APPROVED_OSM_XML" "$PHASE9_REVIEW_DIR/source.osm"
"$REVIEW_PYTHON" scripts/export-phase8-road-evidence.py   --input "$PHASE9_REVIEW_DIR/source.osm" --bbox="$APPROVED_BBOX"   --source-acquired-at "$SOURCE_ACQUIRED_AT" --jurisdiction England   --output "$PHASE9_REVIEW_DIR/road-evidence.json"
"$REVIEW_PYTHON" scripts/validate-road-evidence.py "$PHASE9_REVIEW_DIR/road-evidence.json"   > "$PHASE9_REVIEW_DIR/quality-control.json"
(cd "$PHASE9_REVIEW_DIR" && sha256sum source.osm road-evidence.json quality-control.json > SHA256SUMS)
```

For an existing approved local Overpass, replace only the exporter input/timestamp arguments with `--overpass-url "$APPROVED_LOCAL_OVERPASS_URL" --approved-local-service`. This must be the confirmed literal-loopback interpreter URL, not a guessed port or remote production address. Save the QC output and checksum the resulting JSON; source bytes are not saved by this mode, but their SHA256 is embedded. Independently record the installed Overpass snapshot date/revision. Prefer offline XML if those declarations cannot be obtained.

One sequential request per area, no retries or concurrency; wait at least 5 seconds between areas and stop on errors. Query timeout 10 s, maxsize/source 4 MiB; HTTP connect 2 s/read 15 s, no redirects, proxy or netrc credentials; output ≤10 MiB, exclusive creation. Read timeout is not a hard total streaming deadline. Do not retry by enlarging scope or change source timestamps to bypass the 24-hour attribute TTL. Existing PBF may be read with already-installed osmium using `osmium extract --bbox="$APPROVED_BBOX" --strategy=complete_ways --output="$PHASE9_REVIEW_DIR/source.osm" "$APPROVED_PBF"`; never use overwrite. It must still meet the XML cap. Complete ways may extend beyond the bbox and do not prove restriction completeness. Do not install tools on production for this task.

Alongside the files, record original source service/snapshot revision, acquisition/export times, bbox, category, tool commit, operator review role, licence/attribution, and coverage limitations in a new provenance manifest. OSM IDs/tags/versions and source digest are retained. Do not include credentials, personal journey traces or private server configuration. Do not mark coverage COMPLETE just because export/QC succeeded.

Transfer only these review artifacts using existing authorised file transfer. Example placeholders, executed by the operator only:

```bash
: "${APPROVED_EXPORT_SSH_ALIAS:?existing approved SSH alias}"
: "${REMOTE_PHASE9_REVIEW_DIR:?the generated remote review directory}"
LOCAL_PHASE9_REVIEW_DIR=$(mktemp -d /tmp/voyagr-phase9-import.XXXXXX)
scp -r "$APPROVED_EXPORT_SSH_ALIAS:$REMOTE_PHASE9_REVIEW_DIR/." "$LOCAL_PHASE9_REVIEW_DIR/"
(cd "$LOCAL_PHASE9_REVIEW_DIR" && sha256sum -c SHA256SUMS)
```

Verify checksums from the reviewed manifest, then rerun QC in Codex with `.venv/bin/python scripts/validate-road-evidence.py "$LOCAL_PHASE9_REVIEW_DIR/road-evidence.json"`. The embedded `source_sha256` must equal the original XML checksum. Review attribution/ODbL, age, all restrictions, directional/access/layer tags and source coverage. Expiry after transfer is expected, not a reason to retimestamp. For isolated local Flask tests only, set `VOYAGR_ROAD_EVIDENCE_FILE` to that file for the test process; never change production configuration. `load_context()` remains the trusted consumer and may refuse invalid or stale authority. Real matching evaluation still needs separately reviewed queries/expected identities; geometry alone is not GPS ground truth.

## Representative coverage request

See `scripts/fixtures/phase9/fixture-area-requests.json`. It preserves the ten prior requests and adds directional-speed, directional-lane and closely-spaced-junction categories. Prioritise Doncaster/South Yorkshire where an operator can identify suitable actual source features. All bboxes/revisions remain null pending source selection; no geographic positions invented. Required checks: connectivity, one-way, turn restrictions, class, directional lanes/speed, bridge/tunnel/layer, access, freshness, coverage, identifiers and contradictions. Complex/conditional restrictions remain unsupported and cannot grant authority. Hazard association remains UNVERIFIED until separately reviewed.

**Needed from operator:** a bounded licensed source export with original date/revision and reviewed bbox, or approved execution of the commands above against an existing local source. Until then there is no real-road acceptance claim.
