#!/usr/bin/env python3
"""
Unit Tests for Dashcam Service
Tests core dashcam functionality: recording, metadata, storage, cleanup
"""

import unittest
import tempfile
import os
import sqlite3
import json
from datetime import datetime, timedelta
from dashcam_service import DashcamService


class TestDashcamService(unittest.TestCase):
    """Unit tests for DashcamService class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        self.storage_dir = os.path.join(self.temp_dir, 'recordings')
        
        # Create database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dashcam_recordings (
                id INTEGER PRIMARY KEY,
                recording_id TEXT UNIQUE NOT NULL,
                trip_id TEXT,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_seconds REAL,
                status TEXT DEFAULT 'recording',
                metadata_points INTEGER DEFAULT 0,
                file_path TEXT,
                file_size_mb REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
        
        self.service = DashcamService(self.db_path, self.storage_dir)
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_service_initialization(self):
        """Test service initializes correctly"""
        self.assertIsNotNone(self.service)
        self.assertEqual(self.service.db_path, self.db_path)
        self.assertEqual(self.service.storage_dir, self.storage_dir)
        self.assertFalse(self.service.recording_active)
    
    def test_start_recording(self):
        """Test starting a recording"""
        result = self.service.start_recording()
        self.assertTrue(result['success'])
        self.assertIn('recording_id', result)
        self.assertTrue(self.service.recording_active)
        self.assertIsNotNone(self.service.current_recording_id)
    
    def test_stop_recording(self):
        """Test stopping a recording"""
        self.service.start_recording()
        result = self.service.stop_recording()
        self.assertTrue(result['success'])
        self.assertFalse(self.service.recording_active)
    
    def test_add_metadata(self):
        """Test adding GPS metadata"""
        self.service.start_recording()

        result = self.service.add_metadata(
            lat=51.5074,
            lon=-0.1278,
            speed=45.5,
            heading=90.0
        )
        self.assertTrue(result)
        self.assertEqual(len(self.service.metadata_buffer), 1)

    def test_stop_recording_persists_gps_metadata(self):
        """GPS points must survive stop via sidecar + metadata_points column."""
        start = self.service.start_recording()
        recording_id = start['recording_id']
        self.service.add_metadata(51.5, -0.12, 30.0, 90.0)
        self.service.add_metadata(51.51, -0.11, 32.0, 95.0)

        stop = self.service.stop_recording()
        self.assertTrue(stop['success'])
        self.assertEqual(stop['metadata_points'], 2)
        self.assertEqual(len(self.service.metadata_buffer), 0)

        meta_path = os.path.join(self.storage_dir, f'{recording_id}.meta.json')
        self.assertTrue(os.path.isfile(meta_path))
        with open(meta_path, 'r', encoding='utf-8') as fh:
            payload = json.load(fh)
        self.assertEqual(len(payload['points']), 2)
        self.assertEqual(payload['points'][0]['lat'], 51.5)

        recordings = self.service.get_recordings()
        match = next(r for r in recordings if r['recording_id'] == recording_id)
        self.assertEqual(match['metadata_points'], 2)

        loaded = self.service.get_recording_metadata(recording_id)
        self.assertTrue(loaded['success'])
        self.assertEqual(loaded['metadata_points'], 2)

    def test_delete_recording_removes_metadata_sidecar(self):
        start = self.service.start_recording()
        recording_id = start['recording_id']
        self.service.add_metadata(51.5, -0.12, 10.0, 0.0)
        self.service.stop_recording()
        meta_path = os.path.join(self.storage_dir, f'{recording_id}.meta.json')
        self.assertTrue(os.path.isfile(meta_path))
        self.service.delete_recording(recording_id)
        self.assertFalse(os.path.isfile(meta_path))
    
    def test_get_recordings(self):
        """Test retrieving recordings list"""
        self.service.start_recording()
        self.service.stop_recording()
        
        recordings = self.service.get_recordings()
        self.assertIsInstance(recordings, list)
        self.assertGreater(len(recordings), 0)
    
    def test_get_recording_status(self):
        """Test getting recording status"""
        self.service.start_recording()
        status = self.service.get_recording_status()

        self.assertTrue(status['recording'])
        self.assertIn('recording_id', status)
        self.assertIn('elapsed_seconds', status)
    
    def test_delete_recording(self):
        """Test deleting a recording"""
        self.service.start_recording()
        recording_id = self.service.current_recording_id
        self.service.stop_recording()
        
        result = self.service.delete_recording(recording_id)
        self.assertTrue(result['success'])

    def test_save_recording_file_persists_bytes_and_db_fields(self):
        """Video bytes must land on disk and update file_path / file_size_mb."""
        start = self.service.start_recording()
        recording_id = start['recording_id']
        self.service.stop_recording()

        payload = b'\x1aE\xdf\xa3fake-webm-bytes'
        result = self.service.save_recording_file(
            recording_id=recording_id,
            file_bytes=payload,
            extension='video/webm',
        )
        self.assertTrue(result['success'])
        self.assertTrue(os.path.isfile(result['file_path']))
        with open(result['file_path'], 'rb') as f:
            self.assertEqual(f.read(), payload)

        recordings = self.service.get_recordings()
        match = next(r for r in recordings if r['recording_id'] == recording_id)
        self.assertEqual(match['file_path'], result['file_path'])
        self.assertGreater(match['file_size_mb'], 0)

    def test_save_recording_file_rejects_unknown_id(self):
        result = self.service.save_recording_file(
            recording_id='dashcam_missing',
            file_bytes=b'abc',
            extension='webm',
        )
        self.assertFalse(result['success'])

    def test_delete_recording_removes_video_file(self):
        start = self.service.start_recording()
        recording_id = start['recording_id']
        self.service.stop_recording()
        saved = self.service.save_recording_file(recording_id, b'video-data', 'webm')
        self.assertTrue(os.path.isfile(saved['file_path']))

        result = self.service.delete_recording(recording_id)
        self.assertTrue(result['success'])
        self.assertFalse(os.path.isfile(saved['file_path']))
    
    def test_cleanup_old_recordings(self):
        """Test cleanup of old recordings"""
        # Create old recording
        self.service.start_recording()
        self.service.stop_recording()

        # Set retention to 0 days to cleanup immediately
        self.service.update_settings({'retention_days': 0})
        result = self.service.cleanup_old_recordings()
        self.assertTrue(result['success'])

    def test_cleanup_old_recordings_removes_files(self):
        start = self.service.start_recording()
        recording_id = start['recording_id']
        self.service.stop_recording()
        saved = self.service.save_recording_file(recording_id, b'old-video', 'webm')
        self.service.update_settings({'retention_days': 0})
        result = self.service.cleanup_old_recordings()
        self.assertTrue(result['success'])
        self.assertGreaterEqual(result['deleted_count'], 1)
        self.assertFalse(os.path.isfile(saved['file_path']))
    
    def test_get_settings(self):
        """Test getting settings"""
        settings = self.service.get_settings()
        self.assertIsInstance(settings, dict)
        self.assertIn('resolution', settings)
        self.assertIn('fps', settings)
        self.assertIn('audio_enabled', settings)
    
    def test_update_settings(self):
        """Test updating settings"""
        new_settings = {
            'resolution': '720p',
            'fps': 24,
            'audio': False,
            'retention_days': 7
        }
        
        result = self.service.update_settings(new_settings)
        self.assertTrue(result['success'])
        
        settings = self.service.get_settings()
        self.assertEqual(settings['resolution'], '720p')
        self.assertEqual(settings['fps'], 24)


if __name__ == '__main__':
    unittest.main()

