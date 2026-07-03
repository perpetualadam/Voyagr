"""Helpers for ⚡ Optimised route camera avoidance (GraphHopper vs Valhalla)."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


def fetch_valhalla_auto_json(
    url: str,
    headers: Dict[str, str],
    locations: List[Dict[str, Any]],
    exclude_locations: Optional[List[Dict[str, Any]]] = None,
    timeout: int = 10,
) -> Optional[Dict[str, Any]]:
    """
    Valhalla auto (time-focused). If exclude_locations is non-empty, try that first;
    on non-success, retry without exclusions so routing still succeeds when avoids over-constrain the graph.
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
