"""
Cost calculation services for routes.

Includes:
- RouteCache: LRU cache with TTL for route calculations
- CostCalculator: Advanced cost calculator with ML predictions
- Cost calculation functions for fuel, tolls, and CAZ
"""

import json
import time
import threading
import logging
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Set, Tuple

from voyagr.config import CAZ_ZONES_DATA
from voyagr.models import db_connection
from voyagr.utils import point_in_polygon

logger = logging.getLogger('voyagr_web')


class RouteCache:
    """LRU cache for route calculations with TTL support."""

    def __init__(self, max_size: int = 1000, ttl_seconds: int = 3600) -> None:
        """Initialize cache with max size and TTL."""
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self.cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self.timestamps: Dict[str, float] = {}
        self.lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def _make_key(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, 
                  routing_mode: str, vehicle_type: str, enable_hazard_avoidance: bool = False) -> str:
        """Create cache key from route parameters."""
        return f"{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f},{routing_mode},{vehicle_type},{enable_hazard_avoidance}"

    def get(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, 
            routing_mode: str, vehicle_type: str, enable_hazard_avoidance: bool = False) -> Optional[Dict[str, Any]]:
        """Get cached route if available and not expired."""
        with self.lock:
            key = self._make_key(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance)

            if key not in self.cache:
                self.misses += 1
                return None

            # Check if expired
            if time.time() - self.timestamps[key] > self.ttl_seconds:
                del self.cache[key]
                del self.timestamps[key]
                self.misses += 1
                return None

            # Move to end (most recently used)
            self.cache.move_to_end(key)
            self.hits += 1
            return self.cache[key]

    def set(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, 
            routing_mode: str, vehicle_type: str, route_data: Dict[str, Any], 
            enable_hazard_avoidance: bool = False) -> None:
        """Cache a route calculation."""
        with self.lock:
            key = self._make_key(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance)

            # Remove oldest if at capacity
            if len(self.cache) >= self.max_size and key not in self.cache:
                oldest_key = next(iter(self.cache))
                del self.cache[oldest_key]
                del self.timestamps[oldest_key]

            # Add or update
            self.cache[key] = route_data
            self.timestamps[key] = time.time()
            self.cache.move_to_end(key)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self.lock:
            total = self.hits + self.misses
            hit_rate = (self.hits / total * 100) if total > 0 else 0
            return {
                'hits': self.hits,
                'misses': self.misses,
                'total': total,
                'hit_rate': f"{hit_rate:.1f}%",
                'size': len(self.cache),
                'max_size': self.max_size
            }

    def clear(self) -> None:
        """Clear all cached routes."""
        with self.lock:
            self.cache.clear()
            self.timestamps.clear()


# Initialize route cache
route_cache = RouteCache(max_size=1000, ttl_seconds=3600)


def check_route_in_caz(route_coords: List[Tuple[float, float]], vehicle_caz_pass: str = 'none') -> Dict[str, Any]:
    """
    Check if a route passes through any CAZ zones and calculate charges.

    Args:
        route_coords: List of (lat, lon) tuples representing the route
        vehicle_caz_pass: The CAZ pass/exemption type the vehicle has

    Returns:
        Dictionary with zones_crossed, total_charge, is_exempt, pass_covers, zone_details
    """
    result: Dict[str, Any] = {
        'zones_crossed': [],
        'total_charge': 0.0,
        'is_exempt': False,
        'pass_covers': False,
        'zone_details': []
    }

    # Check if vehicle has exemption
    exempt_passes = ['exempt_electric', 'exempt_euro6', 'exempt_disabled', 'exempt_historic', 'exempt_military']
    has_pass = ['pass_daily', 'pass_weekly', 'pass_monthly', 'pass_annual', 'auto_pay']

    if vehicle_caz_pass in exempt_passes:
        result['is_exempt'] = True
    elif vehicle_caz_pass in has_pass:
        result['pass_covers'] = True

    if not route_coords or len(route_coords) == 0:
        return result

    # Check each CAZ zone
    for zone_id, zone_data in CAZ_ZONES_DATA.items():
        polygon = zone_data.get('polygon', [])
        if not polygon:
            continue

        # Check if any route point falls within this zone
        zone_crossed = False
        for coord in route_coords:
            if isinstance(coord, (list, tuple)) and len(coord) >= 2:
                lat, lon = float(coord[0]), float(coord[1])
                if point_in_polygon(lat, lon, polygon):
                    zone_crossed = True
                    break

        if zone_crossed:
            result['zones_crossed'].append(zone_id)
            zone_detail = {
                'zone_id': zone_id,
                'name': zone_data['name'],
                'city': zone_data['city'],
                'daily_charge': zone_data['daily_charge'],
                'purchase_url': zone_data.get('purchase_url', '')
            }
            result['zone_details'].append(zone_detail)

            # Add charge only if not exempt and no pass
            if not result['is_exempt'] and not result['pass_covers']:
                result['total_charge'] += zone_data['daily_charge']

    result['total_charge'] = round(result['total_charge'], 2)
    return result


def calculate_fuel_cost(distance_km: float, fuel_efficiency_l_per_100km: float, fuel_price_gbp_per_l: float) -> float:
    """Calculate fuel cost for a route."""
    fuel_needed = (distance_km / 100) * fuel_efficiency_l_per_100km
    return fuel_needed * fuel_price_gbp_per_l


def calculate_energy_cost(distance_km: float, energy_efficiency_kwh_per_100km: float, electricity_price_gbp_per_kwh: float) -> float:
    """Calculate energy cost for EV."""
    energy_needed = (distance_km / 100) * energy_efficiency_kwh_per_100km
    return energy_needed * electricity_price_gbp_per_kwh


def calculate_toll_cost(_distance_km: float, _route_type: str = 'motorway',
                        route_coords: Optional[List[Tuple[float, float]]] = None) -> float:
    """Calculate toll cost based on actual toll roads, not distance.

    Only charges tolls if route passes through known UK toll roads.
    """
    if not route_coords or len(route_coords) == 0:
        return 0.0

    TOLL_ROADS: Dict[str, Dict[str, float]] = {
        'M6 Toll': {'lat': 52.5, 'lon': -1.9, 'cost': 3.50, 'radius_km': 15},
        'Dartford Crossing': {'lat': 51.45, 'lon': 0.2, 'cost': 2.50, 'radius_km': 10},
        'Severn Bridge': {'lat': 51.4, 'lon': -2.6, 'cost': 6.70, 'radius_km': 15},
        'Humber Bridge': {'lat': 53.7, 'lon': -0.4, 'cost': 2.00, 'radius_km': 10},
    }

    total_toll: float = 0.0
    tolls_charged: Set[str] = set()

    for coord in route_coords:
        if isinstance(coord, (list, tuple)) and len(coord) >= 2:
            lat, lon = coord[0], coord[1]

            for toll_name, toll_data in TOLL_ROADS.items():
                if toll_name not in tolls_charged:
                    lat_diff = abs(lat - toll_data['lat'])
                    lon_diff = abs(lon - toll_data['lon'])
                    approx_distance = (lat_diff ** 2 + lon_diff ** 2) ** 0.5 * 111

                    if approx_distance < toll_data['radius_km']:
                        total_toll += toll_data['cost']
                        tolls_charged.add(toll_name)

    return round(total_toll, 2)


def calculate_caz_cost(_distance_km: float, vehicle_type: str = 'petrol_diesel', is_exempt: bool = False,
                       route_coords: Optional[List[Tuple[float, float]]] = None,
                       vehicle_caz_pass: str = 'none') -> Tuple[float, Dict[str, Any]]:
    """Calculate CAZ cost using polygon-based boundary detection."""
    empty_result: Dict[str, Any] = {
        'zones_crossed': [],
        'total_charge': 0.0,
        'is_exempt': False,
        'pass_covers': False,
        'zone_details': []
    }

    if is_exempt:
        empty_result['is_exempt'] = True
        return 0.0, empty_result

    if vehicle_type == 'electric':
        empty_result['is_exempt'] = True
        return 0.0, empty_result

    if vehicle_caz_pass == 'exempt_electric':
        empty_result['is_exempt'] = True
        return 0.0, empty_result

    if not route_coords or len(route_coords) == 0:
        return 0.0, empty_result

    caz_result = check_route_in_caz(route_coords, vehicle_caz_pass)
    return caz_result['total_charge'], caz_result


def invalidate_hazard_cache() -> bool:
    """Invalidate hazard-related caches when hazard data is updated."""
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                DELETE FROM community_hazard_reports
                WHERE expiry_timestamp < ?
            ''', (int(time.time()),))
            conn.commit()
        logger.info("Hazard cache invalidated and expired reports cleaned")
        return True
    except Exception as e:
        logger.error(f"Error invalidating hazard cache: {e}")
        return False


def invalidate_route_cache() -> bool:
    """
    Drop every persistent route cache row.

    Called when hazard/routing preferences change, so every stored ``route_data``
    was computed under superseded settings. Deleting only rows that had gone
    untouched for 24 hours left the routes the user actually drives — the ones
    refreshing ``last_accessed`` on every request — pinned to their old option
    list, so preference changes appeared to do nothing.
    """
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM persistent_route_cache')
            conn.commit()
        logger.info("Route cache invalidated (all persistent rows dropped)")
        return True
    except Exception as e:
        logger.error(f"Error invalidating route cache: {e}")
        return False


class CostCalculator:
    """Advanced cost calculator for routes with breakdown and comparison."""

    def __init__(self):
        """Initialize cost calculator."""
        self.cache: Dict[str, Any] = {}
        self.lock = threading.Lock()
        self.cost_history: List[Dict[str, Any]] = []

    def calculate_costs(self, distance_km: float, vehicle_type: str, fuel_efficiency: float, fuel_price: float,
                       energy_efficiency: float, electricity_price: float, include_tolls: bool, include_caz: bool,
                       caz_exempt: bool, route_coords: Optional[List[Tuple[float, float]]] = None) -> Dict[str, Any]:
        """Calculate all costs for a route."""
        fuel_cost: float = 0.0
        toll_cost: float = 0.0
        caz_cost: float = 0.0

        # Calculate fuel/energy amount and cost
        fuel_litres: float = 0.0  # litres for petrol/diesel/hybrid, kWh for electric
        if vehicle_type == 'electric':
            fuel_litres = (distance_km / 100) * energy_efficiency  # kWh
            fuel_cost = fuel_litres * electricity_price
        else:
            fuel_litres = (distance_km / 100) * fuel_efficiency  # litres
            fuel_cost = fuel_litres * fuel_price

        # Calculate toll cost
        if include_tolls:
            toll_cost = calculate_toll_cost(distance_km, 'motorway', route_coords=route_coords)

        # Calculate CAZ cost
        caz_details: Dict[str, Any] = {}
        if include_caz and not caz_exempt:
            caz_cost, caz_details = calculate_caz_cost(distance_km, vehicle_type, caz_exempt, route_coords=route_coords)

        return {
            'fuel_cost': round(fuel_cost, 2),
            'fuel_litres': round(fuel_litres, 2),  # litres (petrol/diesel) or kWh (electric)
            'toll_cost': round(toll_cost, 2),
            'caz_cost': round(caz_cost, 2),
            'caz_details': caz_details,
            'total_cost': round(fuel_cost + toll_cost + caz_cost, 2)
        }

    def calculate_detailed_breakdown(self, distance_km: float, duration_minutes: float, vehicle_type: str,
                                    fuel_efficiency: float, fuel_price: float, energy_efficiency: float,
                                    electricity_price: float, include_tolls: bool, include_caz: bool,
                                    caz_exempt: bool) -> Dict[str, Any]:
        """Calculate detailed cost breakdown with per-unit costs."""
        costs = self.calculate_costs(distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt)

        cost_per_km: float = costs['total_cost'] / distance_km if distance_km > 0 else 0.0
        cost_per_minute: float = costs['total_cost'] / duration_minutes if duration_minutes > 0 else 0.0

        if vehicle_type == 'electric':
            fuel_efficiency_actual: float = energy_efficiency
            fuel_unit: str = 'kWh/100km'
        else:
            fuel_efficiency_actual = fuel_efficiency
            fuel_unit = 'L/100km'

        return {
            **costs,
            'breakdown': {
                'fuel_cost': costs['fuel_cost'],
                'toll_cost': costs['toll_cost'],
                'caz_cost': costs['caz_cost']
            },
            'per_unit': {
                'cost_per_km': round(cost_per_km, 3),
                'cost_per_minute': round(cost_per_minute, 3),
                'fuel_efficiency': fuel_efficiency_actual,
                'fuel_unit': fuel_unit
            },
            'metrics': {
                'distance_km': round(distance_km, 2),
                'duration_minutes': round(duration_minutes, 0),
                'avg_speed_kmh': round((distance_km / (duration_minutes / 60)) if duration_minutes > 0 else 0, 1)
            }
        }

    def compare_routes(self, routes_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Compare multiple routes and provide recommendations."""
        if not routes_data or len(routes_data) < 2:
            return None

        comparisons: List[Dict[str, Any]] = []
        for idx, route in enumerate(routes_data):
            comparison: Dict[str, Any] = {
                'route_id': idx + 1,
                'distance_km': route.get('distance_km', 0),
                'duration_minutes': route.get('duration_minutes', 0),
                'fuel_cost': route.get('fuel_cost', 0),
                'toll_cost': route.get('toll_cost', 0),
                'caz_cost': route.get('caz_cost', 0),
                'total_cost': route.get('fuel_cost', 0) + route.get('toll_cost', 0) + route.get('caz_cost', 0),
                'cost_per_km': round((route.get('fuel_cost', 0) + route.get('toll_cost', 0) + route.get('caz_cost', 0)) / route.get('distance_km', 1), 3),
                'cost_per_minute': round((route.get('fuel_cost', 0) + route.get('toll_cost', 0) + route.get('caz_cost', 0)) / route.get('duration_minutes', 1), 3)
            }
            comparisons.append(comparison)

        cheapest = min(comparisons, key=lambda x: x['total_cost'])
        fastest = min(comparisons, key=lambda x: x['duration_minutes'])

        recommendations: Dict[str, Any] = {
            'cheapest': {
                'route_id': cheapest['route_id'],
                'savings': round(max(c['total_cost'] for c in comparisons) - cheapest['total_cost'], 2),
                'reason': f"Saves £{round(max(c['total_cost'] for c in comparisons) - cheapest['total_cost'], 2)} compared to most expensive"
            },
            'fastest': {
                'route_id': fastest['route_id'],
                'time_saved': round(max(c['duration_minutes'] for c in comparisons) - fastest['duration_minutes'], 0),
                'reason': f"Saves {round(max(c['duration_minutes'] for c in comparisons) - fastest['duration_minutes'], 0)} minutes compared to slowest"
            },
        }

        for key, label in (('scenic', '🌿 Scenic'), ('quiet', '🛤️ Quiet')):
            for idx, route in enumerate(routes_data):
                if (route.get('name') or '').strip() == label:
                    recommendations[key] = {
                        'route_id': idx + 1,
                        'reason': f'{label} preference route',
                    }
                    break

        return {
            'routes': comparisons,
            'recommendations': recommendations,
        }

    def cache_route_to_db(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        routing_mode: str,
        vehicle_type: str,
        route_data: Dict[str, Any],
        source: str,
        *,
        cache_key: Optional[str] = None,
    ) -> bool:
        """Cache a route to the database for long-term storage and analytics."""
        try:
            with db_connection() as conn:
                cursor = conn.cursor()

                distance_km = route_data.get('distance_km', 0)
                duration_minutes = route_data.get('duration_minutes', 0)
                fuel_cost = route_data.get('fuel_cost', 0)
                toll_cost = route_data.get('toll_cost', 0)
                caz_cost = route_data.get('caz_cost', 0)
                total_cost = fuel_cost + toll_cost + caz_cost

                if cache_key:
                    cursor.execute(
                        'SELECT access_count FROM persistent_route_cache WHERE cache_key = ?',
                        (cache_key,),
                    )
                    prev = cursor.fetchone()
                    next_access = (int(prev[0]) if prev else 0) + 1
                    cursor.execute(
                        'DELETE FROM persistent_route_cache WHERE cache_key = ?',
                        (cache_key,),
                    )
                    cursor.execute('''
                        INSERT INTO persistent_route_cache
                        (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                         route_data, distance_km, duration_minutes, fuel_cost, toll_cost, caz_cost,
                         total_cost, source, cache_key, access_count, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                          json.dumps(route_data), distance_km, duration_minutes, fuel_cost, toll_cost,
                          caz_cost, total_cost, source, cache_key, next_access))
                else:
                    cursor.execute('''
                        INSERT OR REPLACE INTO persistent_route_cache
                        (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                         route_data, distance_km, duration_minutes, fuel_cost, toll_cost, caz_cost,
                         total_cost, source, access_count, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                COALESCE((SELECT access_count FROM persistent_route_cache
                                         WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
                                         AND routing_mode=? AND vehicle_type=?), 0) + 1,
                                CURRENT_TIMESTAMP)
                    ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                          json.dumps(route_data), distance_km, duration_minutes, fuel_cost, toll_cost,
                          caz_cost, total_cost, source, start_lat, start_lon, end_lat, end_lon,
                          routing_mode, vehicle_type))

                conn.commit()
            return True
        except Exception as e:
            logger.error(f"[Cache] Error caching route to DB: {e}")
            return False

    def get_cached_route_from_db(
        self,
        cache_key: str,
        *,
        max_age_hours: int = 24,
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a cached route from the database by full preference-aware cache key.

        Freshness is judged from when the row was written, not from
        ``last_accessed`` — this method refreshes ``last_accessed`` on every hit,
        so ages measured against it never elapse for a route the user recalculates
        regularly, and the row would be served indefinitely (including route
        option lists produced by superseded app versions).
        """
        if not cache_key:
            return None
        try:
            with db_connection() as conn:
                cursor = conn.cursor()

                cursor.execute('''
                    SELECT route_data FROM persistent_route_cache
                    WHERE cache_key=? AND cache_key IS NOT NULL
                    AND datetime(COALESCE(created_at, last_accessed)) > datetime('now', ?)
                ''', (cache_key, f'-{max_age_hours} hours'))

                result = cursor.fetchone()
                if result:
                    route_data_str = result[0]
                    cursor.execute('''
                        UPDATE persistent_route_cache
                        SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
                        WHERE cache_key=?
                    ''', (cache_key,))
                    conn.commit()
                    parsed = json.loads(route_data_str)
                    if isinstance(parsed, dict):
                        parsed['db_cached'] = True
                    return parsed

            return None
        except Exception as e:
            logger.error(f"[Cache] Error retrieving cached route: {e}")
            return None

    def get_cached_route_from_db_legacy(
        self, start_lat: float, start_lon: float, end_lat: float, end_lon: float,
        routing_mode: str, vehicle_type: str,
        *,
        max_age_hours: int = 24,
    ) -> Optional[Dict[str, Any]]:
        """
        Legacy coord-only DB cache lookup, restricted to pre-migration rows.

        This match ignores route preferences, so it must only ever answer for rows
        written before ``cache_key`` existed. Without the ``cache_key IS NULL``
        guard it also matched preference-keyed rows, which made it a coordinate-only
        back door: a deliberate keyed miss (changed preferences, expired row) fell
        straight through to whatever was last stored for those coordinates. It is
        age-bounded like the keyed lookup for the same reason.
        """
        try:
            with db_connection() as conn:
                cursor = conn.cursor()

                cursor.execute('''
                    SELECT route_data, access_count FROM persistent_route_cache
                    WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
                    AND routing_mode=? AND vehicle_type=? AND cache_key IS NULL
                    AND datetime(COALESCE(created_at, last_accessed)) > datetime('now', ?)
                ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                      f'-{max_age_hours} hours'))

                result = cursor.fetchone()
                if result:
                    route_data_str = result[0]
                    cursor.execute('''
                        UPDATE persistent_route_cache
                        SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
                        WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
                        AND routing_mode=? AND vehicle_type=? AND cache_key IS NULL
                    ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type))
                    conn.commit()
                    return json.loads(route_data_str)

            return None
        except Exception as e:
            logger.error(f"[Cache] Error retrieving cached route: {e}")
            return None

    def get_cache_statistics(self) -> Dict[str, Any]:
        """Get statistics about the persistent route cache."""
        try:
            with db_connection() as conn:
                cursor = conn.cursor()

                cursor.execute('SELECT COUNT(*) FROM persistent_route_cache')
                total_routes = cursor.fetchone()[0]

                cursor.execute('''
                    SELECT start_lat, start_lon, end_lat, end_lon, access_count
                    FROM persistent_route_cache
                    ORDER BY access_count DESC LIMIT 5
                ''')
                most_accessed = cursor.fetchall()

                cursor.execute('SELECT AVG(total_cost) FROM persistent_route_cache')
                avg_cost = cursor.fetchone()[0] or 0

                cursor.execute('SELECT SUM(distance_km) FROM persistent_route_cache')
                total_distance = cursor.fetchone()[0] or 0

            return {
                'total_cached_routes': total_routes,
                'average_cost': round(avg_cost, 2),
                'total_distance_cached_km': round(total_distance, 2),
                'most_accessed_routes': [
                    {
                        'start': f"({row[0]:.4f}, {row[1]:.4f})",
                        'end': f"({row[2]:.4f}, {row[3]:.4f})",
                        'access_count': row[4]
                    } for row in most_accessed
                ]
            }
        except Exception as e:
            logger.error(f"[Cache] Error getting cache statistics: {e}")
            return {}

    def predict_cost(self, distance_km: float, vehicle_type: str, fuel_efficiency: float, fuel_price: float,
                    energy_efficiency: float, electricity_price: float, include_tolls: bool, include_caz: bool) -> Dict[str, Any]:
        """Predict cost for a route using historical data and ML-based estimation."""
        try:
            # Get historical average cost per km for similar routes
            with db_connection() as conn:
                cursor = conn.cursor()

                cursor.execute('''
                    SELECT AVG(total_cost / distance_km) as avg_cost_per_km
                    FROM persistent_route_cache
                    WHERE vehicle_type = ? AND distance_km > ? AND distance_km < ?
                ''', (vehicle_type, distance_km * 0.8, distance_km * 1.2))

                result = cursor.fetchone()
                historical_cost_per_km = result[0] if result and result[0] else None

            # Calculate base cost
            base_costs = self.calculate_costs(
                distance_km, vehicle_type, fuel_efficiency, fuel_price,
                energy_efficiency, electricity_price, include_tolls, include_caz, False
            )

            # If we have historical data, blend with prediction
            if historical_cost_per_km:
                predicted_total = historical_cost_per_km * distance_km
                # Blend: 70% calculated, 30% historical
                blended_cost = (base_costs['total_cost'] * 0.7) + (predicted_total * 0.3)
                confidence = 0.85  # High confidence with historical data
            else:
                blended_cost = base_costs['total_cost']
                confidence = 0.65  # Lower confidence without historical data

            return {
                'predicted_cost': round(blended_cost, 2),
                'base_cost': round(base_costs['total_cost'], 2),
                'confidence': round(confidence, 2),
                'cost_per_km': round(blended_cost / distance_km if distance_km > 0 else 0, 3),
                'breakdown': base_costs
            }
        except Exception as e:
            logger.error(f"[Prediction] Error predicting cost: {e}")
            # Fallback to basic calculation
            return {
                'predicted_cost': round(self.calculate_costs(
                    distance_km, vehicle_type, fuel_efficiency, fuel_price,
                    energy_efficiency, electricity_price, include_tolls, include_caz, False
                )['total_cost'], 2),
                'confidence': 0.5,
                'error': str(e)
            }

    def optimize_route_cost(self, routes_data: List[Dict[str, Any]], vehicle_type: str, _fuel_efficiency: float, _fuel_price: float,
                           energy_efficiency: float, electricity_price: float) -> Optional[Dict[str, Any]]:
        """Provide cost optimization suggestions for routes."""
        if not routes_data or len(routes_data) == 0:
            return None

        optimizations = []

        for idx, route in enumerate(routes_data):
            distance_km = route.get('distance_km', 0)
            duration_minutes = route.get('duration_minutes', 0)
            total_cost = route.get('fuel_cost', 0) + route.get('toll_cost', 0) + route.get('caz_cost', 0)

            suggestions = []

            # Suggestion 1: Toll avoidance
            if route.get('toll_cost', 0) > 0:
                toll_savings = route.get('toll_cost', 0)
                suggestions.append({
                    'type': 'toll_avoidance',
                    'title': 'Avoid Tolls',
                    'savings': round(toll_savings, 2),
                    'description': f'Avoid toll roads to save £{toll_savings:.2f}'
                })

            # Suggestion 2: CAZ avoidance
            if route.get('caz_cost', 0) > 0:
                caz_savings = route.get('caz_cost', 0)
                suggestions.append({
                    'type': 'caz_avoidance',
                    'title': 'Avoid CAZ',
                    'savings': round(caz_savings, 2),
                    'description': f'Avoid Congestion Charge Zone to save £{caz_savings:.2f}'
                })

            # Suggestion 3: Time optimization
            if duration_minutes > 60:
                time_saved_minutes = max(5, int(duration_minutes * 0.1))  # 10% time reduction
                cost_per_minute = total_cost / duration_minutes if duration_minutes > 0 else 0
                cost_savings = cost_per_minute * time_saved_minutes
                suggestions.append({
                    'type': 'time_optimization',
                    'title': 'Faster Route',
                    'savings': round(cost_savings, 2),
                    'description': f'Take a faster route to save ~{time_saved_minutes} minutes and £{cost_savings:.2f}'
                })

            # Suggestion 4: Vehicle efficiency
            if vehicle_type != 'electric':
                # Estimate EV savings
                ev_cost = (distance_km / 100) * energy_efficiency * electricity_price
                fuel_cost = route.get('fuel_cost', 0)
                if fuel_cost > ev_cost:
                    ev_savings = fuel_cost - ev_cost
                    suggestions.append({
                        'type': 'vehicle_efficiency',
                        'title': 'Use Electric Vehicle',
                        'savings': round(ev_savings, 2),
                        'description': f'Using an EV could save £{ev_savings:.2f} on fuel'
                    })

            optimizations.append({
                'route_id': idx + 1,
                'total_cost': round(total_cost, 2),
                'suggestions': suggestions,
                'total_potential_savings': round(sum(s['savings'] for s in suggestions), 2)
            })

        return {
            'routes': optimizations,
            'best_optimization': max(optimizations, key=lambda x: x['total_potential_savings']) if optimizations else None
        }

    def cache_alternative_routes(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float,
                                routing_mode: str, vehicle_type: str, routes_data: List[Dict[str, Any]]) -> bool:
        """Cache alternative routes with smart TTL and invalidation strategy."""
        try:
            with db_connection() as conn:
                cursor = conn.cursor()

                # Store each alternative route
                for idx, route in enumerate(routes_data):
                    distance_km = route.get('distance_km', 0)
                    duration_minutes = route.get('duration_minutes', 0)
                    fuel_cost = route.get('fuel_cost', 0)
                    toll_cost = route.get('toll_cost', 0)
                    caz_cost = route.get('caz_cost', 0)
                    total_cost = fuel_cost + toll_cost + caz_cost

                    # Determine TTL based on route characteristics
                    # Longer routes get longer TTL (more stable)
                    # Routes with tolls/CAZ get shorter TTL (prices change)
                    # base_ttl: 3600 seconds = 1 hour (kept for reference, TTL not currently used)
                    if distance_km > 100:
                        ttl_multiplier: float = 2  # 2 hours for long routes
                    elif distance_km > 50:
                        ttl_multiplier = 1.5  # 1.5 hours for medium routes
                    else:
                        ttl_multiplier = 1  # 1 hour for short routes

                    # Reduce TTL if route has tolls or CAZ
                    if toll_cost > 0 or caz_cost > 0:
                        ttl_multiplier *= 0.7  # 30% reduction

                    # TTL calculation available for future use: int(base_ttl * ttl_multiplier)

                    # Insert alternative route
                    cursor.execute('''
                        INSERT INTO persistent_route_cache
                        (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                         route_data, distance_km, duration_minutes, fuel_cost, toll_cost, caz_cost,
                         total_cost, source, access_count, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                        ON CONFLICT(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type)
                        DO UPDATE SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
                    ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                          json.dumps(route), distance_km, duration_minutes, fuel_cost, toll_cost,
                          caz_cost, total_cost, f'Alternative-{idx+1}'))

                conn.commit()
            return True
        except Exception as e:
            logger.error(f"[Cache] Error caching alternative routes: {e}")
            return False

    def get_alternative_route_cache_info(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, Any]:
        """Get cache information for alternative routes."""
        try:
            with db_connection() as conn:
                cursor = conn.cursor()

                cursor.execute('''
                    SELECT COUNT(*), AVG(total_cost), SUM(access_count)
                    FROM persistent_route_cache
                    WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
                ''', (start_lat, start_lon, end_lat, end_lon))

                result = cursor.fetchone()

            if result:
                count, avg_cost, total_accesses = result
                return {
                    'cached_alternatives': count or 0,
                    'average_cost': round(avg_cost, 2) if avg_cost else 0,
                    'total_accesses': total_accesses or 0
                }
            return {}
        except Exception as e:
            logger.error(f"[Cache] Error getting alternative route cache info: {e}")
            return {}


# Initialize cost calculator
cost_calculator = CostCalculator()

