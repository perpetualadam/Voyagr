#!/usr/bin/env python3
"""
Dashcam API Blueprint for Voyagr PWA
Provides REST endpoints for dashcam recording control and management
"""

from flask import Blueprint, request, jsonify, send_file
from dashcam_service import DashcamService
import logging
import os

logger = logging.getLogger(__name__)

# Create blueprint
dashcam_bp = Blueprint('dashcam', __name__, url_prefix='/api/dashcam')

# Global dashcam service instance
dashcam_service = None


def init_dashcam_blueprint(
    app,
    db_path: str = 'voyagr_web.db',
    storage_dir: str = 'dashcam_recordings',
):
    """Initialize dashcam blueprint with Flask app."""
    global dashcam_service
    dashcam_service = DashcamService(db_path=db_path, storage_dir=storage_dir)
    # Avoid double-register when tests re-init on a fresh app with same blueprint object.
    if 'dashcam' not in app.blueprints:
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
        lat = float(data.get('lat', data.get('latitude', 0)))
        lon = float(data.get('lon', data.get('longitude', 0)))
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


@dashcam_bp.route('/recordings/<recording_id>/metadata', methods=['GET'])
def get_recording_metadata(recording_id):
    """Return persisted GPS metadata for a recording."""
    try:
        result = dashcam_service.get_recording_metadata(recording_id)
        status = 200 if result.get('success') else 404
        return jsonify(result), status
    except Exception as e:
        logger.error(f"Error in get_recording_metadata: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/recordings/<recording_id>/video', methods=['GET'])
def get_recording_video(recording_id):
    """Stream a saved dashcam video for playback/download."""
    try:
        result = dashcam_service.get_recording_file(recording_id)
        if not result.get('success'):
            return jsonify(result), 404
        as_attachment = request.args.get('download', '').strip().lower() in (
            '1', 'true', 'yes',
        )
        return send_file(
            result['file_path'],
            mimetype=result['mimetype'],
            as_attachment=as_attachment,
            download_name=result['download_name'],
            conditional=True,
        )
    except Exception as e:
        logger.error(f"Error in get_recording_video: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/recordings/<recording_id>/upload', methods=['POST'])
def upload_recording(recording_id):
    """Upload a recorded video blob for an existing session."""
    try:
        if 'file' not in request.files and not request.get_data():
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        upload = request.files.get('file')
        if upload is not None and upload.filename:
            file_bytes = upload.read()
            content_type = upload.mimetype or upload.content_type or 'video/webm'
        else:
            file_bytes = request.get_data()
            content_type = request.content_type or 'video/webm'

        if not file_bytes:
            return jsonify({'success': False, 'error': 'Empty file'}), 400

        result = dashcam_service.save_recording_file(
            recording_id=recording_id,
            file_bytes=file_bytes,
            extension=content_type,
        )
        status = 200 if result.get('success') else 400
        return jsonify(result), status
    except Exception as e:
        logger.error(f"Error in upload_recording: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashcam_bp.route('/recordings/<recording_id>', methods=['DELETE'])
def delete_recording(recording_id):
    """Delete a recording."""
    try:
        result = dashcam_service.delete_recording(recording_id)
        status = 200 if result.get('success') else 404
        return jsonify(result), status
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

