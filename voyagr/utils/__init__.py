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
    normalize_vehicle_type,
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
    rate_limit_page,
)

from voyagr.utils.auth import (
    require_auth,
    require_private_user,
)

__all__ = [
    # Validation
    'sanitize_string',
    'validate_coordinates',
    'validate_routing_mode',
    'normalize_vehicle_type',
    'validate_vehicle_type',
    'validate_route_request',
    # Geometry
    'point_in_polygon',
    'decode_route_geometry',
    'get_distance_between_points',
    # Rate limiting
    'RateLimiter',
    'rate_limit',
    'rate_limit_page',
    # Auth
    'require_auth',
    'require_private_user',
]

