"""Independent offline OSM topology diagnostics. No navigation authority.

Coordinates and candidate paths are private inputs. Public reports contain only
fixed classifications, counts and digests. Supported rules are deliberately narrow.
"""

from collections import defaultdict, deque
from dataclasses import dataclass
import hashlib
import json
import math
import re

from pyproj import CRS, Transformer, network

LIMIT = 32 * 1024 * 1024
MAX_ELEMENTS = 100000
MAX_SEGMENTS = 200000
HASH = re.compile(r"[0-9a-f]{64}\Z")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode()


def decode(raw):
    if not isinstance(raw, bytes) or len(raw) > LIMIT:
        raise ValueError("input_limit")

    def unique(pairs):
        result = {}
        for k, v in pairs:
            if k in result:
                raise ValueError("duplicate_key")
            result[k] = v
        return result

    return json.loads(
        raw,
        object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")),
    )


def identifier(v):
    if type(v) is not int or v <= 0:
        raise ValueError("invalid_osm_id")
    return v


def tags(value):
    if not isinstance(value, dict) or any(
        not isinstance(k, str)
        or not isinstance(v, str)
        or len(k) > 256
        or len(v) > 4096
        for k, v in value.items()
    ):
        raise ValueError("invalid_tags")
    return value


def coord(v):
    if (
        not isinstance(v, (list, tuple))
        or len(v) != 2
        or any(type(x) not in (int, float) or not math.isfinite(x) for x in v)
        or abs(v[0]) > 90
        or abs(v[1]) > 180
    ):
        raise ValueError("invalid_coordinate")
    return v


@dataclass(frozen=True)
class Edge:
    way: int
    segment: int
    direction: int
    start: object
    end: object
    uncertain: bool

    @property
    def key(self):
        return (self.way, self.segment, self.direction)


class RoadOracle:
    def __init__(self, raw):
        self.export_sha256 = digest(raw)
        data = decode(raw)
        elements = data.get("elements") if isinstance(data, dict) else None
        if not isinstance(elements, list) or not 1 <= len(elements) <= MAX_ELEMENTS:
            raise ValueError("elements_limit")
        self.nodes, self.ways, self.relations = {}, {}, {}
        self.gaps = False
        segments = 0
        for e in elements:
            if not isinstance(e, dict) or e.get("type") not in (
                "node",
                "way",
                "relation",
            ):
                raise ValueError("invalid_element")
            i = identifier(e.get("id"))
            target = {"node": self.nodes, "way": self.ways, "relation": self.relations}[
                e["type"]
            ]
            if i in target:
                raise ValueError("duplicate_element")
            tags(e.get("tags", {}))
            if e["type"] == "node":
                coord([e.get("lat"), e.get("lon")])
            elif e["type"] == "way":
                ns = e.get("nodes")
                if not isinstance(ns, list) or len(ns) < 2:
                    raise ValueError("invalid_way")
                for n in ns:
                    identifier(n)
                segments += len(ns) - 1
                if segments > MAX_SEGMENTS:
                    raise ValueError("segment_limit")
            else:
                if not isinstance(e.get("members"), list):
                    raise ValueError("invalid_relation")
                for member in e["members"]:
                    if (
                        not isinstance(member, dict)
                        or member.get("type") not in ("node", "way", "relation")
                        or not isinstance(member.get("role"), str)
                    ):
                        raise ValueError("invalid_member")
                    identifier(member.get("ref"))
            target[i] = e
        self.rules = []
        self.unresolved = False
        for r in self.relations.values():
            t = r.get("tags", {})
            if t.get("type") != "restriction":
                continue
            members = r["members"]
            for m in members:
                if not isinstance(m, dict):
                    raise ValueError("invalid_member")
                identifier(m.get("ref"))
            roles = {
                role: [m for m in members if m.get("role") == role]
                for role in ("from", "via", "to")
            }
            kind = t.get("restriction:motorcar", t.get("restriction", ""))
            if (
                len(members) != 3
                or any(len(v) != 1 for v in roles.values())
                or roles["via"][0].get("type") != "node"
                or any(roles[x][0].get("type") != "way" for x in ("from", "to"))
                or any(":" in k and k != "restriction:motorcar" for k in t)
                or "except" in t
                or kind
                not in {
                    "no_left_turn",
                    "no_right_turn",
                    "no_straight_on",
                    "no_u_turn",
                    "no_entry",
                    "no_exit",
                    "only_left_turn",
                    "only_right_turn",
                    "only_straight_on",
                    "only_u_turn",
                }
            ):
                self.unresolved = True
                continue
            f, v, to = (roles[x][0]["ref"] for x in ("from", "via", "to"))
            if (
                f not in self.ways
                or to not in self.ways
                or v not in self.nodes
                or v not in self.ways[f]["nodes"]
                or v not in self.ways[to]["nodes"]
            ):
                self.unresolved = True
                continue
            self.rules.append((f, v, to, kind))
        self.turn_rules = defaultdict(list)
        for rule in self.rules:
            self.turn_rules[rule[0], rule[1]].append(rule)
        self.edges = []
        for w, way in self.ways.items():
            t = way.get("tags", {})
            if "highway" not in t:
                continue
            oneway = t.get(
                "oneway:motorcar",
                t.get(
                    "oneway",
                    (
                        "yes"
                        if t.get("highway") == "motorway"
                        or t.get("junction") == "roundabout"
                        else "no"
                    ),
                ),
            )
            direction_unknown = oneway not in (
                "yes",
                "1",
                "true",
                "-1",
                "no",
                "0",
                "false",
            )
            direction_unknown |= any(
                k.startswith("oneway") and "conditional" in k for k in t
            )
            direction_unknown |= (
                t.get("highway", "").endswith("_link")
                and "oneway" not in t
                and "oneway:motorcar" not in t
            )
            for s, (a, b) in enumerate(zip(way["nodes"], way["nodes"][1:])):
                if a not in self.nodes or b not in self.nodes:
                    self.gaps = True
                    continue
                for d in (1, -1):
                    if not direction_unknown and (
                        (d == -1 and oneway in ("yes", "1", "true"))
                        or (d == 1 and oneway == "-1")
                    ):
                        continue
                    access, uncertain = self.access(t, d)
                    if access:
                        self.edges.append(
                            Edge(
                                w,
                                s,
                                d,
                                a if d == 1 else b,
                                b if d == 1 else a,
                                uncertain or direction_unknown,
                            )
                        )

    @staticmethod
    def access(t, direction):
        suffix = "forward" if direction == 1 else "backward"
        value = None
        for mode in ("access", "vehicle", "motor_vehicle", "motorcar"):
            value = t.get(mode + ":" + suffix, t.get(mode, value))
        uncertain = any("conditional" in k for k in t)
        uncertain |= any(
            k.startswith(
                (
                    "maxheight",
                    "maxwidth",
                    "maxlength",
                    "maxweight",
                    "maxaxleload",
                    "hgv",
                    "hazmat",
                )
            )
            for k in t
        )
        uncertain |= t.get("construction") is not None or t.get("proposed") is not None
        if value in ("no", "private"):
            # Conditional permission is a possible path, never a known path.
            return uncertain, uncertain
        allowed = value in ("yes", "designated", "permissive")
        highway = t.get("highway")
        default = highway in {
            "motorway",
            "trunk",
            "primary",
            "secondary",
            "tertiary",
            "unclassified",
            "residential",
            "living_street",
            "service",
            "motorway_link",
            "trunk_link",
            "primary_link",
            "secondary_link",
            "tertiary_link",
        }
        return True, uncertain or (not allowed and (value is not None or not default))

    def project(self, endpoint):
        if not isinstance(endpoint, dict):
            raise ValueError("endpoint_required")
        w = identifier(endpoint.get("way"))
        s = endpoint.get("segment")
        way = self.ways.get(w)
        if way is None or type(s) is not int or not 0 <= s < len(way["nodes"]) - 1:
            raise ValueError("exact_segment_required")
        a, b = way["nodes"][s : s + 2]
        if (
            endpoint.get("nodes") != [a, b]
            or a not in self.nodes
            or b not in self.nodes
        ):
            raise ValueError("ordered_segment_binding")
        lat, lon = coord(endpoint.get("coordinate"))
        # pyproj must never obtain grids from the network.
        network.set_network_enabled(False)
        transform = Transformer.from_crs(
            "EPSG:4326",
            CRS.from_proj4(
                f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m"
            ),
            always_xy=True,
        )
        xy = [
            transform.transform(self.nodes[n]["lon"], self.nodes[n]["lat"])
            for n in (a, b)
        ]
        (x, y), (u, v) = xy
        length2 = (u - x) ** 2 + (v - y) ** 2
        if not math.isfinite(length2) or length2 <= 1e-8 or length2 > 100000**2:
            raise ValueError("segment_geometry")
        fraction = max(0.0, min(1.0, -(x * (u - x) + y * (v - y)) / length2))
        separation = math.hypot(x + fraction * (u - x), y + fraction * (v - y))
        if separation > 100:
            raise ValueError("projection_too_distant")
        return (w, s, fraction, a, b), separation

    def transition(self, previous, edge):
        uncertain = edge.uncertain or self.unresolved
        if isinstance(edge.start, int):
            t = self.nodes[edge.start].get("tags", {})
            allowed, unknown = self.access(t, edge.direction)
            if not allowed:
                return False, uncertain
            # No highway default applies to a junction node. Other ambiguous
            # access, directional and physical rules remain possible only.
            uncertain |= "barrier" in t or any("conditional" in k for k in t)
            uncertain |= unknown and any(
                k.startswith(("access", "vehicle", "motor_vehicle", "motorcar", "max"))
                for k in t
            )
        if previous:
            applicable = self.turn_rules[previous.way, edge.start]
            if len(applicable) > 64:
                return True, True
            for f, via, to, kind in applicable:
                if previous.way == f and edge.start == via:
                    if kind in ("no_u_turn", "only_u_turn") and f == to:
                        match = (
                            edge.way == to
                            and edge.segment == previous.segment
                            and edge.direction == -previous.direction
                        )
                    else:
                        match = edge.way == to
                        if f == to:
                            uncertain = True
                    if (kind.startswith("no_") and match) or (
                        kind.startswith("only_") and not match
                    ):
                        return False, uncertain
        return True, uncertain

    def analyse(self, origin, target, candidate=None, *, max_states=100000):
        if type(max_states) is not int or not 1 <= max_states <= 200000:
            raise ValueError("search_bound")
        o, od = self.project(origin)
        t, td = self.project(target)
        # Split exact segments at both projections; endpoints retain real junctions.
        cuts = defaultdict(list)
        positions = []
        for p in (o, t):
            w, s, f, a, b = p
            vertex = a if f <= 1e-10 else b if f >= 1 - 1e-10 else (w, s, f)
            positions.append(vertex)
            cuts[w, s].append((f, vertex))
        adjacency = defaultdict(list)
        for e in self.edges:
            ns = self.ways[e.way]["nodes"]
            points = sorted(
                set(
                    [(0.0, ns[e.segment]), (1.0, ns[e.segment + 1])]
                    + cuts[e.way, e.segment]
                ),
                key=lambda p: p[0],
            )
            if e.direction == -1:
                points.reverse()
            for (fa, a), (fb, b) in zip(points, points[1:]):
                if abs(fa - fb) > 1e-10:
                    adjacency[a].append(
                        Edge(e.way, e.segment, e.direction, a, b, e.uncertain)
                    )
        start, finish = positions

        def search(potential):
            queue = deque([(start, None)])
            seen = {(start, None)}
            steps = 0
            while queue:
                node, previous = queue.popleft()
                if node == finish:
                    return True
                for e in adjacency[node]:
                    steps += 1
                    if steps > max_states * 8:
                        return None
                    ok, uncertain = self.transition(previous, e)
                    state = (e.end, e.key)
                    if ok and (potential or not uncertain) and state not in seen:
                        if len(seen) >= max_states:
                            return None
                        seen.add(state)
                        queue.append((e.end, e))
            return False

        known, possible = search(False), search(True)
        candidate_status = "NOT_SUPPLIED"
        if candidate is not None:
            if not isinstance(candidate, list) or len(candidate) > MAX_SEGMENTS:
                raise ValueError("candidate_limit")
            states = [(start, None, False)]
            candidate_steps = 0
            for key in candidate:
                if (
                    not isinstance(key, list)
                    or len(key) != 3
                    or any(type(x) is not int for x in key)
                ):
                    raise ValueError("candidate_edge")
                next_states = []
                for node, previous, unknown in states:
                    for e in adjacency[node]:
                        candidate_steps += 1
                        if candidate_steps > MAX_SEGMENTS * 8:
                            raise ValueError("candidate_search_bound")
                        if list(e.key) == key:
                            ok, uncertain = self.transition(previous, e)
                            if ok:
                                next_states.append((e.end, e, unknown or uncertain))
                states = next_states
                if len(states) > 16:
                    raise ValueError("ambiguous_candidate")
            endings = [unknown for node, _, unknown in states if node == finish]
            candidate_status = (
                "INVALID"
                if not endings
                else "UNVERIFIED" if all(endings) else "KNOWN_PATH_IN_EXPORT"
            )
        return {
            "schema_version": 1,
            "kind": "INDEPENDENT_OSM_DIAGNOSTIC",
            "reviewed": False,
            "navigation_authorized": False,
            "production": "PRODUCTION_NO_GO",
            "acceptance": "UNVERIFIED",
            "connectivity": "KNOWN_PATH_IN_EXPORT" if known else "UNVERIFIED",
            "potential_path": possible,
            "search_exhausted": known is None or possible is None,
            "candidate": candidate_status,
            "coverage_gap": self.gaps,
            "unresolved_restrictions": self.unresolved,
            "closed_component": "UNVERIFIED",  # A bounded export is not closure evidence.
            "export_sha256": self.export_sha256,
            "counts": {
                "nodes": len(self.nodes),
                "ways": len(self.ways),
                "edges": len(self.edges),
            },
            "projection_distance_m": {"origin": round(od, 3), "target": round(td, 3)},
        }


def bind_capture(export_raw, bundle_raw, receipt_raw, fixture_id):
    """Check operator-supplied provenance without creating an accepted oracle.

    The receipt is an independent private input, not an attestation by this tool.
    Diagnostic preparation intentionally does not call validate_bundle: that
    acceptance validator requires a separately accepted oracle_sha256.
    """
    bundle, receipt = decode(bundle_raw), decode(receipt_raw)
    if (
        not isinstance(bundle, dict)
        or not isinstance(receipt, dict)
        or receipt.get("schema_version") != 1
        or receipt.get("reviewed") is not True
        or type(fixture_id) is not int
    ):
        raise ValueError("reviewed_binding_required")
    if bundle.get("reviewed") is not True or bundle.get("kind") not in (
        "RECORDED_GRAPH_HOPPER8_CAPTURE",
        "SYNTHETIC_PROTOCOL_TEST",
    ):
        raise ValueError("reviewed_capture_required")
    engine = bundle.get("engine", {})
    if (
        not isinstance(engine, dict)
        or engine.get("version") != "8.0"
        or engine.get("profile") != "car"
    ):
        raise ValueError("engine_binding")
    expected = {
        "export_sha256": digest(export_raw),
        "capture_sha256": digest(bundle_raw),
    }
    for key in (
        "road_source_sha256",
        "graph_sha256",
        "import_receipt_sha256",
        "engine_build_sha256",
        "dataset_sha256",
    ):
        value = engine.get(key)
        if not isinstance(value, str) or not HASH.fullmatch(value):
            raise ValueError("source_binding_required")
        expected[key] = value
    fixtures = bundle.get("fixtures")
    if not isinstance(fixtures, list) or len(fixtures) > 100:
        raise ValueError("fixtures_required")
    matches = [
        f
        for f in fixtures
        if isinstance(f, dict) and type(f.get("id")) is int and f["id"] == fixture_id
    ]
    if len(matches) != 1:
        raise ValueError("unique_fixture_required")
    fixture = matches[0]
    for key in ("request", "response"):
        expected[key + "_sha256"] = digest(canonical(fixture.get(key)))
        if fixture.get(key + "_sha256") != expected[key + "_sha256"]:
            raise ValueError("capture_hash_mismatch")
    if receipt.get("fixture_id") != fixture_id or any(
        receipt.get(k) != v for k, v in expected.items()
    ):
        raise ValueError("conflicting_provenance")
    from voyagr.utils.origin_replay import normalized, transport_mode
    from voyagr.services.routing.journey_geometry import decode_geometry

    transport_mode(fixture, engine)
    request = fixture["request"]
    if request.get("profile") != "car" or fixture.get("http_status") != 200:
        raise ValueError("capture_profile_or_status")
    points = request.get("points")
    if not isinstance(points, list) or len(points) != 2:
        raise ValueError("capture_points")
    coord(points[0][::-1])
    coord(points[1][::-1])
    if len(fixture["response"].get("paths", [])) != 1:
        raise ValueError("single_path_required")
    route = normalized(fixture)
    snaps = decode_geometry(
        route["provider_snapped_waypoints"], route["provider_snap_precision"]
    )
    if len(snaps) != 2:
        raise ValueError("native_snaps_required")
    return (
        points[0][::-1],
        list(snaps[0]),
        {**expected, "receipt_sha256": digest(receipt_raw)},
    )


def diagnostic(export_raw, bundle_raw, receipt_raw, specification_raw):
    """Read-only bridge to recorded replay inputs. Never populates oracle_sha256."""
    spec = decode(specification_raw)
    if not isinstance(spec, dict):
        raise ValueError("specification_required")
    origin, target, binding = bind_capture(
        export_raw, bundle_raw, receipt_raw, spec.get("fixture_id")
    )
    if (
        spec.get("origin", {}).get("coordinate") != origin
        or spec.get("target", {}).get("coordinate") != target
    ):
        raise ValueError("capture_endpoint_binding")
    report = RoadOracle(export_raw).analyse(
        spec["origin"], spec["target"], spec.get("candidate")
    )
    report["provenance"] = binding
    report["provenance_status"] = "OPERATOR_RECEIPT_BOUND_NOT_INDEPENDENTLY_ATTESTED"
    report["specification_sha256"] = digest(specification_raw)
    return report


def summary(report):
    return (
        f"Independent OSM diagnostic: {report['connectivity']}. "
        f"Candidate: {report['candidate']}. Acceptance: UNVERIFIED. "
        "Reviewed: false. Navigation authorized: false. PRODUCTION_NO_GO."
    )


def read_private(path):
    """Bound input allocation before decoding; never writes a capture."""
    with path.open("rb") as stream:
        raw = stream.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError("input_limit")
    return raw
