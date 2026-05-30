"""
Costs blueprint for Voyagr.

Contains:
- Cost breakdown
- Route comparison
- Cache statistics
- Cost prediction
- Cost optimization
"""

import logging
from flask import Blueprint, jsonify, request

from voyagr.config.rates import resolve_route_cost_params

logger = logging.getLogger(__name__)

costs_bp = Blueprint('costs', __name__)

# Global reference to cost calculator (set by main app)
_cost_calculator = None


def set_cost_calculator(calculator):
    """Set the cost calculator instance."""
    global _cost_calculator
    _cost_calculator = calculator


def get_cost_calculator():
    """Get the cost calculator instance."""
    return _cost_calculator


@costs_bp.route('/cost-breakdown', methods=['POST'])
def get_cost_breakdown():
    """Get detailed cost breakdown for a route."""
    try:
        calculator = get_cost_calculator()
        if not calculator:
            return jsonify({'success': False, 'error': 'Cost calculator not available'})

        data = request.json
        distance_km = float(data.get('distance_km', 0))
        duration_minutes = float(data.get('duration_minutes', 0))
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        cost_params = resolve_route_cost_params(data)
        fuel_efficiency = cost_params['fuel_efficiency']
        fuel_price = cost_params['fuel_price']
        energy_efficiency = cost_params['energy_efficiency']
        electricity_price = cost_params['electricity_price']
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)
        caz_exempt = data.get('caz_exempt', False)

        breakdown = calculator.calculate_detailed_breakdown(
            distance_km, duration_minutes, vehicle_type,
            fuel_efficiency, fuel_price, energy_efficiency,
            electricity_price, include_tolls, include_caz, caz_exempt
        )

        return jsonify({'success': True, 'breakdown': breakdown})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@costs_bp.route('/route-comparison', methods=['POST'])
def compare_routes():
    """Compare multiple routes and provide recommendations."""
    try:
        calculator = get_cost_calculator()
        if not calculator:
            return jsonify({'success': False, 'error': 'Cost calculator not available'})

        data = request.json
        routes = data.get('routes', [])

        if not routes:
            return jsonify({'success': False, 'error': 'No routes provided'})

        comparison = calculator.compare_routes(routes)

        if not comparison:
            return jsonify({'success': False, 'error': 'Unable to compare routes'})

        return jsonify({'success': True, 'comparison': comparison})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@costs_bp.route('/cache-statistics', methods=['GET'])
def get_cache_statistics():
    """Get persistent route cache statistics."""
    try:
        calculator = get_cost_calculator()
        if not calculator:
            return jsonify({'success': False, 'error': 'Cost calculator not available'})

        stats = calculator.get_cache_statistics()
        return jsonify({'success': True, 'statistics': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@costs_bp.route('/cost-prediction', methods=['POST'])
def predict_cost():
    """Predict cost for a route using ML-based estimation."""
    try:
        calculator = get_cost_calculator()
        if not calculator:
            return jsonify({'success': False, 'error': 'Cost calculator not available'})

        data = request.json or {}
        distance_km = float(data.get('distance_km', 0))
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        cost_params = resolve_route_cost_params(data)
        fuel_efficiency = cost_params['fuel_efficiency']
        fuel_price = cost_params['fuel_price']
        energy_efficiency = cost_params['energy_efficiency']
        electricity_price = cost_params['electricity_price']
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)

        prediction = calculator.predict_cost(
            distance_km, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz
        )

        return jsonify({'success': True, 'prediction': prediction})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@costs_bp.route('/cost-optimization', methods=['POST'])
def optimize_route_cost():
    """Get cost optimization suggestions for routes."""
    try:
        calculator = get_cost_calculator()
        if not calculator:
            return jsonify({'success': False, 'error': 'Cost calculator not available'})

        data = request.json or {}
        routes = data.get('routes', [])
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        cost_params = resolve_route_cost_params(data)
        fuel_efficiency = cost_params['fuel_efficiency']
        fuel_price = cost_params['fuel_price']
        energy_efficiency = cost_params['energy_efficiency']
        electricity_price = cost_params['electricity_price']

        if not routes:
            return jsonify({'success': False, 'error': 'No routes provided'})

        optimization = calculator.optimize_route_cost(
            routes, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price
        )

        if not optimization:
            return jsonify({'success': False, 'error': 'Unable to optimize routes'})

        return jsonify({'success': True, 'optimization': optimization})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@costs_bp.route('/alternative-route-cache-info', methods=['GET'])
def get_alternative_route_cache_info():
    """Get cache information for alternative routes."""
    try:
        calculator = get_cost_calculator()
        if not calculator:
            return jsonify({'success': False, 'error': 'Cost calculator not available'})

        start_lat = float(request.args.get('start_lat', 0))
        start_lon = float(request.args.get('start_lon', 0))
        end_lat = float(request.args.get('end_lat', 0))
        end_lon = float(request.args.get('end_lon', 0))

        if start_lat == 0 or start_lon == 0 or end_lat == 0 or end_lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        cache_info = calculator.get_alternative_route_cache_info(
            start_lat, start_lon, end_lat, end_lon
        )

        return jsonify({'success': True, 'cache_info': cache_info})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

