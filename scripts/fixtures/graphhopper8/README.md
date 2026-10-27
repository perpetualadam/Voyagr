# Synthetic GraphHopper 8 area-composition reproduction

These small models contain synthetic SCDB/OSM-shaped test inputs, not authoritative
road/hazard evidence and not production request bodies. `duplicate-areas-before.json`
is the original builder/merger output: each independent part defined hazard_0 and
hazard_1. `unique-areas-after.json` is the corrected output preserving all four
geometries and hard blocks. Do not use them as live route oracles.

Optional local validation with independently provided GraphHopper 8 parser jars:

```bash
java --class-path "$GH8_PARSER_CLASSPATH" scripts/CheckGraphHopper8Model.java scripts/fixtures/graphhopper8/duplicate-areas-before.json
# Expected exit 1: REJECTED type=IllegalArgumentException duplicate_area=true
java --class-path "$GH8_PARSER_CLASSPATH" scripts/CheckGraphHopper8Model.java scripts/fixtures/graphhopper8/unique-areas-after.json
# Expected exit 0: PARSED areas=4 unique=4 invalid_geometry=0
```

Requires a Java source-file-launcher/compiler-capable runtime (tested on Java 21).
No graph, routing service, production endpoint, config update or installation is
performed. Classpath must include the GH8 web-api/Jackson/JTS libraries, or a
compatible GH8 application bundle. Exact local artifact URLs/checksums and the
parser-only limitations are in `docs/audits/VOYAGR_GRAPHHOPPER8_PARSER_EVIDENCE.json`.
`mixed-after.json` also exercises two synthetic SCDB cameras, two synthetic OSM hazards, all eight repository CAZ polygons and repository camera-section references. It is parser input only, not an installed-area inventory or routing oracle.

The script deliberately prints no polygon, model expression or raw exception text.
