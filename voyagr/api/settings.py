"""
Settings blueprint for Voyagr.

Contains:
- App settings management
- Gesture events
- ML predictions
- Traffic patterns
"""

import logging
from datetime import datetime
from flask import Blueprint, jsonify, request

from voyagr.models import get_db_connection, return_db_connection

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/app-settings', methods=['GET', 'POST'])
def manage_app_settings():
    """Manage Phase 3 app settings (gesture, battery, themes, ML)."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT * FROM app_settings LIMIT 1')
            row = cursor.fetchone()
            if row:
                settings = {
                    'gesture_enabled': row[1],
                    'gesture_sensitivity': row[2],
                    'gesture_action': row[3],
                    'battery_saving_mode': row[4],
                    'map_theme': row[5],
                    'ml_predictions_enabled': row[6],
                    'haptic_feedback_enabled': row[7],
                    'distance_unit': row[8] if len(row) > 8 else 'km',
                    'currency_unit': row[9] if len(row) > 9 else 'GBP',
                    'speed_unit': row[10] if len(row) > 10 else 'kmh',
                    'temperature_unit': row[11] if len(row) > 11 else 'celsius'
                }
                return_db_connection(conn)
                return jsonify({'success': True, 'settings': settings})
            return_db_connection(conn)
            return jsonify({'success': False, 'error': 'Settings not found'})

        else:  # POST
            data = request.json
            updates = []
            values = []

            field_map = [
                'gesture_enabled', 'gesture_sensitivity', 'gesture_action',
                'battery_saving_mode', 'map_theme', 'ml_predictions_enabled',
                'distance_unit', 'currency_unit', 'speed_unit', 'temperature_unit'
            ]

            for field in field_map:
                if field in data:
                    updates.append(f'{field} = ?')
                    values.append(data[field])

            if updates:
                query = f"UPDATE app_settings SET {', '.join(updates)}"
                cursor.execute(query, values)
                conn.commit()

            return_db_connection(conn)
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@settings_bp.route('/gesture-event', methods=['POST'])
def log_gesture_event():
    """Log gesture events for analytics."""
    try:
        data = request.json
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO gesture_events (gesture_type, action_triggered)
            VALUES (?, ?)
        ''', (data.get('gesture_type', 'unknown'), data.get('action', 'unknown')))

        conn.commit()
        return_db_connection(conn)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@settings_bp.route('/ml-predictions', methods=['GET', 'POST'])
def manage_ml_predictions():
    """Get ML route predictions based on trip history."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            now = datetime.now()
            day_of_week = now.weekday()
            hour_of_day = now.hour

            cursor.execute('''
                SELECT start_lat, start_lon, end_lat, end_lon, avg_duration_minutes,
                       avg_distance_km, avg_fuel_cost, frequency
                FROM ml_route_predictions
                WHERE day_of_week = ? AND hour_of_day = ?
                ORDER BY frequency DESC LIMIT 5
            ''', (day_of_week, hour_of_day))

            predictions = []
            for row in cursor.fetchall():
                predictions.append({
                    'start_address': f'{row[0]:.4f},{row[1]:.4f}',
                    'end_address': f'{row[2]:.4f},{row[3]:.4f}',
                    'label': f'Route {len(predictions)+1}',
                    'details': f'{row[4]:.0f} min • {row[5]:.1f} km • £{row[6]:.2f}',
                    'frequency': row[7]
                })

            return_db_connection(conn)
            return jsonify({'success': True, 'predictions': predictions})

        else:  # POST
            data = request.json
            now = datetime.now()

            cursor.execute('''
                INSERT OR REPLACE INTO ml_route_predictions
                (start_lat, start_lon, end_lat, end_lon, day_of_week, hour_of_day,
                 frequency, avg_duration_minutes, avg_distance_km, avg_fuel_cost, confidence_score)
                VALUES (?, ?, ?, ?, ?, ?,
                        COALESCE((SELECT frequency FROM ml_route_predictions
                                 WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?), 0) + 1,
                        ?, ?, ?, ?)
            ''', (data['start_lat'], data['start_lon'], data['end_lat'], data['end_lon'],
                  now.weekday(), now.hour,
                  data['start_lat'], data['start_lon'], data['end_lat'], data['end_lon'],
                  data.get('duration_minutes', 0), data.get('distance_km', 0),
                  data.get('fuel_cost', 0), 0.85))

            conn.commit()
            return_db_connection(conn)
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@settings_bp.route('/traffic-patterns', methods=['GET', 'POST'])
def manage_traffic_patterns():
    """Manage ML traffic pattern data."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            lat = request.args.get('lat', type=float)
            lon = request.args.get('lon', type=float)

            if not lat or not lon:
                return jsonify({'success': False, 'error': 'Missing coordinates'})

            cursor.execute('''
                SELECT day_of_week, hour_of_day, congestion_level, avg_speed_kmh
                FROM ml_traffic_patterns
                WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                ORDER BY sample_count DESC
            ''', (lat-0.01, lat+0.01, lon-0.01, lon+0.01))

            patterns = []
            for row in cursor.fetchall():
                patterns.append({
                    'day': row[0],
                    'hour': row[1],
                    'congestion': row[2],
                    'speed': row[3]
                })

            return_db_connection(conn)
            return jsonify({'success': True, 'patterns': patterns})

        else:  # POST
            data = request.json
            now = datetime.now()

            cursor.execute('''
                INSERT INTO ml_traffic_patterns
                (lat, lon, day_of_week, hour_of_day, congestion_level, avg_speed_kmh)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['lat'], data['lon'], now.weekday(), now.hour,
                  data.get('congestion_level', 0), data.get('speed_kmh', 0)))

            conn.commit()
            return_db_connection(conn)
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

