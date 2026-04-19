"""
Trips blueprint for Voyagr.

Contains:
- Trip history (GET, POST, DELETE)
- Trip analytics
"""

import logging
from typing import Optional, Any
from flask import Blueprint, jsonify, request

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import sanitize_string, validate_routing_mode, require_private_user
from voyagr.utils.entitlements import require_promo_premium_if_enforced

logger = logging.getLogger(__name__)

trips_bp = Blueprint('trips', __name__)


@trips_bp.route('/trip-history', methods=['GET', 'POST'])
@trips_bp.route('/trip-history/<int:trip_id>', methods=['DELETE'])
@require_private_user
def trip_history(trip_id: Optional[int] = None, _jwt_claims: Any = None) -> Any:
    """Get, save, or delete trip history."""
    conn = None
    try:
        user_id = (_jwt_claims or {}).get("sub") if isinstance(_jwt_claims, dict) else None
        if not user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('''
                SELECT
                    id,
                    start_lat, start_lon, start_address,
                    end_lat, end_lon, end_address,
                    distance_km, duration_minutes,
                    fuel_cost, toll_cost, caz_cost,
                    routing_mode, timestamp
                FROM trips
                WHERE user_id = ?
                ORDER BY timestamp DESC
                LIMIT 50
            ''', (user_id,))
            trips = cursor.fetchall()
            return jsonify({
                'success': True,
                'trips': [
                    {
                        'id': t[0], 'start_lat': t[1], 'start_lon': t[2], 'start_address': t[3],
                        'end_lat': t[4], 'end_lon': t[5], 'end_address': t[6],
                        'distance_km': t[7], 'duration_minutes': t[8],
                        'fuel_cost': t[9], 'toll_cost': t[10], 'caz_cost': t[11],
                        'routing_mode': t[12], 'timestamp': t[13]
                    } for t in trips
                ]
            })

        elif request.method == 'POST':
            data = request.json

            if not data:
                return jsonify({'success': False, 'error': 'Request body is empty'}), 400

            try:
                start_lat = float(data.get('start_lat'))
                start_lon = float(data.get('start_lon'))
                end_lat = float(data.get('end_lat'))
                end_lon = float(data.get('end_lon'))
                distance_km = float(data.get('distance_km', 0))
                duration_minutes = float(data.get('duration_minutes', 0))

                if start_lat < -90 or start_lat > 90 or start_lon < -180 or start_lon > 180:
                    return jsonify({'success': False, 'error': 'Invalid start coordinates'}), 400

                if end_lat < -90 or end_lat > 90 or end_lon < -180 or end_lon > 180:
                    return jsonify({'success': False, 'error': 'Invalid end coordinates'}), 400

                if distance_km < 0 or duration_minutes < 0:
                    return jsonify({'success': False, 'error': 'Distance and duration cannot be negative'}), 400
            except (ValueError, TypeError, KeyError) as e:
                return jsonify({'success': False, 'error': f'Invalid trip data: {str(e)}'}), 400

            routing_mode = data.get('routing_mode', 'auto')
            if not validate_routing_mode(routing_mode):
                return jsonify({'success': False, 'error': f'Invalid routing_mode: {routing_mode}'}), 400

            start_address = sanitize_string(data.get('start_address', ''), max_length=200) or ''
            end_address = sanitize_string(data.get('end_address', ''), max_length=200) or ''

            cursor.execute('''
                INSERT INTO trips (user_id, start_lat, start_lon, start_address, end_lat, end_lon,
                                  end_address, distance_km, duration_minutes, fuel_cost,
                                  toll_cost, caz_cost, routing_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, start_lat, start_lon, start_address,
                  end_lat, end_lon, end_address,
                  distance_km, duration_minutes, data.get('fuel_cost', 0),
                  data.get('toll_cost', 0), data.get('caz_cost', 0), routing_mode))
            conn.commit()
            trip_id = cursor.lastrowid
            return jsonify({'success': True, 'trip_id': trip_id})

        elif request.method == 'DELETE':
            cursor.execute('DELETE FROM trips WHERE id = ? AND user_id = ?', (trip_id, user_id))
            conn.commit()
            return jsonify({'success': True, 'message': f'Trip {trip_id} deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@trips_bp.route('/trip-analytics', methods=['GET'])
@require_private_user
@require_promo_premium_if_enforced
def get_trip_analytics(_jwt_claims: Any = None):
    """Get trip analytics and statistics"""
    conn = None
    try:
        user_id = (_jwt_claims or {}).get("sub") if isinstance(_jwt_claims, dict) else None
        if not user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        conn = get_db_connection()
        cursor = conn.cursor()
        stats = cursor.execute('''
            SELECT
                COUNT(*) as total_trips,
                SUM(distance_km) as total_distance,
                SUM(duration_minutes) as total_time,
                AVG(duration_minutes) as avg_duration,
                SUM(fuel_cost) as total_fuel_cost,
                SUM(toll_cost) as total_toll_cost,
                SUM(caz_cost) as total_caz_cost
            FROM trips
            WHERE user_id = ?
        ''', (user_id,)).fetchone()

        total_trips = stats[0] or 0
        total_distance = stats[1] or 0
        total_time = stats[2] or 0
        avg_duration = stats[3] or 0
        total_fuel_cost = stats[4] or 0
        total_toll_cost = stats[5] or 0
        total_caz_cost = stats[6] or 0

        total_cost = total_fuel_cost + total_toll_cost + total_caz_cost
        avg_speed = (total_distance / (total_time / 60)) if total_time > 0 else 0

        cursor.execute('''
            SELECT
                start_address, end_address,
                COUNT(*) as trip_count,
                AVG(distance_km) as avg_distance,
                AVG(fuel_cost + toll_cost + caz_cost) as avg_cost
            FROM trips
            WHERE user_id = ?
            GROUP BY start_address, end_address
            ORDER BY trip_count DESC
            LIMIT 5
        ''', (user_id,))
        frequent_routes = cursor.fetchall()

        routes_list = []
        for route in frequent_routes:
            routes_list.append({
                'start': route[0],
                'end': route[1],
                'count': route[2],
                'avg_distance': route[3],
                'avg_cost': route[4]
            })

        return jsonify({
            'success': True,
            'total_trips': total_trips,
            'total_distance_km': total_distance,
            'total_time_minutes': total_time,
            'avg_duration': round(avg_duration, 0),
            'total_cost': total_cost,
            'total_fuel_cost': total_fuel_cost,
            'total_toll_cost': total_toll_cost,
            'total_caz_cost': total_caz_cost,
            'avg_speed': avg_speed,
            'frequent_routes': routes_list
        })
    except Exception as e:
        logger.error(f"Error fetching trip analytics: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)

