#!/usr/bin/env python3
"""
Dashcam API Blueprint for Voyagr PWA
Provides REST endpoints for dashcam recording control and management
"""

from flask import Blueprint, request, jsonify, send_file, g, current_app
from voyagr.utils.dashcam_auth import authenticate_dashcam_request
from dashcam_service import DashcamService
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Create blueprint
dashcam_bp = Blueprint('dashcam', __name__, url_prefix='/api/dashcam')

# Global dashcam service instance
dashcam_service = None


@dashcam_bp.before_request
def require_dashcam_identity():
    denial = authenticate_dashcam_request()
    if denial is not None:
        return denial
    g.dashcam_service = current_app.extensions['voyagr_dashcam'].for_owner(g.dashcam_owner_user_id)


@dashcam_bp.after_request
def private_dashcam_response(response):
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['Vary'] = 'Authorization'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


def service():
    return g.dashcam_service


def init_dashcam_blueprint(
    app,
    db_path: str = 'voyagr_web.db',
    storage_dir: str = 'dashcam_recordings',
):
    """Initialize dashcam blueprint with Flask app."""
    global dashcam_service
    if app.static_folder and Path(storage_dir).resolve().is_relative_to(Path(app.static_folder).resolve()):
        raise ValueError('Dashcam storage must not be publicly served as static files')
    dashcam_service = DashcamService(db_path=db_path, storage_dir=storage_dir)
    app.extensions['voyagr_dashcam'] = dashcam_service
    # Avoid double-register when tests re-init on a fresh app with same blueprint object.
    if 'dashcam' not in app.blueprints:
        app.register_blueprint(dashcam_bp)
    logger.info("Dashcam blueprint initialized")


@dashcam_bp.route('/start', methods=['POST'])
def start_recording():
    """Start dashcam recording."""
    try:
        data = request.get_json(silent=True) or {}
        trip_id = data.get('trip_id')
        result = service().start_recording(trip_id=trip_id)
        return jsonify(result)
    except Exception as e:
        logger.error("Dashcam operation failed: start_recording (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/stop', methods=['POST'])
def stop_recording():
    """Stop dashcam recording."""
    try:
        result = service().stop_recording(recording_id=(request.get_json(silent=True) or {}).get('recording_id'))
        return jsonify(result), (200 if result.get('success') else 404)
    except Exception as e:
        logger.error("Dashcam operation failed: stop_recording (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/status', methods=['GET'])
def get_status():
    """Get current recording status."""
    try:
        status = service().get_recording_status()
        return jsonify(status)
    except Exception as e:
        logger.error("Dashcam operation failed: get_status (%s)", type(e).__name__)
        return jsonify({'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/metadata', methods=['POST'])
def add_metadata():
    """Add GPS metadata to current recording."""
    try:
        data = request.get_json(silent=True) or {}
        lat = float(data.get('lat', data.get('latitude', 0)))
        lon = float(data.get('lon', data.get('longitude', 0)))
        speed = float(data.get('speed', 0))
        heading = float(data.get('heading', 0))
        
        success = service().add_metadata(lat, lon, speed, heading, recording_id=data.get('recording_id'))
        return jsonify({'success': success}), (200 if success else 404)
    except Exception as e:
        logger.error("Dashcam operation failed: add_metadata (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/recordings', methods=['GET'])
def get_recordings():
    """Get list of recordings."""
    try:
        limit = request.args.get('limit', 50, type=int)
        recordings = service().get_recordings(limit=limit)
        for recording in recordings:
            recording['has_video'] = bool(recording.pop('file_path', None))
            recording.pop('owner_user_id', None)
        return jsonify({'success': True, 'recordings': recordings})
    except Exception as e:
        logger.error("Dashcam operation failed: get_recordings (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/recordings/<recording_id>/metadata', methods=['GET'])
def get_recording_metadata(recording_id):
    """Return persisted GPS metadata for a recording."""
    try:
        result = service().get_recording_metadata(recording_id)
        status = 200 if result.get('success') else 404
        return jsonify(result), status
    except Exception as e:
        logger.error("Dashcam operation failed: get_recording_metadata (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/recordings/<recording_id>/video', methods=['GET'])
def get_recording_video(recording_id):
    """Stream a saved dashcam video for playback/download."""
    try:
        result = service().get_recording_file(recording_id)
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
        logger.error("Dashcam operation failed: get_recording_video (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/recordings/<recording_id>/upload', methods=['POST'])
def upload_recording(recording_id):
    """Upload a recorded video blob for an existing session."""
    try:
        if not service()._valid_id(recording_id):
            return jsonify(success=False, error='Recording not found'), 404
        with service()._db() as conn:
            if not service()._row(conn, recording_id):
                return jsonify(success=False, error='Recording not found'), 404
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

        result = service().save_recording_file(
            recording_id=recording_id,
            file_bytes=file_bytes,
            extension=content_type,
        )
        result.pop('file_path', None)
        status = 200 if result.get('success') else 400
        return jsonify(result), status
    except Exception as e:
        logger.error("Dashcam operation failed: upload_recording (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/recordings/<recording_id>', methods=['DELETE'])
def delete_recording(recording_id):
    """Delete a recording."""
    try:
        result = service().delete_recording(recording_id)
        status = 200 if result.get('success') else 404
        return jsonify(result), status
    except Exception as e:
        logger.error("Dashcam operation failed: delete_recording (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/cleanup', methods=['POST'])
def cleanup():
    """Cleanup old recordings."""
    try:
        result = service().cleanup_old_recordings()
        return jsonify(result)
    except Exception as e:
        logger.error("Dashcam operation failed: cleanup (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/settings', methods=['GET'])
def get_settings():
    """Get dashcam settings."""
    try:
        settings = service().get_settings()
        return jsonify({'success': True, 'settings': settings})
    except Exception as e:
        logger.error("Dashcam operation failed: get_settings (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500


@dashcam_bp.route('/settings', methods=['POST'])
def update_settings():
    """Update dashcam settings."""
    try:
        data = request.get_json(silent=True) or {}
        result = service().update_settings(data)
        return jsonify(result)
    except Exception as e:
        logger.error("Dashcam operation failed: update_settings (%s)", type(e).__name__)
        return jsonify({'success': False, 'error': 'Dashcam operation failed'}), 500

