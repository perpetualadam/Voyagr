"""Helpers for ⚡ Optimised route camera avoidance (GraphHopper vs Valhalla)."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import requests

from voyagr.utils.geometry import get_distance_between_points

logger = logging.getLogger(__name__)

PRIMARY_OPTIMISED_NAME = '⚡ Optimised'
SHORTEST_ROUTE_NAME = '📏 Shortest'
SCENIC_ROUTE_NAME = '🌿 Scenic'
ROUTE_B_NAME = '🛣️ Route B'

CAMERA_HAZARD_BUCKETS: Tuple[str, ...] = (
    'camera_speed',
    'camera_red_light',
    'camera_average_speed',
    'camera_bus_lane',
    'camera_mobile',
    'camera_other',
)

# Tighter than default 500m scoring — catches cameras the user sees on the map near the line.
SHORTEST_CAMERA_PROXIMITY_METERS = 150


def is_primary_optimised_route(route: Dict[str, Any]) -> bool:
    """True only for the main Optimised option, not discovery/alternate labels."""
    return (route.get('name') or '').strip() == PRIMARY_OPTIMISED_NAME


def is_shortest_route(route: Dict[str, Any]) -> bool:
    """True only for auto_shorter 📏 Shortest — not Valhalla alternates named 'Shortest'."""
    return (route.get('name') or '').strip() == SHORTEST_ROUTE_NAME


def merge_valhalla_exclude_locations(
    *groups: List[Dict[str, Any]],
    max_points: int = 50,
) -> List[Dict[str, Any]]:
    """Dedupe lat/lon exclude points; earlier groups take priority (e.g. on-route cameras first)."""
    seen: set = set()
    merged: List[Dict[str, Any]] = []
    for group in groups:
        for loc in group:
            try:
                lat = float(loc['lat'])
                lon = float(loc['lon'])
            except (KeyError, TypeError, ValueError):
                continue
            key = (round(lat, 5), round(lon, 5))
            if key in seen:
                continue
            seen.add(key)
            merged.append({'lat': lat, 'lon': lon})
            if len(merged) >= max_points:
                return merged
    return merged


def decode_route_coords(route: Dict[str, Any]) -> List[Tuple[float, float]]:
    """Decode a /api/route-style route entry geometry to (lat, lon) pairs."""
    geom = route.get('geometry')
    if not geom:
        return []
    if isinstance(geom, list):
        return [(float(p[0]), float(p[1])) for p in geom if len(p) >= 2]
    if not isinstance(geom, str):
        return []
    try:
        import polyline as pl
    except ImportError:
        return []
    prec = int(route.get('geometry_precision') or 6)
    return pl.decode(geom, precision=prec)


def iter_camera_hazards(hazards: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for bucket in CAMERA_HAZARD_BUCKETS:
        out.extend(hazards.get(bucket) or [])
    legacy = hazards.get('camera') or []
    out.extend(legacy)
    return out


def count_cameras_near_polyline(
    route_points: Union[str, Sequence[Tuple[float, float]], Dict[str, Any]],
    hazards: Dict[str, List[Dict[str, Any]]],
    *,
    threshold_m: float = SHORTEST_CAMERA_PROXIMITY_METERS,
    max_samples: int = 500,
) -> int:
    """Count distinct cameras within threshold_m of a route polyline (dense sample)."""
    if isinstance(route_points, dict):
        coords = decode_route_coords(route_points)
    elif isinstance(route_points, str):
        coords = decode_route_coords({'geometry': route_points, 'geometry_precision': 6})
    else:
        coords = list(route_points)
    if not coords:
        return 0

    cameras = iter_camera_hazards(hazards)
    if not cameras:
        return 0

    sample_interval = max(1, len(coords) // max_samples)
    sampled = coords[::sample_interval]
    seen: set = set()
    count = 0
    for cam in cameras:
        try:
            clat = float(cam['lat'])
            clon = float(cam['lon'])
        except (KeyError, TypeError, ValueError):
            continue
        key = (round(clat, 5), round(clon, 5))
        if key in seen:
            continue
        min_dist = float('inf')
        for plat, plon in sampled:
            dist = get_distance_between_points(clat, clon, plat, plon)
            min_dist = min(min_dist, dist)
            if min_dist <= threshold_m:
                break
        if min_dist <= threshold_m:
            seen.add(key)
            count += 1
    return count


def cameras_near_polyline_exclude_points(
    route_points: Union[str, Sequence[Tuple[float, float]], Dict[str, Any]],
    hazards: Dict[str, List[Dict[str, Any]]],
    *,
    threshold_m: float = SHORTEST_CAMERA_PROXIMITY_METERS,
    max_points: int = 50,
    max_samples: int = 500,
) -> List[Dict[str, float]]:
    """Cameras near the polyline as Valhalla exclude_locations (closest first)."""
    if isinstance(route_points, dict):
        coords = decode_route_coords(route_points)
    elif isinstance(route_points, str):
        coords = decode_route_coords({'geometry': route_points, 'geometry_precision': 6})
    else:
        coords = list(route_points)
    if not coords:
        return []

    cameras = iter_camera_hazards(hazards)
    if not cameras:
        return []

    sample_interval = max(1, len(coords) // max_samples)
    sampled = coords[::sample_interval]
    near: List[Tuple[float, float, float]] = []
    for cam in cameras:
        try:
            clat = float(cam['lat'])
            clon = float(cam['lon'])
        except (KeyError, TypeError, ValueError):
            continue
        min_dist = float('inf')
        for plat, plon in sampled:
            min_dist = min(min_dist, get_distance_between_points(clat, clon, plat, plon))
        if min_dist <= threshold_m:
            near.append((min_dist, clat, clon))
    near.sort(key=lambda x: x[0])
    return [{'lat': lat, 'lon': lon} for _, lat, lon in near[:max_points]]


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


def fetch_valhalla_auto_shorter_json(
    url: str,
    headers: Dict[str, str],
    locations: List[Dict[str, Any]],
    exclude_locations: Optional[List[Dict[str, Any]]] = None,
    timeout: int = 10,
    *,
    require_exclusions: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Valhalla auto_shorter (distance-focused). Tries exclude_locations first when provided.
    Unless require_exclusions is True, retries without exclusions if the avoided route fails.
    """
    base_payload: Dict[str, Any] = {
        'locations': locations,
        'costing': 'auto_shorter',
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
            logger.warning('[VALHALLA] auto_shorter request failed: %s', e)
    return None


def fetch_valhalla_auto_shorter_preferring_exclusions(
    url: str,
    headers: Dict[str, str],
    locations: List[Dict[str, Any]],
    exclude_locations: Optional[List[Dict[str, Any]]] = None,
    timeout: int = 10,
    *,
    prefer_exclusions: bool = False,
) -> Tuple[Optional[Dict[str, Any]], bool]:
    """
    Request auto_shorter; try exclude_locations first when prefer_exclusions is True.
    Falls back to a bare auto_shorter route so 📏 Shortest is still offered for later
    ensure_shortest_respects_camera_avoidance to refine or flag.
    Returns (trip_json, exclusions_applied).
    """
    if prefer_exclusions and exclude_locations:
        avoided = fetch_valhalla_auto_shorter_json(
            url, headers, locations,
            exclude_locations=exclude_locations,
            timeout=timeout,
            require_exclusions=True,
        )
        if avoided:
            return avoided, True
    bare = fetch_valhalla_auto_shorter_json(
        url, headers, locations,
        exclude_locations=None,
        timeout=timeout,
        require_exclusions=False,
    )
    return (bare, False) if bare else (None, False)


def annotate_routes_camera_proximity(
    routes: List[Dict[str, Any]],
    hazards: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Add cameras_near_route (polyline proximity) for UI scoring display."""
    for route in routes:
        route['cameras_near_route'] = count_cameras_near_polyline(route, hazards)
    return routes


def routes_are_distinct(
    route_a: Dict[str, Any],
    route_b: Dict[str, Any],
    *,
    min_distance_delta_km: float = 0.25,
) -> bool:
    """True when two routes differ enough to show as separate options."""
    try:
        dist_a = float(route_a.get('distance_km') or 0)
        dist_b = float(route_b.get('distance_km') or 0)
    except (TypeError, ValueError):
        return True
    if abs(dist_a - dist_b) >= min_distance_delta_km:
        return True
    geom_a = decode_route_coords(route_a)
    geom_b = decode_route_coords(route_b)
    if not geom_a or not geom_b:
        return dist_a != dist_b
    if len(geom_a) != len(geom_b):
        return True
    sample = max(1, len(geom_a) // 20)
    for i in range(0, min(len(geom_a), len(geom_b)), sample):
        if abs(geom_a[i][0] - geom_b[i][0]) > 0.0003 or abs(geom_a[i][1] - geom_b[i][1]) > 0.0003:
            return True
    return False


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
