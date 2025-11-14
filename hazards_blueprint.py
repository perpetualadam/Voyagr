"""
Flask blueprint for hazard management endpoints.
Refactored from voyagr_web.py to improve maintainability.
"""

from flask import Blueprint, request, jsonify
import sqlite3
import time
from typing import Dict, List
from hazard_service import hazard_service

# Blueprint definition
hazards_bp = Blueprint('hazards', __name__, url_prefix='/api')


def get_db_connection(db_file: str = 'voyagr_web.db'):
    """Get database connection."""
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


@hazards_bp.route('/hazard-preferences', methods=['GET', 'POST'])
def hazard_preferences():
    """Get or update hazard preferences."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if request.method == 'GET':
            # Get all hazard preferences
            cursor.execute("SELECT * FROM hazard_preferences")
            prefs = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return jsonify({'success': True, 'preferences': prefs})
        
        elif request.method == 'POST':
            # Update hazard preferences
            data = request.json
            hazard_type = data.get('hazard_type')
            enabled = data.get('enabled', True)
            penalty_seconds = int(data.get('penalty_seconds', 30))
            proximity_threshold = int(data.get('proximity_threshold_meters', 500))
            
            cursor.execute('''
                INSERT OR REPLACE INTO hazard_preferences
                (hazard_type, enabled, penalty_seconds, proximity_threshold_meters)
                VALUES (?, ?, ?, ?)
            ''', (hazard_type, enabled, penalty_seconds, proximity_threshold))
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'message': 'Preferences updated'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@hazards_bp.route('/hazards/add-camera', methods=['POST'])
def add_camera():
    """Add a speed/traffic camera location."""
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        camera_type = data.get('type', 'speed_camera')
        description = data.get('description', '')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO cameras (lat, lon, type, description)
            VALUES (?, ?, ?, ?)
        ''', (lat, lon, camera_type, description))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Camera added successfully'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@hazards_bp.route('/hazards/report', methods=['POST'])
def report_hazard():
    """Report a hazard (community report)."""
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        hazard_type = data.get('hazard_type')
        description = data.get('description', '')
        severity = data.get('severity', 'medium')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Set expiry to 24 hours from now
        expiry_timestamp = int(time.time()) + (24 * 3600)
        
        cursor.execute('''
            INSERT INTO community_hazard_reports
            (lat, lon, hazard_type, description, severity, status, expiry_timestamp)
            VALUES (?, ?, ?, ?, ?, 'active', ?)
        ''', (lat, lon, hazard_type, description, severity, expiry_timestamp))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Hazard reported successfully'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@hazards_bp.route('/hazards/nearby', methods=['GET'])
def get_nearby_hazards():
    """Get hazards near a location."""
    try:
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
        radius_km = float(request.args.get('radius_km', 5))
        
        # Use hazard service to fetch hazards
        hazards = hazard_service.fetch_hazards_for_route(
            lat - radius_km/111, lon - radius_km/111,
            lat + radius_km/111, lon + radius_km/111
        )
        
        return jsonify({
            'success': True,
            'hazards': hazards,
            'location': {'lat': lat, 'lon': lon},
            'radius_km': radius_km
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@hazards_bp.route('/hazards/clear-expired', methods=['POST'])
def clear_expired_hazards():
    """Clear expired community hazard reports."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        current_time = int(time.time())
        cursor.execute('''
            DELETE FROM community_hazard_reports
            WHERE expiry_timestamp < ?
        ''', (current_time,))
        
        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Cleared {deleted_count} expired hazard reports'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

