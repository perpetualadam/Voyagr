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
from typing import Any, Dict, Optional

import requests

from voyagr.config import (
    VALHALLA_URL, GRAPHHOPPER_URL, OSRM_URL,
    USE_GRAPHHOPPER_CAMERA_AVOIDANCE, GRAPHHOPPER_TIMEOUT
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
    route_bbox: Optional[Dict[str, float]] = None
) -> Optional[Dict[str, Any]]:
    """
    Route using GraphHopper with optional camera avoidance via pre-loaded areas.

    Args:
        start_lat, start_lon: Start coordinates
        end_lat, end_lon: End coordinates
        enable_camera_avoidance: Whether to use camera avoidance custom model
        route_bbox: Bounding box of route for area selection

    Returns:
        Route data dict or None if failed
    """
    try:
        url = f"{GRAPHHOPPER_URL}/route"

        payload = {
            "points": [[start_lon, start_lat], [end_lon, end_lat]],
            "profile": "car",
            "locale": "en",
            "instructions": True,
            "points_encoded": True,
            "elevation": False
        }

        if enable_camera_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE:
            custom_model = build_graphhopper_camera_avoidance_model(route_bbox)
            if custom_model:
                payload["custom_model"] = custom_model
                payload["ch.disable"] = True
                logger.info("[GRAPHHOPPER] Using camera avoidance custom model")

        headers = {
            'User-Agent': 'Voyagr-PWA/1.0',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

        logger.info(f"[GRAPHHOPPER] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
        response = requests.post(url, json=payload, timeout=GRAPHHOPPER_TIMEOUT, headers=headers)

        if response.status_code == 200:
            data = response.json()

            if 'paths' in data and len(data['paths']) > 0:
                path = data['paths'][0]

                route_data = {
                    'success': True,
                    'source': 'GraphHopper',
                    'distance_km': path.get('distance', 0) / 1000,
                    'duration_seconds': path.get('time', 0) / 1000,
                    'geometry': path.get('points', ''),
                    'instructions': path.get('instructions', []),
                    'bbox': path.get('bbox', []),
                    'camera_avoidance': enable_camera_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE
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
