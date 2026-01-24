"""
Input validation and sanitization utilities.
"""

import re
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger('voyagr_web')


def sanitize_string(value: str, max_length: int = 500) -> Optional[str]:
    """
    Sanitize string input to prevent SQL injection and XSS.
    Returns sanitized string or None if invalid.
    """
    if not value:
        return None

    # Limit length
    value = value[:max_length]

    # Remove potentially dangerous characters
    # Allow alphanumeric, spaces, and common punctuation
    sanitized = re.sub(r'[^\w\s\-.,&\'()]', '', value)

    return sanitized.strip() if sanitized else None


def validate_coordinates(coord_str: str) -> Optional[Tuple[float, float]]:
    """
    Validate coordinate string in format 'lat,lon'.
    Returns (lat, lon) tuple or None if invalid.
    """
    try:
        parts: List[str] = coord_str.strip().split(',')
        if len(parts) != 2:
            return None
        lat: float = float(parts[0].strip())
        lon: float = float(parts[1].strip())
        # Validate ranges
        if lat < -90 or lat > 90 or lon < -180 or lon > 180:
            return None
        return (lat, lon)
    except (ValueError, AttributeError):
        return None


def validate_routing_mode(mode: str) -> bool:
    """Validate routing mode."""
    valid_modes: List[str] = ['auto', 'pedestrian', 'bicycle']
    return mode in valid_modes


def validate_vehicle_type(vehicle_type: str) -> bool:
    """Validate vehicle type.

    Note: 'pedestrian' and 'bicycle' are valid when routing_mode matches,
    as they represent the travel mode rather than actual vehicle types.
    """
    valid_types: List[str] = ['petrol_diesel', 'electric', 'hybrid', 'pedestrian', 'bicycle']
    return vehicle_type in valid_types


def validate_route_request(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate route calculation request.
    Returns (is_valid, error_message) tuple.
    """
    try:
        if not data:
            return False, "Request body is empty"

        # Check required fields
        start: str = data.get('start', '').strip()
        end: str = data.get('end', '').strip()

        if not start or not end:
            return False, "Missing start or end location"

        # Validate coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)

        if not start_coords:
            return False, "Invalid start coordinates (format: lat,lon)"
        if not end_coords:
            return False, "Invalid end coordinates (format: lat,lon)"
    except Exception as e:
        logger.error(f"[VALIDATION ERROR] {str(e)}")
        return False, f"Validation error: {str(e)}"

    # Validate optional fields
    routing_mode = data.get('routing_mode', 'auto')
    if not validate_routing_mode(routing_mode):
        return False, f"Invalid routing_mode: {routing_mode}"

    vehicle_type = data.get('vehicle_type', 'petrol_diesel')
    if not validate_vehicle_type(vehicle_type):
        return False, f"Invalid vehicle_type: {vehicle_type}"

    return True, None

