#!/usr/bin/env python3
"""
Dashcam API Blueprint for Voyagr PWA
Provides REST endpoints for dashcam recording control and management
"""

from flask import Blueprint, request, jsonify
from dashcam_service import DashcamService
import logging

logger = logging.getLogger(__name__)

# Create blueprint
dashcam_bp = Blueprint('dashcam', __name__, url_prefix='/api/dashcam')

# Global dashcam service instance
dashcam_service = None


def init_dashcam_blueprint(app, db_path: str = 'voyagr_web.db'):
    """Initialize dashcam blueprint with Flask app."""
    global dashcam_service
    dashcam_service = DashcamService(db_path=db_path)
    app.register_blueprint(dashcam_bp)
    logger.info("Dashcam blueprint initialized")


@dashcam_bp.route('/start', methods=['POST'])
def start_recording():
    """Start dashcam recording."""
    try:
        data = request.json or {}
        trip_id = data.get('trip_id')
        result = dashcam_service.start_recording(trip_id=trip_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in start_recording: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/stop', methods=['POST'])
def stop_recording():
    """Stop dashcam recording."""
    try:
        result = dashcam_service.stop_recording()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in stop_recording: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/status', methods=['GET'])
def get_status():
    """Get current recording status."""
    try:
        status = dashcam_service.get_recording_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Error in get_status: {e}")
        return jsonify({'error': str(e)}), 500


@dashcam_bp.route('/metadata', methods=['POST'])
def add_metadata():
    """Add GPS metadata to current recording."""
    try:
        data = request.json or {}
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        speed = float(data.get('speed', 0))
        heading = float(data.get('heading', 0))
        
        success = dashcam_service.add_metadata(lat, lon, speed, heading)
        return jsonify({'success': success})
    except Exception as e:
        logger.error(f"Error in add_metadata: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/recordings', methods=['GET'])
def get_recordings():
    """Get list of recordings."""
    try:
        limit = request.args.get('limit', 50, type=int)
        recordings = dashcam_service.get_recordings(limit=limit)
        return jsonify({'success': True, 'recordings': recordings})
    except Exception as e:
        logger.error(f"Error in get_recordings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/recordings/<recording_id>', methods=['DELETE'])
def delete_recording(recording_id):
    """Delete a recording."""
    try:
        result = dashcam_service.delete_recording(recording_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in delete_recording: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/cleanup', methods=['POST'])
def cleanup():
    """Cleanup old recordings."""
    try:
        result = dashcam_service.cleanup_old_recordings()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in cleanup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/settings', methods=['GET'])
def get_settings():
    """Get dashcam settings."""
    try:
        settings = dashcam_service.get_settings()
        return jsonify({'success': True, 'settings': settings})
    except Exception as e:
        logger.error(f"Error in get_settings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/settings', methods=['POST'])
def update_settings():
    """Update dashcam settings."""
    try:
        data = request.json or {}
        result = dashcam_service.update_settings(data)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in update_settings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

