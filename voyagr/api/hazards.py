"""
Hazards blueprint for Voyagr.

Contains:
- Hazard preferences
- Camera management
- Hazard reporting
- Nearby hazards
- Traffic lights
"""

import logging
import math
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

import requests
from flask import Blueprint, jsonify, request

from voyagr.utils import overpass_audit as audit
from voyagr.utils import request_budget as route_transport
from voyagr.utils.hazard_matching import HazardList

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import sanitize_string
from voyagr.utils.admin_auth import require_admin_if_configured
from voyagr.utils.camera_buckets import normalize_camera_hazard_bucket
from voyagr.utils.geometry import get_distance_between_points
from voyagr.utils.rate_limiting import RateLimiter, rate_limit
from voyagr.services import invalidate_hazard_cache, invalidate_route_cache
from voyagr.api.routing import clear_route_cache

logger = logging.getLogger(__name__)

hazards_bp = Blueprint('hazards', __name__)

_hazard_report_limiter = RateLimiter(
    max_requests=40, window_seconds=3600, key_prefix='voyagr:rl:hazard-report',
)
_osm_area_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='osm-area')
_OSM_AREA_FETCH_TIMEOUT_SEC = 12
_osm_area_slots = threading.BoundedSemaphore(2)


def _run_osm_area_fetch(fetch_fn, *args, **kwargs):
    """Two owned tasks, no pending backlog; cooperative cancellation, never hard preemption."""
    if not _osm_area_slots.acquire(blocking=False):
        audit.emit('area_admission_rejected')
        return HazardList(coverage={'status':'UNAVAILABLE','reason':'acquisition_busy'})
    current = audit.trace()
    budget = route_transport.WorkBudget(_OSM_AREA_FETCH_TIMEOUT_SEC)
    def run():
        with audit.bind_trace(current), route_transport.use_budget(budget):
            audit.emit('area_task_started')
            try:
                budget.check()
                result = fetch_fn(*args, **kwargs)
                budget.check()
                return result
            finally:
                audit.emit('area_task_finished')
    try:
        future = _osm_area_executor.submit(run)
    except Exception:
        _osm_area_slots.release()
        raise
    future.add_done_callback(lambda done: _osm_area_slots.release())
    audit.emit('area_task_submitted')
    try:
        return future.result(timeout=_OSM_AREA_FETCH_TIMEOUT_SEC)
    except FuturesTimeout:
        budget.cancel()
        cancelled = future.cancel()
        audit.emit('area_wait_timeout', queued_task_cancelled=cancelled)
        return HazardList(coverage={'status':'UNAVAILABLE','reason':'deadline_exceeded'})
    except route_transport.RoutingDeadlineExceeded:
        budget.cancel()
        return HazardList(coverage={'status':'UNAVAILABLE','reason':'deadline_exceeded'})
    except Exception as exc:
        audit.emit('area_task_error', error_type=type(exc).__name__)
        return HazardList(coverage={'status':'UNAVAILABLE','reason':'acquisition_failed'})


ALLOWED_COMMUNITY_HAZARD_TYPES = frozenset({
    'accident', 'roadwork', 'police', 'hazard', 'congestion', 'weather', 'closure',
    'debris', 'flooded', 'animal', 'speed_limit_correction', 'other',
    # Voice-report and map-aligned types (see /api/voice/command report_hazard)
    'pothole', 'speed_camera', 'camera_red_light',
})

# Aliases emitted by older clients / voice phrasing → canonical allowlist values
COMMUNITY_HAZARD_TYPE_ALIASES = {
    'road_closure': 'closure',
    'traffic': 'congestion',
    'traffic_light_camera': 'camera_red_light',
}


def normalize_community_hazard_type(hazard_type):
    """Map report type aliases to canonical community hazard types."""
    if not isinstance(hazard_type, str):
        return None
    normalized = hazard_type.strip().lower()
    if not normalized:
        return None
    return COMMUNITY_HAZARD_TYPE_ALIASES.get(normalized, normalized)


@hazards_bp.route('/hazard-preferences', methods=['GET', 'POST'])
def hazard_preferences():
    """Get or update hazard preferences."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT hazard_type, penalty_seconds, enabled, proximity_threshold_meters FROM hazard_preferences')
            prefs = cursor.fetchall()
            return jsonify({
                'success': True,
                'preferences': [
                    {
                        'hazard_type': p[0],
                        'penalty_seconds': p[1],
                        'enabled': bool(p[2]),
                        'proximity_threshold_meters': p[3]
                    } for p in prefs
                ]
            })

        else:  # POST
            data = request.get_json(silent=True) or {}
            hazard_type = data.get('hazard_type')
            if not hazard_type:
                return jsonify({'success': False, 'error': 'hazard_type is required'}), 400

            penalty = data.get('penalty_seconds')
            enabled = data.get('enabled', True)
            threshold = data.get('proximity_threshold_meters')

            # Defaults for camera subtype rows (matches voyagr_web init_db)
            _cam_penalty: dict[str, int] = {
                'camera_red_light': 1200,
                'camera_speed': 1000,
                'camera_average_speed': 800,
                'camera_bus_lane': 800,
                'camera_mobile': 800,
                'camera_other': 800,
            }
            if penalty is None and hazard_type in _cam_penalty:
                penalty = _cam_penalty[hazard_type]
            if penalty is None:
                penalty = 800
            thr = threshold if threshold is not None else 100
            en_int = int(bool(enabled))

            cursor.execute('''
                UPDATE hazard_preferences
                SET penalty_seconds = ?, enabled = ?, proximity_threshold_meters = ?
                WHERE hazard_type = ?
            ''', (penalty, en_int, thr, hazard_type))

            if cursor.rowcount == 0:
                cursor.execute('''
                    INSERT INTO hazard_preferences (hazard_type, penalty_seconds, enabled, proximity_threshold_meters)
                    VALUES (?, ?, ?, ?)
                ''', (hazard_type, penalty, en_int, thr))

            conn.commit()
            invalidate_hazard_cache()
            invalidate_route_cache()
            # Penalties feed route scoring/ordering, and the in-memory cache key
            # does not encode them — without this the previous option list is
            # replayed for up to an hour after the change.
            clear_route_cache()

            return jsonify({'success': True, 'message': f'Updated {hazard_type}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@hazards_bp.route('/hazards/add-camera', methods=['POST'])
@require_admin_if_configured
def add_camera():
    """Add a speed/traffic camera location."""
    conn = None
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        camera_type = data.get('type', 'camera')
        description = sanitize_string(data.get('description', ''), max_length=500) or ''

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO cameras (lat, lon, type, description, severity)
            VALUES (?, ?, ?, ?, ?)
        ''', (lat, lon, camera_type, description, 'high'))
        conn.commit()
        camera_id = cursor.lastrowid

        return jsonify({'success': True, 'camera_id': camera_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@hazards_bp.route('/hazards/report', methods=['POST'])
@rate_limit(_hazard_report_limiter)
def report_hazard():
    """Report a hazard (community report). Anonymous-friendly; rate-limited per IP."""
    conn = None
    try:
        data = request.json or {}
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        hazard_type = normalize_community_hazard_type(
            data.get('hazard_type') or data.get('type')
        )
        if hazard_type not in ALLOWED_COMMUNITY_HAZARD_TYPES:
            return jsonify({'success': False, 'error': 'Invalid hazard_type'}), 400
        description = sanitize_string(data.get('description', ''), max_length=500) or ''
        severity = data.get('severity', 'medium')
        user_id = sanitize_string(data.get('user_id', 'anonymous'), max_length=100) or 'anonymous'

        expiry_timestamp = int(time.time()) + 86400

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO community_hazard_reports
            (user_id, hazard_type, lat, lon, description, severity, expiry_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, hazard_type, lat, lon, description, severity, expiry_timestamp))
        conn.commit()
        report_id = cursor.lastrowid

        return jsonify({'success': True, 'report_id': report_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@hazards_bp.route('/hazards/nearby', methods=['GET'])
def get_nearby_hazards():
    """Get hazards near a location."""
    conn = None
    try:
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
        radius_km = float(request.args.get('radius', 5))

        lat_delta = radius_km / 111.0
        lon_delta = radius_km / (111.0 * math.cos(math.radians(lat)))

        north = lat + lat_delta
        south = lat - lat_delta
        east = lon + lon_delta
        west = lon - lon_delta

        conn = get_db_connection()
        cursor = conn.cursor()

        hazards = {'cameras': [], 'reports': []}

        cursor.execute(
            'SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
            (south, north, west, east)
        )
        for row in cursor.fetchall():
            distance = get_distance_between_points(lat, lon, row[0], row[1])
            hazards['cameras'].append({
                'lat': row[0], 'lon': row[1], 'type': row[2],
                'description': row[3], 'distance_meters': distance
            })

        cursor.execute(
            'SELECT lat, lon, hazard_type, description, severity FROM community_hazard_reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND status = "active" AND expiry_timestamp > ?',
            (south, north, west, east, int(time.time()))
        )
        for row in cursor.fetchall():
            distance = get_distance_between_points(lat, lon, row[0], row[1])
            hazards['reports'].append({
                'lat': row[0], 'lon': row[1], 'type': row[2],
                'description': row[3], 'severity': row[4], 'distance_meters': distance
            })

        return jsonify({'success': True, 'hazards': hazards})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@hazards_bp.route('/traffic-lights/area', methods=['GET'])
def get_traffic_lights_in_area():
    """Traffic signals in map viewport (OSM via Overpass), for map layer."""
    try:
        north = float(request.args.get('north', 90))
        south = float(request.args.get('south', -90))
        east = float(request.args.get('east', 180))
        west = float(request.args.get('west', -180))

        if abs(north - south) > 0.35 or abs(east - west) > 0.35:
            return jsonify({'success': True, 'traffic_lights': [], 'message': 'Zoom in to see traffic lights'})

        from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
        lights = _run_osm_area_fetch(
            fetch_traffic_lights_osm_bbox, south, north, west, east, max_nodes=200
        )
        out = [{'lat': x['lat'], 'lon': x['lon'], 'type': 'traffic_light', 'description': x.get('description', '')} for x in lights]
        return jsonify({'success': True, 'traffic_lights': out, 'count': len(out), 'coverage':getattr(lights,'coverage',{'status':'UNKNOWN'})})
    except route_transport.RoutingDeadlineExceeded:
        raise
    except Exception as e:
        logger.error(f"Error fetching traffic lights in area: {e}")
        return jsonify({'success': False, 'error': str(e)})


@hazards_bp.route('/railway-crossings/area', methods=['GET'])
def get_railway_crossings_in_area():
    """Road–rail level crossings in map viewport (OSM via Overpass), for map layer."""
    try:
        north = float(request.args.get('north', 90))
        south = float(request.args.get('south', -90))
        east = float(request.args.get('east', 180))
        west = float(request.args.get('west', -180))

        if abs(north - south) > 0.35 or abs(east - west) > 0.35:
            return jsonify({'success': True, 'railway_crossings': [], 'message': 'Zoom in to see railway crossings'})

        from voyagr.services.hazards import fetch_railway_crossings_osm_bbox
        crossings = _run_osm_area_fetch(
            fetch_railway_crossings_osm_bbox, south, north, west, east, max_nodes=200
        )
        out = [
            {
                'lat': x['lat'],
                'lon': x['lon'],
                'type': 'railway_crossing',
                'description': x.get('description', ''),
            }
            for x in crossings
        ]
        return jsonify({'success': True, 'railway_crossings': out, 'count': len(out), 'coverage':getattr(crossings,'coverage',{'status':'UNKNOWN'})})
    except route_transport.RoutingDeadlineExceeded:
        raise
    except Exception as e:
        logger.error(f"Error fetching railway crossings in area: {e}")
        return jsonify({'success': False, 'error': str(e)})


@hazards_bp.route('/cameras/area', methods=['GET'])
def get_cameras_in_area():
    """Get all cameras within a map viewport bounding box."""
    conn = None
    try:
        north = float(request.args.get('north', 90))
        south = float(request.args.get('south', -90))
        east = float(request.args.get('east', 180))
        west = float(request.args.get('west', -180))

        if abs(north - south) > 2 or abs(east - west) > 2:
            return jsonify({'success': True, 'cameras': [], 'message': 'Zoom in to see cameras'})

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            '''SELECT lat, lon, type, description, severity
               FROM cameras
               WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
               LIMIT 500''',
            (south, north, west, east)
        )

        cameras = []
        for row in cursor.fetchall():
            raw_type = row[2] or 'camera'
            cameras.append({
                'lat': row[0],
                'lon': row[1],
                'type': raw_type,
                'bucket': normalize_camera_hazard_bucket(raw_type),
                'description': row[3] or '',
                'severity': row[4] or 'high'
            })

        return jsonify({'success': True, 'cameras': cameras, 'count': len(cameras)})
    except Exception as e:
        logger.error(f"Error fetching cameras in area: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@hazards_bp.route('/traffic-lights', methods=['POST'])
def get_traffic_lights():
    """Get traffic lights along a route from OpenStreetMap via Overpass API."""
    try:
        data = request.json
        route_geojson = data.get('route', {})

        if not route_geojson or route_geojson.get('type') != 'LineString':
            return jsonify({'success': False, 'error': 'Invalid route GeoJSON'})

        coordinates = route_geojson.get('coordinates', [])
        if len(coordinates) < 2:
            return jsonify({'success': False, 'error': 'Route must have at least 2 coordinates'})

        lngs = [c[0] for c in coordinates if len(c) >= 2]
        lats = [c[1] for c in coordinates if len(c) >= 2]

        if not lngs or not lats:
            return jsonify({'success': False, 'error': 'No valid coordinates in route'})

        buffer = 0.001
        min_lat = min(lats) - buffer
        max_lat = max(lats) + buffer
        min_lng = min(lngs) - buffer
        max_lng = max(lngs) + buffer

        lat_diff = abs(max_lat - min_lat)
        lon_diff = abs(max_lng - min_lng)
        diagonal_sq = (lat_diff * lat_diff) + (lon_diff * lon_diff * 0.6)
        estimated_km = int(math.sqrt(diagonal_sq) * 111)

        if max_lat-min_lat>0.35 or max_lng-min_lng>0.35:
            return jsonify(success=True, lights=[], count=0, warning='Area too large for bounded traffic signal acquisition', coverage={'status':'PARTIAL'})
        from overpass_helper import query_overpass, build_traffic_signals_query
        result = query_overpass(build_traffic_signals_query(min_lat,min_lng,max_lat,max_lng),cache_ttl=300)
        if not result.get('success'):
            return jsonify(success=True, lights=[], count=0, warning='Traffic signal data unavailable', coverage={'status':'UNKNOWN'})
        elements = result['elements']
        cached = result.get('cached',False)

        lights = []
        seen_ids = set()

        for element in elements:
            try:
                osm_id = element.get('id')
                if osm_id in seen_ids:
                    continue
                seen_ids.add(osm_id)

                lat = float(element.get('lat', 0))
                lng = float(element.get('lon', 0))
                tags = element.get('tags', {})

                if diagonal_sq > 1.0:
                    proximity_threshold = 0.005
                elif diagonal_sq > 0.25:
                    proximity_threshold = 0.003
                else:
                    proximity_threshold = 0.0015

                is_near_route = False
                for coord in coordinates:
                    if len(coord) >= 2:
                        route_lng, route_lat = coord[0], coord[1]
                        dist = math.sqrt((lat - route_lat)**2 + (lng - route_lng)**2)
                        if dist < proximity_threshold:
                            is_near_route = True
                            break

                if not is_near_route:
                    continue

                lights.append({
                    'id': f'osm_{osm_id}',
                    'lat': lat,
                    'lng': lng,
                    'state': 'unknown',
                    'name': tags.get('name', ''),
                    'crossing': tags.get('crossing', ''),
                    'button_operated': tags.get('button_operated', ''),
                    'source': 'openstreetmap'
                })
            except (ValueError, KeyError) as e:
                logger.debug(f"[Traffic Lights] Error processing element: {e}")
                continue

        logger.info(f"[Traffic Lights] Found {len(lights)} traffic signals")

        return jsonify({
            'success': True,
            'lights': lights,
            'count': len(lights),
            'source': 'openstreetmap',
            'coverage': {'status':'PARTIAL','dataset_coverage':result.get('dataset_coverage','UNVERIFIED'),'retrieved_at':result.get('retrieved_at'),'response_state':result.get('response_state')},
            'cached': cached if 'cached' in dir() else False
        })

    except route_transport.RoutingDeadlineExceeded:
        raise
    except Exception as e:
        logger.error(f"[Traffic Lights] Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

