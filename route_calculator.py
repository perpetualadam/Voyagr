"""
Refactored route calculation logic.
Consolidates duplicate code from calculate_route and calculate_multi_stop_route.
"""

import time
import polyline
from typing import Dict, List, Optional, Tuple
from routing_engines import routing_manager
from cost_service import cost_service


class RouteCalculator:
    """Handles route calculation with unified interface."""
    
    def __init__(self, route_cache=None, cost_calculator=None, fallback_optimizer=None):
        """Initialize route calculator.
        
        Args:
            route_cache: Route cache instance
            cost_calculator: Cost calculator instance (legacy)
            fallback_optimizer: Fallback chain optimizer instance
        """
        self.route_cache = route_cache
        self.cost_calculator = cost_calculator
        self.fallback_optimizer = fallback_optimizer
    
    def calculate_route(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float,
                       routing_mode: str = 'auto',
                       vehicle_type: str = 'petrol_diesel',
                       fuel_efficiency: float = 6.5,
                       fuel_price: float = 1.40,
                       energy_efficiency: float = 18.5,
                       electricity_price: float = 0.30,
                       include_tolls: bool = True,
                       include_caz: bool = True,
                       caz_exempt: bool = False) -> Optional[Dict]:
        """Calculate route between two points.
        
        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            routing_mode: Routing mode (auto, pedestrian, bicycle)
            vehicle_type: Type of vehicle
            fuel_efficiency: Fuel efficiency in L/100km
            fuel_price: Fuel price in GBP/L
            energy_efficiency: Energy efficiency in kWh/100km
            electricity_price: Electricity price in GBP/kWh
            include_tolls: Whether to include toll costs
            include_caz: Whether to include CAZ costs
            caz_exempt: Whether vehicle is CAZ exempt
            
        Returns:
            Route response dict or None if failed
        """
        route_start_time = time.time()
        
        # Check cache first
        if self.route_cache:
            cached_route = self.route_cache.get(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type)
            if cached_route:
                cached_route['cached'] = True
                return cached_route
        
        # Calculate route using routing manager
        route_data = routing_manager.calculate_route(
            start_lat, start_lon, end_lat, end_lon, routing_mode
        )
        
        if not route_data:
            return None
        
        # Extract route information
        distance_km = route_data.get('distance_km', 0)
        duration_minutes = route_data.get('duration_minutes', 0)
        geometry = route_data.get('geometry')
        source = route_data.get('source', 'Unknown')
        
        # Calculate costs
        costs = cost_service.calculate_all_costs(
            distance_km, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt
        )
        
        # Build response
        response_time_ms = (time.time() - route_start_time) * 1000
        response = {
            'success': True,
            'routes': [{
                'id': 1,
                'name': 'Fastest',
                'distance_km': round(distance_km, 2),
                'duration_minutes': round(duration_minutes, 0),
                'fuel_cost': costs['fuel_cost'],
                'toll_cost': costs['toll_cost'],
                'caz_cost': costs['caz_cost'],
                'geometry': geometry
            }],
            'source': f'{source} ✅',
            'distance': f'{distance_km:.2f} km',
            'time': f'{duration_minutes:.0f} minutes',
            'geometry': geometry,
            'fuel_cost': costs['fuel_cost'],
            'toll_cost': costs['toll_cost'],
            'caz_cost': costs['caz_cost'],
            'response_time_ms': response_time_ms,
            'cached': False
        }
        
        # Cache the route
        if self.route_cache:
            self.route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response)
        
        # Record success in fallback optimizer
        if self.fallback_optimizer:
            self.fallback_optimizer.record_success(source.split()[0].lower(), response_time_ms)
        
        return response
    
    def calculate_multi_stop_route(self, waypoints: List[Tuple[float, float]],
                                  routing_mode: str = 'auto',
                                  vehicle_type: str = 'petrol_diesel',
                                  fuel_efficiency: float = 6.5,
                                  fuel_price: float = 1.40,
                                  energy_efficiency: float = 18.5,
                                  electricity_price: float = 0.30,
                                  include_tolls: bool = True,
                                  include_caz: bool = True,
                                  caz_exempt: bool = False) -> Optional[Dict]:
        """Calculate route with multiple waypoints.
        
        Args:
            waypoints: List of (lat, lon) tuples
            routing_mode: Routing mode
            vehicle_type: Type of vehicle
            fuel_efficiency: Fuel efficiency
            fuel_price: Fuel price
            energy_efficiency: Energy efficiency
            electricity_price: Electricity price
            include_tolls: Whether to include tolls
            include_caz: Whether to include CAZ
            caz_exempt: Whether CAZ exempt
            
        Returns:
            Multi-stop route response dict or None if failed
        """
        if len(waypoints) < 2:
            return None
        
        total_distance = 0
        total_duration = 0
        all_geometries = []
        
        # Calculate route between each pair of waypoints
        for i in range(len(waypoints) - 1):
            start_lat, start_lon = waypoints[i]
            end_lat, end_lon = waypoints[i + 1]
            
            route_data = routing_manager.calculate_route(
                start_lat, start_lon, end_lat, end_lon, routing_mode
            )
            
            if not route_data:
                return None
            
            total_distance += route_data.get('distance_km', 0)
            total_duration += route_data.get('duration_minutes', 0)
            all_geometries.append(route_data.get('geometry'))
        
        # Calculate total costs
        costs = cost_service.calculate_all_costs(
            total_distance, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt
        )
        
        return {
            'success': True,
            'distance_km': round(total_distance, 2),
            'duration_minutes': round(total_duration, 0),
            'fuel_cost': costs['fuel_cost'],
            'toll_cost': costs['toll_cost'],
            'caz_cost': costs['caz_cost'],
            'geometries': all_geometries,
            'waypoint_count': len(waypoints)
        }


# Global instance
route_calculator = RouteCalculator()

