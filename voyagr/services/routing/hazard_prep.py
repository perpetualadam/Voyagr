"""Prepare independent mapped warnings and preference-filtered engine hazards.

Mapped cameras, signals and crossings are retained for route warning serialization.
Avoidance/scoring still receives only its existing preference-filtered dictionary;
warning observations are attached separately and never iterated as engine hazards.
"""

from __future__ import annotations

import logging
import time
from voyagr.utils import request_budget as route_transport
from dataclasses import dataclass
from typing import Any, Dict, List

logger = logging.getLogger('voyagr_web')


@dataclass
class HazardPrefs:
    """Client-driven avoidance toggles; these do not disable mapped warnings."""

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
    Assemble filtered avoidance inputs with a separate mapped-warning snapshot.
    """
    import voyagr_web as vw
    from voyagr.utils.hazard_matching import HazardDataset
    from voyagr.services.routing.integrity_api import capture_hazard_snapshot

    route_transport.check_budget()
    # Fetch hazards (always fetch for scoring, even if avoidance is disabled)
    hazard_start = time.time()
    import copy
    hazards = copy.deepcopy(vw.fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon))
    coverage = getattr(hazards, 'coverage', {}).copy()
    verification_cameras = {k:copy.deepcopy(v) for k,v in hazards.items() if k=='camera' or k.startswith('camera_')}
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
    except route_transport.RoutingDeadlineExceeded:
        raise
    except Exception as e:
        logger.warning(f"[TOMTOM] Failed to fetch incidents (using cameras only): {type(e).__name__}")

    # Fold explicit avoid_points into the hazard set (same prioritisation as other avoids).
    if prefs.avoid_points:
        hazards.setdefault('avoid_point', [])
        for ap in prefs.avoid_points:
            hazards['avoid_point'].append({'lat': ap['lat'], 'lon': ap['lon'], 'severity': 'high'})
        logger.info(f"[ROUTE] {len(prefs.avoid_points)} explicit avoid_points added to hazards")

    from voyagr.services.routing.warning_observations import collect, attach
    observations = collect([(start_lat,start_lon),(end_lat,end_lon)], hazards)
    if not prefs.avoid_cameras:
        vw.clear_camera_hazard_buckets(hazards)
    else:
        vw.filter_camera_hazards_by_preferences(hazards)
    hazards['traffic_light'] = observations['traffic_light'] if prefs.avoid_traffic_lights else []
    hazards['railway_crossing'] = observations['railway_crossing'] if prefs.avoid_railway_crossings else []

    if prefs.enable_hazard_avoidance:
        logger.info("[HAZARDS] Hazard avoidance ENABLED - will use exclude_locations")
    else:
        logger.info("[HAZARDS] Hazard avoidance DISABLED - will score route but not avoid hazards")

    if prefs.avoid_points:
        coverage['avoid_point'] = {'status':'AVAILABLE','bounds':[-90,-180,90,180],
                                   'retrieved_at':time.time(),'source':'explicit_geographic_avoid_points'}
    # Ranking/display preferences must not erase evidence for an enabled contract category.
    capture_hazard_snapshot(HazardDataset({**hazards, **verification_cameras}, coverage=coverage))
    return attach(hazards, observations)
