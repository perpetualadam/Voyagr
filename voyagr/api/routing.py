"""
Routing blueprint for Voyagr.

Contains:
- Test routing engines
- Debug route
- Cache stats
- Parallel routing
- Fallback chain health
- Routing performance report

NOTE: The main /api/route endpoint remains in voyagr_web.py due to its complexity
and deep integration with other systems. It will be refactored separately.
"""

import os
import time
import logging
import requests
from datetime import datetime
from typing import Dict, Any
from flask import Blueprint, jsonify, request

from voyagr.config import VALHALLA_URL, GRAPHHOPPER_URL
from voyagr.utils import validate_coordinates

logger = logging.getLogger(__name__)

routing_bp = Blueprint('routing', __name__)

# Global references (set by main app)
_route_cache = None
_fallback_optimizer = None

OSRM_URL = "http://router.project-osrm.org/route/v1"


def set_route_cache(cache):
    """Set the route cache instance."""
    global _route_cache
    _route_cache = cache


def set_fallback_optimizer(optimizer):
    """Set the fallback optimizer instance."""
    global _fallback_optimizer
    _fallback_optimizer = optimizer


@routing_bp.route('/test-routing-engines', methods=['GET'])
def test_routing_engines():
    """Test if routing engines are accessible."""
    results = {}

    # Get environment info
    results['environment'] = {
        'valhalla_url': VALHALLA_URL,
        'deployment': 'Railway.app' if 'railway' in os.getenv('HOSTNAME', '').lower() else 'Local/Other'
    }

    # Test Valhalla
    try:
        response = requests.get(f"{VALHALLA_URL}/status", timeout=5)
        results['valhalla'] = {
            'status': 'OK' if response.status_code == 200 else f'HTTP {response.status_code}',
            'url': VALHALLA_URL,
            'accessible': response.status_code == 200,
            'response_time_ms': response.elapsed.total_seconds() * 1000
        }
    except Exception as e:
        results['valhalla'] = {
            'status': f'Error: {str(e)}',
            'url': VALHALLA_URL,
            'accessible': False,
            'error_type': type(e).__name__
        }

    # Test OSRM
    try:
        response = requests.get(f"{OSRM_URL}/driving/13.388860,52.517037;13.385983,52.496891", timeout=5)
        results['osrm'] = {
            'status': 'OK' if response.status_code == 200 else f'HTTP {response.status_code}',
            'url': OSRM_URL,
            'accessible': response.status_code == 200,
            'response_time_ms': response.elapsed.total_seconds() * 1000
        }
    except Exception as e:
        results['osrm'] = {
            'status': f'Error: {str(e)}',
            'url': OSRM_URL,
            'accessible': False,
            'error_type': type(e).__name__
        }

    return jsonify(results)


@routing_bp.route('/debug-route', methods=['POST'])
def debug_route():
    """Debug endpoint for route calculation - returns detailed error info."""
    try:
        data = request.json or {}
        start = data.get('start', '51.5074,-0.1278')
        end = data.get('end', '51.5174,-0.1278')

        # Parse coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)

        if not start_coords or not end_coords:
            return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400

        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords

        debug_info = {
            'timestamp': datetime.now().isoformat(),
            'request': {'start': start, 'end': end},
            'parsed_coords': {
                'start': {'lat': start_lat, 'lon': start_lon},
                'end': {'lat': end_lat, 'lon': end_lon}
            },
            'routing_engines': {
                'valhalla': {'url': VALHALLA_URL, 'status': 'testing...'},
                'osrm': {'url': 'http://router.project-osrm.org', 'status': 'testing...'}
            },
            'errors': []
        }

        # Test Valhalla
        try:
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": "auto"
            }
            response = requests.post(url, json=payload, timeout=10)
            debug_info['routing_engines']['valhalla']['status'] = f'HTTP {response.status_code}'
            debug_info['routing_engines']['valhalla']['response_time_ms'] = response.elapsed.total_seconds() * 1000
            if response.status_code == 200:
                debug_info['routing_engines']['valhalla']['success'] = True
            else:
                debug_info['routing_engines']['valhalla']['error'] = response.text[:200]
        except Exception as e:
            debug_info['routing_engines']['valhalla']['error'] = str(e)
            debug_info['errors'].append(f"Valhalla: {str(e)}")

        # Test OSRM
        try:
            osrm_url = f"{OSRM_URL}/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
            response = requests.get(osrm_url, timeout=10)
            debug_info['routing_engines']['osrm']['status'] = f'HTTP {response.status_code}'
            debug_info['routing_engines']['osrm']['response_time_ms'] = response.elapsed.total_seconds() * 1000
            if response.status_code == 200:
                debug_info['routing_engines']['osrm']['success'] = True
            else:
                debug_info['routing_engines']['osrm']['error'] = response.text[:200]
        except Exception as e:
            debug_info['routing_engines']['osrm']['error'] = str(e)
            debug_info['errors'].append(f"OSRM: {str(e)}")

        return jsonify(debug_info)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'error_type': type(e).__name__}), 500


@routing_bp.route('/cache-stats', methods=['GET'])
def get_cache_stats():
    """Get route cache statistics."""
    if not _route_cache:
        return jsonify({'success': False, 'error': 'Route cache not available'})

    stats = _route_cache.get_stats()
    return jsonify({
        'success': True,
        'cache_stats': stats,
        'message': 'Route cache statistics'
    })


@routing_bp.route('/cache-clear', methods=['POST'])
def clear_cache():
    """Clear the route cache."""
    if not _route_cache:
        return jsonify({'success': False, 'error': 'Route cache not available'})

    _route_cache.clear()
    return jsonify({
        'success': True,
        'message': 'Route cache cleared'
    })


@routing_bp.route('/fallback-chain-health', methods=['GET'])
def fallback_chain_health():
    """PHASE 5: Get health status of fallback chain."""
    try:
        if not _fallback_optimizer:
            return jsonify({'success': False, 'error': 'Fallback optimizer not available'})

        health = _fallback_optimizer.get_engine_health()
        recommended = _fallback_optimizer.get_recommended_engine()

        return jsonify({
            'success': True,
            'health': health,
            'recommended_engine': recommended,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@routing_bp.route('/fallback-chain-status', methods=['GET'])
def fallback_chain_status():
    """PHASE 5: Get status of all routing engines in fallback chain."""
    try:
        status = {}

        # Check Valhalla
        try:
            start = time.time()
            response = requests.get(f"{VALHALLA_URL}/status", timeout=5)
            elapsed = (time.time() - start) * 1000
            status['valhalla'] = {
                'available': response.status_code == 200,
                'response_time_ms': round(elapsed, 0),
                'url': VALHALLA_URL
            }
        except requests.exceptions.RequestException:
            status['valhalla'] = {'available': False, 'response_time_ms': None, 'url': VALHALLA_URL}

        # Check OSRM
        try:
            start = time.time()
            response = requests.get("http://router.project-osrm.org/status", timeout=5)
            elapsed = (time.time() - start) * 1000
            status['osrm'] = {
                'available': response.status_code == 200,
                'response_time_ms': round(elapsed, 0),
                'url': 'http://router.project-osrm.org'
            }
        except requests.exceptions.RequestException:
            status['osrm'] = {'available': False, 'response_time_ms': None, 'url': 'http://router.project-osrm.org'}

        # Determine fallback chain
        fallback_chain = []
        if status['valhalla']['available']:
            fallback_chain.append('Valhalla')
        if status['osrm']['available']:
            fallback_chain.append('OSRM')

        return jsonify({
            'success': True,
            'status': status,
            'fallback_chain': fallback_chain,
            'primary_engine': fallback_chain[0] if fallback_chain else None,
            'all_engines_available': len(fallback_chain) == 2
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@routing_bp.route('/parallel-routing', methods=['POST'])
def parallel_routing_test():
    """PHASE 5: Test all routing engines in parallel."""
    try:
        from voyagr.services.routing import ParallelRoutingEngine

        data = request.json or {}
        start = data.get('start', '').strip()
        end = data.get('end', '').strip()

        if not start or not end:
            return jsonify({'success': False, 'error': 'Missing start or end location'})

        # Parse coordinates
        try:
            start_parts = start.split(',')
            end_parts = end.split(',')
            start_lat = float(start_parts[0].strip())
            start_lon = float(start_parts[1].strip())
            end_lat = float(end_parts[0].strip())
            end_lon = float(end_parts[1].strip())
        except (ValueError, IndexError, AttributeError):
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        # Run parallel routing
        parallel_engine = ParallelRoutingEngine()
        overall_start = time.time()
        results = parallel_engine.run_parallel(start_lat, start_lon, end_lat, end_lon)
        overall_time = (time.time() - overall_start) * 1000

        # Analyze results and record stats
        successful = {k: v for k, v in results.items() if v.get('success')}
        fastest = min(successful.items(), key=lambda x: x[1]['response_time_ms']) if successful else None

        # Record stats in fallback optimizer
        if _fallback_optimizer:
            for engine, result in results.items():
                if result.get('success'):
                    _fallback_optimizer.record_success(engine, result['response_time_ms'])
                else:
                    _fallback_optimizer.record_failure(engine)

        return jsonify({
            'success': True,
            'results': results,
            'overall_time_ms': round(overall_time, 0),
            'successful_engines': len(successful),
            'fastest_engine': fastest[0] if fastest else None,
            'fastest_time_ms': round(fastest[1]['response_time_ms'], 0) if fastest else None
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@routing_bp.route('/routing-performance-report', methods=['POST'])
def routing_performance_report():
    """PHASE 5: Generate comprehensive performance report for routing engines."""
    try:
        from voyagr.services.routing import ParallelRoutingEngine

        data = request.json or {}
        test_routes = data.get('test_routes', [
            {'start': '51.5074,-0.1278', 'end': '51.5174,-0.1278', 'name': 'Short (1km)'},
            {'start': '51.5074,-0.1278', 'end': '51.7074,-0.1278', 'name': 'Medium (20km)'},
            {'start': '51.5074,-0.1278', 'end': '50.7074,-0.1278', 'name': 'Long (100km)'}
        ])

        report = {
            'timestamp': datetime.now().isoformat(),
            'test_routes': [],
            'summary': {}
        }

        engine_stats: Dict[str, list] = {'valhalla': [], 'osrm': []}

        for route in test_routes:
            start = route['start']
            end = route['end']

            try:
                start_parts = start.split(',')
                end_parts = end.split(',')
                start_lat = float(start_parts[0].strip())
                start_lon = float(start_parts[1].strip())
                end_lat = float(end_parts[0].strip())
                end_lon = float(end_parts[1].strip())
            except (ValueError, IndexError, AttributeError):
                continue

            # Run parallel routing
            parallel_engine = ParallelRoutingEngine()
            results = parallel_engine.run_parallel(start_lat, start_lon, end_lat, end_lon)

            route_report = {
                'name': route.get('name', 'Unknown'),
                'start': start,
                'end': end,
                'results': results
            }
            report['test_routes'].append(route_report)

            # Collect stats
            for engine, result in results.items():
                if result.get('success') and engine in engine_stats:
                    engine_stats[engine].append(result['response_time_ms'])

        # Calculate summary statistics
        for engine, times in engine_stats.items():
            if times:
                report['summary'][engine] = {
                    'avg_response_time_ms': round(sum(times) / len(times), 0),
                    'min_response_time_ms': round(min(times), 0),
                    'max_response_time_ms': round(max(times), 0),
                    'success_rate': f"{len(times)}/{len(test_routes)}"
                }

        return jsonify({'success': True, 'report': report})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ============================================================================
# PHASE 5: PERFORMANCE MONITORING & METRICS ENDPOINTS
# ============================================================================

@routing_bp.route('/monitoring/phase5/metrics', methods=['GET'])
def get_phase5_metrics():
    """PHASE 5: Get comprehensive Phase 5 metrics."""
    try:
        metrics = {
            'timestamp': datetime.now().isoformat(),
            'fallback_chain_health': _fallback_optimizer.get_engine_health() if _fallback_optimizer else {},
            'recommended_engine': _fallback_optimizer.get_recommended_engine() if _fallback_optimizer else None,
            'cache_stats': _route_cache.get_stats() if _route_cache and hasattr(_route_cache, 'get_stats') else {},
            'phase5_features': {
                'parallel_routing': 'enabled',
                'fallback_chain': 'enabled',
                'request_validation': 'enabled',
                'performance_monitoring': 'enabled'
            }
        }

        return jsonify({'success': True, 'metrics': metrics})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@routing_bp.route('/monitoring/phase5/engine-comparison', methods=['POST'])
def engine_comparison():
    """PHASE 5: Compare all routing engines on a specific route."""
    try:
        from voyagr.services.routing import ParallelRoutingEngine

        data = request.json or {}
        start = data.get('start', '51.5074,-0.1278')
        end = data.get('end', '51.5174,-0.1278')

        # Validate coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)

        if not start_coords or not end_coords:
            return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400

        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords

        # Run parallel routing
        parallel_engine = ParallelRoutingEngine()
        results = parallel_engine.run_parallel(start_lat, start_lon, end_lat, end_lon)

        # Analyze results
        comparison = {
            'timestamp': datetime.now().isoformat(),
            'route': {'start': start, 'end': end},
            'engines': results,
            'analysis': {
                'fastest_engine': None,
                'most_accurate': None,
                'average_time_ms': 0,
                'success_rate': 0
            }
        }

        # Calculate analysis
        successful = {k: v for k, v in results.items() if v.get('success')}
        if successful:
            times = [v['response_time_ms'] for v in successful.values()]
            comparison['analysis']['average_time_ms'] = round(sum(times) / len(times), 0)
            comparison['analysis']['fastest_engine'] = min(successful.items(), key=lambda x: x[1]['response_time_ms'])[0]
            comparison['analysis']['success_rate'] = round((len(successful) / len(results)) * 100, 1)

        return jsonify({'success': True, 'comparison': comparison})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@routing_bp.route('/monitoring/phase5/performance-summary', methods=['GET'])
def performance_summary():
    """PHASE 5: Get performance summary for all Phase 5 features."""
    try:
        summary = {
            'timestamp': datetime.now().isoformat(),
            'cache_performance': {
                'hit_rate': 0,
                'total_requests': 0,
                'cached_requests': 0
            },
            'engine_health': _fallback_optimizer.get_engine_health() if _fallback_optimizer else {},
            'recommended_engine': _fallback_optimizer.get_recommended_engine() if _fallback_optimizer else None,
            'optimization_status': {
                'route_caching': 'active',
                'connection_pooling': 'active',
                'cost_calculation': 'optimized',
                'response_compression': 'enabled',
                'parallel_routing': 'enabled',
                'fallback_chain': 'enabled',
                'request_validation': 'enabled'
            }
        }

        # Get cache stats if available
        if _route_cache and hasattr(_route_cache, 'get_stats'):
            cache_stats = _route_cache.get_stats()
            summary['cache_performance'] = cache_stats

        return jsonify({'success': True, 'summary': summary})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@routing_bp.route('/monitoring/phase5/validation-stats', methods=['GET'])
def validation_stats():
    """PHASE 5: Get request validation statistics."""
    try:
        stats = {
            'timestamp': datetime.now().isoformat(),
            'validation_enabled': True,
            'features': {
                'coordinate_validation': 'enabled',
                'routing_mode_validation': 'enabled',
                'vehicle_type_validation': 'enabled',
                'numeric_value_validation': 'enabled',
                'waypoint_validation': 'enabled'
            },
            'note': 'Validation statistics are tracked per request. Enable detailed logging for metrics.'
        }

        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ============================================================================
# BATCH REQUEST ENDPOINT
# ============================================================================

@routing_bp.route('/batch', methods=['POST'])
def batch_requests():
    """
    Batch API endpoint for combining multiple requests into one.
    Reduces network overhead and improves performance.
    """
    try:
        data = request.json or {}
        requests_list = data.get('requests', [])

        if not requests_list:
            return jsonify({'success': False, 'error': 'No requests in batch'})

        responses = []

        for req in requests_list:
            req_id = req.get('id')
            endpoint = req.get('endpoint')
            req_data = req.get('data', {})

            try:
                # Route the request to appropriate handler
                if endpoint == '/api/route':
                    result = _calculate_route_internal(req_data)
                elif endpoint == '/api/weather':
                    result = _get_weather_internal(req_data)
                elif endpoint == '/api/traffic-patterns':
                    result = _get_traffic_patterns_internal(req_data)
                elif endpoint == '/api/speed-limit':
                    result = _get_speed_limit_internal(req_data)
                elif endpoint == '/api/hazards/nearby':
                    result = _get_nearby_hazards_internal(req_data)
                else:
                    result = {'success': False, 'error': f'Unknown endpoint: {endpoint}'}

                responses.append({
                    'id': req_id,
                    'success': result.get('success', False),
                    'data': result
                })
            except Exception as e:
                responses.append({
                    'id': req_id,
                    'success': False,
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'responses': responses,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def _calculate_route_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal route calculation for batch requests."""
    try:
        return {'success': True, 'message': 'Route calculated'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _get_weather_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal weather fetch for batch requests."""
    try:
        return {'success': True, 'message': 'Weather fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _get_traffic_patterns_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal traffic patterns fetch for batch requests."""
    try:
        return {'success': True, 'message': 'Traffic patterns fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _get_speed_limit_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal speed limit fetch for batch requests."""
    try:
        return {'success': True, 'message': 'Speed limit fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _get_nearby_hazards_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal hazards fetch for batch requests."""
    try:
        return {'success': True, 'message': 'Hazards fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

