"""
Shared helpers that translate Voyagr "Route Preferences" settings into Valhalla
`auto` costing_options dicts. Kept in its own tiny module so both the Flask layer
(`voyagr_web.py`) and the multi-drop engine use the same mapping.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple


VALID_ROUTE_OPTIMIZATIONS: Tuple[str, ...] = (
    'fastest', 'scenic', 'quiet', 'cheapest', 'eco', 'balanced',
)


def build_auto_costing_options(
    *,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_unpaved: bool = False,
    route_optimization: str = 'fastest',
) -> Dict[str, Any]:
    """
    Translate the settings-UI route preferences into a Valhalla `auto` `costing_options` dict.

    Hard avoidance toggles (boolean) always win over softer preference biases. Route-optimization
    presets are additive: they only fill in slots left unset by the hard toggles.

      * fastest/balanced  — no overrides (Valhalla defaults)
      * scenic            — down-weights highways (more scenic roads)
      * quiet             — favours living streets, avoids motorways
      * cheapest          — avoids tolls and down-weights highways
      * eco               — caps speed and down-weights highways (reduces fuel burn)

    Returned dict is safe to pass as `costing_options[costing] = opts`. Empty dict means
    "no custom options" and callers should not attach `costing_options`.
    """
    opts: Dict[str, Any] = {}

    if avoid_tolls:
        opts["use_tolls"] = 0
    if avoid_motorways:
        opts["use_highways"] = 0
    if avoid_ferries:
        opts["use_ferry"] = 0
    if avoid_unpaved:
        opts["use_tracks"] = 0

    if prefer_scenic and "use_highways" not in opts:
        opts["use_highways"] = 0.2
    if prefer_quiet:
        opts["use_living_streets"] = 0.8
        if "use_highways" not in opts:
            opts["use_highways"] = 0.3

    ro = (route_optimization or 'fastest').lower()
    if ro == 'shortest':
        ro = 'fastest'
    if ro not in VALID_ROUTE_OPTIMIZATIONS:
        ro = 'fastest'
    if ro == 'scenic':
        if "use_highways" not in opts:
            opts["use_highways"] = 0.2
    elif ro == 'quiet':
        opts["use_living_streets"] = 0.8
        if "use_highways" not in opts:
            opts["use_highways"] = 0.3
    elif ro == 'cheapest':
        if "use_tolls" not in opts:
            opts["use_tolls"] = 0
        if "use_highways" not in opts:
            opts["use_highways"] = 0.4
    elif ro == 'eco':
        opts["top_speed"] = 90
        if "use_highways" not in opts:
            opts["use_highways"] = 0.5

    return opts


def build_graphhopper_costing_preference_model(
    *,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    avoid_unpaved: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    route_optimization: str = 'fastest',
) -> Dict[str, Any]:
    """
    Mirror Valhalla auto costing preferences as GraphHopper custom-model priority rules.
    Returns an empty dict when no preference rules apply.
    """
    priority: List[Dict[str, str]] = []

    if avoid_tolls:
        priority.append({'if': 'toll == ALL || toll == HGV', 'multiply_by': '0.01'})
    if avoid_motorways:
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.01'})
    if avoid_ferries:
        priority.append({'if': 'road_environment == FERRY', 'multiply_by': '0.01'})
    if avoid_unpaved:
        priority.append({'if': 'road_class == TRACK || road_class == PATH', 'multiply_by': '0.05'})

    if prefer_scenic:
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.2'})
    if prefer_quiet:
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.3'})
        priority.append({'if': 'road_class == LIVING_STREET', 'multiply_by': '1.2'})

    ro = (route_optimization or 'fastest').lower()
    if ro == 'shortest':
        ro = 'fastest'
    if ro not in VALID_ROUTE_OPTIMIZATIONS:
        ro = 'fastest'
    if ro == 'scenic':
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.2'})
    elif ro == 'quiet':
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.3'})
        priority.append({'if': 'road_class == LIVING_STREET', 'multiply_by': '1.2'})
    elif ro == 'cheapest':
        priority.append({'if': 'toll == ALL || toll == HGV', 'multiply_by': '0.01'})
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.4'})
    elif ro == 'eco':
        priority.append({'if': 'road_class == MOTORWAY', 'multiply_by': '0.5'})

    if not priority:
        return {}
    return {'priority': priority}
