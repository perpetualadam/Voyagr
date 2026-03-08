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
import requests
from flask import Blueprint, jsonify, request

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import sanitize_string, require_auth
from voyagr.utils.geometry import get_distance_between_points
from voyagr.services import invalidate_hazard_cache, invalidate_route_cache

logger = logging.getLogger(__name__)

hazards_bp = Blueprint('hazards', __name__)


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
            data = request.json
            hazard_type = data.get('hazard_type')
            penalty = data.get('penalty_seconds')
            enabled = data.get('enabled', True)
            threshold = data.get('proximity_threshold_meters')

            cursor.execute('''
                UPDATE hazard_preferences
                SET penalty_seconds = ?, enabled = ?, proximity_threshold_meters = ?
                WHERE hazard_type = ?
            ''', (penalty, int(enabled), threshold, hazard_type))

            conn.commit()
            invalidate_hazard_cache()
            invalidate_route_cache()

            return jsonify({'success': True, 'message': f'Updated {hazard_type}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@hazards_bp.route('/hazards/add-camera', methods=['POST'])
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
@require_auth
def report_hazard():
    """Report a hazard (community report)."""
    conn = None
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        hazard_type = data.get('hazard_type')
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
            cameras.append({
                'lat': row[0],
                'lon': row[1],
                'type': row[2] or 'camera',
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

        # Try to use overpass_helper if available
        try:
            from overpass_helper import get_client, query_overpass, build_traffic_signals_query
            OVERPASS_HELPER_AVAILABLE = True
        except ImportError:
            OVERPASS_HELPER_AVAILABLE = False

        if OVERPASS_HELPER_AVAILABLE:
            active_endpoint = get_client()._get_next_endpoint()
            logger.info(f"[Traffic Lights] Route (~{estimated_km}km). Using BBox search via {active_endpoint}")
            query = build_traffic_signals_query(min_lat, min_lng, max_lat, max_lng)
            cache_key = f"traffic_lights_{min_lat:.4f}_{min_lng:.4f}_{max_lat:.4f}_{max_lng:.4f}"

            result = query_overpass(query, cache_key=cache_key, cache_ttl=300)

            if not result.get('success'):
                logger.warning(f"[Traffic Lights] Overpass query failed: {result.get('error')}")
                return jsonify({'success': True, 'lights': [], 'warning': 'Traffic signal data unavailable', 'count': 0})

            elements = result.get('elements', [])
            cached = result.get('cached', False)
            logger.info(f"[Traffic Lights] Query returned {len(elements)} raw elements (cached={cached})")
        else:
            overpass_url = os.getenv('OVERPASS_API_URL', 'https://overpass-api.de/api/interpreter')
            logger.info(f"[Traffic Lights] Querying Overpass (Direct): {overpass_url}")

            query = f'''
            [out:json][timeout:30];
            (
                node["highway"="traffic_signals"]({min_lat},{min_lng},{max_lat},{max_lng});
                node["crossing"="traffic_signals"]({min_lat},{min_lng},{max_lat},{max_lng});
            );
            out body;
            '''
            try:
                response = requests.post(overpass_url, data={'data': query}, timeout=30)
                if response.status_code != 200:
                    logger.warning(f"[Traffic Lights] Direct query failed: {response.status_code}")
                    return jsonify({'success': True, 'lights': [], 'warning': 'Traffic signal data unavailable', 'count': 0})
                elements = response.json().get('elements', [])
                cached = False
            except Exception as e:
                logger.error(f"[Traffic Lights] Direct query error: {e}")
                return jsonify({'success': True, 'lights': [], 'warning': 'Traffic signal data unavailable', 'count': 0})

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
            'cached': cached if 'cached' in dir() else False
        })

    except Exception as e:
        logger.error(f"[Traffic Lights] Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

