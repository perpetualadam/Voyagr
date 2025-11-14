#!/usr/bin/env python3
"""
Unit tests for refactored service modules.
Tests: routing_engines, cost_service, hazard_service, database_service
"""

import pytest
import sqlite3
import os
import tempfile
from unittest.mock import Mock, patch, MagicMock

# Import service modules
from routing_engines import (
    RoutingEngineManager, ValhallaEngine, GraphHopperEngine, OSRMEngine
)
from cost_service import CostService
from hazard_service import HazardService
from database_service import DatabasePool, DatabaseService


class TestCostService:
    """Test cost calculation service."""
    
    def test_calculate_fuel_cost(self):
        """Test fuel cost calculation."""
        cost = CostService.calculate_fuel_cost(
            distance_km=100,
            fuel_efficiency=6.5,
            fuel_price=1.40
        )
        expected = (100 / 100) * 6.5 * 1.40
        assert abs(cost - expected) < 0.01
    
    def test_calculate_energy_cost(self):
        """Test EV energy cost calculation."""
        cost = CostService.calculate_energy_cost(
            distance_km=100,
            energy_efficiency=18.5,
            electricity_price=0.30
        )
        expected = (100 / 100) * 18.5 * 0.30
        assert abs(cost - expected) < 0.01
    
    def test_calculate_toll_cost(self):
        """Test toll cost calculation."""
        cost = CostService.calculate_toll_cost(
            distance_km=100,
            route_type='motorway'
        )
        expected = 100 * 0.15  # £0.15 per km
        assert abs(cost - expected) < 0.01
    
    def test_calculate_caz_cost(self):
        """Test CAZ cost calculation."""
        # Test with CAZ charge
        cost = CostService.calculate_caz_cost(
            distance_km=100,
            vehicle_type='petrol_diesel',
            is_exempt=False
        )
        assert cost > 0
        
        # Test with exemption
        cost_exempt = CostService.calculate_caz_cost(
            distance_km=100,
            vehicle_type='petrol_diesel',
            is_exempt=True
        )
        assert cost_exempt == 0.0
    
    def test_calculate_all_costs(self):
        """Test comprehensive cost calculation."""
        costs = CostService.calculate_all_costs(
            distance_km=100,
            vehicle_type='petrol_diesel',
            fuel_efficiency=6.5,
            fuel_price=1.40,
            energy_efficiency=18.5,
            electricity_price=0.30,
            include_tolls=True,
            include_caz=True,
            caz_exempt=False
        )
        
        assert 'fuel_cost' in costs
        assert 'toll_cost' in costs
        assert 'caz_cost' in costs
        assert 'total_cost' in costs
        assert costs['total_cost'] > 0


class TestHazardService:
    """Test hazard detection service."""
    
    def test_distance_calculation(self):
        """Test Haversine distance calculation."""
        # London to Manchester (approx 262km)
        distance = HazardService.get_distance_between_points(
            51.5074, -0.1278,  # London
            53.4808, -2.2426   # Manchester
        )
        # Should be approximately 262km (262,000 meters)
        assert 250000 < distance < 270000
    
    def test_distance_same_point(self):
        """Test distance between same point."""
        distance = HazardService.get_distance_between_points(
            51.5074, -0.1278,
            51.5074, -0.1278
        )
        assert distance < 1  # Should be very close to 0


class TestDatabaseService:
    """Test database service."""
    
    @pytest.fixture
    def temp_db(self):
        """Create temporary database."""
        fd, path = tempfile.mkstemp(suffix='.db')
        os.close(fd)
        yield path
        if os.path.exists(path):
            os.remove(path)
    
    def test_database_pool_initialization(self, temp_db):
        """Test database pool initialization."""
        pool = DatabasePool(temp_db, pool_size=3)
        assert len(pool.connections) == 3
        pool.close_all()
    
    def test_database_service_query(self, temp_db):
        """Test database query execution."""
        pool = DatabasePool(temp_db, pool_size=2)
        service = DatabaseService(pool)
        
        # Create test table
        with pool.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE test (
                    id INTEGER PRIMARY KEY,
                    name TEXT
                )
            ''')
            conn.commit()
        
        # Test insert
        success = service.execute_update(
            "INSERT INTO test (name) VALUES (?)",
            ("Test",)
        )
        assert success
        
        # Test query
        results = service.execute_query("SELECT * FROM test")
        assert len(results) == 1
        assert results[0]['name'] == 'Test'
        
        pool.close_all()
    
    def test_database_service_batch(self, temp_db):
        """Test batch operations."""
        pool = DatabasePool(temp_db, pool_size=2)
        service = DatabaseService(pool)
        
        # Create test table
        with pool.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE test (
                    id INTEGER PRIMARY KEY,
                    name TEXT
                )
            ''')
            conn.commit()
        
        # Test batch insert
        success = service.execute_batch(
            "INSERT INTO test (name) VALUES (?)",
            [("Test1",), ("Test2",), ("Test3",)]
        )
        assert success
        
        # Verify
        results = service.execute_query("SELECT * FROM test")
        assert len(results) == 3
        
        pool.close_all()


class TestRoutingEngineManager:
    """Test routing engine manager."""
    
    @patch('routing_engines.requests.get')
    @patch('routing_engines.requests.post')
    def test_routing_manager_fallback(self, mock_post, mock_get):
        """Test fallback chain in routing manager."""
        manager = RoutingEngineManager()
        
        # Mock all engines to fail
        mock_get.side_effect = Exception("Connection failed")
        mock_post.side_effect = Exception("Connection failed")
        
        result = manager.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
        assert result is None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

