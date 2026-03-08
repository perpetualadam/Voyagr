"""
Hazard detection and avoidance services.

Includes:
- fetch_hazards_for_route: Fetch hazards within route bounding box
- fetch_tomtom_incidents: Fetch real-time traffic incidents from TomTom API
- merge_hazards_with_tomtom_incidents: Merge static and real-time hazards
- build_graphhopper_custom_model: Build GraphHopper avoidance model
- build_valhalla_exclude_locations: Build Valhalla exclude locations list
- build_graphhopper_camera_avoidance_model: Camera-specific avoidance model
- get_hazards_on_route: Get hazards near a route
- score_route_by_hazards: Calculate hazard penalty score for route
"""

import os
import json
import time
import math
import logging
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

try:
    import polyline
except ImportError:
    polyline = None

from voyagr.config import GRAPHHOPPER_CAMERA_AREAS_COUNT, USE_GRAPHHOPPER_CAMERA_AVOIDANCE
from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils import get_distance_between_points

logger = logging.getLogger('voyagr_web')

# ============================================================================
# CAMERA AREAS DATA (loaded from geojson)
# ============================================================================
CAMERA_AREAS_DATA: Optional[Dict[str, Any]] = None

def load_camera_areas() -> Optional[Dict[str, Any]]:
    """Load camera areas from geojson file."""
    global CAMERA_AREAS_DATA
    try:
        # Try current directory first, then parent directories
        possible_paths = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'camera_areas.geojson'),
            'camera_areas.geojson',
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'camera_areas.geojson'),
        ]
        for path in possible_paths:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    CAMERA_AREAS_DATA = json.load(f)
                logger.info(f"[HAZARDS] Loaded {len(CAMERA_AREAS_DATA.get('features', []))} camera areas from {path}")
                return CAMERA_AREAS_DATA
        logger.warning("[HAZARDS] camera_areas.geojson not found")
    except Exception as e:
        logger.error(f"[HAZARDS] Failed to load camera_areas.geojson: {e}")
    return None

# Load on module import
load_camera_areas()


def fetch_hazards_for_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, List[Dict[str, Any]]]:
    """Fetch hazards within bounding box of route."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Calculate bounding box with 10km buffer
        north = max(start_lat, end_lat) + 0.1
        south = min(start_lat, end_lat) - 0.1
        east = max(start_lon, end_lon) + 0.1
        west = min(start_lon, end_lon) - 0.1

        # Check cache (10-minute expiry)
        cursor.execute(
            "SELECT hazards_data, timestamp FROM route_hazards_cache WHERE north >= ? AND south <= ? AND east >= ? AND west <= ?",
            (south, north, west, east)
        )
        cached = cursor.fetchone()
        if cached:
            cached_data, timestamp = cached
            if time.time() - timestamp < 600:  # 10-minute cache
                return_db_connection(conn)
                return json.loads(cached_data)

        hazards: Dict[str, List[Dict[str, Any]]] = {
            'camera': [],
            'police': [],
            'roadworks': [],
            'accident': [],
            'railway_crossing': [],
            'pothole': [],
            'debris': []
        }

        cursor.execute(
            "SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (south, north, west, east)
        )
        for lat, lon, camera_type, desc in cursor.fetchall():
            hazards['camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})

        return_db_connection(conn)
        return hazards
    except Exception as e:
        logger.error(f"Error fetching hazards: {e}")
        return {}


def fetch_tomtom_incidents(bbox: Dict[str, float], incident_types: Optional[List[str]] = None) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetch real-time traffic incidents from TomTom Traffic Incidents API.

    Args:
        bbox: Bounding box with keys: north, south, east, west
        incident_types: Optional list of incident types to fetch.
    """
    if not requests:
        logger.warning("[TOMTOM] requests module not available")
        return {}

    tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')

    if not tomtom_api_key:
        logger.warning("[TOMTOM] No API key configured - skipping real-time incidents")
        return {}

    # Default incident types to fetch
    if incident_types is None:
        incident_types = ['1', '6', '7', '8', '9', '14']

    # TomTom category code to Voyagr hazard type mapping
    category_mapping = {
        '1': 'accident',
        '3': 'debris',
        '6': 'jam',
        '7': 'lane_closed',
        '8': 'road_closed',
        '9': 'roadworks',
        '14': 'debris',
    }

    incidents: Dict[str, List[Dict[str, Any]]] = {
        'accident': [],
        'roadworks': [],
        'road_closed': [],
        'lane_closed': [],
        'jam': [],
        'debris': []
    }

    try:
        bbox_str = f"{bbox['west']},{bbox['south']},{bbox['east']},{bbox['north']}"
        url = "https://api.tomtom.com/traffic/services/5/incidentDetails"
        params = {
            'key': tomtom_api_key,
            'bbox': bbox_str,
            'fields': '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,to}}}',
            'language': 'en-GB',
            'categoryFilter': ','.join(incident_types),
            'timeValidityFilter': 'present'
        }

        logger.info(f"[TOMTOM] Fetching incidents for bbox: {bbox_str}")
        response = requests.get(url, params=params, timeout=3)

        if response.status_code == 200:
            data = response.json()
            incident_list = data.get('incidents', [])
            logger.info(f"[TOMTOM] Received {len(incident_list)} incidents from API")

            for incident in incident_list:
                try:
                    props = incident.get('properties', {})
                    icon_category = str(props.get('iconCategory', '0'))
                    geometry = incident.get('geometry', {})
                    hazard_type = category_mapping.get(icon_category, None)
                    if hazard_type is None:
                        continue

                    events = props.get('events', [])
                    description = events[0].get('description', 'Traffic incident') if events else 'Traffic incident'
                    from_location = props.get('from', '')
                    to_location = props.get('to', '')
                    if from_location and to_location:
                        description = f"{description} ({from_location} to {to_location})"

                    coords = geometry.get('coordinates', [])
                    geo_type = geometry.get('type', '')

                    if geo_type == 'Point' and len(coords) >= 2:
                        incidents[hazard_type].append({
                            'lat': coords[1], 'lon': coords[0],
                            'description': description,
                            'severity': 'high' if icon_category in ['1', '8'] else 'medium',
                            'source': 'TomTom', 'original_type': icon_category
                        })
                    elif geo_type == 'LineString' and len(coords) > 0:
                        points_to_add = []
                        if len(coords[0]) >= 2:
                            points_to_add.append((coords[0][1], coords[0][0]))
                        if len(coords) > 2:
                            mid_idx = len(coords) // 2
                            if len(coords[mid_idx]) >= 2:
                                points_to_add.append((coords[mid_idx][1], coords[mid_idx][0]))
                        if len(coords) > 1 and len(coords[-1]) >= 2:
                            points_to_add.append((coords[-1][1], coords[-1][0]))
                        for lat, lon in points_to_add:
                            incidents[hazard_type].append({
                                'lat': lat, 'lon': lon,
                                'description': description,
                                'severity': 'high' if icon_category in ['1', '8'] else 'medium',
                                'source': 'TomTom', 'original_type': icon_category
                            })
                    elif geo_type == 'MultiPoint':
                        for coord in coords:
                            if len(coord) >= 2:
                                incidents[hazard_type].append({
                                    'lat': coord[1], 'lon': coord[0],
                                    'description': description,
                                    'severity': 'high' if icon_category in ['1', '8'] else 'medium',
                                    'source': 'TomTom', 'original_type': icon_category
                                })
                except Exception as parse_error:
                    logger.warning(f"[TOMTOM] Error parsing incident: {parse_error}")
                    continue

            total_incidents = sum(len(v) for v in incidents.values())
            logger.info(f"[TOMTOM] Parsed {total_incidents} incident points")
            return incidents

        elif response.status_code == 403:
            logger.warning("[TOMTOM] API key invalid or quota exceeded")
            return {}
        else:
            logger.warning(f"[TOMTOM] API returned status {response.status_code}")
            return {}

    except Exception as e:
        if hasattr(e, '__class__') and e.__class__.__name__ == 'Timeout':
            logger.warning("[TOMTOM] API request timed out")
        else:
            logger.error(f"[TOMTOM] Error fetching incidents: {e}")
        return {}


def merge_hazards_with_tomtom_incidents(hazards: Dict[str, List[Dict[str, Any]]],
                                         tomtom_incidents: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    """Merge existing hazards (cameras from SCDB) with TomTom real-time incidents."""
    merged = hazards.copy()

    for hazard_type in ['road_closed', 'lane_closed', 'jam']:
        if hazard_type not in merged:
            merged[hazard_type] = []

    for incident_type, incident_list in tomtom_incidents.items():
        if incident_type in merged:
            merged[incident_type].extend(incident_list)
        else:
            merged[incident_type] = incident_list

    camera_count = len(merged.get('camera', []))
    tomtom_count = sum(len(tomtom_incidents.get(t, [])) for t in tomtom_incidents.keys())
    total_count = sum(len(v) for v in merged.values())
    logger.info(f"[HYBRID] Merged hazards: {camera_count} cameras + {tomtom_count} TomTom incidents = {total_count} total")

    return merged


def build_graphhopper_custom_model(hazards: Dict[str, List[Dict[str, Any]]],
                                   route_bbox: Optional[Dict[str, float]] = None,
                                   max_hazards: int = 25) -> Dict[str, Any]:
    """Build GraphHopper Custom Model to avoid hazards using circular zones."""
    try:
        all_hazards = []
        hazard_weights = {
            'camera': 50.0,
            'police': 30.0,
            'accident': 20.0,
            'roadworks': 15.0,
            'railway_crossing': 10.0,
            'pothole': 5.0,
            'debris': 5.0
        }

        for hazard_type, hazard_list in hazards.items():
            weight = hazard_weights.get(hazard_type, 10.0)
            if weight >= 30.0:
                for hazard in hazard_list:
                    if route_bbox:
                        margin = 0.1
                        lat_margin = (route_bbox['max_lat'] - route_bbox['min_lat']) * margin
                        lon_margin = (route_bbox['max_lon'] - route_bbox['min_lon']) * margin
                        if not (route_bbox['min_lat'] - lat_margin <= hazard['lat'] <= route_bbox['max_lat'] + lat_margin and
                                route_bbox['min_lon'] - lon_margin <= hazard['lon'] <= route_bbox['max_lon'] + lon_margin):
                            continue
                    all_hazards.append({'lat': hazard['lat'], 'lon': hazard['lon'], 'type': hazard_type, 'weight': weight})

        all_hazards.sort(key=lambda h: h['weight'], reverse=True)
        all_hazards = all_hazards[:max_hazards]

        if not all_hazards:
            logger.warning("[CUSTOM_MODEL] No high-priority hazards found")
            return {}

        areas_geojson = {"type": "FeatureCollection", "features": []}
        priority_rules = []
        radius_meters = 30

        for idx, hazard in enumerate(all_hazards):
            area_id = f"hazard_{idx}"
            lat_offset = radius_meters / 111000
            lon_offset = radius_meters / (111000 * math.cos(math.radians(hazard['lat'])))

            coordinates = []
            for i in range(7):
                angle = (i / 6) * 2 * math.pi
                lat = hazard['lat'] + lat_offset * math.sin(angle)
                lon = hazard['lon'] + lon_offset * math.cos(angle)
                coordinates.append([lon, lat])

            areas_geojson["features"].append({
                "type": "Feature", "id": area_id,
                "geometry": {"type": "Polygon", "coordinates": [coordinates]}
            })

            if hazard['weight'] >= 100:
                multiplier = 0.05
            elif hazard['weight'] >= 50:
                multiplier = 0.1
            else:
                multiplier = 0.3

            priority_rules.append({"if": f"in_{area_id}", "multiply_by": str(multiplier)})

        custom_model = {"priority": priority_rules, "areas": areas_geojson}
        logger.info(f"[CUSTOM_MODEL] Built model with {len(all_hazards)} hazard areas")
        return custom_model

    except Exception as e:
        logger.error(f"[CUSTOM_MODEL] Error building custom model: {e}")
        return {}


def build_valhalla_exclude_locations(hazards: Dict[str, List[Dict[str, Any]]],
                                     route_bbox: Optional[Dict[str, float]] = None,
                                     max_hazards: int = 100,
                                     start_lat: Optional[float] = None, start_lon: Optional[float] = None,
                                     end_lat: Optional[float] = None, end_lon: Optional[float] = None) -> List[Dict[str, float]]:
    """Build Valhalla exclude_locations to avoid hazards."""
    try:
        hazard_weights = {
            'camera': 50.0,
            'road_closed': 45.0, 'police': 40.0, 'accident': 35.0,
            'lane_closed': 32.0, 'roadworks': 30.0, 'jam': 25.0,
            'railway_crossing': 20.0, 'pothole': 15.0, 'debris': 15.0
        }

        all_hazards = []

        for hazard_type, hazard_list in hazards.items():
            weight = hazard_weights.get(hazard_type, 10.0)
            for hazard in hazard_list:
                if route_bbox:
                    margin_percent = 0.5
                    min_margin_degrees = 0.15
                    lat_margin = max((route_bbox['max_lat'] - route_bbox['min_lat']) * margin_percent, min_margin_degrees)
                    lon_margin = max((route_bbox['max_lon'] - route_bbox['min_lon']) * margin_percent, min_margin_degrees)
                    if not (route_bbox['min_lat'] - lat_margin <= hazard['lat'] <= route_bbox['max_lat'] + lat_margin and
                            route_bbox['min_lon'] - lon_margin <= hazard['lon'] <= route_bbox['max_lon'] + lon_margin):
                        continue

                distance_to_route = float('inf')
                if start_lat is not None and start_lon is not None and end_lat is not None and end_lon is not None:
                    dx = end_lon - start_lon
                    dy = end_lat - start_lat
                    px = hazard['lon'] - start_lon
                    py = hazard['lat'] - start_lat
                    line_length_sq = dx * dx + dy * dy

                    if line_length_sq > 0:
                        t = max(0, min(1, (px * dx + py * dy) / line_length_sq))
                        closest_lon = start_lon + t * dx
                        closest_lat = start_lat + t * dy
                        distance_to_route = get_distance_between_points(hazard['lat'], hazard['lon'], closest_lat, closest_lon)
                    else:
                        distance_to_route = get_distance_between_points(hazard['lat'], hazard['lon'], start_lat, start_lon)

                all_hazards.append({
                    'lat': hazard['lat'], 'lon': hazard['lon'],
                    'type': hazard_type, 'weight': weight,
                    'distance_to_route': distance_to_route
                })

        all_hazards.sort(key=lambda h: (h['distance_to_route'], -h['weight']))
        all_hazards = all_hazards[:max_hazards]

        if not all_hazards:
            logger.warning("[VALHALLA] No hazards found for exclude_locations")
            return []

        exclude_locations = [{"lat": h['lat'], "lon": h['lon']} for h in all_hazards]
        logger.info(f"[VALHALLA] Built {len(exclude_locations)} exclude_locations")
        return exclude_locations

    except Exception as e:
        logger.error(f"[VALHALLA] Error building exclude_locations: {e}")
        return []


def build_graphhopper_camera_avoidance_model(route_bbox: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """Build GraphHopper custom model that references camera areas within route bounding box."""
    try:
        area_conditions = []

        if route_bbox and CAMERA_AREAS_DATA:
            margin = 0.2
            lat_margin = (route_bbox['max_lat'] - route_bbox['min_lat']) * margin
            lon_margin = (route_bbox['max_lon'] - route_bbox['min_lon']) * margin

            bbox_min_lat = route_bbox['min_lat'] - lat_margin
            bbox_max_lat = route_bbox['max_lat'] + lat_margin
            bbox_min_lon = route_bbox['min_lon'] - lon_margin
            bbox_max_lon = route_bbox['max_lon'] + lon_margin

            for feature in CAMERA_AREAS_DATA.get('features', []):
                area_id = feature.get('id', '')
                if not area_id.startswith('camera_area_'):
                    continue

                try:
                    area_index = int(area_id.replace('camera_area_', ''))
                except ValueError:
                    continue

                geometry = feature.get('geometry', {})
                if geometry.get('type') == 'MultiPolygon':
                    coordinates = geometry.get('coordinates', [])
                    intersects = False
                    for polygon in coordinates:
                        for ring in polygon:
                            for coord in ring:
                                lon, lat = coord[0], coord[1]
                                if (bbox_min_lat <= lat <= bbox_max_lat and bbox_min_lon <= lon <= bbox_max_lon):
                                    intersects = True
                                    break
                            if intersects:
                                break
                        if intersects:
                            break

                    if intersects:
                        area_conditions.append(f"in_camera_area_{area_index}")

            logger.info(f"[GRAPHHOPPER] Filtered to {len(area_conditions)} camera areas within route bbox")
        else:
            for i in range(GRAPHHOPPER_CAMERA_AREAS_COUNT):
                area_conditions.append(f"in_camera_area_{i}")
            logger.info(f"[GRAPHHOPPER] Using ALL {len(area_conditions)} camera areas")

        if not area_conditions:
            logger.warning("[GRAPHHOPPER] No camera areas found - using empty model")
            return {}

        condition_str = " || ".join(area_conditions)
        custom_model = {"priority": [{"if": condition_str, "multiply_by": "0.01"}]}
        return custom_model

    except Exception as e:
        logger.error(f"[GRAPHHOPPER] Error building camera avoidance model: {e}")
        return {}


def get_hazards_on_route(route_points: List[Tuple[float, float]],
                         hazards: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Get list of hazards that are on or near the route."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        hazards_on_route = []

        cursor.execute("SELECT hazard_type, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
        preferences = {row[0]: {'threshold': row[1]} for row in cursor.fetchall()}
        return_db_connection(conn)

        try:
            if isinstance(route_points, str):
                if not polyline:
                    return []
                decoded_points = polyline.decode(route_points, 6)
            else:
                decoded_points = route_points
        except Exception as e:
            logger.error(f"Error decoding polyline: {e}")
            return []

        sample_interval = max(1, len(decoded_points) // 100)
        sampled_points = decoded_points[::sample_interval]

        for hazard_type, hazard_list in hazards.items():
            if hazard_type not in preferences or len(hazard_list) == 0:
                continue

            threshold = preferences[hazard_type]['threshold']

            for hazard in hazard_list:
                hazard_lat = hazard.get('lat')
                hazard_lon = hazard.get('lon')

                min_distance = float('inf')
                for point_lat, point_lon in sampled_points:
                    distance = get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                    min_distance = min(min_distance, distance)
                    if min_distance > threshold * 2:
                        break

                if min_distance <= threshold:
                    display_type = hazard.get('original_type', hazard_type)
                    hazards_on_route.append({
                        'lat': hazard_lat, 'lon': hazard_lon,
                        'type': display_type,
                        'description': hazard.get('description', 'Hazard detected'),
                        'distance': round(min_distance, 0)
                    })

        return hazards_on_route
    except Exception as e:
        logger.error(f"Error getting hazards on route: {e}")
        return []


def score_route_by_hazards(route_points: List[Tuple[float, float]],
                           hazards: Dict[str, List[Dict[str, Any]]]) -> Tuple[float, int]:
    """Calculate hazard score for a route based on proximity to hazards."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        total_penalty = 0
        hazard_count = 0

        # Get hazard preferences from database, or use defaults
        try:
            cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
            preferences = {row[0]: {'penalty': row[1], 'threshold': row[2]} for row in cursor.fetchall()}
            if not preferences:
                preferences = {
                    'camera': {'penalty': 60, 'threshold': 500},
                    'police': {'penalty': 30, 'threshold': 1000},
                    'roadworks': {'penalty': 15, 'threshold': 500},
                    'accident': {'penalty': 30, 'threshold': 500}
                }
        except Exception:
            preferences = {
                'camera': {'penalty': 60, 'threshold': 500},
                'police': {'penalty': 30, 'threshold': 1000},
                'roadworks': {'penalty': 15, 'threshold': 500},
                'accident': {'penalty': 30, 'threshold': 500}
            }

        return_db_connection(conn)

        try:
            if isinstance(route_points, str):
                if not polyline:
                    return 0, 0
                decoded_points = polyline.decode(route_points, 6)
            else:
                decoded_points = route_points
        except Exception as e:
            logger.error(f"[HAZARDS] Error decoding polyline: {e}")
            return 0, 0

        if not decoded_points:
            return 0, 0

        for hazard_type, hazard_list in hazards.items():
            if hazard_type not in preferences or len(hazard_list) == 0:
                continue

            pref = preferences[hazard_type]
            threshold = pref['threshold']
            penalty = pref['penalty']

            sample_interval = max(1, len(decoded_points) // 500)
            sampled_points = decoded_points[::sample_interval]

            for hazard in hazard_list:
                hazard_lat = hazard.get('lat')
                hazard_lon = hazard.get('lon')

                min_distance = float('inf')
                for point_lat, point_lon in sampled_points:
                    distance = get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                    min_distance = min(min_distance, distance)
                    if min_distance > threshold * 2:
                        break

                if min_distance <= threshold:
                    if hazard_type == 'camera':
                        proximity_multiplier = 1.0 + (2.0 * (1.0 - min_distance / threshold))
                        distance_multiplier = max(1.0, proximity_multiplier)
                        applied_penalty = penalty * distance_multiplier
                    else:
                        applied_penalty = penalty

                    total_penalty += applied_penalty
                    hazard_count += 1

        logger.info(f"[HAZARDS] Route scoring complete: total_penalty={total_penalty:.0f}s, hazard_count={hazard_count}")
        return total_penalty, hazard_count
    except Exception as e:
        logger.error(f"Error scoring route: {e}")
        return 0, 0

