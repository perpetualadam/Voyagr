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

from voyagr.models import get_db_connection, return_db_connection

logger = logging.getLogger(__name__)

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
    'slight_left': '↖',
    'through': '↑',
    'slight_right': '↗',
    'right': '→',
    'merge_to_left': '↰',
    'merge_to_right': '↱',
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


def _recommend_lane_from_turn_lanes(lane_dirs, maneuver):
    """Given parsed turn:lanes and a maneuver, pick the best lane index (1-based)."""
    if not lane_dirs:
        return None

    maneuver_map = {
        'left': ['left', 'slight_left'],
        'slight_left': ['slight_left', 'left'],
        'right': ['right', 'slight_right'],
        'slight_right': ['slight_right', 'right'],
        'straight': ['through', 'none', ''],
        'exit_right': ['right', 'slight_right', 'merge_to_right'],
        'exit_left': ['left', 'slight_left', 'merge_to_left'],
        'exit': ['right', 'slight_right'],
        'merge': ['through', 'none', ''],
    }

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

    For roundabouts (UK, left-hand traffic):
      Exit 1 (first/left exit)  -> left lane
      Exit 2 (straight on)      -> left lane (2-lane) or middle (3+)
      Exit 3+ (right turn)      -> right lane
    """
    if total_lanes <= 1:
        return 1

    if maneuver == 'roundabout' and roundabout_exit_count > 0:
        if roundabout_exit_count <= 1:
            return 1  # First exit -> left lane
        elif roundabout_exit_count == 2:
            return 1 if total_lanes <= 2 else max(1, (total_lanes + 1) // 2)
        else:
            return total_lanes  # 3rd+ exit -> right lane
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
        heading = float(request.args.get('heading', 0))
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
            recommended_lane = _recommend_lane_from_turn_lanes(parsed_lanes, next_maneuver)

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
        valhalla_speed_limit = request.args.get('valhalla_speed_limit', None)

        result = speed_limit_detector.get_speed_limit_for_location(
            lat=lat, lon=lon, road_type=road_type, vehicle_type=vehicle_type
        )

        if valhalla_speed_limit and result:
            try:
                v_limit = float(valhalla_speed_limit)
                detected = result.get('speed_limit', 0)
                if v_limit > 0 and detected > 0 and abs(v_limit - detected) > 15:
                    result['speed_limit'] = max(detected, int(v_limit))
                    result['source'] = result.get('source', '') + '+valhalla-crossref'
            except (ValueError, TypeError):
                pass

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
        speed_limit_mph = int(data.get('speed_limit_mph', 30))
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
        conn = get_db_connection()
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

        return_db_connection(conn)

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

        if not command or len(command) > 500:
            return jsonify({'success': False, 'error': 'Invalid command'})

        result = _parse_voice_command(command, lat, lon)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def _parse_voice_command(command: str, _lat: float, _lon: float) -> Dict[str, Any]:
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

