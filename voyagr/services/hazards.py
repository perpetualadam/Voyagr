"""
Hazard detection and avoidance services.

Includes:
- fetch_hazards_for_route: Fetch hazards within route bounding box
- fetch_tomtom_incidents: Fetch real-time traffic incidents from TomTom API
- merge_hazards_with_tomtom_incidents: Merge static and real-time hazards
- build_graphhopper_custom_model: Build GraphHopper avoidance model
- build_valhalla_exclude_locations: Build Valhalla exclude locations list
- build_graphhopper_camera_avoidance_model: Camera-specific avoidance model
- fetch_traffic_lights_osm_bbox / fetch_railway_crossings_osm_bbox: OSM points for routing
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

from voyagr.config import GRAPHHOPPER_CAMERA_AREAS_COUNT
from voyagr.models import db_connection
from voyagr.utils import get_distance_between_points
from voyagr.utils.camera_buckets import normalize_camera_hazard_bucket

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


def get_graphhopper_camera_areas_count() -> int:
    """Number of server-side camera_area_N sections (from geojson or env, default 128)."""
    env_val = os.getenv('GRAPHHOPPER_CAMERA_AREAS_COUNT')
    if env_val and str(env_val).strip().isdigit():
        return int(env_val)
    if CAMERA_AREAS_DATA and CAMERA_AREAS_DATA.get('features'):
        return len(CAMERA_AREAS_DATA['features'])
    return 128


def _camera_area_indices_for_bbox(
    route_bbox: Dict[str, float],
    *,
    margin_scale: float = 0.2,
    min_margin_deg: float = 0.15,
) -> List[int]:
    """Return camera_area_N indices whose MultiPolygon intersects an expanded route bbox."""
    if not CAMERA_AREAS_DATA:
        return []

    lat_span = route_bbox['max_lat'] - route_bbox['min_lat']
    lon_span = route_bbox['max_lon'] - route_bbox['min_lon']
    lat_margin = max(lat_span * margin_scale, min_margin_deg)
    lon_margin = max(lon_span * margin_scale, min_margin_deg)

    bbox_min_lat = route_bbox['min_lat'] - lat_margin
    bbox_max_lat = route_bbox['max_lat'] + lat_margin
    bbox_min_lon = route_bbox['min_lon'] - lon_margin
    bbox_max_lon = route_bbox['max_lon'] + lon_margin

    indices: List[int] = []
    for feature in CAMERA_AREAS_DATA.get('features', []):
        area_id = feature.get('id', '')
        if not area_id.startswith('camera_area_'):
            continue
        try:
            area_index = int(area_id.replace('camera_area_', ''))
        except ValueError:
            continue

        geometry = feature.get('geometry', {})
        if geometry.get('type') != 'MultiPolygon':
            continue

        intersects = False
        for polygon in geometry.get('coordinates', []):
            for ring in polygon:
                for coord in ring:
                    lon, lat = coord[0], coord[1]
                    if bbox_min_lat <= lat <= bbox_max_lat and bbox_min_lon <= lon <= bbox_max_lon:
                        intersects = True
                        break
                if intersects:
                    break
            if intersects:
                break

        if intersects:
            indices.append(area_index)

    return sorted(set(indices))


def camera_map_data_filters_are_selective() -> bool:
    """
    True when Settings → Map data filters has disabled at least one camera_* type.

    UK camera_area_N sections are type-agnostic (all SCDB types in a grid cell). When the
    user turns types off, GraphHopper must use preference-filtered SCDB zones instead of
    (or without) those sections so disabled types are not hard-blocked.
    """
    try:
        from voyagr.config import CAMERA_HAZARD_BUCKETS

        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT hazard_type, enabled FROM hazard_preferences "
                "WHERE hazard_type LIKE 'camera_%' OR hazard_type = 'camera'"
            )
            rows = cursor.fetchall()
        if not rows:
            return False
        pref_on = {h[0]: bool(h[1]) for h in rows}
        for bucket in CAMERA_HAZARD_BUCKETS:
            if bucket in pref_on and not pref_on[bucket]:
                return True
        if pref_on.get('camera') is False:
            return True
        return False
    except Exception as e:
        logger.warning('[HAZARDS] camera_map_data_filters_are_selective: %s', e)
        return False


def build_graphhopper_combined_camera_model(
    camera_hazards: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    route_bbox: Optional[Dict[str, float]] = None,
    *,
    max_scdb_hazards: int = 40,
    use_area_sections: bool = True,
    selective_filters: Optional[bool] = None,
    start_lat: Optional[float] = None,
    start_lon: Optional[float] = None,
    end_lat: Optional[float] = None,
    end_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    GraphHopper camera avoidance for ⚡ Optimised.

    - UK grid sections (camera_area_N) cover all cameras in populated cells (not just top N).
    - Preference-filtered SCDB inline zones apply Settings → Map data filters and catch
      live DB cameras missing from the static area snapshot.
    - When map-data filters disable any camera type, skip type-agnostic area sections and
      use SCDB zones only (higher cap) so selected types are blocked and disabled are not.
    """
    parts: List[Optional[Dict[str, Any]]] = []
    has_filtered = bool(camera_hazards and any(camera_hazards.values()))
    if selective_filters is None:
        selective_filters = camera_map_data_filters_are_selective() if has_filtered else False

    # Area sections are all-types; skip them when the user has turned subtypes off.
    if use_area_sections and not selective_filters:
        area_model = build_graphhopper_camera_avoidance_model(route_bbox)
        if area_model:
            parts.append(area_model)

    if has_filtered:
        # Broader SCDB cap when areas are unavailable or skipped for filter precision.
        scdb_cap = max_scdb_hazards
        if selective_filters or not parts:
            scdb_cap = max(max_scdb_hazards, 80)
        filtered = build_graphhopper_filtered_camera_model(
            camera_hazards,
            route_bbox=route_bbox,
            max_hazards=scdb_cap,
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
        )
        if filtered:
            parts.append(filtered)

    return merge_graphhopper_custom_model_parts(*parts) or {}


def fetch_hazards_for_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, List[Dict[str, Any]]]:
    """Fetch hazards within bounding box of route."""
    try:
        with db_connection() as conn:
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
                    parsed: Dict[str, Any] = json.loads(cached_data)
                    # Migrate legacy single 'camera' bucket to camera_speed for older caches.
                    if parsed.get('camera') and not any(k.startswith('camera_') for k in parsed):
                        parsed['camera_speed'] = parsed.pop('camera', [])
                    return parsed

            hazards: Dict[str, List[Dict[str, Any]]] = {
                'camera_speed': [],
                'camera_red_light': [],
                'camera_average_speed': [],
                'camera_bus_lane': [],
                'camera_mobile': [],
                'camera_other': [],
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
                bucket = normalize_camera_hazard_bucket(camera_type)
                if bucket not in hazards:
                    bucket = 'camera_other'
                hazards[bucket].append({
                    'lat': lat,
                    'lon': lon,
                    'type': bucket,
                    'description': desc or '',
                    'severity': 'high',
                })

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

    cam_keys = ('camera_speed', 'camera_red_light', 'camera_average_speed', 'camera_bus_lane', 'camera_mobile', 'camera_other')
    camera_count = sum(len(merged.get(k, [])) for k in cam_keys)
    tomtom_count = sum(len(tomtom_incidents.get(t, [])) for t in tomtom_incidents.keys())
    total_count = sum(len(v) for v in merged.values())
    logger.info(f"[HYBRID] Merged hazards: {camera_count} cameras + {tomtom_count} TomTom incidents = {total_count} total")

    return merged


CAMERA_HAZARD_BUCKET_KEYS = (
    'camera_speed',
    'camera_red_light',
    'camera_average_speed',
    'camera_bus_lane',
    'camera_mobile',
    'camera_other',
    'camera',
)


def build_graphhopper_filtered_camera_model(
    hazards: Dict[str, List[Dict[str, Any]]],
    route_bbox: Optional[Dict[str, float]] = None,
    max_hazards: int = 40,
    *,
    start_lat: Optional[float] = None,
    start_lon: Optional[float] = None,
    end_lat: Optional[float] = None,
    end_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """GraphHopper avoidance zones for enabled camera_* buckets (respects map-data filters)."""
    camera_only = {k: list(hazards.get(k, [])) for k in CAMERA_HAZARD_BUCKET_KEYS if hazards.get(k)}
    if not any(camera_only.values()):
        return {}
    return build_graphhopper_custom_model(
        camera_only,
        route_bbox=route_bbox,
        max_hazards=max_hazards,
        start_lat=start_lat,
        start_lon=start_lon,
        end_lat=end_lat,
        end_lon=end_lon,
    )


# Align GraphHopper polygon weights with Valhalla exclude_locations priority.
GRAPHOPPER_HAZARD_WEIGHTS: Dict[str, float] = {
    'avoid_point': 60.0,
    'camera': 50.0,
    'road_closed': 45.0,
    'police': 40.0,
    'accident': 35.0,
    'traffic_light': 38.0,
    'lane_closed': 32.0,
    'roadworks': 30.0,
    'jam': 25.0,
    'railway_crossing': 35.0,
    'pothole': 15.0,
    'debris': 15.0,
}
MIN_GRAPHOPPER_HAZARD_WEIGHT = 15.0
# Valhalla-style hard block: edges inside hazard polygons are unusable (not merely costly).
# If GraphHopper cannot find a path, engines refuse unfiltered fallback and Valhalla takes over.
GRAPHHOPPER_HAZARD_BLOCK_MULTIPLY_BY = '0'

# TomTom / live-incident buckets merged into GraphHopper custom models (Valhalla parity).
GRAPHHOPPER_LIVE_INCIDENT_BUCKETS: Tuple[str, ...] = (
    'road_closed', 'police', 'accident', 'roadworks', 'jam', 'lane_closed',
)


def extract_graphhopper_live_incident_hazards(
    hazards: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, List[Dict[str, Any]]]:
    """Return live-incident hazard buckets for GraphHopper dynamic polygons."""
    out: Dict[str, List[Dict[str, Any]]] = {}
    for key in GRAPHHOPPER_LIVE_INCIDENT_BUCKETS:
        bucket = hazards.get(key)
        if bucket:
            out[key] = list(bucket)
    return out


def build_graphhopper_custom_model(hazards: Dict[str, List[Dict[str, Any]]],
                                   route_bbox: Optional[Dict[str, float]] = None,
                                   max_hazards: int = 25,
                                   *,
                                   start_lat: Optional[float] = None,
                                   start_lon: Optional[float] = None,
                                   end_lat: Optional[float] = None,
                                   end_lon: Optional[float] = None) -> Dict[str, Any]:
    """Build GraphHopper custom model that hard-blocks hazards via circular zones."""
    try:
        all_hazards = []
        hazard_weights = dict(GRAPHOPPER_HAZARD_WEIGHTS)
        has_corridor = (
            start_lat is not None and start_lon is not None
            and end_lat is not None and end_lon is not None
        )

        for hazard_type, hazard_list in hazards.items():
            weight = hazard_weights.get(hazard_type, 10.0)
            if hazard_type == 'camera_red_light':
                weight = 100.0
            elif hazard_type.startswith('camera_'):
                weight = hazard_weights.get('camera', 50.0)
            if weight >= MIN_GRAPHOPPER_HAZARD_WEIGHT:
                for hazard in hazard_list:
                    if route_bbox:
                        margin = 0.1
                        lat_margin = (route_bbox['max_lat'] - route_bbox['min_lat']) * margin
                        lon_margin = (route_bbox['max_lon'] - route_bbox['min_lon']) * margin
                        if not (route_bbox['min_lat'] - lat_margin <= hazard['lat'] <= route_bbox['max_lat'] + lat_margin and
                                route_bbox['min_lon'] - lon_margin <= hazard['lon'] <= route_bbox['max_lon'] + lon_margin):
                            continue
                    distance_to_route = float('inf')
                    if has_corridor:
                        dx = end_lon - start_lon
                        dy = end_lat - start_lat
                        px = hazard['lon'] - start_lon
                        py = hazard['lat'] - start_lat
                        line_length_sq = dx * dx + dy * dy
                        if line_length_sq > 0:
                            t = max(0, min(1, (px * dx + py * dy) / line_length_sq))
                            closest_lon = start_lon + t * dx
                            closest_lat = start_lat + t * dy
                            distance_to_route = get_distance_between_points(
                                hazard['lat'], hazard['lon'], closest_lat, closest_lon,
                            )
                        else:
                            distance_to_route = get_distance_between_points(
                                hazard['lat'], hazard['lon'], start_lat, start_lon,
                            )
                    all_hazards.append({
                        'lat': hazard['lat'],
                        'lon': hazard['lon'],
                        'type': hazard_type,
                        'weight': weight,
                        'distance_to_route': distance_to_route,
                    })

        if has_corridor:
            # Prefer cameras near the A→B corridor so the capped SCDB list blocks
            # selected map-data points that matter for this journey (Valhalla parity).
            all_hazards.sort(key=lambda h: (h['distance_to_route'], -h['weight']))
        else:
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

            # Hard-block like Valhalla exclude_locations (soft 0.01/0.1 still let
            # cameras through when the detour looked too costly).
            priority_rules.append({
                "if": f"in_{area_id}",
                "multiply_by": GRAPHHOPPER_HAZARD_BLOCK_MULTIPLY_BY,
            })

        custom_model = {"priority": priority_rules, "areas": areas_geojson}
        logger.info(
            f"[CUSTOM_MODEL] Built hard-block model with {len(all_hazards)} hazard areas "
            f"(multiply_by={GRAPHHOPPER_HAZARD_BLOCK_MULTIPLY_BY})"
        )
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
            'avoid_point': 60.0,       # Explicit client reroute avoid (congestion/closure) - top priority
            'camera': 50.0,
            'road_closed': 45.0, 'police': 40.0, 'accident': 35.0,
            'traffic_light': 38.0,
            'lane_closed': 32.0, 'roadworks': 30.0, 'jam': 25.0,
            'railway_crossing': 20.0, 'pothole': 15.0, 'debris': 15.0
        }

        all_hazards = []

        for hazard_type, hazard_list in hazards.items():
            weight = hazard_weights.get(hazard_type, 10.0)
            if hazard_type.startswith('camera_'):
                weight = hazard_weights.get('camera', 50.0)
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
            logger.warning("[VALHALLA] No high-priority hazards found for exclude_locations")
            return []

        exclude_locations = [{"lat": h['lat'], "lon": h['lon']} for h in all_hazards]
        logger.info(f"[VALHALLA] Built {len(exclude_locations)} exclude_locations")
        return exclude_locations

    except Exception as e:
        logger.error(f"[VALHALLA] Error building exclude_locations: {e}")
        return []


def build_graphhopper_camera_avoidance_model(route_bbox: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """
    Build GraphHopper custom model that hard-blocks server-side UK camera grid sections.

    GraphHopper loads camera_areas.geojson at startup; each feature camera_area_N exposes
    in_camera_area_N in the custom model. We filter sections by route bbox for performance.
    multiply_by=0 matches Valhalla exclude_locations behaviour (road unusable, not merely costly).
    """
    try:
        total_areas = get_graphhopper_camera_areas_count()
        area_conditions: List[str] = []

        if route_bbox and CAMERA_AREAS_DATA:
            indices = _camera_area_indices_for_bbox(route_bbox)
            if not indices:
                indices = _camera_area_indices_for_bbox(
                    route_bbox, margin_scale=0.5, min_margin_deg=0.25,
                )
            area_conditions = [f'in_camera_area_{i}' for i in indices]
            logger.info(
                f'[GRAPHHOPPER] Filtered to {len(area_conditions)} camera area sections '
                f'within route bbox (from {total_areas} UK sections)'
            )
        elif CAMERA_AREAS_DATA:
            for feature in CAMERA_AREAS_DATA.get('features', []):
                area_id = feature.get('id', '')
                if area_id.startswith('camera_area_'):
                    try:
                        area_conditions.append(f"in_camera_area_{int(area_id.replace('camera_area_', ''))}")
                    except ValueError:
                        continue
            logger.info(f'[GRAPHHOPPER] Using ALL {len(area_conditions)} camera area sections')
        else:
            for i in range(total_areas):
                area_conditions.append(f'in_camera_area_{i}')
            logger.info(
                f'[GRAPHHOPPER] Using {len(area_conditions)} camera area sections '
                f'(geojson not loaded, count from env/default)'
            )

        if not area_conditions:
            logger.warning('[GRAPHHOPPER] No camera area sections matched route bbox')
            return {}

        condition_str = ' || '.join(area_conditions)
        # Hard-block camera zones (Valhalla exclude_locations parity). Soft 0.01
        # still allowed Optimised through cameras when the detour looked expensive.
        return {
            'priority': [{
                'if': condition_str,
                'multiply_by': GRAPHHOPPER_HAZARD_BLOCK_MULTIPLY_BY,
            }],
        }

    except Exception as e:
        logger.error(f'[GRAPHHOPPER] Error building camera avoidance model: {e}')
        return {}


def _hazard_marker_display_type(hazard_category: str, hazard: Dict[str, Any]) -> str:
    """
    Stable `type` strings for map markers. Camera rows must use camera_* keys so the PWA picks
    the right icon; do not forward raw SCDB/TomTom description strings from `original_type`.
    """
    hc = (hazard_category or "").strip()
    if hc == "camera":
        return "camera_speed"
    if hc.startswith("camera_"):
        return hc
    ot = hazard.get("original_type")
    if ot is None:
        return hc
    s = str(ot).strip()
    if s.isdigit():
        return hc
    return s


def _default_hazard_proximity_preferences() -> Dict[str, Dict[str, Any]]:
    return {
        'camera_speed': {'threshold': 500},
        'camera_red_light': {'threshold': 120},
        'camera_average_speed': {'threshold': 500},
        'camera_bus_lane': {'threshold': 500},
        'camera_mobile': {'threshold': 500},
        'camera_other': {'threshold': 500},
        'camera': {'threshold': 500},
        'traffic_light': {'threshold': 80},
        'police': {'threshold': 1000},
        'roadworks': {'threshold': 500},
        'accident': {'threshold': 500},
    }


def _load_hazard_proximity_preferences(cursor: Any) -> Dict[str, Dict[str, Any]]:
    try:
        cursor.execute(
            "SELECT hazard_type, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1"
        )
        preferences = {row[0]: {'threshold': row[1]} for row in cursor.fetchall()}
        if preferences:
            return preferences
    except Exception as e:
        logger.info("[HAZARDS] hazard_preferences lookup failed, using defaults: %s", e)
    return _default_hazard_proximity_preferences()


def get_hazards_on_route(route_points: List[Tuple[float, float]],
                         hazards: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Get list of hazards that are on or near the route."""
    try:
        hazards_on_route = []

        with db_connection() as conn:
            cursor = conn.cursor()
            preferences = _load_hazard_proximity_preferences(cursor)

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

        # Sample route points — match score_route density so hazard lists align with counts.
        sample_interval = max(1, len(decoded_points) // 500)
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
                    display_type = _hazard_marker_display_type(hazard_type, hazard)
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
        total_penalty = 0
        hazard_count = 0

        # Get hazard preferences from database, or use defaults
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
                preferences = {row[0]: {'penalty': row[1], 'threshold': row[2]} for row in cursor.fetchall()}
                if not preferences:
                    preferences = {
                        'camera_speed': {'penalty': 800, 'threshold': 500},
                        'camera_red_light': {'penalty': 1200, 'threshold': 120},
                        'camera_average_speed': {'penalty': 800, 'threshold': 500},
                        'camera_bus_lane': {'penalty': 800, 'threshold': 500},
                        'camera_mobile': {'penalty': 800, 'threshold': 500},
                        'camera_other': {'penalty': 800, 'threshold': 500},
                        'camera': {'penalty': 800, 'threshold': 500},
                        'traffic_light': {'penalty': 45, 'threshold': 80},
                        'police': {'penalty': 30, 'threshold': 1000},
                        'roadworks': {'penalty': 15, 'threshold': 500},
                        'accident': {'penalty': 30, 'threshold': 500}
                    }
            except Exception:
                preferences = {
                    'camera_speed': {'penalty': 800, 'threshold': 500},
                    'camera_red_light': {'penalty': 1200, 'threshold': 120},
                    'camera_average_speed': {'penalty': 800, 'threshold': 500},
                    'camera_bus_lane': {'penalty': 800, 'threshold': 500},
                    'camera_mobile': {'penalty': 800, 'threshold': 500},
                    'camera_other': {'penalty': 800, 'threshold': 500},
                    'camera': {'penalty': 800, 'threshold': 500},
                    'traffic_light': {'penalty': 45, 'threshold': 80},
                    'police': {'penalty': 30, 'threshold': 1000},
                    'roadworks': {'penalty': 15, 'threshold': 500},
                    'accident': {'penalty': 30, 'threshold': 500}
                }

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
                    if hazard_type == 'traffic_light' or hazard_type.startswith('camera_') or hazard_type == 'camera':
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


def fetch_traffic_lights_osm_bbox(
    south: float,
    north: float,
    west: float,
    east: float,
    max_nodes: int = 120,
) -> List[Dict[str, Any]]:
    """Load traffic signal nodes from OpenStreetMap via Overpass (bounding box)."""
    out: List[Dict[str, Any]] = []
    try:
        from overpass_helper import query_overpass, build_traffic_signals_query
    except ImportError:
        logger.warning("[TRAFFIC_LIGHTS] overpass_helper not available")
        return out

    if abs(north - south) > 0.35 or abs(east - west) > 0.35:
        logger.info("[TRAFFIC_LIGHTS] BBox too large; skipping OSM traffic lights fetch")
        return out

    query = build_traffic_signals_query(south, west, north, east)
    cache_key = f"tl_bbox_{south:.4f}_{west:.4f}_{north:.4f}_{east:.4f}"
    result = query_overpass(query, cache_key=cache_key, cache_ttl=300)
    if not result.get('success'):
        logger.warning(f"[TRAFFIC_LIGHTS] Overpass failed: {result.get('error')}")
        return out

    for el in result.get('elements', [])[:max_nodes]:
        lat = el.get('lat')
        lon = el.get('lon')
        if lat is None or lon is None:
            continue
        out.append({
            'lat': float(lat),
            'lon': float(lon),
            'description': 'Traffic light (OSM)',
            'severity': 'medium',
        })
    logger.info(f"[TRAFFIC_LIGHTS] Loaded {len(out)} OSM traffic signals in bbox")
    return out


def fetch_railway_crossings_osm_bbox(
    south: float,
    north: float,
    west: float,
    east: float,
    max_nodes: int = 100,
) -> List[Dict[str, Any]]:
    """Load road–rail level crossing nodes from OpenStreetMap via Overpass (bounding box)."""
    out: List[Dict[str, Any]] = []
    try:
        from overpass_helper import query_overpass, build_railway_level_crossings_query
    except ImportError:
        logger.warning("[RAILWAY_CROSSINGS] overpass_helper not available")
        return out

    if abs(north - south) > 0.35 or abs(east - west) > 0.35:
        logger.info("[RAILWAY_CROSSINGS] BBox too large; skipping OSM railway crossing fetch")
        return out

    query = build_railway_level_crossings_query(south, west, north, east)
    cache_key = f"rx_bbox_{south:.4f}_{west:.4f}_{north:.4f}_{east:.4f}"
    result = query_overpass(query, cache_key=cache_key, cache_ttl=300)
    if not result.get("success"):
        logger.warning(f"[RAILWAY_CROSSINGS] Overpass failed: {result.get('error')}")
        return out

    for el in result.get("elements", [])[:max_nodes]:
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None or lon is None:
            continue
        out.append({
            "lat": float(lat),
            "lon": float(lon),
            "description": "Railway level crossing (OSM)",
            "severity": "medium",
        })
    logger.info(f"[RAILWAY_CROSSINGS] Loaded {len(out)} OSM level crossings in bbox")
    return out


def merge_graphhopper_custom_model_parts(
    *parts: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Merge any number of GraphHopper custom models (camera rules, OSM hazard polygons, CAZ polygons).
    Concatenates priority rules and combines all FeatureCollection areas.
    """
    models = [p for p in parts if p]
    if not models:
        return None
    merged: Dict[str, Any] = {'priority': []}
    speed_rules: List[Dict[str, Any]] = []
    for m in models:
        merged['priority'].extend(m.get('priority', []))
        speed_rules.extend(m.get('speed', []))
    fc_features: List[Dict[str, Any]] = []
    for m in models:
        areas = m.get('areas')
        if areas and areas.get('features'):
            fc_features.extend(areas['features'])
    if fc_features:
        merged['areas'] = {'type': 'FeatureCollection', 'features': fc_features}
    if speed_rules:
        merged['speed'] = speed_rules
    return merged


def merge_graphhopper_custom_models(
    camera_model: Optional[Dict[str, Any]],
    dynamic_model: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Merge camera-area priority rules with dynamic hazard polygons (e.g. traffic lights)."""
    return merge_graphhopper_custom_model_parts(camera_model, dynamic_model)


def _caz_polygon_bounds_overlap_route_bbox(
    polygon_latlon: List[Tuple[float, float]],
    route_bbox: Dict[str, float],
) -> bool:
    """True if CAZ polygon bounding box overlaps the route bounding box (with small margin)."""
    if len(polygon_latlon) < 3:
        return False
    lats = [p[0] for p in polygon_latlon]
    lons = [p[1] for p in polygon_latlon]
    pl, ph = min(lats), max(lats)
    pwl, pel = min(lons), max(lons)
    m = 0.02
    return not (
        ph < route_bbox['min_lat'] - m
        or pl > route_bbox['max_lat'] + m
        or pel < route_bbox['min_lon'] - m
        or pwl > route_bbox['max_lon'] + m
    )


def build_graphhopper_caz_avoidance_model(
    route_bbox: Optional[Dict[str, float]],
) -> Dict[str, Any]:
    """
    GraphHopper custom model: penalize edges inside UK CAZ/ULEZ polygons that overlap the route bbox.
    Uses the same polygon data as cost calculation (voyagr.config.CAZ_ZONES_DATA).
    """
    if not route_bbox:
        return {}
    try:
        from voyagr.config import CAZ_ZONES_DATA
    except ImportError:
        return {}

    features: List[Dict[str, Any]] = []
    priority_rules: List[Dict[str, str]] = []

    for zone_id, zone_data in CAZ_ZONES_DATA.items():
        poly = zone_data.get('polygon') or []
        if len(poly) < 4:
            continue
        if not _caz_polygon_bounds_overlap_route_bbox(poly, route_bbox):
            continue

        safe_id = ''.join(c if c.isalnum() or c == '_' else '_' for c in zone_id)
        feat_id = f'caz_{safe_id}'
        ring = [[float(pt[1]), float(pt[0])] for pt in poly]
        if ring[0] != ring[-1]:
            ring.append(ring[0])

        features.append({
            'type': 'Feature',
            'id': feat_id,
            'geometry': {'type': 'Polygon', 'coordinates': [ring]},
        })
        priority_rules.append({'if': f'in_{feat_id}', 'multiply_by': '0.02'})

    if not features:
        return {}

    logger.info(f"[GRAPHHOPPER] CAZ avoidance model: {len(features)} zone polygon(s)")
    return {
        'priority': priority_rules,
        'areas': {'type': 'FeatureCollection', 'features': features},
    }


def get_caz_valhalla_exclude_points(
    route_bbox: Dict[str, float],
    max_points: int = 12,
) -> List[Dict[str, float]]:
    """
    Sample points inside/overlapping CAZ zones for Valhalla exclude_locations (cap 50 total with other avoids).
    One centroid + one vertex per overlapping zone until max_points.
    """
    try:
        from voyagr.config import CAZ_ZONES_DATA
    except ImportError:
        return []

    out: List[Dict[str, float]] = []
    seen = set()

    def _add(lat: float, lon: float) -> None:
        key = (round(lat, 4), round(lon, 4))
        if key in seen or len(out) >= max_points:
            return
        seen.add(key)
        out.append({'lat': lat, 'lon': lon})

    for _zone_id, zone_data in CAZ_ZONES_DATA.items():
        poly = zone_data.get('polygon') or []
        if len(poly) < 3:
            continue
        if not _caz_polygon_bounds_overlap_route_bbox(poly, route_bbox):
            continue
        nlat = sum(p[0] for p in poly) / len(poly)
        nlon = sum(p[1] for p in poly) / len(poly)
        _add(nlat, nlon)
        if len(out) >= max_points:
            break
        mid = poly[len(poly) // 2]
        _add(float(mid[0]), float(mid[1]))

    if out:
        logger.info(f"[VALHALLA] CAZ exclude sample points: {len(out)}")
    return out[:max_points]


def build_prioritised_valhalla_exclude_locations(
    hazards: Dict[str, List[Dict[str, Any]]],
    *,
    route_bbox: Dict[str, float],
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    apply_caz_routing_avoidance: bool,
) -> List[Dict[str, float]]:
    """
    Assemble the Valhalla ``exclude_locations`` list for the primary /api/route
    request, respecting Valhalla's hard cap of 50 avoid locations.

    Priority order (highest first): explicit ``avoid_point`` reroute markers, road
    closures, CAZ sample points, then general hazards (cameras/etc.). Returns [] on
    any failure so routing still proceeds. Extracted verbatim from
    voyagr_web.calculate_route.
    """
    exclude_locations: List[Dict[str, float]] = []
    try:
        # Reserve slots for road closures (higher priority than cameras)
        road_closures = hazards.get('road_closed', [])
        closure_excludes = [{"lat": c["lat"], "lon": c["lon"]}
                            for c in road_closures[:15]
                            if "lat" in c and "lon" in c]
        # Explicit avoid_points (reroute around congestion/closures) take the
        # very top priority — reserve their slots before cameras/CAZ.
        avoid_point_hazards = hazards.get('avoid_point', [])
        avoid_excludes = [{"lat": c["lat"], "lon": c["lon"]}
                          for c in avoid_point_hazards[:10]
                          if "lat" in c and "lon" in c]
        remaining_slots = 50 - len(closure_excludes) - len(avoid_excludes)

        caz_excludes = get_caz_valhalla_exclude_points(
            route_bbox, max_points=min(12, max(4, remaining_slots // 4))
        ) if apply_caz_routing_avoidance else []
        remaining_slots = max(remaining_slots - len(caz_excludes), 0)

        exclude_locations = build_valhalla_exclude_locations(
            hazards,
            route_bbox=route_bbox,
            max_hazards=max(remaining_slots, 8),
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon
        )
        if caz_excludes:
            exclude_locations = caz_excludes + [
                loc for loc in exclude_locations
                if loc not in caz_excludes
            ]
            exclude_locations = exclude_locations[:50]
            logger.info(f"[VALHALLA] Added {len(caz_excludes)} CAZ sample points to exclude_locations")
        if closure_excludes:
            exclude_locations = closure_excludes + [
                loc for loc in exclude_locations
                if loc not in closure_excludes
            ]
            exclude_locations = exclude_locations[:50]
            logger.info(f"[VALHALLA] Added {len(closure_excludes)} road closures to exclude_locations")
        if avoid_excludes:
            exclude_locations = avoid_excludes + [
                loc for loc in exclude_locations
                if loc not in avoid_excludes
            ]
            exclude_locations = exclude_locations[:50]
            logger.info(f"[VALHALLA] Added {len(avoid_excludes)} explicit avoid_points to exclude_locations")
        if exclude_locations:
            logger.info(f"[VALHALLA] Using {len(exclude_locations)} exclude_locations for hazard avoidance")
        else:
            logger.warning("[VALHALLA] No exclude_locations generated, using standard routing")
    except Exception as e:
        logger.warning(f"[VALHALLA] Failed to build exclude_locations: {e}")
        exclude_locations = []
    return exclude_locations
