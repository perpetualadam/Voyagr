"""
Shared helpers that translate Voyagr "Route Preferences" settings into Valhalla
`auto` costing_options dicts. Kept in its own tiny module so both the Flask layer
(`voyagr_web.py`) and the multi-drop engine use the same mapping.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple


VALID_ROUTE_OPTIMIZATIONS: Tuple[str, ...] = (
    'fastest', 'shortest', 'cheapest', 'eco', 'balanced',
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
      * shortest          — sets `shortest: true` so distance dominates over time
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
    if ro not in VALID_ROUTE_OPTIMIZATIONS:
        ro = 'fastest'
    if ro == 'shortest':
        opts["shortest"] = True
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
