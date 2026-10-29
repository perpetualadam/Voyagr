"""Provisional offline motorcar plausibility. Never a routing/acceptance oracle.

The diagnostic view only removes traversals from the original potential graph.
The original RoadOracle class and every traversal predicate remain unchanged.
"""

from collections import Counter
from voyagr.utils.road_oracle import RoadOracle, decode

POLICY = "PROVISIONAL_MOTORCAR_PLAUSIBILITY_V1"
ROAD_CLASSES = frozenset(
    "motorway trunk primary secondary tertiary unclassified residential living_street service motorway_link trunk_link primary_link secondary_link tertiary_link".split()
)
EXCEPTION_CLASSES = frozenset(
    "footway pedestrian steps path cycleway bridleway track road".split()
)
MODES = ("access", "vehicle", "motor_vehicle", "motorcar")
PERMITTED = frozenset(("yes", "designated", "permissive"))
EXCLUSION_REASONS = (
    "BARRIER",
    "CONDITIONAL_PERMISSION",
    "UNSUPPORTED_ACCESS_TAG",
    "RESTRICTED_OR_UNKNOWN_ACCESS",
    "NON_MOTORCAR_INFRASTRUCTURE",
    "UNSUPPORTED_ROAD_CLASS",
    "DIRECTION_UNCERTAIN",
    "TURN_UNCERTAIN",
)


def access_value(tags, direction):
    value = None
    side = "forward" if direction == 1 else "backward"
    for mode in MODES:
        value = tags.get(mode + ":" + side, tags.get(mode, value))
    return value


def permission_exclusion(tags, direction, *, node=False):
    if "barrier" in tags:
        return "BARRIER"
    allowed_keys = {
        key for mode in MODES for key in (mode, mode + ":forward", mode + ":backward")
    }
    for key in tags:
        if key.split(":")[0] in (*MODES, "oneway") and "conditional" in key:
            return "CONDITIONAL_PERMISSION"
        if key.split(":")[0] in MODES and key not in allowed_keys:
            return "UNSUPPORTED_ACCESS_TAG"
    value = access_value(tags, direction)
    if value is not None and value not in PERMITTED:
        return "RESTRICTED_OR_UNKNOWN_ACCESS"
    if node:
        return None
    highway = tags.get("highway")
    if highway in ROAD_CLASSES:
        return None  # Narrow road-class plausibility default, never universal access.
    side = "forward" if direction == 1 else "backward"
    explicit = tags.get("motorcar:" + side, tags.get("motorcar"))
    if highway in EXCEPTION_CLASSES:
        return None if explicit in PERMITTED else "NON_MOTORCAR_INFRASTRUCTURE"
    return "UNSUPPORTED_ROAD_CLASS"


class _MotorcarView(RoadOracle):
    """Ephemeral stricter diagnostic view. No production caller instantiates this."""

    def __init__(self, raw):
        super().__init__(raw)
        self.base_edge_count = len(self.edges)
        self.excluded_edges = Counter()
        self.excluded_transitions = Counter()
        kept = []
        for edge in self.edges:
            reason = permission_exclusion(
                self.ways[edge.way].get("tags", {}), edge.direction
            )
            if reason is None and "direction" in self.edge_reasons[edge.key]:
                reason = "DIRECTION_UNCERTAIN"
            if reason:
                self.excluded_edges[reason] += 1
            else:
                kept.append(edge)
        self.edges = kept
        keys = {edge.key for edge in kept}
        self.edge_reasons = {
            key: value for key, value in self.edge_reasons.items() if key in keys
        }

    def transition(self, previous, edge):
        # The authoritative predicates run first, including all supported turns.
        ok, uncertain = super().transition(previous, edge)
        if not ok:
            return ok, uncertain
        reason = (
            permission_exclusion(
                self.nodes[edge.start].get("tags", {}), edge.direction, node=True
            )
            if isinstance(edge.start, int)
            else None
        )
        if reason is None and self.transition_reasons(previous, edge) & {
            "ambiguous_turn",
            "restriction_complexity",
        }:
            reason = "TURN_UNCERTAIN"
        if reason:
            self.excluded_transitions[reason] += 1
            return False, uncertain
        # Global unresolved guard and dimensional uncertainty are NOT cleared.
        return ok, uncertain


def insufficient():
    return {
        "schema_version": 1,
        "scope": "PROVISIONAL_MOTORCAR_INVESTIGATION_ONLY",
        "policy": POLICY,
        "classification": "EVIDENCE_INSUFFICIENT",
        "reviewed": False,
        "navigation_authorized": False,
        "acceptance": "UNVERIFIED",
        "production": "PRODUCTION_NO_GO",
        "capture_binding": "NOT_CHECKED",
        "real_world_disconnection_proven": False,
    }


def _run(export_raw, specification_raw, *, max_states, private):
    spec = decode(specification_raw)
    if (
        not isinstance(spec, dict)
        or not isinstance(spec.get("origin"), dict)
        or not isinstance(spec.get("target"), dict)
    ):
        raise ValueError("exact_endpoints_required")
    view = _MotorcarView(export_raw)
    if "export_sha256" in spec and spec["export_sha256"] != view.export_sha256:
        raise ValueError("export_binding_conflict")
    # Supplied candidates belong to the authoritative oracle and must not be
    # revalidated or reclassified under this separate policy. Never use them as starts.
    report, path = view._analyse_with_path(
        spec["origin"], spec["target"], max_states=max_states
    )
    possible = report["potential_path"]
    if possible is None:
        classification = "SEARCH_INCOMPLETE"
    elif possible and path:
        classification = "POTENTIAL_MOTORCAR_PATH_IN_EXPORT"
    elif possible or report["coverage_gap"]:
        classification = "EVIDENCE_INSUFFICIENT"
    else:
        classification = "NO_MOTORCAR_PATH_FOUND_IN_EXPORT"
    counts = report["uncertainty_diagnostics"]["representative_potential_path"][
        "uncertainty"
    ]
    exception_transitions = (
        sum(
            view.ways[e.way].get("tags", {}).get("highway") in EXCEPTION_CLASSES
            for e, _ in path
        )
        if path is not None
        else None
    )
    summary = {
        **insufficient(),
        "classification": classification,
        "potential_path_in_policy_graph": possible,
        "coverage_gap": report["coverage_gap"],
        "closed_component": "UNVERIFIED",
        "global_unresolved_restriction_guard": view.unresolved,
        "candidate_validation": "NOT_PERFORMED_BY_THIS_DIAGNOSTIC",
        "base_directed_edges": view.base_edge_count,
        "policy_directed_edges": len(view.edges),
        "policy_excluded_directed_edges": {
            key: view.excluded_edges[key] for key in EXCLUSION_REASONS
        },
        "policy_excluded_examined_transitions": {
            key: view.excluded_transitions[key] for key in EXCLUSION_REASONS
        },
        "examined_transition_count_scope": "KNOWN_AND_POTENTIAL_SEARCHES_INCLUDING_REVISITS",
        "search": report["uncertainty_diagnostics"]["searches"]["potential"],
        "representative_transitions": len(path) if path is not None else None,
        "representative_uncertainty": counts,
        "explicit_motorcar_exception_transitions": exception_transitions,
        "remaining_conditions": {
            "access": bool(counts["uncertain_access"]) if counts is not None else None,
            "barrier": bool(counts["barrier"]) if counts is not None else None,
            "dimensional_or_physical": (
                bool(counts["physical_rules"]) if counts is not None else None
            ),
            "conditional": (
                bool(counts["conditional_rules"]) if counts is not None else None
            ),
            "turn_or_unresolved_restriction": view.unresolved
            or bool(
                counts
                and (counts["ambiguous_turn"] or counts["restriction_complexity"])
            ),
            "explicit_exception_infrastructure_suitability_unverified": (
                bool(exception_transitions) if path is not None else None
            ),
        },
    }
    if not private:
        return summary
    from voyagr.utils.road_oracle_private import _describe_path

    evidence = _describe_path(view, specification_raw, spec, report, path)
    evidence["policy_search_report"] = evidence.pop("public_diagnostic")
    evidence["motorcar_investigation"] = summary
    evidence["policy"] = POLICY
    evidence["authoritative_oracle_result"] = "UNCHANGED_NOT_REPLACED_BY_THIS_REPORT"
    return evidence


def investigate(export_raw, specification_raw, *, max_states=100000):
    """Sanitized aggregate report. Missing/malformed evidence is never no-path."""
    try:
        return _run(export_raw, specification_raw, max_states=max_states, private=False)
    except (ValueError, TypeError, KeyError, IndexError, OverflowError, RecursionError):
        return insufficient()


def inspect_alternative(export_raw, specification_raw, *, max_states=100000):
    """Private evidence report: write only through PR #362's exclusive writer."""
    return _run(export_raw, specification_raw, max_states=max_states, private=True)
