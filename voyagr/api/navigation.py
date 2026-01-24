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


@navigation_bp.route('/lane-guidance', methods=['GET'])
def get_lane_guidance():
    """Get lane guidance for current location."""
    try:
        heading = float(request.args.get('heading', 0))
        next_maneuver = request.args.get('maneuver', 'straight')

        total_lanes = 3 if heading % 180 < 90 else 2
        current_lane = (int(heading / 90) % total_lanes) + 1

        if next_maneuver == 'left':
            recommended_lane = max(1, current_lane - 1)
        elif next_maneuver == 'right':
            recommended_lane = min(total_lanes, current_lane + 1)
        else:
            recommended_lane = current_lane

        return jsonify({
            'success': True,
            'current_lane': current_lane,
            'recommended_lane': recommended_lane,
            'total_lanes': total_lanes,
            'lane_change_needed': current_lane != recommended_lane,
            'next_maneuver': next_maneuver,
            'guidance_text': f"{'Move to lane ' + str(recommended_lane) if current_lane != recommended_lane else 'Stay in lane ' + str(current_lane)}"
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


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

        result = speed_limit_detector.get_speed_limit_for_location(
            lat=lat, lon=lon, road_type=road_type, vehicle_type=vehicle_type
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

