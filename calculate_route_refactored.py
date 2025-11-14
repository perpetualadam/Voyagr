"""
Refactored calculate_route function for Phase 2 integration.
This module contains the new implementation using service modules.
"""

import time
import polyline
from typing import Dict, Tuple, Optional
from flask import request, jsonify

# Import service modules
from routing_engines import routing_manager
from cost_service import cost_service
from hazard_service import hazard_service


def validate_route_request(data: Dict) -> Tuple[bool, str]:
    """Validate route request parameters."""
    if not data:
        return False, "No request data provided"
    
    start = data.get('start', '').strip()
    end = data.get('end', '').strip()
    
    if not start or not end:
        return False, "Start and end coordinates are required"
    
    return True, ""


def validate_coordinates(coord_str: str) -> Optional[Tuple[float, float]]:
    """Validate and parse coordinate string."""
    try:
        parts = coord_str.strip().split(',')
        if len(parts) != 2:
            return None
        lat = float(parts[0].strip())
        lon = float(parts[1].strip())
        
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        
        return (lat, lon)
    except (ValueError, AttributeError):
        return None


def calculate_route_refactored(route_cache, fallback_optimizer, cost_calculator):
    """
    Refactored calculate_route function using service modules.
    
    This is the new implementation that uses:
    - routing_manager for unified routing engine calls
    - cost_service for cost calculations
    - hazard_service for hazard detection
    
    Args:
        route_cache: Route cache instance
        fallback_optimizer: Fallback optimizer instance
        cost_calculator: Cost calculator instance (for database caching)
    
    Returns:
        Flask response with route data
    """
    route_start_time = time.time()
    
    try:
        data = request.json
        print(f"[ROUTE] Received request: {data}")
        
        # Validate request
        is_valid, error_msg = validate_route_request(data)
        if not is_valid:
            print(f"[VALIDATION] Request validation failed: {error_msg}")
            return jsonify({'success': False, 'error': error_msg}), 400
        
        # Extract parameters
        start = data.get('start', '').strip()
        end = data.get('end', '').strip()
        routing_mode = data.get('routing_mode', 'auto')
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)
        caz_exempt = data.get('caz_exempt', False)
        enable_hazard_avoidance = data.get('enable_hazard_avoidance', False)
        
        # Parse coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)
        if not start_coords or not end_coords:
            return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400
        
        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords
        
        # Check cache
        cached_route = route_cache.get(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type)
        if cached_route:
            print(f"[CACHE] HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
            cached_route['cached'] = True
            cached_route['cache_stats'] = route_cache.get_stats()
            return jsonify(cached_route)
        
        # Fetch hazards if enabled
        hazards = {}
        if enable_hazard_avoidance:
            hazard_start = time.time()
            hazards = hazard_service.fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)
            print(f"[TIMING] Hazard fetch: {(time.time() - hazard_start)*1000:.0f}ms")
        
        print(f"\n[ROUTING] Starting route calculation from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
        
        # Use routing manager to calculate route (handles fallback chain)
        route_data = routing_manager.calculate_route(
            start_lat, start_lon, end_lat, end_lon, routing_mode
        )
        
        if not route_data:
            print("[ROUTING] All routing engines failed")
            return jsonify({
                'success': False,
                'error': 'Unable to calculate route. All routing engines failed.'
            }), 503
        
        # Extract route information
        distance_km = route_data.get('distance_km', 0)
        duration_minutes = route_data.get('duration_minutes', 0)
        geometry = route_data.get('geometry')
        source = route_data.get('source', 'Unknown')
        
        print(f"[ROUTING] SUCCESS: Route from {source}")
        print(f"[ROUTING] Distance: {distance_km:.2f} km, Duration: {duration_minutes:.0f} minutes")
        
        # Calculate costs using cost service
        costs = cost_service.calculate_all_costs(
            distance_km, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt
        )
        
        print(f"[COSTS] Fuel: £{costs['fuel_cost']:.2f}, Toll: £{costs['toll_cost']:.2f}, CAZ: £{costs['caz_cost']:.2f}")
        
        # Build response
        response_data = {
            'success': True,
            'distance': f'{distance_km:.2f} km',
            'time': f'{duration_minutes:.0f} minutes',
            'distance_km': round(distance_km, 2),
            'duration_minutes': round(duration_minutes, 0),
            'fuel_cost': round(costs['fuel_cost'], 2),
            'toll_cost': round(costs['toll_cost'], 2),
            'caz_cost': round(costs['caz_cost'], 2),
            'total_cost': round(costs['total_cost'], 2),
            'geometry': geometry,
            'source': source,
            'response_time_ms': round((time.time() - route_start_time) * 1000, 0),
            'cached': False
        }
        
        # Cache the route
        route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data)
        print(f"[CACHE] STORED: Route cached for future requests")
        
        # Cache to database for long-term storage
        cost_calculator.cache_route_to_db(
            start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
            response_data, source
        )
        print(f"[CACHE] STORED: Route cached in database")
        
        return jsonify(response_data)
    
    except Exception as e:
        print(f"[ERROR] Exception in calculate_route: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

