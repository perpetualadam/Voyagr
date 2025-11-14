"""
Flask blueprint for vehicle management endpoints.
Refactored from voyagr_web.py to improve maintainability.
"""

from flask import Blueprint, request, jsonify
import sqlite3
from typing import Dict, Optional

# Blueprint definition
vehicles_bp = Blueprint('vehicles', __name__, url_prefix='/api')


def get_db_connection(db_file: str = 'voyagr_web.db'):
    """Get database connection."""
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


@vehicles_bp.route('/vehicles', methods=['GET', 'POST'])
def manage_vehicles():
    """Get or create vehicle profiles."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if request.method == 'GET':
            # Get all vehicles
            cursor.execute("SELECT * FROM vehicles")
            vehicles = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return jsonify({'success': True, 'vehicles': vehicles})
        
        elif request.method == 'POST':
            # Create new vehicle
            data = request.json
            vehicle_type = data.get('vehicle_type', 'petrol_diesel')
            fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
            fuel_price = float(data.get('fuel_price', 1.40))
            energy_efficiency = float(data.get('energy_efficiency', 18.5))
            electricity_price = float(data.get('electricity_price', 0.30))
            
            cursor.execute('''
                INSERT INTO vehicles (vehicle_type, fuel_efficiency, fuel_price, energy_efficiency, electricity_price)
                VALUES (?, ?, ?, ?, ?)
            ''', (vehicle_type, fuel_efficiency, fuel_price, energy_efficiency, electricity_price))
            
            conn.commit()
            vehicle_id = cursor.lastrowid
            conn.close()
            
            return jsonify({
                'success': True,
                'vehicle_id': vehicle_id,
                'message': 'Vehicle created successfully'
            })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@vehicles_bp.route('/vehicles/<int:vehicle_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_vehicle(vehicle_id: int):
    """Get, update, or delete a specific vehicle."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if request.method == 'GET':
            # Get vehicle details
            cursor.execute("SELECT * FROM vehicles WHERE id = ?", (vehicle_id,))
            vehicle = cursor.fetchone()
            conn.close()
            
            if not vehicle:
                return jsonify({'success': False, 'error': 'Vehicle not found'}), 404
            
            return jsonify({'success': True, 'vehicle': dict(vehicle)})
        
        elif request.method == 'PUT':
            # Update vehicle
            data = request.json
            
            cursor.execute('''
                UPDATE vehicles SET
                    vehicle_type = ?,
                    fuel_efficiency = ?,
                    fuel_price = ?,
                    energy_efficiency = ?,
                    electricity_price = ?
                WHERE id = ?
            ''', (
                data.get('vehicle_type'),
                float(data.get('fuel_efficiency', 6.5)),
                float(data.get('fuel_price', 1.40)),
                float(data.get('energy_efficiency', 18.5)),
                float(data.get('electricity_price', 0.30)),
                vehicle_id
            ))
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'message': 'Vehicle updated successfully'})
        
        elif request.method == 'DELETE':
            # Delete vehicle
            cursor.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'message': 'Vehicle deleted successfully'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@vehicles_bp.route('/vehicles/<int:vehicle_id>/set-default', methods=['POST'])
def set_default_vehicle(vehicle_id: int):
    """Set a vehicle as default."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if vehicle exists
        cursor.execute("SELECT id FROM vehicles WHERE id = ?", (vehicle_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'error': 'Vehicle not found'}), 404
        
        # Update default vehicle in settings
        cursor.execute('''
            INSERT OR REPLACE INTO app_settings (key, value)
            VALUES ('default_vehicle_id', ?)
        ''', (vehicle_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Default vehicle set successfully'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

