"""Private provisional evidence references. Never imported by the public CLI.

Only the common oracle search decides traversal. This module describes its output.
"""

import json
import os
from pathlib import Path
import re

from voyagr.utils.road_oracle import RoadOracle, canonical, decode, digest

MAX_RECORDS = 5000
MAX_EVIDENCE_BYTES = 8 * 1024 * 1024
MAX_REPORT_BYTES = 16 * 1024 * 1024
REPOSITORY = Path(__file__).resolve().parents[2]
ROOTS = {
    "highway",
    "junction",
    "oneway",
    "access",
    "vehicle",
    "motor_vehicle",
    "motorcar",
    "barrier",
    "maxheight",
    "maxwidth",
    "maxlength",
    "maxweight",
    "maxaxleload",
    "hgv",
    "hazmat",
    "construction",
    "proposed",
    "restriction",
    "type",
    "except",
}
# Unknown/free-form strings are withheld, not silently interpreted as OSM rules.
WORDS = set(
    """yes no true false designated permissive private destination customers delivery
agricultural forestry emergency bus psv taxi bicycle foot motorcycle motorcar motor_vehicle
vehicle hgv goods hazmat disabled permit residents destination_only discouraged unknown
reversible alternating motorway trunk primary secondary tertiary unclassified residential
living_street service motorway_link trunk_link primary_link secondary_link tertiary_link
road track path footway cycleway pedestrian steps bridleway construction proposed raceway
roundabout circular restriction no_left_turn no_right_turn no_straight_on no_u_turn no_entry
no_exit only_left_turn only_right_turn only_straight_on only_u_turn gate lift_gate swing_gate
bollard rising_bollard block cycle_barrier cattle_grid kerb height_restrictor wall fence chain
entrance kissing_gate stile toll_booth border_control ditch guard_rail sally_port rope log
m ft cm mm kg t tonnes mph km h Mo Tu We Th Fr Sa Su PH SH Jan Feb Mar Apr May Jun Jul Aug Sep
Oct Nov Dec sunrise sunset dawn dusk wet snow ice weight height length width AND OR off on
none default local destination seasonal access forward backward motorroad""".split()
)
SUSPICIOUS = re.compile(
    r"https?://|www\.|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|password|secret|token|credential|authorization|api.?key|bearer|[+-]?\d{1,3}\.\d+\D+[+-]?\d{1,3}\.\d+|[+-]?\d{1,3}(?:\.\d+)?\s*[,;/]\s*[+-]?\d{1,3}(?:\.\d+)?",
    re.I,
)


def safe_tags(tags):
    visible, withheld = {}, 0
    for key, value in tags.items():
        if (
            key.split(":")[0] not in ROOTS
            or len(key) > 80
            or any(
                part not in ROOTS | {"conditional", "forward", "backward"}
                for part in key.split(":")
            )
        ):
            withheld += 1
            continue
        safe = (
            len(value) <= 512
            and not SUSPICIOUS.search(value)
            and not any(ord(c) < 32 or ord(c) > 126 for c in value)
            and all(word in WORDS for word in re.findall(r"[A-Za-z_]+", value))
        )
        root = key.split(":")[0]
        if (
            root == "oneway"
            and not re.search(r"[A-Za-z]", value)
            and value not in ("1", "-1", "0")
        ):
            safe = False
        if root not in {
            "oneway",
            "maxheight",
            "maxwidth",
            "maxlength",
            "maxweight",
            "maxaxleload",
        } and not re.search(r"[A-Za-z]", value):
            safe = False
        visible[key] = (
            value
            if safe
            else {
                "withheld": True,
                "value_sha256": digest(value.encode()),
                "reason": "FREE_FORM_OR_SENSITIVE_METADATA",
            }
        )
    return {
        "routing_tags": visible,
        "other_tag_count": withheld,
        "all_tags_sha256": digest(canonical(tags)),
    }


def source(element):
    return {
        "type": element["type"],
        "id": element["id"],
        "object_sha256": digest(canonical(element)),
        **safe_tags(element.get("tags", {})),
    }


def vertex(node):
    # Virtual vertices contain projection fractions internally: never serialize them.
    return (
        {"node": node}
        if isinstance(node, int)
        else {"virtual": "EXACT_PROJECTED_SEGMENT_POSITION"}
    )


def conditions(reasons):
    return [
        {
            "classification": reason,
            "status": (
                "UNSUPPORTED"
                if reason
                in ("conditional_rules", "physical_rules", "restriction_complexity")
                else "AMBIGUOUS"
            ),
        }
        for reason in sorted(reasons)
    ]


def inspect(export_raw, specification_raw, *, max_states=100000):
    spec = decode(specification_raw)
    if (
        not isinstance(spec, dict)
        or not isinstance(spec.get("origin"), dict)
        or not isinstance(spec.get("target"), dict)
    ):
        raise ValueError("exact_endpoints_required")
    oracle = RoadOracle(export_raw)
    if "export_sha256" in spec and spec["export_sha256"] != oracle.export_sha256:
        raise ValueError("export_binding_conflict")
    public, path = oracle._analyse_with_path(
        spec["origin"], spec["target"], spec.get("candidate"), max_states=max_states
    )
    records, used_bytes, omitted = [], 0, 0
    sources = {}

    def evidence(element):
        key = (element["type"], element["id"])
        if key not in sources:
            sources[key] = source(element)
        return sources[key]

    def add(record):
        nonlocal used_bytes, omitted
        size = len(canonical(record))
        if len(records) >= MAX_RECORDS or used_bytes + size > MAX_EVIDENCE_BYTES:
            omitted += 1
        else:
            records.append(record)
            used_bytes += size

    if path is None:
        for label in ("origin", "target"):
            endpoint = spec[label]
            way = oracle.ways[endpoint["way"]]
            add(
                {
                    "record_type": "ENDPOINT_SEGMENT_EVIDENCE",
                    "endpoint": label,
                    "way": endpoint["way"],
                    "segment": endpoint["segment"],
                    "ordered_segment_nodes": way["nodes"][
                        endpoint["segment"] : endpoint["segment"] + 2
                    ],
                    "source": evidence(way),
                    "access_only_not_direction_or_turn_permission": [
                        {
                            "direction": d,
                            "potentially_allowed": oracle.access(
                                way.get("tags", {}), d
                            )[0],
                            "uncertain": oracle.access(way.get("tags", {}), d)[1],
                        }
                        for d in (1, -1)
                    ],
                }
            )

    path_keys, path_nodes, departures, turn_keys = set(), set(), set(), set()
    previous = None
    for index, (edge, reasons) in enumerate(path or ()):
        path_keys.add(edge.key)
        path_nodes.update(n for n in (edge.start, edge.end) if isinstance(n, int))
        if isinstance(edge.start, int):
            departures.add(edge.start)
        if previous:
            turn_keys.add((previous.way, edge.start))
        rules = (
            oracle.turn_rules.get((previous.way, edge.start), ()) if previous else ()
        )
        way = oracle.ways[edge.way]
        origins = []
        if oracle.edge_reasons[edge.key]:
            origins.append("EDGE")
        node_reasons = set()
        if isinstance(edge.start, int):
            node_reasons = oracle.tag_reasons(
                oracle.nodes[edge.start].get("tags", {}), edge.direction, node=True
            )
            if node_reasons:
                origins.append("DEPARTURE_NODE")
        if "ambiguous_turn" in reasons or "restriction_complexity" in reasons:
            origins.append("TURN_TRANSITION")
        if oracle.unresolved:
            origins.append("GLOBAL_UNRESOLVED_RESTRICTION_GUARD")
        add(
            {
                "record_type": "PATH_TRANSITION",
                "path_index": index,
                "on_representative_path": True,
                "way": edge.way,
                "segment": edge.segment,
                "direction": edge.direction,
                "ordered_segment_nodes": way["nodes"][edge.segment : edge.segment + 2],
                "departure": vertex(edge.start),
                "arrival": vertex(edge.end),
                "classification": sorted(reasons),
                "conditions": conditions(reasons),
                "condition_status": (
                    "UNRESOLVED"
                    if reasons or oracle.unresolved
                    else "SUPPORTED_BY_EXPORT_ONLY"
                ),
                "uncertainty_sources": origins,
                "edge": {
                    "classification": sorted(oracle.edge_reasons[edge.key]),
                    "conditions": conditions(oracle.edge_reasons[edge.key]),
                    **evidence(way),
                },
                "departure_node": (
                    {
                        "classification": sorted(node_reasons),
                        "conditions": conditions(node_reasons),
                        **evidence(oracle.nodes[edge.start]),
                    }
                    if isinstance(edge.start, int)
                    else None
                ),
                "incoming": (
                    {
                        "way": previous.way,
                        "segment": previous.segment,
                        "direction": previous.direction,
                    }
                    if previous
                    else None
                ),
                "applicable_supported_turn_rules": [
                    {"from": f, "via": v, "to": to, "restriction": kind}
                    for f, v, to, kind in rules[:64]
                ],
                "additional_supported_turn_rule_count": max(0, len(rules) - 64),
            }
        )
        previous = edge

    for relation in sorted(
        oracle.relations.values(),
        key=lambda r: r["id"] in oracle._supported_relation_ids,
    ):
        t = relation.get("tags", {})
        if t.get("type") != "restriction":
            continue
        roles = {
            role: [m for m in relation["members"] if m.get("role") == role]
            for role in ("from", "via", "to")
        }
        via = (
            roles["via"][0]["ref"]
            if len(roles["via"]) == 1
            and roles["via"][0]["type"] == "node"
            and roles["via"][0]["ref"] in oracle.nodes
            else None
        )
        rule = (
            (
                roles["from"][0]["ref"],
                via,
                roles["to"][0]["ref"],
                t.get("restriction:motorcar", t.get("restriction", "")),
            )
            if all(len(roles[r]) == 1 for r in roles)
            else None
        )
        is_supported = relation["id"] in oracle._supported_relation_ids
        issue = []
        missing = sum(
            m["ref"]
            not in {
                "node": oracle.nodes,
                "way": oracle.ways,
                "relation": oracle.relations,
            }[m["type"]]
            for m in relation["members"]
        )
        if missing or any(len(v) != 1 for v in roles.values()):
            issue.append("INCOMPLETE_MEMBER_EVIDENCE")
        if via is not None and any(
            m["type"] == "way"
            and m.get("role") in ("from", "to")
            and m["ref"] in oracle.ways
            and via not in oracle.ways[m["ref"]]["nodes"]
            for m in relation["members"]
        ):
            issue.append("INCOMPLETE_INCIDENCE_EVIDENCE")
        if "except" in t:
            issue.append("VEHICLE_EXCEPTION_NOT_RESOLVED")
        if any("conditional" in k for k in t):
            issue.append("CONDITIONAL_NOT_EVALUATED")
        if not is_supported and not issue:
            issue.append("UNSUPPORTED_FORM_OR_TAGS")
        record = {
            "record_type": "RESTRICTION_RELATION",
            **evidence(relation),
            "condition_status": "SUPPORTED_RULE" if is_supported else "UNRESOLVED",
            "classification": issue,
            "global_guard": not is_supported,
            "via_locality": (
                "UNKNOWN"
                if via is None or path is None
                else "AT_PATH_NODE" if via in path_nodes else "OUTSIDE_PATH_NODES"
            ),
            "applicable_supported_turn_on_path": bool(
                is_supported and (rule[0], via) in turn_keys
            ),
            "locality_is_relevance_proof": False,
            "members": [
                {
                    "type": m["type"],
                    "ref": m["ref"],
                    "role": (
                        m["role"]
                        if m["role"] in ("from", "via", "to")
                        else "WITHHELD_UNRECOGNISED_ROLE"
                    ),
                }
                for m in relation["members"][:64]
            ],
            "additional_member_count": max(0, len(relation["members"]) - 64),
            "missing_member_reference_count": missing,
        }
        add(record)
    for key, reasons in oracle.edge_reasons.items():
        if key not in path_keys and reasons:
            w, s, d = key
            add(
                {
                    "record_type": "OFF_PATH_EDGE",
                    "on_representative_path": False if path is not None else None,
                    "way": w,
                    "segment": s,
                    "direction": d,
                    "classification": sorted(reasons),
                    "conditions": conditions(reasons),
                    "condition_status": "UNRESOLVED",
                    **{"source": evidence(oracle.ways[w])},
                }
            )
    for n, node in oracle.nodes.items():
        reasons = oracle.tag_reasons(
            node.get("tags", {}), 1, node=True
        ) | oracle.tag_reasons(node.get("tags", {}), -1, node=True)
        if n not in departures and reasons:
            add(
                {
                    "record_type": "NON_DEPARTURE_NODE",
                    "on_representative_path": (
                        n in path_nodes if path is not None else None
                    ),
                    "classification": sorted(reasons),
                    "conditions": conditions(reasons),
                    "condition_status": "UNRESOLVED",
                    "source": evidence(node),
                }
            )
    return {
        "schema_version": 1,
        "scope": "PRIVATE_PROVISIONAL_TOPOLOGY_ONLY",
        "reviewed": False,
        "navigation_authorized": False,
        "acceptance": "UNVERIFIED",
        "production": "PRODUCTION_NO_GO",
        "capture_binding": "NOT_CHECKED",
        "independent_approval": False,
        "export_sha256": oracle.export_sha256,
        "specification_sha256": digest(specification_raw),
        "public_diagnostic": public,
        "representative_path_available": path is not None,
        "records": records,
        "omitted_records": omitted,
        "truncated": omitted > 0,
        "limits": {
            "records": MAX_RECORDS,
            "evidence_bytes": MAX_EVIDENCE_BYTES,
            "members_per_relation": 64,
        },
    }


def output_target(path):
    """Only an explicit absolute new file in an existing non-Git directory."""
    path = Path(path)
    if str(path).startswith(("\\\\", "//")):
        raise ValueError("local_output_required")
    if not path.is_absolute():
        raise ValueError("absolute_output_required")
    parent = path.parent.resolve(strict=True)
    target = parent / path.name

    def git_boundary(directory):
        marker = directory / ".git"
        if marker.is_symlink() or marker.is_file():
            return True
        if marker.is_dir() and any(marker.iterdir()):
            return True
        return (
            (directory / "HEAD").is_file()
            and (directory / "objects").is_dir()
            and (directory / "refs").is_dir()
        )

    if target.is_relative_to(REPOSITORY) or any(
        git_boundary(p) for p in (parent, *parent.parents)
    ):
        raise ValueError("git_output_forbidden")
    if target.exists() or target.is_symlink():
        raise ValueError("existing_output_forbidden")
    return target


def write_report(path, report):
    target = output_target(path)
    encoded = json.dumps(report, indent=2, sort_keys=True, allow_nan=False).encode()
    if len(encoded) > MAX_REPORT_BYTES:
        raise ValueError("private_report_limit")
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_BINARY", 0)
    )
    fd = os.open(target, flags, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(encoded)
