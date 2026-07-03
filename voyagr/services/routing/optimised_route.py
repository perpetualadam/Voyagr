"""Helpers for ⚡ Optimised route camera avoidance (GraphHopper vs Valhalla)."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

PRIMARY_OPTIMISED_NAME = '⚡ Optimised'


def is_primary_optimised_route(route: Dict[str, Any]) -> bool:
    """True only for the main Optimised option, not discovery/alternate labels."""
    return (route.get('name') or '').strip() == PRIMARY_OPTIMISED_NAME


def fetch_valhalla_auto_json(
    url: str,
    headers: Dict[str, str],
    locations: List[Dict[str, Any]],
    exclude_locations: Optional[List[Dict[str, Any]]] = None,
    timeout: int = 10,
    *,
    require_exclusions: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Valhalla auto (time-focused). If exclude_locations is non-empty, try that first;
    on non-success, retry without exclusions so routing still succeeds when avoids
    over-constrain the graph — unless require_exclusions is True (Optimised ensure path).
    """
    base_payload: Dict[str, Any] = {
        'locations': locations,
        'costing': 'auto',
        'units': 'kilometers',
        'language': 'en-GB',
        'directions_options': {'generalize': 0},
    }
    attempts: List[Dict[str, Any]] = []
    if exclude_locations:
        w = dict(base_payload)
        w['exclude_locations'] = exclude_locations
        attempts.append(w)
    elif require_exclusions:
        return None
    if not require_exclusions:
        attempts.append(base_payload)
    for payload in attempts:
        try:
            resp = requests.post(url, json=payload, timeout=timeout, headers=headers)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if data.get('error'):
                continue
            if 'trip' in data and 'legs' in data['trip'] and data['trip']['legs']:
                return data
        except Exception as e:
            logger.warning(f'[VALHALLA] auto request failed: {e}')
    return None


def graphhopper_qualifies_as_optimised(
    graphhopper_route: Optional[Dict[str, Any]],
    *,
    avoid_cameras: bool,
) -> bool:
    """Only label GraphHopper as ⚡ Optimised when camera avoidance was actually applied."""
    if not graphhopper_route or not graphhopper_route.get('success'):
        return False
    if not avoid_cameras:
        return True
    return bool(graphhopper_route.get('custom_model_applied'))


def baseline_camera_hazard_count(routes: List[Dict[str, Any]]) -> int:
    """Lowest camera hazard_count among non-Optimised route options (Fastest, Shortest, etc.)."""
    counts = [
        int(r.get('hazard_count') or 0)
        for r in routes
        if not is_primary_optimised_route(r)
    ]
    return min(counts) if counts else 0


def optimised_route_entry_qualifies(
    route: Dict[str, Any],
    *,
    graphhopper_route: Optional[Dict[str, Any]],
    baseline_hazard_count: int,
    avoid_cameras: bool,
) -> bool:
    """
    Keep an Optimised route only when it actually avoids cameras at least as well as
    Fast/Short routes and used a real avoidance mechanism (GH custom model or Valhalla excludes).
    """
    if not avoid_cameras:
        return True
    if not is_primary_optimised_route(route):
        return True

    if int(route.get('hazard_count') or 0) > baseline_hazard_count:
        return False

    source = route.get('source')
    if source == 'GraphHopper':
        return graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=True)
    if source == 'Valhalla':
        return bool(route.get('camera_exclusions_applied'))
    return False


def prune_non_qualifying_optimised_routes(
    routes: List[Dict[str, Any]],
    *,
    graphhopper_route: Optional[Dict[str, Any]],
    avoid_cameras: bool,
) -> List[Dict[str, Any]]:
    """Drop Optimised entries that did not apply camera avoidance."""
    if not avoid_cameras:
        return routes
    baseline = baseline_camera_hazard_count(routes)
    pruned = [
        r for r in routes
        if optimised_route_entry_qualifies(
            r,
            graphhopper_route=graphhopper_route,
            baseline_hazard_count=baseline,
            avoid_cameras=avoid_cameras,
        )
    ]
    removed = len(routes) - len(pruned)
    if removed:
        logger.info(
            f'[OPTIMISED] Pruned {removed} non-qualifying Optimised route(s) '
            f'(baseline hazard_count={baseline})'
        )
    return pruned
