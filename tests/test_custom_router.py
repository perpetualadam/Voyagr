#!/usr/bin/env python3
"""
Test suite for custom routing engine
"""

import unittest
import os
import sys
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.instructions import InstructionGenerator
from custom_router.costs import CostCalculator
from custom_router.cache import RouteCache

class TestRoadNetwork(unittest.TestCase):
    """Test road network graph."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.db_file = 'data/uk_router.db'
        if os.path.exists(self.db_file):
            self.graph = RoadNetwork(self.db_file)
    
    def test_graph_loads(self):
        """Test that graph loads from database."""
        if not os.path.exists(self.db_file):
            self.skipTest("Database not found")
        
        self.assertGreater(len(self.graph.nodes), 0)
        self.assertGreater(len(self.graph.ways), 0)
    
    def test_haversine_distance(self):
        """Test Haversine distance calculation."""
        # London to Manchester: ~265 km
        distance = RoadNetwork.haversine_distance(
            (51.5074, -0.1278),  # London
            (53.4808, -2.2426)   # Manchester
        )
        
        # Should be approximately 265 km
        self.assertGreater(distance, 260000)
        self.assertLess(distance, 270000)
    
    def test_find_nearest_node(self):
        """Test finding nearest node."""
        if not os.path.exists(self.db_file):
            self.skipTest("Database not found")
        
        # Find nearest node to London
        node = self.graph.find_nearest_node(51.5074, -0.1278)
        self.assertIsNotNone(node)
        self.assertIn(node, self.graph.nodes)


class TestRouter(unittest.TestCase):
    """Test routing algorithm."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.db_file = 'data/uk_router.db'
        if os.path.exists(self.db_file):
            self.graph = RoadNetwork(self.db_file)
            self.router = Router(self.graph)
    
    def test_route_calculation(self):
        """Test basic route calculation."""
        if not os.path.exists(self.db_file):
            self.skipTest("Database not found")
        
        # London to Manchester
        route = self.router.route(51.5074, -0.1278, 53.4808, -2.2426)
        
        self.assertIsNotNone(route)
        self.assertIn('distance_km', route)
        self.assertIn('duration_minutes', route)
        self.assertIn('polyline', route)
        
        # Distance should be ~265 km
        self.assertGreater(route['distance_km'], 200)
        self.assertLess(route['distance_km'], 350)


class TestInstructions(unittest.TestCase):
    """Test turn instruction generation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.db_file = 'data/uk_router.db'
        if os.path.exists(self.db_file):
            self.graph = RoadNetwork(self.db_file)
            self.gen = InstructionGenerator(self.graph)
    
    def test_bearing_calculation(self):
        """Test bearing calculation."""
        # North
        bearing = InstructionGenerator.calculate_bearing(
            (0, 0), (1, 0)
        )
        self.assertLess(bearing, 0.1)  # Should be ~0
        
        # East
        bearing = InstructionGenerator.calculate_bearing(
            (0, 0), (0, 1)
        )
        self.assertGreater(bearing, 1.5)  # Should be ~π/2
    
    def test_maneuver_detection(self):
        """Test maneuver detection."""
        # Straight
        maneuver = InstructionGenerator.detect_maneuver(0, 0)
        self.assertEqual(maneuver, 'continue')
        
        # Left turn
        maneuver = InstructionGenerator.detect_maneuver(0, 0.5)
        self.assertIn('left', maneuver)
        
        # Right turn
        maneuver = InstructionGenerator.detect_maneuver(0, -0.5)
        self.assertIn('right', maneuver)


class TestCostCalculator(unittest.TestCase):
    """Test cost calculation."""
    
    def test_fuel_cost(self):
        """Test fuel cost calculation."""
        # 100 km, 6.5 L/100km, £1.40/L
        cost = CostCalculator.calculate_fuel_cost(100, 'petrol_diesel', 6.5, 1.40)
        self.assertAlmostEqual(cost, 9.1, places=1)
    
    def test_toll_cost(self):
        """Test toll cost calculation."""
        # 100 km motorway at £0.15/km
        cost = CostCalculator.calculate_toll_cost(100, 'motorway', True)
        self.assertAlmostEqual(cost, 15.0, places=1)
    
    def test_caz_cost(self):
        """Test CAZ cost calculation."""
        # 100 km = 2 CAZ entries at £8 each
        cost = CostCalculator.calculate_caz_cost(100, 'petrol_diesel', True, False)
        self.assertAlmostEqual(cost, 16.0, places=1)
    
    def test_total_cost(self):
        """Test total cost calculation."""
        costs = CostCalculator.calculate_total_cost(
            100, 'petrol_diesel', 6.5, 1.40, True, True, False, 'motorway'
        )
        
        self.assertIn('fuel_cost', costs)
        self.assertIn('toll_cost', costs)
        self.assertIn('caz_cost', costs)
        self.assertIn('total_cost', costs)
        
        # Total should be ~40 (9.1 + 15 + 16)
        self.assertGreater(costs['total_cost'], 35)
        self.assertLess(costs['total_cost'], 45)


class TestRouteCache(unittest.TestCase):
    """Test route caching."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.cache = RouteCache(max_size=100)
    
    def test_cache_set_get(self):
        """Test cache set and get."""
        start = (51.5074, -0.1278)
        end = (53.4808, -2.2426)
        route = {'distance_km': 265, 'duration_minutes': 240}
        
        self.cache.set(start, end, route)
        cached = self.cache.get(start, end)
        
        self.assertIsNotNone(cached)
        self.assertEqual(cached['distance_km'], 265)
    
    def test_cache_miss(self):
        """Test cache miss."""
        start = (51.5074, -0.1278)
        end = (53.4808, -2.2426)
        
        cached = self.cache.get(start, end)
        self.assertIsNone(cached)
    
    def test_cache_lru(self):
        """Test LRU eviction."""
        cache = RouteCache(max_size=2)
        
        cache.set((0, 0), (1, 1), {'test': 1})
        cache.set((2, 2), (3, 3), {'test': 2})
        cache.set((4, 4), (5, 5), {'test': 3})
        
        # First entry should be evicted
        self.assertIsNone(cache.get((0, 0), (1, 1)))
        self.assertIsNotNone(cache.get((2, 2), (3, 3)))
        self.assertIsNotNone(cache.get((4, 4), (5, 5)))


if __name__ == '__main__':
    unittest.main()

