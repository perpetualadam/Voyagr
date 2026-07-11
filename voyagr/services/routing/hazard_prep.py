"""
Hazard preparation for /api/route.

Fetches and assembles the ``hazards`` dict used for both route scoring and
Valhalla/GraphHopper avoidance: SCDB cameras, TomTom real-time incidents,
explicit avoid_points, camera-preference filtering, and OSM traffic-light /
railway-crossing overlays.

Extracted verbatim from ``voyagr_web.calculate_route`` so the assembly order and
logging are unchanged. Monolith-only helpers are reached via a lazy
``import voyagr_web`` to avoid an import cycle at module load.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List

logger = logging.getLogger('voyagr_web')


@dataclass
class HazardPrefs:
    """Client-driven hazard toggles that shape the assembled hazard set."""

    avoid_points: List[Dict[str, float]]
    avoid_cameras: bool
    avoid_traffic_lights: bool
    avoid_railway_crossings: bool
    enable_hazard_avoidance: bool


def prepare_route_hazards(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    prefs: HazardPrefs,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Assemble the hazard dict for a route request (always fetched, for scoring even
    when avoidance is off). Mirrors the previous inline logic exactly.
    """
    import voyagr_web as vw

    # Fetch hazards (always fetch for scoring, even if avoidance is disabled)
    hazard_start = time.time()
    hazards = vw.fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)
    hazard_elapsed = (time.time() - hazard_start) * 1000
    logger.info(
        f"[HAZARDS] Fetched camera hazards in {hazard_elapsed:.0f}ms: "
        f"{[(k, len(v)) for k, v in hazards.items() if v]}"
    )

    # HYBRID INTEGRATION: TomTom real-time incidents (accidents, roadworks, closures)
    tomtom_start = time.time()
    try:
        tomtom_bbox = {
            'north': max(start_lat, end_lat) + 0.1,  # 10km buffer
            'south': min(start_lat, end_lat) - 0.1,
            'east': max(start_lon, end_lon) + 0.1,
            'west': min(start_lon, end_lon) - 0.1,
        }
        tomtom_incidents = vw.fetch_tomtom_incidents(tomtom_bbox)
        if tomtom_incidents:
            hazards = vw.merge_hazards_with_tomtom_incidents(hazards, tomtom_incidents)
            tomtom_elapsed = (time.time() - tomtom_start) * 1000
            logger.info(f"[TOMTOM] Merged real-time incidents in {tomtom_elapsed:.0f}ms")
            road_closures = tomtom_incidents.get('road_closed', [])
            if road_closures:
                logger.info(
                    f"[TOMTOM] {len(road_closures)} road closures found - will be excluded from routing"
                )
        else:
            logger.debug("[TOMTOM] No real-time incidents found for route area")
    except Exception as e:
        logger.warning(f"[TOMTOM] Failed to fetch incidents (using cameras only): {e}")

    # Fold explicit avoid_points into the hazard set (same prioritisation as other avoids).
    if prefs.avoid_points:
        hazards.setdefault('avoid_point', [])
        for ap in prefs.avoid_points:
            hazards['avoid_point'].append({'lat': ap['lat'], 'lon': ap['lon'], 'severity': 'high'})
        logger.info(f"[ROUTE] {len(prefs.avoid_points)} explicit avoid_points added to hazards")

    if not prefs.avoid_cameras:
        vw.clear_camera_hazard_buckets(hazards)
    else:
        vw.filter_camera_hazards_by_preferences(hazards)

    if prefs.avoid_traffic_lights:
        try:
            from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
            _south = min(start_lat, end_lat) - 0.1
            _north = max(start_lat, end_lat) + 0.1
            _west = min(start_lon, end_lon) - 0.1
            _east = max(start_lon, end_lon) + 0.1
            hazards['traffic_light'] = fetch_traffic_lights_osm_bbox(_south, _north, _west, _east)
            logger.info(
                f"[TRAFFIC_LIGHTS] Merged {len(hazards.get('traffic_light', []))} OSM traffic signals for routing"
            )
        except Exception as e:
            logger.warning(f"[TRAFFIC_LIGHTS] Could not load OSM traffic lights: {e}")
            hazards['traffic_light'] = []
    else:
        hazards['traffic_light'] = []

    if prefs.avoid_railway_crossings:
        try:
            from voyagr.services.hazards import fetch_railway_crossings_osm_bbox
            _rs = min(start_lat, end_lat) - 0.1
            _rn = max(start_lat, end_lat) + 0.1
            _rw = min(start_lon, end_lon) - 0.1
            _re = max(start_lon, end_lon) + 0.1
            hazards['railway_crossing'] = fetch_railway_crossings_osm_bbox(_rs, _rn, _rw, _re)
            logger.info(
                f"[RAILWAY_CROSSINGS] Merged {len(hazards.get('railway_crossing', []))} OSM level crossings for routing"
            )
        except Exception as e:
            logger.warning(f"[RAILWAY_CROSSINGS] Could not load OSM railway crossings: {e}")
            hazards['railway_crossing'] = []
    else:
        hazards['railway_crossing'] = []

    if prefs.enable_hazard_avoidance:
        logger.info("[HAZARDS] Hazard avoidance ENABLED - will use exclude_locations")
    else:
        logger.info("[HAZARDS] Hazard avoidance DISABLED - will score route but not avoid hazards")

    return hazards
