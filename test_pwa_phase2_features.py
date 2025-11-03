#!/usr/bin/env python3
"""
Tests for Voyagr PWA Phase 2 Features
Tests: Lane Guidance, Speed Warnings, Search History, Favorite Locations
"""

import pytest
import json
import sqlite3
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voyagr_web import app, init_db, DB_FILE


@pytest.fixture
def client():
    """Create test client."""
    app.config['TESTING'] = True
    
    # Use test database
    test_db = 'test_voyagr_web.db'
    if os.path.exists(test_db):
        os.remove(test_db)
    
    # Temporarily override DB_FILE
    import voyagr_web
    original_db = voyagr_web.DB_FILE
    voyagr_web.DB_FILE = test_db
    
    # Initialize test database
    init_db()
    
    with app.test_client() as client:
        yield client
    
    # Restore original DB
    voyagr_web.DB_FILE = original_db
    if os.path.exists(test_db):
        os.remove(test_db)


class TestSearchHistory:
    """Test search history functionality."""
    
    def test_get_empty_search_history(self, client):
        """Test getting empty search history."""
        response = client.get('/api/search-history')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['history'] == []
    
    def test_add_search_to_history(self, client):
        """Test adding search to history."""
        response = client.post('/api/search-history', 
            json={
                'query': 'London',
                'result_name': 'London, UK',
                'lat': 51.5074,
                'lon': -0.1278
            }
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
    
    def test_retrieve_search_history(self, client):
        """Test retrieving search history."""
        # Add search
        client.post('/api/search-history',
            json={'query': 'Paris', 'result_name': 'Paris, France', 'lat': 48.8566, 'lon': 2.3522}
        )
        
        # Retrieve
        response = client.get('/api/search-history')
        data = json.loads(response.data)
        assert data['success'] is True
        assert len(data['history']) == 1
        assert data['history'][0]['query'] == 'Paris'
    
    def test_clear_search_history(self, client):
        """Test clearing search history."""
        # Add search
        client.post('/api/search-history',
            json={'query': 'Berlin', 'result_name': 'Berlin, Germany', 'lat': 52.52, 'lon': 13.405}
        )
        
        # Clear
        response = client.delete('/api/search-history')
        assert response.status_code == 200
        
        # Verify empty
        response = client.get('/api/search-history')
        data = json.loads(response.data)
        assert len(data['history']) == 0


class TestFavoriteLocations:
    """Test favorite locations functionality."""
    
    def test_get_empty_favorites(self, client):
        """Test getting empty favorites."""
        response = client.get('/api/favorites')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['favorites'] == []
    
    def test_add_favorite_location(self, client):
        """Test adding favorite location."""
        response = client.post('/api/favorites',
            json={
                'name': 'Home',
                'address': '123 Main St',
                'lat': 51.5074,
                'lon': -0.1278,
                'category': 'home'
            }
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'favorite_id' in data
    
    def test_retrieve_favorites(self, client):
        """Test retrieving favorites."""
        # Add favorite
        client.post('/api/favorites',
            json={'name': 'Work', 'address': '456 Office Ave', 'lat': 51.52, 'lon': -0.1, 'category': 'work'}
        )
        
        # Retrieve
        response = client.get('/api/favorites')
        data = json.loads(response.data)
        assert data['success'] is True
        assert len(data['favorites']) == 1
        assert data['favorites'][0]['name'] == 'Work'
    
    def test_remove_favorite(self, client):
        """Test removing favorite location."""
        # Add favorite
        add_response = client.post('/api/favorites',
            json={'name': 'Gym', 'address': '789 Fitness St', 'lat': 51.51, 'lon': -0.12, 'category': 'gym'}
        )
        fav_id = json.loads(add_response.data)['favorite_id']
        
        # Remove
        response = client.delete('/api/favorites',
            json={'id': fav_id}
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True


class TestLaneGuidance:
    """Test lane guidance functionality."""
    
    def test_get_lane_guidance(self, client):
        """Test getting lane guidance."""
        response = client.get('/api/lane-guidance?lat=51.5074&lon=-0.1278&heading=90&maneuver=right')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'current_lane' in data
        assert 'recommended_lane' in data
        assert 'total_lanes' in data
        assert 'lane_change_needed' in data
    
    def test_lane_guidance_straight(self, client):
        """Test lane guidance for straight maneuver."""
        response = client.get('/api/lane-guidance?lat=51.5074&lon=-0.1278&heading=0&maneuver=straight')
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['current_lane'] == data['recommended_lane']
        assert data['lane_change_needed'] is False
    
    def test_lane_guidance_left_turn(self, client):
        """Test lane guidance for left turn."""
        response = client.get('/api/lane-guidance?lat=51.5074&lon=-0.1278&heading=45&maneuver=left')
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'guidance_text' in data


class TestSpeedWarnings:
    """Test speed warning functionality."""
    
    def test_get_speed_warning_compliant(self, client):
        """Test speed warning when compliant."""
        response = client.get('/api/speed-warnings?lat=51.5074&lon=-0.1278&speed=25&road_type=local')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['status'] == 'compliant'
        assert data['color'] == 'green'
    
    def test_get_speed_warning_approaching(self, client):
        """Test speed warning when approaching limit."""
        response = client.get('/api/speed-warnings?lat=51.5074&lon=-0.1278&speed=33&road_type=local')
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['status'] == 'approaching'
        assert data['color'] == 'amber'
    
    def test_get_speed_warning_exceeding(self, client):
        """Test speed warning when exceeding limit."""
        response = client.get('/api/speed-warnings?lat=51.5074&lon=-0.1278&speed=40&road_type=local')
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['status'] == 'exceeding'
        assert data['color'] == 'red'
    
    def test_speed_warning_motorway(self, client):
        """Test speed warning on motorway."""
        response = client.get('/api/speed-warnings?lat=51.5074&lon=-0.1278&speed=75&road_type=motorway')
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['speed_limit_mph'] == 70


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

