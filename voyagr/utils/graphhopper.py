"""GraphHopper -> Valhalla maneuver translation.

GraphHopper instructions use a numeric ``sign`` for the turn type while the rest
of Voyagr's turn-by-turn UI is keyed on Valhalla ``maneuver.type`` codes. Keeping
this mapping in one place avoids the off-by-one drift that previously produced
"keep left" text and straight arrows for what were really left turns.

Valhalla maneuver type reference (subset used here):
    0  None              4  Destination        8  Continue
    9  SlightRight      10  Right             11  SharpRight
    12 UturnRight       13  UturnLeft         14  SharpLeft
    15 Left             16  SlightLeft        23  StayRight
    24 StayLeft         26  RoundaboutEnter   27  RoundaboutExit
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from voyagr.utils.geometry import get_distance_between_points

# GraphHopper instruction ``sign`` -> Valhalla ``maneuver.type``.
GH_SIGN_TO_VALHALLA = {
    -98: 13,  # U-turn (unknown)   -> Uturn Left
    -8: 13,   # U-turn left        -> Uturn Left
    -7: 24,   # Keep left          -> Stay Left
    -6: 27,   # Leave roundabout   -> Roundabout Exit
    -3: 14,   # Sharp left         -> Sharp Left
    -2: 15,   # Left               -> Left
    -1: 16,   # Slight left        -> Slight Left
    0: 8,     # Straight/continue  -> Continue
    1: 9,     # Slight right       -> Slight Right
    2: 10,    # Right              -> Right
    3: 11,    # Sharp right        -> Sharp Right
    4: 4,     # Finish             -> Destination
    5: 0,     # Via                -> None
    6: 26,    # Roundabout         -> Roundabout Enter
    7: 23,    # Keep right         -> Stay Right
    8: 12,    # U-turn right       -> Uturn Right
}

# Default when a sign is unknown: treat as "continue" so we never crash and the
# arrow/text degrade to a sensible straight-ahead rather than a wrong turn.
DEFAULT_VALHALLA_TYPE = 8


def gh_sign_to_valhalla_type(sign, default=DEFAULT_VALHALLA_TYPE):
    """Translate a GraphHopper instruction ``sign`` to a Valhalla maneuver type."""
    return GH_SIGN_TO_VALHALLA.get(sign, default)


def remap_shape_index_after_reencode(
    src_coords: Sequence[Tuple[float, float]],
    dst_coords: Sequence[Tuple[float, float]],
    src_idx: int,
) -> int:
    """
    Map a GraphHopper instruction interval index (source polyline) to the nearest
    vertex on a re-encoded polyline (e.g. precision 5 -> precision 6 for the API).
    """
    if not dst_coords:
        return 0
    if not src_coords:
        return max(0, min(int(src_idx), len(dst_coords) - 1))
    src_idx = max(0, min(int(src_idx), len(src_coords) - 1))
    target_lat, target_lon = src_coords[src_idx]
    best_i = 0
    best_d = float('inf')
    for i, (lat, lon) in enumerate(dst_coords):
        d = get_distance_between_points(target_lat, target_lon, lat, lon)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i
