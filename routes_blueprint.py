"""
Flask blueprint for route calculation endpoints.
Refactored from voyagr_web.py to improve maintainability.
"""

from flask import Blueprint, request, jsonify
import time
import polyline
from typing import Dict, List, Optional, Tuple

# Blueprint definition
routes_bp = Blueprint('routes', __name__, url_prefix='/api')


def validate_route_request(data: Dict) -> Tuple[bool, str]:
    """Validate route request parameters.
    
    Args:
        data: Request JSON data
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not data:
        return False, "No request data provided"
    
    start = data.get('start', '').strip()
    end = data.get('end', '').strip()
    
    if not start or not end:
        return False, "Start and end coordinates are required"
    
    return True, ""


def validate_coordinates(coord_str: str) -> Optional[Tuple[float, float]]:
    """Validate and parse coordinate string.
    
    Args:
        coord_str: Coordinate string in format 'lat,lon'
        
    Returns:
        Tuple of (lat, lon) or None if invalid
    """
    try:
        parts = coord_str.strip().split(',')
        if len(parts) != 2:
            return None
        lat = float(parts[0].strip())
        lon = float(parts[1].strip())
        
        # Validate ranges
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        
        return (lat, lon)
    except (ValueError, AttributeError):
        return None


def extract_route_data(path: Dict, distance_km: float, duration_minutes: float,
                      route_type: str, cost_data: Dict) -> Dict:
    """Extract route data from engine response.
    
    Args:
        path: Path data from routing engine
        distance_km: Distance in kilometers
        duration_minutes: Duration in minutes
        route_type: Type of route (Fastest, Shortest, etc.)
        cost_data: Cost calculation data
        
    Returns:
        Formatted route data dict
    """
    return {
        'id': cost_data.get('id', 1),
        'name': route_type,
        'distance_km': round(distance_km, 2),
        'duration_minutes': round(duration_minutes, 0),
        'fuel_cost': round(cost_data.get('fuel_cost', 0), 2),
        'toll_cost': round(cost_data.get('toll_cost', 0), 2),
        'caz_cost': round(cost_data.get('caz_cost', 0), 2),
        'geometry': path.get('geometry')
    }


def build_route_response(routes: List[Dict], source: str, response_time_ms: float,
                        cached: bool = False) -> Dict:
    """Build standardized route response.
    
    Args:
        routes: List of route dicts
        source: Routing engine source
        response_time_ms: Response time in milliseconds
        cached: Whether response was cached
        
    Returns:
        Formatted response dict
    """
    if not routes:
        return {
            'success': False,
            'error': 'No routes found',
            'response_time_ms': response_time_ms
        }
    
    primary_route = routes[0]
    return {
        'success': True,
        'routes': routes,
        'source': source,
        'distance': f'{primary_route["distance_km"]:.2f} km',
        'time': f'{primary_route["duration_minutes"]:.0f} minutes',
        'geometry': primary_route['geometry'],
        'fuel_cost': primary_route['fuel_cost'],
        'toll_cost': primary_route['toll_cost'],
        'caz_cost': primary_route['caz_cost'],
        'response_time_ms': response_time_ms,
        'cached': cached
    }


@routes_bp.route('/route', methods=['POST'])
def calculate_route():
    """Calculate route using available routing engines.
    
    Supports: GraphHopper, Valhalla, OSRM (fallback)
    Mobile-optimized with proper error handling and fallbacks.
    """
    route_start_time = time.time()
    
    try:
        data = request.json
        
        # Validate request
        is_valid, error_msg = validate_route_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error_msg}), 400
        
        # Extract and validate coordinates
        start_coords = validate_coordinates(data.get('start', ''))
        end_coords = validate_coordinates(data.get('end', ''))
        
        if not start_coords or not end_coords:
            return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400
        
        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords
        
        # Extract parameters
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
        
        # TODO: Implement route calculation using routing_manager
        # This is a placeholder for the refactored implementation
        
        return jsonify({
            'success': False,
            'error': 'Route calculation not yet implemented in blueprint'
        }), 501
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@routes_bp.route('/multi-stop-route', methods=['POST'])
def calculate_multi_stop_route():
    """Calculate route with multiple waypoints."""
    try:
        data = request.json
        waypoints = data.get('waypoints', [])
        
        if len(waypoints) < 2:
            return jsonify({'success': False, 'error': 'At least 2 waypoints required'}), 400
        
        # TODO: Implement multi-stop route calculation
        
        return jsonify({
            'success': False,
            'error': 'Multi-stop route calculation not yet implemented'
        }), 501
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

