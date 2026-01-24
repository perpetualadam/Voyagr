"""
Vehicles blueprint for Voyagr.

Contains:
- Vehicle management (GET, POST)
- CAZ pass updates
"""

from flask import Blueprint, jsonify, request

from voyagr.config import CAZ_PASS_TYPES
from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import validate_vehicle_type, rate_limit

vehicles_bp = Blueprint('vehicles', __name__)

# Import rate limiter from main app (will be set during app initialization)
api_limiter = None


def set_api_limiter(limiter):
    """Set the API limiter for this blueprint."""
    global api_limiter
    api_limiter = limiter


@vehicles_bp.route('/vehicles', methods=['GET', 'POST'])
def manage_vehicles():
    """Get or create vehicle profiles."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT id, name, vehicle_type, fuel_efficiency, fuel_price, energy_efficiency, electricity_price, is_caz_exempt, caz_pass_type FROM vehicles')
            vehicles = cursor.fetchall()
            return jsonify({
                'success': True,
                'vehicles': [
                    {
                        'id': v[0], 'name': v[1], 'vehicle_type': v[2],
                        'fuel_efficiency': v[3], 'fuel_price': v[4],
                        'energy_efficiency': v[5], 'electricity_price': v[6],
                        'caz_exempt': v[7],
                        'caz_pass_type': v[8] if len(v) > 8 else 'none'
                    } for v in vehicles
                ]
            })

        else:  # POST - create new vehicle
            data = request.json

            if not data:
                return jsonify({'success': False, 'error': 'Request body is empty'}), 400

            name = data.get('name', '').strip()
            if not name or len(name) < 1 or len(name) > 100:
                return jsonify({'success': False, 'error': 'Vehicle name must be 1-100 characters'}), 400

            vehicle_type = data.get('vehicle_type', 'petrol_diesel')
            if not validate_vehicle_type(vehicle_type):
                return jsonify({'success': False, 'error': f'Invalid vehicle_type: {vehicle_type}'}), 400

            try:
                fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
                fuel_price = float(data.get('fuel_price', 1.40))
                energy_efficiency = float(data.get('energy_efficiency', 18.5))
                electricity_price = float(data.get('electricity_price', 0.30))

                if fuel_efficiency < 0 or fuel_price < 0 or energy_efficiency < 0 or electricity_price < 0:
                    return jsonify({'success': False, 'error': 'Numeric values cannot be negative'}), 400
            except (ValueError, TypeError):
                return jsonify({'success': False, 'error': 'Invalid numeric values'}), 400

            caz_pass_type = data.get('caz_pass_type', 'none')
            valid_passes = [p['id'] for p in CAZ_PASS_TYPES]
            if caz_pass_type not in valid_passes:
                caz_pass_type = 'none'

            cursor.execute('''
                INSERT INTO vehicles (name, vehicle_type, fuel_efficiency, fuel_price,
                                     energy_efficiency, electricity_price, is_caz_exempt, caz_pass_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (name, vehicle_type, fuel_efficiency, fuel_price, energy_efficiency,
                  electricity_price, data.get('caz_exempt', 0), caz_pass_type))
            conn.commit()
            vehicle_id = cursor.lastrowid
            return jsonify({'success': True, 'vehicle_id': vehicle_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)


@vehicles_bp.route('/vehicles/<int:vehicle_id>/caz-pass', methods=['PUT'])
def update_vehicle_caz_pass(vehicle_id: int):
    """Update CAZ pass/exemption for a vehicle."""
    conn = None
    try:
        data = request.get_json()
        caz_pass_type = data.get('caz_pass_type', 'none')

        valid_passes = [p['id'] for p in CAZ_PASS_TYPES]
        if caz_pass_type not in valid_passes:
            return jsonify({'success': False, 'error': f'Invalid CAZ pass type. Valid options: {valid_passes}'})

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE vehicles SET caz_pass_type = ? WHERE id = ?', (caz_pass_type, vehicle_id))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'error': 'Vehicle not found'})

        return jsonify({'success': True, 'message': f'CAZ pass updated to {caz_pass_type}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if conn:
            return_db_connection(conn)

