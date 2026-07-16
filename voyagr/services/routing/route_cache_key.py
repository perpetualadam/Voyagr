"""Pure helpers for /api/route in-memory cache keys and bypass rules."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional, Sequence


def fingerprint_avoid_points(avoid_points: Optional[Sequence[Dict[str, Any]]]) -> str:
    """Stable short fingerprint for up to 10 validated avoid points."""
    if not avoid_points:
        return ''
    parts: List[str] = []
    for ap in list(avoid_points)[:10]:
        try:
            lat = float(ap['lat'])
            lon = float(ap['lon'])
        except (TypeError, ValueError, KeyError):
            continue
        parts.append(f'{lat:.4f},{lon:.4f}')
    if not parts:
        return ''
    digest = hashlib.sha1('|'.join(parts).encode('utf-8')).hexdigest()[:12]
    return digest


def build_route_cache_key(
    *,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    routing_mode: str,
    vehicle_type: str,
    enable_hazard_avoidance: bool = False,
    avoid_traffic_lights: bool = False,
    avoid_cameras: bool = True,
    avoid_railway_crossings: bool = False,
    avoid_caz_zones: bool = False,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    avoid_unpaved: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    route_optimization: str = 'fastest',
    max_detour: float = 20.0,
    avoid_points: Optional[Sequence[Dict[str, Any]]] = None,
) -> str:
    """Create cache key from route parameters (rv8 adds route-shape prefs)."""
    avoid_fp = fingerprint_avoid_points(avoid_points)
    ro = (route_optimization or 'fastest').lower()
    return (
        f'{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f},'
        f'{routing_mode},{vehicle_type},'
        f'{enable_hazard_avoidance},{int(avoid_traffic_lights)},{int(avoid_cameras)},'
        f'{int(avoid_railway_crossings)},{int(avoid_caz_zones)},'
        f'{int(avoid_tolls)},{int(avoid_motorways)},{int(avoid_ferries)},'
        f'{int(avoid_unpaved)},{int(prefer_scenic)},{int(prefer_quiet)},'
        f'{ro},{float(max_detour):.0f},'
        f'{avoid_fp},rv8'
    )


def should_bypass_route_cache(
    *,
    force_refresh: bool = False,
    is_reroute: bool = False,
    avoid_points: Optional[Sequence[Dict[str, Any]]] = None,
) -> bool:
    """Reroutes and explicit avoid_points must always hit live engines."""
    if force_refresh or is_reroute:
        return True
    return bool(avoid_points)
