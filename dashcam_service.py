#!/usr/bin/env python3
"""
Dashcam Service for Voyagr PWA
Manages video recording, file storage, metadata tracking, and playback
Supports both standalone recording and navigation-integrated recording
"""

import os
from contextlib import contextmanager
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

# Default ceiling for dashcam video uploads (overridable via DASHCAM_MAX_UPLOAD_BYTES).
DEFAULT_DASHCAM_MAX_UPLOAD_BYTES = 200 * 1024 * 1024
DEFAULT_API_MAX_CONTENT_BYTES = 1 * 1024 * 1024


def resolve_max_content_length_bytes(
    max_content_length_bytes: Optional[str] = None,
    dashcam_max_upload_bytes: Optional[str] = None,
) -> int:
    """
    Resolve Flask MAX_CONTENT_LENGTH.

    JSON APIs stay small by default, but dashcam video uploads need a larger
    ceiling. Explicit env values win; invalid values fall back to defaults.
    """
    def _parse(raw: Optional[str], default: int) -> int:
        if raw is None or str(raw).strip() == '':
            return default
        try:
            return int(str(raw).strip())
        except (TypeError, ValueError):
            return default

    api_max = _parse(max_content_length_bytes, DEFAULT_API_MAX_CONTENT_BYTES)
    dashcam_max = _parse(dashcam_max_upload_bytes, DEFAULT_DASHCAM_MAX_UPLOAD_BYTES)
    return max(64 * 1024, api_max, dashcam_max)


class DashcamService:
    """Owner-bound local storage. Active sessions/settings/metadata survive workers.

    An unbound instance cannot access resources; bind only to server-verified identity.
    """
    DEFAULT_SETTINGS = {
        'enabled': True, 'auto_start_with_navigation': False,
        'auto_stop_with_navigation': True, 'retention_days': 7, 'max_storage_gb': 10,
        'resolution': '720p', 'bitrate': '5000k', 'fps': 30, 'audio_enabled': True,
    }

    def __init__(self, db_path='voyagr_web.db', storage_dir='dashcam_recordings', *, owner_user_id=None):
        self.db_path = db_path
        self.storage_dir = str(Path(storage_dir).absolute())
        self.owner_user_id = owner_user_id
        Path(self.storage_dir).mkdir(parents=True, exist_ok=True, mode=0o700)
        # Schema setup is idempotent, including standalone/local service users.
        from dashcam_schema import ensure_dashcam_schema
        with self._db() as conn:
            ensure_dashcam_schema(conn)

    def for_owner(self, owner_user_id):
        # Keep request identity out of shared globals. No per-user process cache.
        import copy
        bound = copy.copy(self)
        bound.owner_user_id = owner_user_id
        bound._require_owner()
        return bound

    def _require_owner(self):
        if not isinstance(self.owner_user_id, str) or not self.owner_user_id.strip():
            raise PermissionError('Authenticated owner required')

    @contextmanager
    def _db(self):
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _owner_dir(self):
        import hashlib
        self._require_owner()
        root = Path(self.storage_dir).resolve()
        path = root / hashlib.sha256(self.owner_user_id.encode()).hexdigest()
        if path.is_symlink():
            raise ValueError('Invalid storage path')
        path.mkdir(mode=0o700, exist_ok=True)
        return path

    def _safe_path(self, path):
        path = Path(path)
        owner_dir = self._owner_dir()
        if path.is_symlink() or path.resolve().parent != owner_dir:
            raise ValueError('Invalid storage path')
        return path

    def _metadata_path(self, recording_id):
        if not self._valid_id(recording_id):
            raise ValueError('Invalid recording identifier')
        return str(self._safe_path(self._owner_dir() / (recording_id + '.meta.json')))

    @staticmethod
    def _valid_id(recording_id):
        import re
        return isinstance(recording_id, str) and bool(re.fullmatch(r'[A-Za-z0-9_-]{1,100}', recording_id))

    def _row(self, conn, recording_id):
        self._require_owner()
        if not self._valid_id(recording_id):
            return None
        return conn.execute('SELECT * FROM dashcam_recordings WHERE recording_id=? AND owner_user_id=?',
                            (recording_id, self.owner_user_id)).fetchone()

    def _active(self, conn):
        self._require_owner()
        return conn.execute("SELECT * FROM dashcam_recordings WHERE owner_user_id=? AND status='recording'",
                            (self.owner_user_id,)).fetchone()

    @property
    def recording_active(self):
        with self._db() as conn:
            return self._active(conn) is not None

    @property
    def current_recording_id(self):
        with self._db() as conn:
            row = self._active(conn)
            return row['recording_id'] if row else None

    @property
    def metadata_buffer(self):
        rid = self.current_recording_id
        return self.get_recording_metadata(rid).get('points', []) if rid else []

    @property
    def settings(self):
        return self.get_settings()

    def start_recording(self, trip_id=None):
        import uuid
        self._require_owner()
        rid = 'dashcam_' + uuid.uuid4().hex
        now = datetime.now().isoformat()
        with self._db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            if self._active(conn):
                return {'success': False, 'error': 'Recording already active'}
            # A supplied trip reference must also belong to this owner.
            if trip_id is not None:
                if not conn.execute('SELECT 1 FROM trips WHERE id=? AND user_id=?',
                                    (trip_id, self.owner_user_id)).fetchone():
                    return {'success': False, 'error': 'Trip not found'}
            conn.execute("INSERT INTO dashcam_recordings(recording_id,owner_user_id,trip_id,start_time,status) VALUES(?,?,?,?, 'recording')",
                         (rid, self.owner_user_id, trip_id, now))
        return {'success': True, 'recording_id': rid, 'start_time': now}

    def _atomic_write(self, path, content):
        import tempfile
        path = self._safe_path(path)
        fd, temp = tempfile.mkstemp(dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as out:
                out.write(content)
            os.replace(temp, path)  # Never follow an existing file symlink.
        finally:
            if os.path.exists(temp):
                os.unlink(temp)

    def stop_recording(self, recording_id=None):
        with self._db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = self._row(conn, recording_id) if recording_id is not None else self._active(conn)
            if not row or row['status'] != 'recording':
                return {'success': False, 'error': 'Recording not found'}
            rid = row['recording_id']
            points = self.get_recording_metadata(rid)['points']
            self._atomic_write(self._metadata_path(rid), json.dumps({'recording_id': rid, 'points': points}).encode())
            end = datetime.now()
            duration = max(0, (end - datetime.fromisoformat(row['start_time'])).total_seconds())
            conn.execute("UPDATE dashcam_recordings SET end_time=?,duration_seconds=?,metadata_points=?,status='completed' WHERE recording_id=? AND owner_user_id=?",
                         (end.isoformat(), duration, len(points), rid, self.owner_user_id))
        return {'success': True, 'recording_id': rid, 'duration_seconds': duration,
                'end_time': end.isoformat(), 'metadata_points': len(points)}

    def add_metadata(self, lat, lon, speed, heading, recording_id=None):
        import math
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lat, lon, speed, heading)):
            return False
        if abs(lat) > 90 or abs(lon) > 180 or speed < 0 or not 0 <= heading <= 360:
            return False
        with self._db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = self._row(conn, recording_id) if recording_id is not None else self._active(conn)
            if not row or row['status'] != 'recording':
                return False
            conn.execute('INSERT INTO dashcam_metadata(recording_id,timestamp,lat,lon,speed,heading) VALUES(?,?,?,?,?,?)',
                         (row['recording_id'], datetime.now().isoformat(), lat, lon, speed, heading))
            conn.execute('UPDATE dashcam_recordings SET metadata_points=metadata_points+1 WHERE recording_id=? AND owner_user_id=?',
                         (row['recording_id'], self.owner_user_id))
        return True

    def get_recording_metadata(self, recording_id):
        with self._db() as conn:
            if not self._row(conn, recording_id):
                return {'success': False, 'error': 'Recording not found'}
            points = [dict(r) for r in conn.execute('SELECT timestamp,lat,lon,speed,heading FROM dashcam_metadata WHERE recording_id=? ORDER BY id', (recording_id,))]
        return {'success': True, 'recording_id': recording_id, 'points': points, 'metadata_points': len(points)}

    def get_recording_status(self):
        with self._db() as conn:
            row = self._active(conn)
            if not row:
                return {'recording': False}
            return {'recording': True, 'recording_id': row['recording_id'],
                    'elapsed_seconds': max(0, (datetime.now()-datetime.fromisoformat(row['start_time'])).total_seconds()),
                    'metadata_points': row['metadata_points']}

    def get_recordings(self, limit=50):
        self._require_owner()
        with self._db() as conn:
            return [dict(r) for r in conn.execute('SELECT * FROM dashcam_recordings WHERE owner_user_id=? ORDER BY start_time DESC LIMIT ?',
                                                  (self.owner_user_id, max(1, min(int(limit), 100))))]

    @staticmethod
    def _normalize_extension(extension):
        ext = (extension or 'webm').lower().split(';')[0].split('/')[-1].lstrip('.')
        return ext if ext in ('webm', 'mp4', 'ogg') else 'webm'

    def save_recording_file(self, recording_id, file_bytes, extension='webm'):
        with self._db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = self._row(conn, recording_id)
            if not row:
                return {'success': False, 'error': 'Recording not found'}
            if not isinstance(file_bytes, (bytes, bytearray)) or not file_bytes:
                return {'success': False, 'error': 'Empty recording file'}
            path = self._owner_dir() / (recording_id + '.' + self._normalize_extension(extension))
            self._atomic_write(path, file_bytes)
            size = max(0.000001, round(len(file_bytes)/(1024*1024), 6))
            conn.execute('UPDATE dashcam_recordings SET file_path=?,file_size_mb=? WHERE recording_id=? AND owner_user_id=?',
                         (str(path), size, recording_id, self.owner_user_id))
        return {'success': True, 'recording_id': recording_id, 'file_path': str(path), 'file_size_mb': size}

    def get_recording_file(self, recording_id):
        with self._db() as conn:
            row = self._row(conn, recording_id)
            if not row or not row['file_path']:
                return {'success': False, 'error': 'Recording not found'}
            try:
                path = self._safe_path(row['file_path'])
            except ValueError:
                return {'success': False, 'error': 'Recording not found'}
            if not path.is_file():
                return {'success': False, 'error': 'Recording not found'}
            mime = {'webm':'video/webm','mp4':'video/mp4','ogg':'video/ogg'}.get(path.suffix[1:], 'application/octet-stream')
            return {'success': True, 'recording_id': recording_id, 'file_path': str(path),
                    'mimetype': mime, 'download_name': path.name}

    def delete_recording(self, recording_id):
        with self._db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = self._row(conn, recording_id)
            if not row:
                return {'success': False, 'error': 'Recording not found'}
            for raw in (row['file_path'], self._metadata_path(recording_id)):
                if raw:
                    try:
                        self._safe_path(raw).unlink(missing_ok=True)
                    except ValueError:
                        pass  # Never touch a path outside this owner's directory.
            conn.execute('DELETE FROM dashcam_recordings WHERE recording_id=? AND owner_user_id=?', (recording_id, self.owner_user_id))
        return {'success': True}

    def cleanup_old_recordings(self):
        cutoff = (datetime.now()-timedelta(days=self.get_settings()['retention_days'])).isoformat()
        with self._db() as conn:
            rows = conn.execute("SELECT recording_id FROM dashcam_recordings WHERE owner_user_id=? AND start_time<? AND status='completed'",
                                (self.owner_user_id, cutoff)).fetchall()
        count = sum(self.delete_recording(r['recording_id'])['success'] for r in rows)
        return {'success': True, 'deleted_count': count}

    def get_settings(self):
        self._require_owner()
        with self._db() as conn:
            row = conn.execute('SELECT settings_json FROM dashcam_user_settings WHERE owner_user_id=?', (self.owner_user_id,)).fetchone()
        return {**self.DEFAULT_SETTINGS, **(json.loads(row[0]) if row else {})}

    def update_settings(self, settings):
        normalized = {k:v for k,v in settings.items() if k in self.DEFAULT_SETTINGS}
        if 'audio' in settings:
            normalized['audio_enabled'] = bool(settings['audio'])
        if 'retention_days' in normalized:
            days = normalized['retention_days']
            if not isinstance(days, int) or isinstance(days, bool) or not 0 <= days <= 365:
                return {'success': False, 'error': 'Invalid retention_days'}
        updated = {**self.get_settings(), **normalized}
        with self._db() as conn:
            conn.execute('INSERT INTO dashcam_user_settings(owner_user_id,settings_json) VALUES(?,?) ON CONFLICT(owner_user_id) DO UPDATE SET settings_json=excluded.settings_json',
                         (self.owner_user_id, json.dumps(updated)))
        return {'success': True, 'settings': updated}
