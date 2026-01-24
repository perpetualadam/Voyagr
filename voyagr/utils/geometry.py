"""
Geometric calculations and polygon operations.
"""

import math
import logging
from typing import List, Tuple, Union

# Try to import polyline for route geometry decoding
try:
    import polyline
except ImportError:
    polyline = None

logger = logging.getLogger('voyagr_web')


def point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    """
    Check if a point (lat, lon) is inside a polygon using ray casting algorithm.

    Args:
        lat: Latitude of the point
        lon: Longitude of the point
        polygon: List of (lat, lon) tuples defining the polygon vertices

    Returns:
        True if point is inside polygon, False otherwise
    """
    n = len(polygon)
    inside = False

    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]

        if ((yi > lon) != (yj > lon)) and (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


def decode_route_geometry(geometry: Union[str, List], precision: int = 5) -> List[Tuple[float, float]]:
    """Decode route geometry (polyline) to list of coordinates.

    Args:
        geometry: Encoded polyline string or list of coordinates
        precision: Polyline precision (5 for OSRM/GraphHopper, 6 for Valhalla)

    Returns:
        List of (lat, lon) tuples
    """
    if not geometry:
        return []

    try:
        # If it's already a list, return it
        if isinstance(geometry, list):
            return geometry

        # If it's a string, try to decode as polyline
        # OSRM and GraphHopper use precision 5, Valhalla uses precision 6
        if isinstance(geometry, str) and polyline:
            decoded = polyline.decode(geometry, precision)
            return decoded
    except Exception as e:
        logger.warning(f"Error decoding geometry: {e}")

    return []


def get_distance_between_points(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters using Haversine formula."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

