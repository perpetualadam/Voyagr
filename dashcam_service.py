#!/usr/bin/env python3
"""
Dashcam Service for Voyagr PWA
Manages video recording, file storage, metadata tracking, and playback
Supports both standalone recording and navigation-integrated recording
"""

import os
import json
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('dashcam.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class DashcamService:
    """
    Manages dashcam recording, storage, and metadata.
    
    Features:
    - Start/stop recording
    - Metadata tracking (GPS, speed, heading, timestamp)
    - File storage and cleanup
    - Recording history
    - Settings management
    """
    
    def __init__(self, db_path: str = 'voyagr_web.db', storage_dir: str = 'dashcam_recordings'):
        """Initialize dashcam service."""
        self.db_path = db_path
        self.storage_dir = storage_dir
        self.recording_active = False
        self.current_recording_id = None
        self.current_recording_start = None
        self.metadata_buffer = []
        self.lock = threading.Lock()
        
        # Create storage directory if it doesn't exist
        Path(self.storage_dir).mkdir(parents=True, exist_ok=True)
        
        # Default settings
        self.settings = {
            'enabled': True,
            'auto_start_with_navigation': False,
            'auto_stop_with_navigation': True,
            'retention_days': 7,
            'max_storage_gb': 10,
            'resolution': '720p',  # 720p, 1080p, 480p
            'bitrate': '5000k',  # 5000k, 8000k, 3000k
            'fps': 30,
            'audio_enabled': True
        }
        
        logger.info(f"Dashcam service initialized (storage: {self.storage_dir})")
    
    def start_recording(self, trip_id: Optional[str] = None) -> Dict[str, Any]:
        """Start a new recording session."""
        with self.lock:
            if self.recording_active:
                return {'success': False, 'error': 'Recording already active'}
            
            try:
                recording_id = f"dashcam_{int(time.time())}"
                self.current_recording_id = recording_id
                self.current_recording_start = datetime.now()
                self.recording_active = True
                self.metadata_buffer = []
                
                # Store in database
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO dashcam_recordings 
                    (recording_id, trip_id, start_time, status)
                    VALUES (?, ?, ?, ?)
                ''', (recording_id, trip_id, self.current_recording_start.isoformat(), 'recording'))
                conn.commit()
                conn.close()
                
                logger.info(f"Recording started: {recording_id}")
                return {
                    'success': True,
                    'recording_id': recording_id,
                    'start_time': self.current_recording_start.isoformat()
                }
            except Exception as e:
                logger.error(f"Error starting recording: {e}")
                self.recording_active = False
                return {'success': False, 'error': str(e)}
    
    def stop_recording(self) -> Dict[str, Any]:
        """Stop the current recording session."""
        with self.lock:
            if not self.recording_active:
                return {'success': False, 'error': 'No active recording'}
            
            try:
                end_time = datetime.now()
                duration = (end_time - self.current_recording_start).total_seconds()
                
                # Update database
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE dashcam_recordings 
                    SET end_time = ?, status = ?, duration_seconds = ?
                    WHERE recording_id = ?
                ''', (end_time.isoformat(), 'completed', duration, self.current_recording_id))
                conn.commit()
                conn.close()
                
                recording_id = self.current_recording_id
                self.recording_active = False
                self.current_recording_id = None
                self.metadata_buffer = []
                
                logger.info(f"Recording stopped: {recording_id} ({duration:.1f}s)")
                return {
                    'success': True,
                    'recording_id': recording_id,
                    'duration_seconds': duration,
                    'end_time': end_time.isoformat()
                }
            except Exception as e:
                logger.error(f"Error stopping recording: {e}")
                return {'success': False, 'error': str(e)}

    @staticmethod
    def _normalize_extension(extension: Optional[str]) -> str:
        """Map a content type or extension to a safe file suffix."""
        ext = (extension or 'webm').strip().lower()
        if '/' in ext:
            # content-type like video/webm;codecs=vp8
            ext = ext.split(';', 1)[0].split('/', 1)[-1]
        ext = ext.lstrip('.')
        if ext in ('webm', 'mp4', 'ogg'):
            return ext
        return 'webm'

    def _recording_exists(self, recording_id: str) -> bool:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT 1 FROM dashcam_recordings WHERE recording_id = ? LIMIT 1',
            (recording_id,),
        )
        found = cursor.fetchone() is not None
        conn.close()
        return found

    def save_recording_file(
        self,
        recording_id: str,
        file_bytes: bytes,
        extension: Optional[str] = 'webm',
    ) -> Dict[str, Any]:
        """Persist a video blob for a recording and update DB path/size."""
        if not recording_id or not isinstance(recording_id, str):
            return {'success': False, 'error': 'Invalid recording_id'}
        if not isinstance(file_bytes, (bytes, bytearray)) or len(file_bytes) == 0:
            return {'success': False, 'error': 'Empty recording file'}
        if not self._recording_exists(recording_id):
            return {'success': False, 'error': 'Recording not found'}

        try:
            ext = self._normalize_extension(extension)
            Path(self.storage_dir).mkdir(parents=True, exist_ok=True)
            filename = f'{recording_id}.{ext}'
            abs_path = os.path.join(self.storage_dir, filename)
            with open(abs_path, 'wb') as out:
                out.write(file_bytes)

            # Keep sub-MB clips visible (short test / short drive clips).
            size_mb = round(len(file_bytes) / (1024 * 1024), 6)
            if size_mb <= 0 and len(file_bytes) > 0:
                size_mb = 0.000001
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE dashcam_recordings
                SET file_path = ?, file_size_mb = ?
                WHERE recording_id = ?
                ''',
                (abs_path, size_mb, recording_id),
            )
            conn.commit()
            conn.close()

            logger.info(f'Recording file saved: {recording_id} ({size_mb} MB)')
            return {
                'success': True,
                'recording_id': recording_id,
                'file_path': abs_path,
                'file_size_mb': size_mb,
            }
        except Exception as e:
            logger.error(f'Error saving recording file: {e}')
            return {'success': False, 'error': str(e)}

    def _unlink_recording_file(self, file_path: Optional[str]) -> None:
        if not file_path:
            return
        try:
            path = Path(file_path)
            # Only delete files inside our storage directory.
            storage_root = Path(self.storage_dir).resolve()
            resolved = path.resolve()
            if storage_root in resolved.parents or resolved.parent == storage_root:
                if resolved.is_file():
                    resolved.unlink()
        except Exception as e:
            logger.warning(f'Could not delete recording file {file_path}: {e}')
    
    def add_metadata(self, lat: float, lon: float, speed: float, heading: float) -> bool:
        """Add GPS metadata to current recording."""
        if not self.recording_active:
            return False
        
        try:
            metadata = {
                'timestamp': datetime.now().isoformat(),
                'lat': lat,
                'lon': lon,
                'speed': speed,
                'heading': heading
            }
            self.metadata_buffer.append(metadata)
            return True
        except Exception as e:
            logger.error(f"Error adding metadata: {e}")
            return False
    
    def get_recording_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        with self.lock:
            if not self.recording_active:
                return {'recording': False}
            
            elapsed = (datetime.now() - self.current_recording_start).total_seconds()
            return {
                'recording': True,
                'recording_id': self.current_recording_id,
                'elapsed_seconds': elapsed,
                'metadata_points': len(self.metadata_buffer)
            }
    
    def get_recordings(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get list of recordings."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM dashcam_recordings 
                ORDER BY start_time DESC 
                LIMIT ?
            ''', (limit,))
            recordings = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return recordings
        except Exception as e:
            logger.error(f"Error getting recordings: {e}")
            return []
    
    def delete_recording(self, recording_id: str) -> Dict[str, Any]:
        """Delete a recording and its video file if present."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                'SELECT file_path FROM dashcam_recordings WHERE recording_id = ?',
                (recording_id,),
            )
            row = cursor.fetchone()
            if not row:
                conn.close()
                return {'success': False, 'error': 'Recording not found'}
            file_path = row[0]
            cursor.execute('DELETE FROM dashcam_recordings WHERE recording_id = ?', (recording_id,))
            conn.commit()
            conn.close()
            self._unlink_recording_file(file_path)
            logger.info(f"Recording deleted: {recording_id}")
            return {'success': True}
        except Exception as e:
            logger.error(f"Error deleting recording: {e}")
            return {'success': False, 'error': str(e)}
    
    def cleanup_old_recordings(self) -> Dict[str, Any]:
        """Delete recordings older than retention period (DB + files)."""
        try:
            retention_days = self.settings['retention_days']
            cutoff_date = (datetime.now() - timedelta(days=retention_days)).isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT recording_id, file_path FROM dashcam_recordings
                WHERE start_time < ? AND status = 'completed'
            ''', (cutoff_date,))
            stale = cursor.fetchall()
            for _recording_id, file_path in stale:
                self._unlink_recording_file(file_path)
            cursor.execute('''
                DELETE FROM dashcam_recordings 
                WHERE start_time < ? AND status = 'completed'
            ''', (cutoff_date,))
            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()
            
            logger.info(f"Cleanup: deleted {deleted_count} old recordings")
            return {'success': True, 'deleted_count': deleted_count}
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_settings(self) -> Dict[str, Any]:
        """Get dashcam settings."""
        return self.settings.copy()
    
    def update_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Update dashcam settings."""
        try:
            normalized = dict(settings)
            if 'audio' in normalized and 'audio_enabled' not in normalized:
                normalized['audio_enabled'] = bool(normalized.pop('audio'))
            self.settings.update(normalized)
            logger.info(f"Settings updated: {settings}")
            return {'success': True, 'settings': self.settings.copy()}
        except Exception as e:
            logger.error(f"Error updating settings: {e}")
            return {'success': False, 'error': str(e)}

