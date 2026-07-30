"""
Shared lane-guidance helpers for routing engines and the lane-guidance API.

Single source of truth for UK lane heuristics, OSM turn:lanes parsing, and
Valhalla-shaped ``maneuver.lanes`` objects used by the PWA hybrid lane overlay.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

# Valhalla maneuver types that benefit from lane guidance (turns, exits, roundabouts).
LANE_GUIDANCE_VALHALLA_TYPES = frozenset({
    9, 10, 11, 12, 13, 14, 15, 16,
    19, 20, 21, 23, 24, 25, 26, 27, 35,
})

GH_ROAD_CLASS_TO_VOYAGR = {
    'MOTORWAY': 'motorway',
    'MOTORWAY_LINK': 'motorway_link',
    'TRUNK': 'trunk',
    'TRUNK_LINK': 'trunk_link',
    'PRIMARY': 'primary',
    'PRIMARY_LINK': 'primary',
    'SECONDARY': 'secondary',
    'SECONDARY_LINK': 'secondary',
    'TERTIARY': 'tertiary',
    'TERTIARY_LINK': 'tertiary',
    'RESIDENTIAL': 'residential',
    'UNCLASSIFIED': 'unclassified',
    'LIVING_STREET': 'living_street',
    'SERVICE': 'service',
}


def is_motorway_road_type(road_type: Optional[str]) -> bool:
    if not road_type:
        return False
    rc = str(road_type).lower()
    return rc in ('motorway', 'motorway_link', 'trunk', 'trunk_link')


def normalize_lane_maneuver_for_uk(maneuver: str, total_lanes: int, highway_type: Optional[str]) -> str:
    if maneuver in ('through',):
        return 'straight'
    if is_motorway_road_type(highway_type):
        return maneuver
    if total_lanes <= 2 and maneuver in ('slight_right', 'slight_left'):
        return 'straight'
    return maneuver


def parse_turn_lanes(turn_lanes_str: Optional[str], total_lanes: int) -> Optional[List[List[str]]]:
    if not turn_lanes_str:
        return None
    parts = turn_lanes_str.split('|')
    if len(parts) != total_lanes:
        return None
    return [p.split(';') for p in parts]


def recommend_lanes_from_turn_lanes(
    lane_dirs: Optional[List[List[str]]],
    maneuver: str,
    roundabout_exit_count: int = 0,
) -> List[int]:
    if not lane_dirs:
        return []

    maneuver_map = {
        'left': ['left', 'slight_left'],
        'sharp_left': ['sharp_left', 'left', 'slight_left'],
        'slight_left': ['slight_left', 'left'],
        'right': ['right', 'slight_right'],
        'sharp_right': ['sharp_right', 'right', 'slight_right'],
        'slight_right': ['slight_right', 'right'],
        'straight': ['through', 'none', ''],
        'exit_right': ['right', 'slight_right', 'merge_to_right'],
        'exit_left': ['left', 'slight_left', 'merge_to_left'],
        'exit': ['right', 'slight_right'],
        'merge': ['through', 'none', ''],
        'uturn': ['reverse', 'left', 'slight_left'],
        'destination': ['through', 'none', ''],
    }

    if maneuver == 'roundabout':
        if roundabout_exit_count <= 1:
            maneuver_map['roundabout'] = ['left', 'slight_left', 'through']
        elif roundabout_exit_count == 2:
            maneuver_map['roundabout'] = ['through', 'none', '', 'slight_left', 'slight_right']
        else:
            maneuver_map['roundabout'] = ['right', 'slight_right', 'through']

    wanted = maneuver_map.get(maneuver, ['through', 'none', ''])
    best_score = -1
    lane_scores: List[Tuple[int, int]] = []
    for idx, dirs in enumerate(lane_dirs):
        lane_score = 0
        for w_idx, w in enumerate(wanted):
            if w in dirs:
                lane_score = len(wanted) - w_idx
                break
        lane_scores.append((idx + 1, lane_score))
        if lane_score > best_score:
            best_score = lane_score

    if best_score <= 0:
        return []

    return [lane for lane, score in lane_scores if score == best_score]


def recommend_lane_from_turn_lanes(
    lane_dirs: Optional[List[List[str]]],
    maneuver: str,
    roundabout_exit_count: int = 0,
) -> Optional[int]:
    lanes = recommend_lanes_from_turn_lanes(lane_dirs, maneuver, roundabout_exit_count)
    return lanes[0] if lanes else None


def estimate_candidate_lanes_uk(maneuver: str, total_lanes: int, roundabout_exit_count: int = 0) -> List[int]:
    if total_lanes <= 1:
        return [1]
    if maneuver == 'roundabout' and roundabout_exit_count > 0:
        if roundabout_exit_count <= 2:
            return [1]
        if roundabout_exit_count >= 3:
            return [total_lanes]
        return [1]
    if maneuver in ('left', 'slight_left', 'sharp_left', 'exit_left'):
        return [1, 2] if total_lanes >= 3 else [1]
    if maneuver in ('right', 'slight_right', 'sharp_right', 'exit_right', 'exit', 'uturn'):
        return [total_lanes - 1, total_lanes] if total_lanes >= 3 else [total_lanes]
    if maneuver == 'merge':
        return [1, total_lanes] if total_lanes >= 3 else [max(1, (total_lanes + 1) // 2)]
    return [max(1, (total_lanes + 1) // 2)]


def get_recommended_lane_simple(maneuver: str, total_lanes: int, roundabout_exit_count: int = 0) -> int:
    """Single-lane UK heuristic fallback (rightmost for right, leftmost for left)."""
    if total_lanes <= 1:
        return 1
    if maneuver == 'roundabout' and roundabout_exit_count > 0:
        if roundabout_exit_count <= 2:
            return 1
        return total_lanes
    if maneuver in ('left', 'slight_left', 'sharp_left', 'exit_left'):
        return 1
    if maneuver in ('right', 'slight_right', 'sharp_right', 'exit_right', 'exit'):
        return total_lanes
    if maneuver in ('straight', 'merge'):
        return max(1, (total_lanes + 1) // 2)
    return max(1, (total_lanes + 1) // 2)


def score_lane_guidance_confidence(
    has_turn_lanes: bool,
    has_osm_data: bool,
    highway_type: Optional[str],
    maneuver: str,
    total_lanes: int,
) -> int:
    if has_turn_lanes:
        return 95
    if has_osm_data:
        return 78
    if is_motorway_road_type(highway_type):
        if maneuver in ('exit_left', 'exit_right', 'exit', 'merge', 'roundabout'):
            return 76
        if maneuver.startswith('slight_'):
            return 74
        if total_lanes >= 3:
            return 72
        return 68
    if maneuver == 'roundabout' and total_lanes >= 2:
        return 80
    if total_lanes >= 3 and maneuver in (
        'left', 'right', 'sharp_left', 'sharp_right', 'exit_left', 'exit_right',
    ):
        return 72
    if maneuver in ('exit_left', 'exit_right', 'exit', 'merge'):
        return 71
    return 65


def apply_confidence_lane_selection(
    recommended_lanes: List[int],
    confidence: int,
) -> Tuple[List[int], Optional[int]]:
    if not recommended_lanes:
        return [], None
    if confidence >= 90:
        return [recommended_lanes[0]], recommended_lanes[0]
    if confidence >= 70:
        return recommended_lanes, recommended_lanes[0]
    return [], None


def valhalla_type_to_lane_maneuver(valhalla_type: int) -> str:
    mapping = {
        9: 'slight_right', 10: 'right', 11: 'sharp_right',
        12: 'uturn', 13: 'uturn',
        14: 'sharp_left', 15: 'left', 16: 'slight_left',
        19: 'exit_left', 20: 'exit_right', 21: 'exit_left',
        23: 'slight_right', 24: 'slight_left',
        25: 'merge', 35: 'merge',
        26: 'roundabout', 27: 'roundabout',
    }
    return mapping.get(valhalla_type, 'straight')


def path_detail_value_at_index(segments: Optional[Sequence], point_idx: int) -> Any:
    """Return the path-detail value covering ``point_idx`` ([from, to, value] segments)."""
    for seg in segments or []:
        if not isinstance(seg, (list, tuple)) or len(seg) < 3:
            continue
        frm, to, val = int(seg[0]), int(seg[1]), seg[2]
        if frm <= point_idx < to:
            return val
    return None


def map_graphhopper_road_class(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    key = str(raw).upper().strip()
    return GH_ROAD_CLASS_TO_VOYAGR.get(key)


def build_valhalla_lane_objects(
    total_lanes: int,
    recommended_1based: List[int],
    lane_dirs: Optional[List[List[str]]] = None,
) -> List[Dict[str, Any]]:
    """Build Valhalla-shaped lane objects for the PWA hybrid lane overlay."""
    if total_lanes <= 1:
        return []
    rec_set = set(recommended_1based or [])
    out: List[Dict[str, Any]] = []
    for i in range(total_lanes):
        lane_num = i + 1
        obj: Dict[str, Any] = {'active': lane_num in rec_set}
        if lane_dirs and i < len(lane_dirs):
            indications = [d for d in lane_dirs[i] if d]
            if indications:
                obj['valid_indications'] = indications
        out.append(obj)
    return out


def _map_direction_token_to_osm(token: Any) -> str:
    raw = str(token or '').lower().replace(' ', '_').replace('-', '_')
    mapping = {
        'straight': 'through',
        'through': 'through',
        'none': 'none',
        'uturn': 'reverse',
        'u_turn': 'reverse',
    }
    return mapping.get(raw, raw)


def _lane_dict_to_osm_segment(lane: Dict[str, Any]) -> str:
    dirs = lane.get('directions') or lane.get('valid') or lane.get('indications') or []
    if isinstance(dirs, str):
        return _map_direction_token_to_osm(dirs)
    if not isinstance(dirs, list):
        return 'through'
    mapped = [_map_direction_token_to_osm(d) for d in dirs if d]
    if not mapped:
        return 'through' if lane.get('active') else 'none'
    return ';'.join(mapped) if len(mapped) > 1 else mapped[0]


def turn_lanes_string_from_lane_dicts(lane_dicts: Sequence[Any]) -> Optional[str]:
    """Convert GraphHopper / Mapbox-style lane dicts to an OSM turn:lanes string."""
    if not lane_dicts:
        return None
    parts: List[str] = []
    for lane in lane_dicts:
        if isinstance(lane, str):
            parts.append(lane)
        elif isinstance(lane, dict):
            parts.append(_lane_dict_to_osm_segment(lane))
    if not parts:
        return None
    return '|'.join(parts)


def extract_turn_lanes_string_from_graphhopper_instruction(instr: Dict[str, Any]) -> Optional[str]:
    """Best-effort turn:lanes string from a GraphHopper instruction object."""
    for key in ('turn_lanes', 'turn:lanes', 'turn_lanes_forward'):
        val = instr.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    raw = instr.get('lanes')
    if isinstance(raw, str) and '|' in raw:
        return raw.strip()

    if isinstance(raw, list) and raw:
        # GH may nest multiple lane lists per instruction; use the last (closest to turn).
        lane_list = raw[-1] if isinstance(raw[-1], list) else raw
        return turn_lanes_string_from_lane_dicts(lane_list)

    for detail in instr.get('details') or []:
        if isinstance(detail, dict):
            lane_dicts = detail.get('lanes') or detail.get('turn_lanes')
            if isinstance(lane_dicts, list):
                s = turn_lanes_string_from_lane_dicts(lane_dicts)
                if s:
                    return s

    components = instr.get('components') or []
    lane_comps = [c for c in components if isinstance(c, dict) and c.get('type') == 'lane']
    if lane_comps:
        return turn_lanes_string_from_lane_dicts(lane_comps)

    return None


def resolve_lane_count_for_maneuver(
    turn_lanes_str: Optional[str],
    path_lane_count: Any,
    default: int = 2,
) -> int:
    if turn_lanes_str and '|' in turn_lanes_str:
        count = len(turn_lanes_str.split('|'))
        if count >= 1:
            return count
    if isinstance(path_lane_count, (int, float)) and path_lane_count >= 1:
        return int(path_lane_count)
    if isinstance(path_lane_count, str) and path_lane_count.isdigit():
        return max(1, int(path_lane_count))
    return max(1, default)


def build_lanes_for_maneuver(
    *,
    valhalla_type: int,
    road_class: Optional[str],
    exit_count: int = 0,
    turn_lanes_str: Optional[str] = None,
    path_lane_count: Any = None,
) -> Optional[List[Dict[str, Any]]]:
    """
    Build Valhalla-shaped ``lanes`` for a maneuver using turn:lanes or UK heuristics.

    Returns None when lane guidance would not add value (single-lane or non-turn).
    """
    if valhalla_type not in LANE_GUIDANCE_VALHALLA_TYPES:
        return None

    total_lanes = resolve_lane_count_for_maneuver(turn_lanes_str, path_lane_count)
    if total_lanes <= 1:
        return None

    maneuver = valhalla_type_to_lane_maneuver(valhalla_type)
    lane_maneuver = normalize_lane_maneuver_for_uk(maneuver, total_lanes, road_class)
    lane_dirs = parse_turn_lanes(turn_lanes_str, total_lanes) if turn_lanes_str else None

    if lane_dirs:
        recommended = recommend_lanes_from_turn_lanes(lane_dirs, lane_maneuver, exit_count)
    else:
        recommended = estimate_candidate_lanes_uk(lane_maneuver, total_lanes, exit_count)

    if not recommended:
        return None

    return build_valhalla_lane_objects(total_lanes, recommended, lane_dirs)


def attach_lanes_to_graphhopper_maneuver(
    maneuver: Dict[str, Any],
    instr: Dict[str, Any],
    *,
    valhalla_type: int,
    path_details: Optional[Dict[str, Any]],
    shape_index_src: int,
) -> None:
    """Attach Valhalla-shaped ``lanes`` to a GraphHopper-derived maneuver when possible."""
    road_class = maneuver.get('road_class')
    if not road_class and path_details:
        gh_rc = path_detail_value_at_index(path_details.get('road_class'), shape_index_src)
        road_class = map_graphhopper_road_class(gh_rc) or road_class

    turn_lanes_str = extract_turn_lanes_string_from_graphhopper_instruction(instr)
    path_lane_count = None
    if path_details:
        path_lane_count = path_detail_value_at_index(path_details.get('lanes'), shape_index_src)

    exit_count = int(maneuver.get('roundabout_exit_count') or 0)
    lanes = build_lanes_for_maneuver(
        valhalla_type=valhalla_type,
        road_class=road_class,
        exit_count=exit_count,
        turn_lanes_str=turn_lanes_str,
        path_lane_count=path_lane_count,
    )
    if lanes:
        maneuver['lanes'] = lanes
