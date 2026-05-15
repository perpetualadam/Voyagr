"""
Traffic blueprint for Voyagr.

Contains:
- Traffic conditions
- Route traffic flow
- TomTom incidents
- TomTom raster tile proxy (keeps API key off the client when enabled)
"""

import logging
import os
import random
import threading
import time as time_module
from datetime import datetime

import requests
from flask import Blueprint, jsonify, make_response, request

from voyagr.services import fetch_tomtom_incidents
from voyagr.utils.client_ip import get_client_ip

logger = logging.getLogger(__name__)

traffic_bp = Blueprint('traffic', __name__)

_tile_lock = threading.Lock()
_tomtom_tile_hits = {}  # client_ip -> [unix_ts, ...]


def _allow_tomtom_tile_request(client_ip: str, max_per_minute: int = 300) -> bool:
    """Very light per-IP throttle — map pans pull many tiles at once."""
    now = time_module.time()
    window = 60.0
    with _tile_lock:
        arr = _tomtom_tile_hits.setdefault(client_ip, [])
        arr[:] = [t for t in arr if now - t < window]
        if len(arr) >= max_per_minute:
            return False
        arr.append(now)
        return True


def _valid_slippy_tile(z: int, x: int, y: int) -> bool:
    if z < 0 or z > 22:
        return False
    if x < 0 or y < 0:
        return False
    n = 1 << z
    return x < n and y < n


@traffic_bp.route('/traffic-conditions', methods=['POST'])
def get_traffic_conditions():
    """Get real-time traffic conditions using TomTom Traffic Flow API."""
    try:
        data = request.json or {}
        lat = float(data.get('lat', 51.5074))
        lon = float(data.get('lon', -0.1278))
        base_duration = int(data.get('duration_minutes', 30))

        tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')

        if tomtom_api_key:
            try:
                tomtom_url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
                params = {
                    'key': tomtom_api_key,
                    'point': f"{lat},{lon}",
                    'unit': 'KMPH'
                }
                response = requests.get(tomtom_url, params=params, timeout=5)

                if response.status_code == 200:
                    flow_data = response.json().get('flowSegmentData', {})
                    current_speed = flow_data.get('currentSpeed', 50)
                    free_flow_speed = flow_data.get('freeFlowSpeed', 60)
                    confidence = flow_data.get('confidence', 0.5)

                    if free_flow_speed > 0:
                        speed_ratio = current_speed / free_flow_speed
                        congestion = int((1 - speed_ratio) * 100)
                    else:
                        congestion = 0

                    if congestion >= 50:
                        traffic_level = 'Heavy'
                    elif congestion >= 25:
                        traffic_level = 'Moderate'
                    else:
                        traffic_level = 'Light'

                    if free_flow_speed > 0:
                        duration_multiplier = free_flow_speed / max(current_speed, 5)
                        updated_duration = int(base_duration * min(duration_multiplier, 3.0))
                    else:
                        updated_duration = base_duration

                    logger.info(f"[TRAFFIC] TomTom API: {traffic_level}, {congestion}% congestion")

                    return jsonify({
                        'success': True,
                        'source': 'TomTom',
                        'traffic_level': traffic_level,
                        'congestion_percentage': max(0, min(congestion, 100)),
                        'current_speed_kmph': current_speed,
                        'free_flow_speed_kmph': free_flow_speed,
                        'confidence': confidence,
                        'incidents_count': 0,
                        'updated_duration_minutes': updated_duration,
                        'timestamp': datetime.now().isoformat()
                    })
                else:
                    logger.warning(f"[TRAFFIC] TomTom API error: {response.status_code}")
            except requests.exceptions.RequestException as e:
                logger.warning(f"[TRAFFIC] TomTom API request failed: {e}")

        # Fallback: Time-based estimation
        hour = datetime.now().hour
        weekday = datetime.now().weekday()
        is_weekend = weekday >= 5

        if is_weekend:
            if 10 <= hour <= 18:
                traffic_level = random.choice(['Light', 'Moderate'])
                congestion = random.randint(15, 45)
            else:
                traffic_level = 'Light'
                congestion = random.randint(5, 20)
        else:
            if 7 <= hour <= 9:
                traffic_level = random.choice(['Heavy', 'Moderate', 'Heavy'])
                congestion = random.randint(55, 90)
            elif 17 <= hour <= 19:
                traffic_level = random.choice(['Heavy', 'Moderate', 'Heavy'])
                congestion = random.randint(60, 95)
            elif 10 <= hour <= 16:
                traffic_level = random.choice(['Light', 'Moderate'])
                congestion = random.randint(20, 45)
            else:
                traffic_level = 'Light'
                congestion = random.randint(5, 20)

        if traffic_level == 'Heavy':
            updated_duration = int(base_duration * random.uniform(1.4, 1.8))
        elif traffic_level == 'Moderate':
            updated_duration = int(base_duration * random.uniform(1.1, 1.3))
        else:
            updated_duration = int(base_duration * random.uniform(0.95, 1.05))

        return jsonify({
            'success': True,
            'source': 'Estimation',
            'traffic_level': traffic_level,
            'congestion_percentage': congestion,
            'incidents_count': random.randint(0, 2 if traffic_level == 'Heavy' else 1),
            'updated_duration_minutes': updated_duration,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error fetching traffic conditions: {e}")
        return jsonify({'success': False, 'error': str(e)})


@traffic_bp.route('/route-traffic-flow', methods=['POST'])
def get_route_traffic_flow():
    """Get traffic flow data for route segments using TomTom Traffic Flow API."""
    try:
        data = request.json or {}
        points = data.get('points', [])
        sample_interval = int(data.get('sample_interval', 10))

        if not points or len(points) < 2:
            return jsonify({'success': False, 'error': 'At least 2 points required'})

        tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')

        if not tomtom_api_key:
            logger.warning("[ROUTE-TRAFFIC] No TomTom API key - returning simulated data")
            segments = []
            effective_interval = max(1, min(sample_interval, len(points) // 10))

            i = 0
            while i < len(points) - 1:
                end_idx = min(i + effective_interval, len(points) - 1)
                level = random.choice(['green', 'green', 'green', 'green', 'orange', 'red'])
                segments.append({
                    'start': points[i],
                    'end': points[end_idx],
                    'traffic_level': level,
                    'current_speed': random.randint(30, 70),
                    'free_flow_speed': 70,
                    'congestion_percent': random.randint(10, 60) if level != 'green' else random.randint(0, 15)
                })
                i = end_idx
                if i >= len(points) - 1:
                    break

            logger.info(f"[ROUTE-TRAFFIC] Simulated {len(segments)} traffic segments")
            return jsonify({'success': True, 'segments': segments, 'source': 'simulated'})

        sampled_points = []
        for i in range(0, len(points), sample_interval):
            sampled_points.append(points[i])
        if points[-1] not in sampled_points:
            sampled_points.append(points[-1])

        segments = []

        for i in range(len(sampled_points) - 1):
            start_point = sampled_points[i]
            end_point = sampled_points[i + 1]
            mid_lat = (start_point[0] + end_point[0]) / 2
            mid_lon = (start_point[1] + end_point[1]) / 2

            try:
                tomtom_url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
                params = {
                    'key': tomtom_api_key,
                    'point': f"{mid_lat},{mid_lon}",
                    'unit': 'KMPH'
                }
                response = requests.get(tomtom_url, params=params, timeout=3)

                if response.status_code == 200:
                    flow_data = response.json().get('flowSegmentData', {})
                    current_speed = flow_data.get('currentSpeed', 50)
                    free_flow_speed = flow_data.get('freeFlowSpeed', 60)

                    if free_flow_speed > 0:
                        speed_ratio = current_speed / free_flow_speed
                        congestion = int((1 - speed_ratio) * 100)
                    else:
                        speed_ratio = 1.0
                        congestion = 0

                    if speed_ratio >= 0.75:
                        traffic_level = 'green'
                    elif speed_ratio >= 0.5:
                        traffic_level = 'orange'
                    elif speed_ratio >= 0.25:
                        traffic_level = 'red'
                    else:
                        traffic_level = 'black'

                    segments.append({
                        'start': start_point,
                        'end': end_point,
                        'traffic_level': traffic_level,
                        'current_speed': current_speed,
                        'free_flow_speed': free_flow_speed,
                        'congestion_percent': max(0, min(congestion, 100))
                    })
                else:
                    segments.append({
                        'start': start_point,
                        'end': end_point,
                        'traffic_level': 'green',
                        'current_speed': 60,
                        'free_flow_speed': 60,
                        'congestion_percent': 0
                    })
            except Exception as seg_error:
                logger.warning(f"[ROUTE-TRAFFIC] Segment error: {seg_error}")
                segments.append({
                    'start': start_point,
                    'end': end_point,
                    'traffic_level': 'green',
                    'current_speed': 60,
                    'free_flow_speed': 60,
                    'congestion_percent': 0
                })

        logger.info(f"[ROUTE-TRAFFIC] Fetched traffic for {len(segments)} segments")
        return jsonify({'success': True, 'segments': segments, 'source': 'TomTom'})

    except Exception as e:
        logger.error(f"Error fetching route traffic flow: {e}")
        return jsonify({'success': False, 'error': str(e)})


@traffic_bp.route('/tomtom-incidents', methods=['POST'])
def get_tomtom_incidents():
    """Get real-time traffic incidents from TomTom Traffic Incidents API."""
    try:
        data = request.json or {}
        lat = float(data.get('lat', 51.5074))
        lon = float(data.get('lon', -0.1278))
        radius_km = float(data.get('radius_km', 10))

        radius_deg = radius_km / 111.0
        bbox = {
            'north': lat + radius_deg,
            'south': lat - radius_deg,
            'east': lon + radius_deg,
            'west': lon - radius_deg
        }

        incidents = fetch_tomtom_incidents(bbox)
        summary = {
            incident_type: len(incident_list)
            for incident_type, incident_list in incidents.items()
        }
        total = sum(summary.values())

        return jsonify({
            'success': True,
            'source': 'TomTom Traffic Incidents API',
            'bbox': bbox,
            'total_incidents': total,
            'summary': summary,
            'incidents': incidents,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"Error fetching TomTom incidents: {e}")
        return jsonify({'success': False, 'error': str(e)})


@traffic_bp.route('/tomtom/traffic-tile/<int:z>/<int:x>/<int:y>.png')
def tomtom_traffic_tile_proxy(z, x, y):
    """Proxy TomTom traffic raster tiles so the browser never holds TOMTOM_API_KEY."""
    if not _valid_slippy_tile(z, x, y):
        return make_response('', 404)

    api_key = os.getenv('TOMTOM_API_KEY', '').strip()
    if not api_key:
        return make_response('', 503)

    client_ip = get_client_ip()
    if not _allow_tomtom_tile_request(client_ip):
        logger.warning('[TRAFFIC-TILE] rate limited ip=%s', client_ip)
        return make_response('', 429)

    url = (
        f'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/'
        f'{z}/{x}/{y}.png?key={api_key}&tileSize=256'
    )
    try:
        upstream = requests.get(url, timeout=12)
    except requests.RequestException as exc:
        logger.warning('[TRAFFIC-TILE] upstream error: %s', exc)
        return make_response('', 502)

    if upstream.status_code != 200:
        return make_response('', upstream.status_code)

    resp = make_response(upstream.content)
    ct = upstream.headers.get('Content-Type', 'image/png')
    resp.headers['Content-Type'] = ct
    resp.headers['Cache-Control'] = 'public, max-age=90'
    return resp

