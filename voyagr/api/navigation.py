"""
Navigation blueprint for Voyagr.

Contains:
- Lane guidance
- Speed warnings
- Speed limit detection
- Voice commands
- Weather
- Analytics
"""

import logging
import os
from typing import Any, Dict
import requests
from flask import Blueprint, jsonify, request, send_file, after_this_request

from voyagr.models import get_db_connection, return_db_connection, db_connection
from voyagr.utils.rate_limiting import RateLimiter

logger = logging.getLogger(__name__)

_speed_limit_feedback_limiter = RateLimiter(max_requests=40, window_seconds=60)

navigation_bp = Blueprint('navigation', __name__)

# Global reference to speed_limit_detector (set by main app)
speed_limit_detector = None


def set_speed_limit_detector(detector):
    """Set the speed limit detector instance."""
    global speed_limit_detector
    speed_limit_detector = detector


# Lane data cache to avoid spamming Overpass API
_lane_data_cache = {}
_LANE_CACHE_EXPIRY = 300  # 5 minutes

# Lane arrow symbols for display
LANE_ARROWS = {
    'left': '←',
    'sharp_left': '↰',
    'slight_left': '↖',
    'through': '↑',
    'slight_right': '↗',
    'right': '→',
    'sharp_right': '↱',
    'merge_to_left': '↰',
    'merge_to_right': '↱',
    'reverse': '↩',
    'none': '↑',
}

# Default lane configurations by road type
DEFAULT_LANE_CONFIGS = {
    'motorway': 3,
    'trunk': 3,
    'primary': 2,
    'secondary': 2,
    'tertiary': 1,
    'residential': 1,
    'unclassified': 1,
}


def _fetch_osm_lane_data(lat, lon):
    """Fetch lane information from OpenStreetMap via Overpass API with caching."""
    import time as _time

    cache_key = f"{lat:.4f},{lon:.4f}"
    now = _time.time()

    if cache_key in _lane_data_cache:
        cached = _lane_data_cache[cache_key]
        if now - cached['timestamp'] < _LANE_CACHE_EXPIRY:
            return cached['data']

    try:
        overpass_url = "http://overpass-api.de/api/interpreter"
        query = f"""
        [out:json][timeout:5];
        way(around:30,{lat},{lon})[highway~"motorway|trunk|primary|secondary|tertiary"];
        out tags;
        """
        resp = requests.get(overpass_url, params={'data': query}, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            for element in data.get('elements', []):
                tags = element.get('tags', {})
                if 'lanes' in tags:
                    result = {
                        'total_lanes': int(tags['lanes']),
                        'turn_lanes': tags.get('turn:lanes', ''),
                        'turn_lanes_forward': tags.get('turn:lanes:forward', ''),
                        'highway': tags.get('highway', 'unknown'),
                        'name': tags.get('name', ''),
                        'lanes_forward': int(tags.get('lanes:forward', tags['lanes'])),
                    }
                    _lane_data_cache[cache_key] = {'data': result, 'timestamp': now}
                    return result

        # Nothing found - return None so caller uses defaults
        _lane_data_cache[cache_key] = {'data': None, 'timestamp': now}
        return None
    except Exception as e:
        logger.debug(f"[Lane] Overpass error: {e}")
        return None


def _parse_turn_lanes(turn_lanes_str, total_lanes):
    """Parse OSM turn:lanes tag into per-lane allowed directions.
    Example: 'left|through|through;right' → [['left'], ['through'], ['through','right']]
    """
    if not turn_lanes_str:
        return None
    parts = turn_lanes_str.split('|')
    if len(parts) != total_lanes:
        # Mismatch – ignore
        return None
    return [p.split(';') for p in parts]


def _recommend_lane_from_turn_lanes(lane_dirs, maneuver, roundabout_exit_count=0):
    """Given parsed turn:lanes and a maneuver, pick the best lane index (1-based).

    Roundabouts are resolved from the *exit* you leave by: the early exits leave to
    the left, the middle exit(s) go straight through, later exits leave to the right.
    This lets real lane markings win — e.g. when the left lane is "left-turn only" and
    going straight ahead actually requires the middle/right lane.
    """
    if not lane_dirs:
        return None

    # Maneuver -> preferred OSM turn:lanes indications (most-preferred first). Every
    # maneuver the client can send is recognised here so lane selection never silently
    # falls back to "through" for a real turn (e.g. a sharp left used to do that).
    maneuver_map = {
        'left': ['left', 'slight_left'],
        'sharp_left': ['sharp_left', 'left', 'slight_left'],
        'slight_left': ['slight_left', 'left'],
        'right': ['right', 'slight_right'],
        'sharp_right': ['sharp_right', 'right', 'slight_right'],
        'slight_right': ['slight_right', 'right'],
        'straight': ['through', 'none', ''],
        'exit_right': ['right', 'slight_right', 'merge_to_right'],
        'exit_left': ['left', 'slight_left', 'merge_to_left'],
        'exit': ['right', 'slight_right'],
        'merge': ['through', 'none', ''],
        'uturn': ['reverse', 'left', 'slight_left'],
        'destination': ['through', 'none', ''],
    }

    # Roundabouts are exit-dependent, so their entry is derived and folded into the same
    # map: early exits leave to the left, the middle exit goes straight through (never a
    # turn-only lane), later exits leave to the right.
    if maneuver == 'roundabout':
        if roundabout_exit_count <= 1:
            maneuver_map['roundabout'] = ['left', 'slight_left', 'through']
        elif roundabout_exit_count == 2:
            maneuver_map['roundabout'] = ['through', 'none', '', 'slight_left', 'slight_right']
        else:
            maneuver_map['roundabout'] = ['right', 'slight_right', 'through']

    wanted = maneuver_map.get(maneuver, ['through', 'none', ''])

    # Score each lane
    best_lane = None
    best_score = -1
    for idx, dirs in enumerate(lane_dirs):
        for w_idx, w in enumerate(wanted):
            if w in dirs:
                score = len(wanted) - w_idx  # Higher score for first preference
                if score > best_score:
                    best_score = score
                    best_lane = idx + 1  # 1-based
                break

    return best_lane


def _get_recommended_lane_simple(maneuver, total_lanes, roundabout_exit_count=0):
    """Fallback lane recommendation when no OSM turn:lanes data is available.

    For roundabouts (UK, left-hand traffic), per Highway Code:
      Exit 1 (first/left exit)     -> left lane
      Exit 2 (straight ahead)      -> left lane
      Exit 3+ (right / full circle) -> right lane
    Approaches up to and including "straight ahead" stay in the LEFT lane; only
    exits past straight (turning right) use the right lane. This matches the
    client's offline fallback. (Previously the 2nd exit on 3+ lane roundabouts
    returned the middle lane, telling drivers "middle" when the answer was left.)
    """
    if total_lanes <= 1:
        return 1

    if maneuver == 'roundabout' and roundabout_exit_count > 0:
        if roundabout_exit_count <= 2:
            return 1  # 1st/2nd exit (left or straight ahead) -> left lane
        return total_lanes  # 3rd+ exit (right) -> right lane
    elif maneuver in ('left', 'slight_left', 'sharp_left', 'exit_left'):
        return 1
    elif maneuver in ('right', 'slight_right', 'sharp_right', 'exit_right', 'exit'):
        return total_lanes
    elif maneuver in ('straight', 'merge'):
        return max(1, (total_lanes + 1) // 2)
    else:
        return max(1, (total_lanes + 1) // 2)


@navigation_bp.route('/lane-guidance', methods=['GET'])
def get_lane_guidance():
    """Get smart lane guidance for current location using OSM data and route context."""
    try:
        lat = float(request.args.get('lat', 0))
        lon = float(request.args.get('lon', 0))
        next_maneuver = request.args.get('maneuver', 'straight')
        distance_to_maneuver = float(request.args.get('distance', 9999))
        road_type = request.args.get('road_type', 'unknown')
        roundabout_exit_count = int(request.args.get('roundabout_exit_count', 0))

        # Try to get real lane data from OSM
        osm_data = _fetch_osm_lane_data(lat, lon)

        if osm_data:
            total_lanes = osm_data.get('lanes_forward', osm_data['total_lanes'])
            turn_lanes_str = osm_data.get('turn_lanes_forward') or osm_data.get('turn_lanes', '')
            road_name = osm_data.get('name', '')
            highway_type = osm_data.get('highway', road_type)
        else:
            total_lanes = DEFAULT_LANE_CONFIGS.get(road_type, 2)
            turn_lanes_str = ''
            road_name = ''
            highway_type = road_type

        # Ensure at least 1 lane
        total_lanes = max(1, total_lanes)

        # Parse turn:lanes data if available
        parsed_lanes = _parse_turn_lanes(turn_lanes_str, total_lanes)

        # Build per-lane arrow/direction info
        lane_arrows = []
        if parsed_lanes:
            for dirs in parsed_lanes:
                # Pick the primary direction for display
                primary = dirs[0] if dirs else 'through'
                arrow = LANE_ARROWS.get(primary, '↑')
                lane_arrows.append({
                    'directions': dirs,
                    'arrow': arrow,
                    'primary': primary
                })
        else:
            # Generate default arrows based on total lanes
            for i in range(total_lanes):
                lane_arrows.append({
                    'directions': ['through'],
                    'arrow': '↑',
                    'primary': 'through'
                })

        # Determine recommended lane
        recommended_lane = None
        if parsed_lanes:
            recommended_lane = _recommend_lane_from_turn_lanes(
                parsed_lanes, next_maneuver, roundabout_exit_count
            )

        if recommended_lane is None:
            recommended_lane = _get_recommended_lane_simple(
                next_maneuver, total_lanes, roundabout_exit_count
            )

        lane_name = _descriptive_lane_name(recommended_lane, total_lanes)

        if distance_to_maneuver <= 100:
            urgency = 'now'
            urgency_text = f'Get in the {lane_name} now!'
        elif distance_to_maneuver <= 300:
            urgency = 'soon'
            urgency_text = f'Move to the {lane_name} in {int(distance_to_maneuver)}m'
        elif distance_to_maneuver <= 800:
            urgency = 'ahead'
            urgency_text = f'Prepare to use the {lane_name} in {int(distance_to_maneuver)}m'
        elif distance_to_maneuver <= 1500:
            urgency = 'info'
            urgency_text = f'Stay in the {lane_name} for upcoming maneuver'
        else:
            urgency = 'none'
            urgency_text = ''

        if next_maneuver == 'straight' or distance_to_maneuver > 1500:
            guidance_text = 'Stay in current lane'
        elif next_maneuver == 'roundabout' and roundabout_exit_count > 0:
            exit_ordinal = _ordinal(roundabout_exit_count)
            guidance_text = f'Use the {lane_name} and take the {exit_ordinal} exit'
        else:
            guidance_text = f'Use the {lane_name} to {_maneuver_action(next_maneuver)}'

        return jsonify({
            'success': True,
            'total_lanes': total_lanes,
            'recommended_lane': recommended_lane,
            'lane_arrows': lane_arrows,
            'lane_change_needed': True if urgency in ('now', 'soon', 'ahead') else False,
            'next_maneuver': next_maneuver,
            'distance_to_maneuver': distance_to_maneuver,
            'urgency': urgency,
            'urgency_text': urgency_text,
            'guidance_text': guidance_text,
            'road_name': road_name,
            'highway_type': highway_type,
            'has_osm_data': osm_data is not None,
            'has_turn_lanes': parsed_lanes is not None,
            'roundabout_exit_count': roundabout_exit_count,
        })
    except Exception as e:
        logger.error(f"[Lane Guidance] Error: {e}")
        return jsonify({'success': False, 'error': str(e)})


def _maneuver_action(maneuver):
    """Convert maneuver type to human-readable action."""
    actions = {
        'left': 'turn left',
        'slight_left': 'bear left',
        'sharp_left': 'turn sharply left',
        'right': 'turn right',
        'slight_right': 'bear right',
        'sharp_right': 'turn sharply right',
        'exit': 'take the exit',
        'exit_right': 'take the exit',
        'exit_left': 'take the exit',
        'merge': 'merge',
        'roundabout': 'enter the roundabout',
        'uturn': 'make a U-turn',
        'straight': 'continue straight',
        'destination': 'reach your destination',
    }
    return actions.get(maneuver, 'continue')


def _descriptive_lane_name(lane_number, total_lanes):
    """Convert a 1-based lane number into a human-friendly name."""
    if total_lanes <= 1:
        return 'lane'
    if lane_number == 1:
        return 'left lane'
    if lane_number == total_lanes:
        return 'right lane'
    if total_lanes == 3 and lane_number == 2:
        return 'middle lane'
    return f'middle lane (lane {lane_number})'


def _ordinal(n):
    """Return ordinal string for integer n (1st, 2nd, 3rd, …)."""
    if 11 <= (n % 100) <= 13:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


@navigation_bp.route('/speed-warnings', methods=['GET'])
def get_speed_warnings():
    """Get speed warning for current location and speed."""
    try:
        current_speed_mph = float(request.args.get('speed', 0))
        road_type = request.args.get('road_type', 'local')

        speed_limits = {
            'motorway': 70,
            'a_road': 60,
            'b_road': 50,
            'local': 30
        }
        speed_limit_mph = speed_limits.get(road_type, 30)

        speed_diff = current_speed_mph - speed_limit_mph
        warning_threshold = 5

        if speed_diff >= warning_threshold:
            status = 'exceeding'
            color = 'red'
            message = f'Exceeding speed limit by {int(speed_diff)} mph'
        elif speed_diff > 0:
            status = 'approaching'
            color = 'amber'
            message = f'Approaching speed limit ({int(current_speed_mph)} mph)'
        else:
            status = 'compliant'
            color = 'green'
            message = f'Speed compliant ({int(current_speed_mph)} mph)'

        return jsonify({
            'success': True,
            'status': status,
            'color': color,
            'current_speed_mph': current_speed_mph,
            'speed_limit_mph': speed_limit_mph,
            'speed_diff_mph': round(speed_diff, 1),
            'message': message,
            'warning_threshold_mph': warning_threshold
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/speed-limit', methods=['GET'])
def get_speed_limit():
    """Get speed limit for a location with variable speed limit detection."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
        road_type = request.args.get('road_type', 'residential')
        vehicle_type = request.args.get('vehicle_type', 'car')
        # Optional route-accurate hint from the client's Valhalla edge (mph). Used only to
        # disambiguate near-tie OSM ways at junctions; never trusted blindly.
        valhalla_hint_mph = None
        try:
            raw_hint = request.args.get('valhalla_speed_limit')
            if raw_hint is not None:
                parsed_hint = int(float(raw_hint))
                if parsed_hint > 0:
                    valhalla_hint_mph = parsed_hint
        except (ValueError, TypeError):
            valhalla_hint_mph = None

        result = speed_limit_detector.get_speed_limit_for_location(
            lat=lat, lon=lon, road_type=road_type, vehicle_type=vehicle_type,
            valhalla_hint_mph=valhalla_hint_mph
        )

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/speed-violation', methods=['POST'])
def check_speed_violation():
    """Check if vehicle is exceeding speed limit."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        data = request.json
        current_speed_mph = float(data.get('current_speed_mph', 0))
        raw_sl = data.get('speed_limit_mph')
        try:
            if raw_sl is None:
                speed_limit_mph = None
            else:
                speed_limit_mph = int(float(raw_sl))
        except (ValueError, TypeError):
            speed_limit_mph = None
        warning_threshold_mph = int(data.get('warning_threshold_mph', 5))

        result = speed_limit_detector.check_speed_violation(
            current_speed_mph=current_speed_mph,
            speed_limit_mph=speed_limit_mph,
            warning_threshold_mph=warning_threshold_mph
        )

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/speed-limit/metrics', methods=['GET'])
def get_speed_limit_metrics():
    """Get speed limit API usage metrics and statistics."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        metrics = speed_limit_detector.get_metrics()
        return jsonify({'success': True, 'data': metrics})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/speed-limit/quota', methods=['GET'])
def get_tomtom_quota():
    """Get TomTom API quota and cost information."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        quota = speed_limit_detector.get_tomtom_quota()
        return jsonify({'success': True, 'data': quota})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/speed-limit/metrics/reset', methods=['POST'])
def reset_speed_limit_metrics():
    """Reset speed limit metrics counters."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        speed_limit_detector.reset_metrics()
        return jsonify({'success': True, 'message': 'Metrics reset successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/speed-limit/feedback', methods=['POST'])
def speed_limit_feedback():
    """
    Log anonymous driver feedback on the displayed speed limit (confirmed vs wrong).
    Intended for analytics and detector tuning — no PII stored.
    """
    ip = request.remote_addr
    if ip and not _speed_limit_feedback_limiter.is_allowed(ip):
        return jsonify({'success': False, 'error': 'Rate limit exceeded'}), 429

    data = request.get_json(silent=True) or {}
    outcome = (data.get('outcome') or '').strip().lower()
    if outcome not in ('confirmed', 'wrong_sign'):
        return jsonify({'success': False, 'error': 'outcome must be confirmed or wrong_sign'}), 400

    try:
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'lat and lon are required numbers'}), 400

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return jsonify({'success': False, 'error': 'lat/lon out of range'}), 400

    raw_mph = data.get('displayed_mph')
    displayed_mph = None
    if raw_mph is not None and raw_mph != '':
        try:
            displayed_mph = int(float(raw_mph))
        except (TypeError, ValueError):
            displayed_mph = None
    if displayed_mph is not None and (displayed_mph < 1 or displayed_mph > 130):
        displayed_mph = None

    src = data.get('source')
    if src is None:
        source = None
    else:
        source = str(src).strip()[:64] or None

    client_ts = data.get('client_ts')
    try:
        client_ts_int = int(client_ts) if client_ts is not None else None
    except (TypeError, ValueError):
        client_ts_int = None

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            INSERT INTO speed_limit_feedback (outcome, lat, lon, displayed_mph, source, client_ts)
            VALUES (?, ?, ?, ?, ?, ?)
            ''',
            (outcome, lat, lon, displayed_mph, source, client_ts_int),
        )
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        logger.warning('[speed-limit/feedback] insert failed: %s', e)
        return jsonify({'success': False, 'error': 'Could not store feedback'}), 500
    finally:
        if conn:
            return_db_connection(conn)


@navigation_bp.route('/road-info', methods=['GET'])
def get_road_info():
    """Get current road name and info using TomTom Reverse Geocoding."""
    try:
        lat = float(request.args.get('lat', 0))
        lon = float(request.args.get('lon', 0))

        if lat == 0 or lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')
        if tomtom_api_key:
            try:
                url = f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lon}.json"
                params = {
                    'key': tomtom_api_key,
                    'returnSpeedLimit': 'true',
                    'returnRoadUse': 'true',
                    'radius': 50,
                }
                resp = requests.get(url, params=params, timeout=3)
                if resp.status_code == 200:
                    data = resp.json()
                    addresses = data.get('addresses', [])
                    if addresses:
                        addr = addresses[0].get('address', {})
                        road_name = addr.get('streetName', '') or addr.get('street', '')
                        road_number = addr.get('streetNumber', '')
                        municipality = addr.get('municipality', '')
                        country_subdivision = addr.get('countrySubdivision', '')
                        speed_limit = addr.get('speedLimit', '')

                        display_name = road_name
                        if road_number and road_name:
                            display_name = f"{road_name}"
                        if not display_name and municipality:
                            display_name = municipality

                        return jsonify({
                            'success': True,
                            'road_name': display_name,
                            'road_number': road_number,
                            'municipality': municipality,
                            'region': country_subdivision,
                            'speed_limit': speed_limit,
                            'source': 'TomTom',
                        })
            except Exception as e:
                logger.warning(f"[RoadInfo] TomTom reverse geocode failed: {e}")

        try:
            from voyagr.api.search import NOMINATIM_BASE_URL, NOMINATIM_LANGUAGE
            url = f"{NOMINATIM_BASE_URL}/reverse"
            params = {'lat': lat, 'lon': lon, 'format': 'json', 'addressdetails': '1', 'zoom': 18}
            headers = {'User-Agent': 'Voyagr-PWA/1.0', 'Accept-Language': NOMINATIM_LANGUAGE}
            resp = requests.get(url, params=params, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                addr = data.get('address', {})
                road_name = addr.get('road', '') or addr.get('pedestrian', '') or addr.get('path', '')
                municipality = addr.get('city', '') or addr.get('town', '') or addr.get('village', '')
                return jsonify({
                    'success': True,
                    'road_name': road_name,
                    'municipality': municipality,
                    'source': 'Nominatim',
                })
        except Exception as e:
            logger.warning(f"[RoadInfo] Nominatim fallback failed: {e}")

        return jsonify({'success': False, 'error': 'No road info available'})
    except Exception as e:
        logger.error(f"[RoadInfo] Error: {e}")
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/best-time-to-leave', methods=['POST'])
def best_time_to_leave():
    """Analyse traffic patterns to suggest optimal departure times using TomTom Traffic Flow."""
    try:
        data = request.json
        start_lat = float(data.get('start_lat', 0))
        start_lon = float(data.get('start_lon', 0))
        end_lat = float(data.get('end_lat', 0))
        end_lon = float(data.get('end_lon', 0))

        if start_lat == 0 or end_lat == 0:
            return jsonify({'success': False, 'error': 'Start and end coordinates required'})

        tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')

        from datetime import datetime as dt, timedelta
        now = dt.now()
        time_slots = []

        mid_lat = (start_lat + end_lat) / 2
        mid_lon = (start_lon + end_lon) / 2
        sample_points = [
            (start_lat, start_lon),
            (mid_lat, mid_lon),
            ((start_lat + mid_lat) / 2, (start_lon + mid_lon) / 2),
        ]

        candidate_times = []
        for offset_min in range(0, 180, 30):
            candidate = now + timedelta(minutes=offset_min)
            candidate_times.append(candidate)

        if tomtom_api_key:
            for candidate in candidate_times:
                total_congestion = 0
                samples_ok = 0
                for pt_lat, pt_lon in sample_points:
                    try:
                        url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
                        params = {
                            'key': tomtom_api_key,
                            'point': f"{pt_lat},{pt_lon}",
                            'unit': 'KMPH',
                        }
                        resp = requests.get(url, params=params, timeout=3)
                        if resp.status_code == 200:
                            flow = resp.json().get('flowSegmentData', {})
                            current_speed = flow.get('currentSpeed', 0)
                            free_flow = flow.get('freeFlowSpeed', 1)
                            if free_flow > 0:
                                ratio = current_speed / free_flow
                                congestion = max(0, (1 - ratio) * 100)
                                total_congestion += congestion
                                samples_ok += 1
                    except Exception:
                        pass

                avg_congestion = total_congestion / max(samples_ok, 1)
                if candidate == candidate_times[0]:
                    congestion_label = 'now'
                else:
                    congestion_label = candidate.strftime('%H:%M')

                if avg_congestion < 15:
                    traffic_level = 'low'
                elif avg_congestion < 35:
                    traffic_level = 'moderate'
                elif avg_congestion < 55:
                    traffic_level = 'heavy'
                else:
                    traffic_level = 'severe'

                time_slots.append({
                    'time': candidate.strftime('%H:%M'),
                    'label': congestion_label,
                    'congestion_pct': round(avg_congestion, 1),
                    'traffic_level': traffic_level,
                    'is_now': candidate == candidate_times[0],
                })
        else:
            for candidate in candidate_times:
                hour = candidate.hour
                if 7 <= hour <= 9 or 16 <= hour <= 19:
                    congestion = 60
                    traffic_level = 'heavy'
                elif 10 <= hour <= 15:
                    congestion = 25
                    traffic_level = 'moderate'
                elif 20 <= hour <= 22:
                    congestion = 15
                    traffic_level = 'low'
                else:
                    congestion = 5
                    traffic_level = 'low'

                time_slots.append({
                    'time': candidate.strftime('%H:%M'),
                    'label': 'now' if candidate == candidate_times[0] else candidate.strftime('%H:%M'),
                    'congestion_pct': congestion,
                    'traffic_level': traffic_level,
                    'is_now': candidate == candidate_times[0],
                })

        time_slots.sort(key=lambda x: x['congestion_pct'])
        best = time_slots[0] if time_slots else None
        source = 'TomTom Traffic Flow' if tomtom_api_key else 'estimated (historical patterns)'

        return jsonify({
            'success': True,
            'best_time': best,
            'all_slots': time_slots,
            'source': source,
            'analysed_at': now.strftime('%H:%M'),
        })
    except Exception as e:
        logger.error(f"[BestTime] Error: {e}")
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/weather', methods=['GET'])
def get_weather():
    """Get weather for a location."""
    try:
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))

        api_key = os.getenv('OPENWEATHERMAP_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'Weather API not configured'})

        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=metric"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'temperature': data['main']['temp'],
                'description': data['weather'][0]['description'],
                'humidity': data['main']['humidity'],
                'wind_speed': data['wind']['speed'],
                'icon': data['weather'][0]['icon']
            })

        return jsonify({'success': False, 'error': 'Weather service unavailable'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/analytics', methods=['GET'])
def get_analytics():
    """Get trip analytics and statistics."""
    try:
        with db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('SELECT COUNT(*) FROM trips')
            total_trips = cursor.fetchone()[0]

            cursor.execute('SELECT SUM(distance_km) FROM trips')
            total_distance = cursor.fetchone()[0] or 0

            cursor.execute('SELECT SUM(fuel_cost), SUM(toll_cost), SUM(caz_cost) FROM trips')
            fuel_cost, toll_cost, caz_cost = cursor.fetchone()

            cursor.execute('SELECT AVG(distance_km), AVG(duration_minutes) FROM trips')
            avg_distance, avg_duration = cursor.fetchone()

            cursor.execute('SELECT routing_mode, COUNT(*) FROM trips GROUP BY routing_mode')
            mode_breakdown = {row[0]: row[1] for row in cursor.fetchall()}

        return jsonify({
            'success': True,
            'total_trips': total_trips,
            'total_distance_km': round(total_distance, 2),
            'total_fuel_cost': round(fuel_cost or 0, 2),
            'total_toll_cost': round(toll_cost or 0, 2),
            'total_caz_cost': round(caz_cost or 0, 2),
            'average_distance_km': round(avg_distance or 0, 2),
            'average_duration_minutes': round(avg_duration or 0, 2),
            'routing_modes': mode_breakdown
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# Global reference to voice_limiter (set by main app)
voice_limiter = None


def set_voice_limiter(limiter):
    """Set the voice limiter instance."""
    global voice_limiter
    voice_limiter = limiter


@navigation_bp.route('/voice/speak', methods=['POST'])
def voice_speak():
    """Convert text to speech using browser Web Audio API or backend TTS."""
    try:
        data = request.json
        text = data.get('text', '')

        if not text or len(text) > 500:
            return jsonify({'success': False, 'error': 'Invalid text length'})

        try:
            import pyttsx3
            import tempfile
            import os as os_module
            engine = pyttsx3.init()
            engine.setProperty('rate', 150)

            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                temp_file = f.name

            engine.save_to_file(text, temp_file)
            engine.runAndWait()

            @after_this_request
            def cleanup_temp_file(response):
                try:
                    if os_module.path.exists(temp_file):
                        os_module.remove(temp_file)
                        logger.debug(f"[TTS] Cleaned up temp file: {temp_file}")
                except OSError as cleanup_err:
                    logger.warning(f"[TTS] Failed to clean up temp file: {cleanup_err}")
                return response

            return send_file(temp_file, mimetype='audio/wav')
        except (ImportError, RuntimeError, OSError) as e:
            logger.debug(f"[TTS] pyttsx3 unavailable, using browser TTS: {e}")
            return jsonify({'success': True, 'text': text, 'use_browser_tts': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@navigation_bp.route('/voice/command', methods=['POST'])
def voice_command():
    """Parse and execute voice commands."""
    try:
        data = request.json
        command = data.get('command', '').lower().strip()
        lat = float(data.get('lat', 51.5074))
        lon = float(data.get('lon', -0.1278))
        speed_hint = data.get('speed_limit_mph_hint')

        if not command or len(command) > 500:
            return jsonify({'success': False, 'error': 'Invalid command'})

        result = _parse_voice_command(command, lat, lon, speed_limit_mph_hint=speed_hint)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def _parse_voice_command(
    command: str,
    _lat: float,
    _lon: float,
    *,
    speed_limit_mph_hint=None,
) -> Dict[str, Any]:
    """Parse voice command and return action to execute."""
    try:
        command = command.lower().strip()

        if any(cmd in command for cmd in ['navigate to', 'go to', 'take me to']):
            for prefix in ['navigate to ', 'go to ', 'take me to ']:
                if prefix in command:
                    location = command.split(prefix, 1)[1].strip()
                    if location:
                        return {'success': True, 'action': 'navigate', 'location': location, 'message': f'Navigating to {location}'}

        if 'find nearest' in command:
            location_type = command.split('find nearest', 1)[1].strip()
            search_map = {
                'gas station': 'gas station', 'petrol station': 'petrol station',
                'fuel': 'gas station', 'charging station': 'charging station',
                'restaurant': 'restaurant', 'parking': 'parking'
            }
            search_term = location_type
            for key, value in search_map.items():
                if key in location_type:
                    search_term = value
                    break
            return {'success': True, 'action': 'search', 'search_term': search_term, 'message': f'Searching for nearest {search_term}'}

        if any(cmd in command for cmd in ['reroute', 'recalculate', 'find new route']):
            return {'success': True, 'action': 'reroute', 'message': 'Recalculating route from current location'}

        if any(
            phrase in command
            for phrase in (
                'speed limit wrong',
                'wrong speed limit',
                'limit is wrong',
                'posted limit wrong',
                'speed limit is wrong',
                'displayed limit wrong',
                'app has wrong limit',
                'limit shown is wrong',
            )
        ):
            try:
                mph = int(float(speed_limit_mph_hint)) if speed_limit_mph_hint is not None else None
            except (TypeError, ValueError):
                mph = None
            if mph and mph > 0:
                msg = f'Thanks — noted that about {mph} miles per hour may be wrong here. Drive safely.'
            else:
                msg = (
                    'Thanks — noted that the limit shown may be wrong. '
                    'After you stop safely, you can report map details from settings.'
                )
            return {'success': True, 'action': 'reject_speed_display', 'message': msg}

        if any(
            phrase in command
            for phrase in (
                'confirm speed limit',
                'speed limit correct',
                'speed limit is correct',
                'limit is correct',
                'posted limit correct',
            )
        ):
            try:
                mph = int(float(speed_limit_mph_hint)) if speed_limit_mph_hint is not None else None
            except (TypeError, ValueError):
                mph = None
            if mph and mph > 0:
                msg = f'Noted. The app is showing about {mph} miles per hour for this road.'
            else:
                msg = (
                    'Noted. After you stop safely, you can report a map issue from settings; '
                    'the detector uses OpenStreetMap and live services.'
                )
            return {'success': True, 'action': 'confirm_speed_display', 'message': msg}

        if 'report' in command:
            if any(x in command for x in ('speed camera', 'speeding camera', 'gatso', 'mobile camera')):
                return {
                    'success': True,
                    'action': 'report_hazard',
                    'hazard_type': 'speed_camera',
                    'description': command[:240],
                    'message': 'Logging a speed camera report at your current location.',
                }
            if any(x in command for x in ('traffic light camera', 'red light camera')):
                return {
                    'success': True,
                    'action': 'report_hazard',
                    'hazard_type': 'camera_red_light',
                    'description': command[:240],
                    'message': 'Logging a traffic light camera report.',
                }
            if any(x in command for x in ('road closed', 'road closure', 'closure')):
                return {
                    'success': True,
                    'action': 'report_hazard',
                    'hazard_type': 'road_closure',
                    'description': command[:240],
                    'message': 'Logging a road closure report.',
                }
            if ('traffic' in command and 'jam' in command) or 'congestion' in command:
                return {
                    'success': True,
                    'action': 'report_hazard',
                    'hazard_type': 'traffic',
                    'description': command[:240],
                    'message': 'Logging a traffic congestion report.',
                }
            if 'pothole' in command:
                return {
                    'success': True,
                    'action': 'report_hazard',
                    'hazard_type': 'pothole',
                    'description': command[:240],
                    'message': 'Logging a pothole report.',
                }
            if 'accident' in command or 'crash' in command:
                return {
                    'success': True,
                    'action': 'report_hazard',
                    'hazard_type': 'accident',
                    'description': command[:240],
                    'message': 'Logging an accident report.',
                }

        if 'avoid tolls' in command:
            return {'success': True, 'action': 'set_preference', 'preference': 'tolls', 'value': False, 'message': 'Toll avoidance enabled'}

        if 'fastest' in command:
            return {'success': True, 'action': 'set_preference', 'preference': 'route_type', 'value': 'fastest', 'message': 'Fastest route selected'}

        if any(cmd in command for cmd in ["what's my eta", 'eta', 'estimated time']):
            return {'success': True, 'action': 'get_info', 'info_type': 'eta', 'message': 'Getting estimated time of arrival'}

        if any(cmd in command for cmd in ['traffic conditions', 'traffic']):
            return {'success': True, 'action': 'get_info', 'info_type': 'traffic', 'message': 'Getting traffic conditions'}

        return {'success': False, 'error': 'Command not recognized', 'message': 'Sorry, I did not understand that command'}
    except Exception as e:
        return {'success': False, 'error': str(e), 'message': 'Error processing command'}

