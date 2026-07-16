"""
Routing engine management for Voyagr.

Contains:
- FallbackChainOptimizer: Intelligent fallback chain with error handling
- ParallelRoutingEngine: Parallel routing for testing all engines
- route_with_graphhopper: GraphHopper routing with camera avoidance
- get_traffic_duration_multiplier: Traffic-based ETA adjustment
"""

import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests

from voyagr.config import (
    VALHALLA_URL, GRAPHHOPPER_URL, OSRM_URL,
    USE_GRAPHHOPPER_CAMERA_AVOIDANCE, GRAPHHOPPER_TIMEOUT,
    CAMERA_HAZARD_BUCKETS,
)
from voyagr.services.hazards import build_graphhopper_camera_avoidance_model

logger = logging.getLogger('voyagr_web')


class FallbackChainOptimizer:
    """
    Intelligent fallback chain with error handling and timeout management.
    Primary: Valhalla → Secondary: OSRM
    """
    def __init__(self) -> None:
        self.engine_stats: Dict[str, Dict[str, Any]] = {
            'valhalla': {'failures': 0, 'successes': 0, 'avg_time': 0.0},
            'osrm': {'failures': 0, 'successes': 0, 'avg_time': 0.0}
        }
        self.lock = threading.Lock()

    def record_success(self, engine: str, response_time_ms: float) -> None:
        """Record successful routing request."""
        with self.lock:
            stats = self.engine_stats[engine]
            stats['successes'] += 1
            total_time = stats['avg_time'] * (stats['successes'] - 1) + response_time_ms
            stats['avg_time'] = total_time / stats['successes']

    def record_failure(self, engine: str) -> None:
        """Record failed routing request."""
        with self.lock:
            self.engine_stats[engine]['failures'] += 1

    def get_engine_health(self) -> Dict[str, Any]:
        """Get health status of all engines."""
        health: Dict[str, Any] = {}
        for engine, stats in self.engine_stats.items():
            total = stats['successes'] + stats['failures']
            success_rate = (stats['successes'] / total * 100) if total > 0 else 0
            health[engine] = {
                'success_rate': round(success_rate, 1),
                'successes': stats['successes'],
                'failures': stats['failures'],
                'avg_response_time_ms': round(stats['avg_time'], 0)
            }
        return health

    def get_recommended_engine(self) -> str:
        """Get recommended engine based on health and performance."""
        health = self.get_engine_health()
        scored: Dict[str, float] = {}
        for engine, stats in health.items():
            penalty: float = min(stats['avg_response_time_ms'] / 100, 50)
            score: float = stats['success_rate'] - penalty
            scored[engine] = score
        return max(scored.items(), key=lambda x: x[1])[0] if scored else 'valhalla'


class ParallelRoutingEngine:
    """
    Parallel routing engine for testing all 3 engines simultaneously.
    Compares performance, accuracy, and response times.
    """
    def __init__(self) -> None:
        self.results: Dict[str, Any] = {}
        self.lock = threading.Lock()

    def request_graphhopper(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from GraphHopper in parallel."""
        try:
            start_time = time.time()
            url = f"{GRAPHHOPPER_URL}/route"
            params = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "ch.disable": "true"
            }
            headers = {'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json'}
            response = requests.get(url, params=params, timeout=10, headers=headers)
            elapsed = (time.time() - start_time) * 1000

            with self.lock:
                if response.status_code == 200:
                    data = response.json()
                    if 'paths' in data and len(data['paths']) > 0:
                        path = data['paths'][0]
                        self.results['graphhopper'] = {
                            'success': True,
                            'distance_km': path.get('distance', 0) / 1000,
                            'duration_minutes': path.get('time', 0) / 60000,
                            'response_time_ms': elapsed,
                            'status': 'OK'
                        }
                    else:
                        self.results['graphhopper'] = {'success': False, 'error': 'No paths', 'response_time_ms': elapsed}
                else:
                    self.results['graphhopper'] = {'success': False, 'error': f'HTTP {response.status_code}', 'response_time_ms': elapsed}
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['graphhopper'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            with self.lock:
                self.results['graphhopper'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def request_valhalla(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from Valhalla in parallel."""
        try:
            start_time = time.time()
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                "costing": "auto",
                "alternates": 3
            }
            headers = {'User-Agent': 'Voyagr-PWA/1.0', 'Content-Type': 'application/json', 'Accept': 'application/json'}
            response = requests.post(url, json=payload, timeout=10, headers=headers)
            elapsed = (time.time() - start_time) * 1000

            with self.lock:
                if response.status_code == 200:
                    data = response.json()
                    if 'trip' in data and 'legs' in data['trip']:
                        summary = data['trip']['summary']
                        self.results['valhalla'] = {
                            'success': True,
                            'distance_km': summary.get('length', 0),
                            'duration_minutes': summary.get('time', 0) / 60,
                            'response_time_ms': elapsed,
                            'status': 'OK'
                        }
                    else:
                        self.results['valhalla'] = {'success': False, 'error': 'No trip', 'response_time_ms': elapsed}
                else:
                    self.results['valhalla'] = {'success': False, 'error': f'HTTP {response.status_code}', 'response_time_ms': elapsed}
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['valhalla'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            with self.lock:
                self.results['valhalla'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def request_osrm(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from OSRM in parallel."""
        try:
            start_time = time.time()
            url = f"{OSRM_URL}/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
            params = {'overview': 'full', 'alternatives': 'true', 'steps': 'true'}
            headers = {'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json'}
            response = requests.get(url, params=params, timeout=10, headers=headers)
            elapsed = (time.time() - start_time) * 1000

            with self.lock:
                if response.status_code == 200:
                    data = response.json()
                    if 'routes' in data and len(data['routes']) > 0:
                        route = data['routes'][0]
                        self.results['osrm'] = {
                            'success': True,
                            'distance_km': route.get('distance', 0) / 1000,
                            'duration_minutes': route.get('duration', 0) / 60,
                            'response_time_ms': elapsed,
                            'status': 'OK'
                        }
                    else:
                        self.results['osrm'] = {'success': False, 'error': 'No routes', 'response_time_ms': elapsed}
                else:
                    self.results['osrm'] = {'success': False, 'error': f'HTTP {response.status_code}', 'response_time_ms': elapsed}
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['osrm'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            with self.lock:
                self.results['osrm'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def run_parallel(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, Any]:
        """Run all 3 routing engines in parallel."""
        threads = [
            threading.Thread(target=self.request_graphhopper, args=(start_lat, start_lon, end_lat, end_lon)),
            threading.Thread(target=self.request_valhalla, args=(start_lat, start_lon, end_lat, end_lon)),
            threading.Thread(target=self.request_osrm, args=(start_lat, start_lon, end_lat, end_lon))
        ]

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join(timeout=12)

        return self.results


def route_with_graphhopper(
    start_lat: float, start_lon: float,
    end_lat: float, end_lon: float,
    enable_camera_avoidance: bool = True,
    route_bbox: Optional[Dict[str, float]] = None,
    traffic_light_hazards: Optional[list] = None,
    railway_crossing_hazards: Optional[list] = None,
    avoid_caz_zones: bool = False,
    avoid_points: Optional[list] = None,
    incident_hazards: Optional[Dict[str, list]] = None,
    camera_hazards: Optional[Dict[str, list]] = None,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    avoid_unpaved: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    route_optimization: str = 'fastest',
) -> Optional[Dict[str, Any]]:
    """
    Route using GraphHopper with optional camera avoidance via pre-loaded areas.

    Args:
        start_lat, start_lon: Start coordinates
        end_lat, end_lon: End coordinates
        enable_camera_avoidance: Whether to use camera avoidance custom model
        route_bbox: Bounding box of route for area selection
        traffic_light_hazards: Optional OSM traffic light points to avoid (dynamic polygons)
        railway_crossing_hazards: Optional OSM level crossing points (separate from traffic lights)
        avoid_caz_zones: Penalize edges inside UK CAZ/ULEZ polygons (same data as costing)
        avoid_points: Optional congested/closed segment points to penalise (Lever C2 traffic)

    Returns:
        Route data dict or None if failed
    """
    try:
        from voyagr.services.routing.costing import build_graphhopper_costing_preference_model
        from voyagr.services.hazards import (
            merge_graphhopper_custom_model_parts,
            build_graphhopper_caz_avoidance_model,
            build_graphhopper_custom_model as gh_build_hazard_model,
            build_graphhopper_combined_camera_model,
        )

        url = f"{GRAPHHOPPER_URL}/route"

        headers = {
            'User-Agent': 'Voyagr-PWA/1.0',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

        # Build request payload (used for POST + custom_model flows)
        payload: Dict[str, Any] = {
            "points": [[start_lon, start_lat], [end_lon, end_lat]],  # GraphHopper uses [lon, lat]
            "profile": "car",
            "locale": "en",
            "instructions": True,
            "points_encoded": True,
            "elevation": False,
            # Ask GraphHopper for per-edge speed limits so the optimised route can supply a
            # speed-limit hint to the widget (parity with Valhalla's maneuver speed_limit).
            "details": ["max_speed"]
        }

        custom_model: Optional[Dict[str, Any]] = None
        custom_model_applied = False
        cam_model: Optional[Dict[str, Any]] = None
        if enable_camera_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE:
            cam_model = build_graphhopper_combined_camera_model(
                camera_hazards if camera_hazards and any(camera_hazards.values()) else None,
                route_bbox=route_bbox,
            ) or None
            if cam_model:
                logger.info('[GRAPHHOPPER] Using UK camera area sections (+ SCDB filters when enabled)')

        osm_dynamic: Dict[str, list] = {}
        if traffic_light_hazards:
            osm_dynamic['traffic_light'] = traffic_light_hazards
        if railway_crossing_hazards:
            osm_dynamic['railway_crossing'] = railway_crossing_hazards
        if avoid_points:
            # Congested/closed segments — penalise (not hard-block) so the optimised route
            # prefers to route around them when a reasonable alternative exists.
            osm_dynamic['avoid_point'] = avoid_points
        if incident_hazards:
            for bucket, items in incident_hazards.items():
                if items:
                    osm_dynamic[bucket] = items

        tl_rx_model: Optional[Dict[str, Any]] = None
        if osm_dynamic:
            tl_rx_model = gh_build_hazard_model(
                osm_dynamic,
                route_bbox=route_bbox,
                max_hazards=28,
            ) or None

        caz_model: Optional[Dict[str, Any]] = None
        if avoid_caz_zones:
            caz_model = build_graphhopper_caz_avoidance_model(route_bbox) or None

        costing_model = build_graphhopper_costing_preference_model(
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            avoid_unpaved=avoid_unpaved,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            route_optimization=route_optimization,
        ) or None

        custom_model = merge_graphhopper_custom_model_parts(
            cam_model, tl_rx_model, caz_model, costing_model,
        )
        if custom_model:
            payload["custom_model"] = custom_model
            logger.info("[GRAPHHOPPER] Using custom model (cameras, OSM hazards, and/or CAZ polygons)")

        logger.info(f"[GRAPHHOPPER] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")

        # GraphHopper deployments vary:
        # - Many self-hosted instances support GET /route with query params.
        # - Custom models generally require POST with JSON + ch.disable=true.
        response: Optional[requests.Response] = None

        if custom_model:
            # Custom model + CH disable must be sent as a query param.
            response = requests.post(
                url,
                params={"ch.disable": "true"},
                json=payload,
                timeout=GRAPHHOPPER_TIMEOUT,
                headers=headers,
            )
            if response.status_code == 200:
                custom_model_applied = True
            else:
                logger.warning(f"[GRAPHHOPPER] POST(custom_model) failed (HTTP {response.status_code}); retrying GET(no custom_model)")
                response = None

        if response is None:
            # Prefer GET for broad compatibility.
            params_point = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "instructions": "true",
                "points_encoded": "true",
                "elevation": "false",
                "details": "max_speed",
            }
            response = requests.get(url, params=params_point, timeout=GRAPHHOPPER_TIMEOUT, headers={'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json'})

            # Some deployments use `points` instead of `point` (historical / custom setups).
            if response.status_code != 200:
                params_points = dict(params_point)
                params_points.pop("point", None)
                params_points["points"] = [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"]
                response = requests.get(url, params=params_points, timeout=GRAPHHOPPER_TIMEOUT, headers={'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json'})

            # If GET fails, try POST without a custom model (some deployments accept JSON POST only).
            if response.status_code != 200:
                logger.warning(f"[GRAPHHOPPER] GET failed (HTTP {response.status_code}); retrying POST(no custom_model)")
                payload_no_model = dict(payload)
                payload_no_model.pop("custom_model", None)
                response = requests.post(url, json=payload_no_model, timeout=GRAPHHOPPER_TIMEOUT, headers=headers)

        if response.status_code == 200:
            data = response.json()

            if 'paths' in data and len(data['paths']) > 0:
                path = data['paths'][0]

                # Extract route data
                route_data = {
                    'success': True,
                    'source': 'GraphHopper',
                    'distance_km': path.get('distance', 0) / 1000,
                    'duration_seconds': path.get('time', 0) / 1000,
                    'geometry': path.get('points', ''),  # Encoded polyline
                    'instructions': path.get('instructions', []),
                    'details': path.get('details', {}),  # per-edge attrs incl. max_speed
                    'bbox': path.get('bbox', []),
                    'camera_avoidance': custom_model_applied,
                    'custom_model_applied': custom_model_applied,
                }

                logger.info(f"[GRAPHHOPPER] Route found: {route_data['distance_km']:.1f}km, {route_data['duration_seconds']/60:.0f}min")
                return route_data
            else:
                logger.warning("[GRAPHHOPPER] No paths in response")
                return None
        else:
            error_msg = response.text[:500] if response.text else f"HTTP {response.status_code}"
            logger.warning(f"[GRAPHHOPPER] Request failed: {error_msg}")
            return None

    except requests.exceptions.Timeout:
        logger.warning(f"[GRAPHHOPPER] Request timeout after {GRAPHHOPPER_TIMEOUT}s")
        return None
    except Exception as e:
        logger.error(f"[GRAPHHOPPER] Error: {e}")
        return None


def attempt_graphhopper_camera_route(
    *,
    hazards: Dict[str, List[Dict[str, Any]]],
    route_bbox: Dict[str, float],
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    routing_mode: str,
    enable_hazard_avoidance: bool,
    avoid_cameras: bool,
    avoid_traffic_lights: bool,
    avoid_railway_crossings: bool,
    apply_caz_routing_avoidance: bool,
    avoid_points: Optional[List[Dict[str, Any]]],
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    avoid_unpaved: bool = False,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    route_optimization: str = 'fastest',
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Try GraphHopper first (car-only) when camera avoidance is enabled.

    Returns ``(graphhopper_route, graphhopper_error)``. When the GraphHopper path
    is not attempted (avoidance off, disabled, or non-auto mode) both are ``None``.
    Extracted verbatim from voyagr_web.calculate_route.
    """
    graphhopper_route: Optional[Dict[str, Any]] = None
    graphhopper_error: Optional[str] = None

    if not (enable_hazard_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE and routing_mode == 'auto'):
        return graphhopper_route, graphhopper_error

    straight_line_km = ((end_lat - start_lat) ** 2 + (end_lon - start_lon) ** 2) ** 0.5 * 111
    logger.info(f"[ROUTING] Trying GraphHopper with camera avoidance (route: {straight_line_km:.0f}km)...")
    try:
        _tl_gh = hazards.get('traffic_light', []) if avoid_traffic_lights else []
        _rx_gh = hazards.get('railway_crossing', []) if avoid_railway_crossings else []
        _cam_gh = {
            k: hazards.get(k, [])
            for k in CAMERA_HAZARD_BUCKETS
            if hazards.get(k)
        } if avoid_cameras else None
        _incident_gh = None
        if enable_hazard_avoidance:
            from voyagr.services.hazards import extract_graphhopper_live_incident_hazards
            _incident_gh = extract_graphhopper_live_incident_hazards(hazards) or None
        graphhopper_route = route_with_graphhopper(
            start_lat, start_lon, end_lat, end_lon,
            enable_camera_avoidance=avoid_cameras,
            route_bbox=route_bbox,
            traffic_light_hazards=_tl_gh if _tl_gh else None,
            railway_crossing_hazards=_rx_gh if _rx_gh else None,
            avoid_caz_zones=apply_caz_routing_avoidance,
            avoid_points=avoid_points if avoid_points else None,
            incident_hazards=_incident_gh,
            camera_hazards=_cam_gh if _cam_gh and any(_cam_gh.values()) else None,
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            avoid_unpaved=avoid_unpaved,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            route_optimization=route_optimization,
        )
        if graphhopper_route and graphhopper_route.get('success'):
            logger.info("[GRAPHHOPPER] ✅ Route found with camera avoidance")
        else:
            graphhopper_error = "No route found"
            logger.warning("[GRAPHHOPPER] No route found, falling back to Valhalla")
    except Exception as e:
        graphhopper_error = str(e)
        logger.warning(f"[GRAPHHOPPER] Error: {e}, falling back to Valhalla")

    return graphhopper_route, graphhopper_error


def get_traffic_duration_multiplier(lat: float, lon: float) -> tuple:
    """
    Get traffic-based duration multiplier for more accurate ETAs.
    Returns (multiplier, traffic_level) tuple.

    Valhalla uses historical average speeds which often underestimate travel time
    during peak hours. This function queries real-time traffic to adjust the ETA.
    """
    try:
        tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')
        if not tomtom_api_key:
            # No API key - use time-of-day based estimation
            hour = datetime.now().hour
            day_of_week = datetime.now().weekday()

            # Peak hours: 7-9am and 4-7pm on weekdays
            is_weekday = day_of_week < 5
            is_morning_peak = 7 <= hour <= 9
            is_evening_peak = 16 <= hour <= 19

            if is_weekday and (is_morning_peak or is_evening_peak):
                return (1.35, 'Peak Hours')
            elif is_weekday and 9 < hour < 16:
                return (1.15, 'Daytime')
            else:
                return (1.0, 'Off-Peak')

        # Query TomTom Traffic Flow API
        url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
        params = {
            'key': tomtom_api_key,
            'point': f"{lat},{lon}",
            'unit': 'KMPH'
        }

        response = requests.get(url, params=params, timeout=3)
        if response.status_code == 200:
            data = response.json()
            flow_data = data.get('flowSegmentData', {})
            current_speed = flow_data.get('currentSpeed', 50)
            free_flow_speed = flow_data.get('freeFlowSpeed', 50)

            if free_flow_speed > 0 and current_speed > 0:
                multiplier = min(free_flow_speed / current_speed, 2.0)

                ratio = current_speed / free_flow_speed
                if ratio >= 0.9:
                    traffic_level = 'Free Flow'
                elif ratio >= 0.7:
                    traffic_level = 'Light Traffic'
                    multiplier = max(multiplier, 1.1)
                elif ratio >= 0.5:
                    traffic_level = 'Moderate Traffic'
                    multiplier = max(multiplier, 1.25)
                else:
                    traffic_level = 'Heavy Traffic'
                    multiplier = max(multiplier, 1.5)

                logger.info(f"[TRAFFIC] Multiplier: {multiplier:.2f}x ({traffic_level}), speeds: {current_speed}/{free_flow_speed} km/h")
                return (multiplier, traffic_level)

        return (1.0, 'Unknown')
    except Exception as e:
        logger.warning(f"[TRAFFIC] Failed to get traffic multiplier: {e}")
        return (1.0, 'Unknown')


# Global fallback optimizer instance
fallback_optimizer = FallbackChainOptimizer()
