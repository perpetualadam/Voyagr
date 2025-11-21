#!/usr/bin/env python3
"""
Integration Tests for Dashcam Blueprint
Tests API endpoints and Flask integration
"""

import unittest
import tempfile
import os
import json
import sqlite3
from flask import Flask
from dashcam_blueprint import dashcam_bp, init_dashcam_blueprint


class TestDashcamBlueprint(unittest.TestCase):
    """Integration tests for dashcam API endpoints"""
    
    def setUp(self):
        """Set up test Flask app and database"""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        
        # Create Flask app
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        
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
        
        # Initialize dashcam blueprint
        init_dashcam_blueprint(self.app, db_path=self.db_path)
        self.client = self.app.test_client()
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_start_recording_endpoint(self):
        """Test POST /api/dashcam/start"""
        response = self.client.post(
            '/api/dashcam/start',
            data=json.dumps({}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('recording_id', data)
    
    def test_stop_recording_endpoint(self):
        """Test POST /api/dashcam/stop"""
        # Start recording first
        self.client.post(
            '/api/dashcam/start',
            data=json.dumps({}),
            content_type='application/json'
        )

        # Stop recording
        response = self.client.post(
            '/api/dashcam/stop',
            data=json.dumps({}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_status_endpoint(self):
        """Test GET /api/dashcam/status"""
        self.client.post(
            '/api/dashcam/start',
            data=json.dumps({}),
            content_type='application/json'
        )

        response = self.client.get('/api/dashcam/status')
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertTrue(data['recording'])
        self.assertIn('recording_id', data)
    
    def test_metadata_endpoint(self):
        """Test POST /api/dashcam/metadata"""
        start_response = self.client.post(
            '/api/dashcam/start',
            data=json.dumps({}),
            content_type='application/json'
        )
        start_data = json.loads(start_response.data)
        recording_id = start_data['recording_id']

        metadata = {
            'lat': 51.5074,
            'lon': -0.1278,
            'speed': 45.5,
            'heading': 90.0
        }

        response = self.client.post(
            '/api/dashcam/metadata',
            data=json.dumps(metadata),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_recordings_list_endpoint(self):
        """Test GET /api/dashcam/recordings"""
        # Create a recording
        self.client.post('/api/dashcam/start')
        self.client.post('/api/dashcam/stop')
        
        response = self.client.get('/api/dashcam/recordings')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('recordings', data)
        self.assertIsInstance(data['recordings'], list)
    
    def test_delete_recording_endpoint(self):
        """Test DELETE /api/dashcam/recordings/<id>"""
        # Create a recording
        start_response = self.client.post(
            '/api/dashcam/start',
            data=json.dumps({}),
            content_type='application/json'
        )
        start_data = json.loads(start_response.data)
        recording_id = start_data['recording_id']
        self.client.post(
            '/api/dashcam/stop',
            data=json.dumps({}),
            content_type='application/json'
        )

        # Delete it
        response = self.client.delete(f'/api/dashcam/recordings/{recording_id}')
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_cleanup_endpoint(self):
        """Test POST /api/dashcam/cleanup"""
        response = self.client.post('/api/dashcam/cleanup')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('deleted_count', data)
    
    def test_settings_get_endpoint(self):
        """Test GET /api/dashcam/settings"""
        response = self.client.get('/api/dashcam/settings')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('settings', data)
    
    def test_settings_post_endpoint(self):
        """Test POST /api/dashcam/settings"""
        settings = {
            'resolution': '720p',
            'fps': 24,
            'audio': False,
            'retention_days': 7
        }
        
        response = self.client.post(
            '/api/dashcam/settings',
            data=json.dumps(settings),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertTrue(data['success'])


if __name__ == '__main__':
    unittest.main()

