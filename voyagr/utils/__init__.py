"""
Utility functions for Voyagr.

Contains:
- validation: Input validation and sanitization
- geometry: Geometric calculations and polygon operations
- rate_limiting: Rate limiting classes and decorators
- auth: Authentication decorators
"""

from voyagr.utils.validation import (
    sanitize_string,
    validate_coordinates,
    validate_routing_mode,
    validate_vehicle_type,
    validate_route_request,
)

from voyagr.utils.geometry import (
    point_in_polygon,
    decode_route_geometry,
    get_distance_between_points,
)

from voyagr.utils.rate_limiting import (
    RateLimiter,
    rate_limit,
)

from voyagr.utils.auth import (
    require_auth,
)

__all__ = [
    # Validation
    'sanitize_string',
    'validate_coordinates',
    'validate_routing_mode',
    'validate_vehicle_type',
    'validate_route_request',
    # Geometry
    'point_in_polygon',
    'decode_route_geometry',
    'get_distance_between_points',
    # Rate limiting
    'RateLimiter',
    'rate_limit',
    # Auth
    'require_auth',
]

