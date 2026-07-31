#!/usr/bin/env python3
"""
Voyagr Web App - Full-featured Flask-based navigation app
Run this on your PC and access from any device with a browser
Features: Route calculation, cost estimation, multi-stop routing, trip history, vehicle profiles
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
import json
import sqlite3
import sys
from datetime import datetime
import threading
import math
import time
from functools import wraps
from collections import OrderedDict
import logging
from typing import List, Dict, Tuple, Optional, Any, Callable, TypeVar, Set

# Under `python voyagr_web.py` (the Procfile entrypoint) this file runs as __main__,
# leaving sys.modules['voyagr_web'] unset. The routing services import it lazily by
# name at request time, which would execute the file a second time and build a
# duplicate set of module-level singletons — a second route cache, cost calculator
# and blueprint wiring. The later registration wins, so /api/cache-clear and the
# preference-change invalidation would then target a cache nothing reads from.
# Aliasing the running module keeps both names pointing at one instance.
if __name__ == '__main__':
    sys.modules.setdefault('voyagr_web', sys.modules['__main__'])

from voyagr.utils.camera_buckets import normalize_camera_hazard_bucket
from voyagr.utils.graphhopper import GH_SIGN_TO_VALHALLA, remap_shape_index_after_reencode
from voyagr.utils.osrm import build_osrm_maneuvers, infer_road_class_from_names

F = TypeVar('F', bound=Callable[..., Any])

# Optional imports with fallbacks
try:
    import polyline
except ImportError:
    polyline = None  # type: ignore

try:
    from flask_compress import Compress
except ImportError:
    Compress = None  # type: ignore

# Optional rate limiting for DoS protection
try:
    from flask_limiter import Limiter
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    Limiter = None  # type: ignore
    RATE_LIMITING_AVAILABLE = False

# Import speed limit detector
try:
    from speed_limit_detector import SpeedLimitDetector
except ImportError:
    SpeedLimitDetector = None  # type: ignore

# Import routing monitor
try:
    from routing_monitor import get_monitor
except ImportError:
    get_monitor = None  # type: ignore



# Import Overpass API helper with caching and retry logic
try:
    from overpass_helper import query_overpass, build_traffic_signals_query, build_poi_query, get_overpass_cache_stats
    OVERPASS_HELPER_AVAILABLE = True
except ImportError:
    query_overpass = None  # type: ignore
    build_traffic_signals_query = None  # type: ignore
    build_poi_query = None  # type: ignore
    get_overpass_cache_stats = None  # type: ignore
    OVERPASS_HELPER_AVAILABLE = False

# Load .env from the same directory as this script (important for gunicorn)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_env_path = os.path.join(_script_dir, '.env')
load_dotenv(_env_path)

app = Flask(__name__, static_folder='static', static_url_path='/static')

# Reverse proxy: fix scheme / client IP when the edge sets X-Forwarded-* (nginx on Contabo).
if os.getenv('VOYAGR_TRUST_PROXY', '').strip().lower() in ('1', 'true', 'yes'):
    try:
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)
    except Exception as _pf_err:
        logging.getLogger(__name__).warning('[SECURITY] ProxyFix not applied: %s', _pf_err)

# Client IP for in-process rate limiters (uses X-Forwarded-For when VOYAGR_TRUST_PROXY=1)
from voyagr.utils.client_ip import get_client_ip  # noqa: E402

# Enable CORS for mobile compatibility
# Restrict origins to prevent CSRF attacks
def _get_allowed_origins() -> List[str]:
    """Get list of allowed CORS origins from config and environment."""
    origins: List[str] = [
        "http://localhost:5000",
        "http://localhost:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:3000",
    ]

    # Add environment-configured origins (comma-separated), e.g. https://app.yourdomain.com
    env_origins = os.getenv('ALLOWED_ORIGINS', '').strip()
    if env_origins:
        origins.extend([origin.strip() for origin in env_origins.split(',') if origin.strip()])

    # Single canonical site URL (e.g. DuckDNS) — avoids duplicating it in ALLOWED_ORIGINS for /api CORS
    public_origin = (os.getenv('VOYAGR_PUBLIC_ORIGIN') or '').strip().rstrip('/')
    if public_origin:
        origins.append(public_origin)

    # De-dupe while preserving order
    seen: Set[str] = set()
    out: List[str] = []
    for o in origins:
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out

ALLOWED_ORIGINS: List[str] = _get_allowed_origins()

CORS(app, resources={
    r"/api/*": {
        "origins": ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["http://localhost:5000"],
        "methods": ["GET", "POST", "OPTIONS", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization", "X-API-Key"],
        "supports_credentials": False
    }
})

# ============================================================================
# MODULAR API BLUEPRINTS REGISTRATION
# ============================================================================
# Import and register API blueprints from voyagr.api module
# These blueprints contain extracted route handlers organized by functionality
from voyagr.discoverability import block_search_indexing
from voyagr.config.rates import resolve_route_cost_params
from voyagr.api import (
    register_blueprints,
    set_route_cache,
    set_fallback_optimizer,
    set_voice_limiter,
    set_speed_limit_detector,
    set_monitor,
    set_cost_calculator
)

# Register all API blueprints with the Flask app
# Note: The blueprints are registered here, but the setter functions
# will be called later after the corresponding instances are initialized
register_blueprints(app)


@app.after_request
def _voyagr_discoverability_headers(response):
    """Discourage crawlers when VOYAGR_BLOCK_SEARCH_INDEXING is set (no SecurityConfig dependency)."""
    if block_search_indexing():
        response.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
    return response

# ============================================================================
# DASHCAM BLUEPRINT INITIALIZATION
# ============================================================================
# Import dashcam blueprint (will be initialized after DB setup)
try:
    from dashcam_blueprint import init_dashcam_blueprint
    dashcam_available = True
except ImportError:
    dashcam_available = False
    logger_temp = logging.getLogger(__name__)
    logger_temp.warning("Dashcam blueprint not available")

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('voyagr_web.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ============================================================================
# RATE LIMITING
# ============================================================================
from voyagr.config.rate_limit_storage import rate_limit_storage_uri
from voyagr.utils.rate_limiting import RateLimiter, rate_limit
# Canonical validation + geometry helpers live in the voyagr package. Import them here
# instead of redefining, so the monolith and API blueprints share one implementation.
from voyagr.utils.validation import (
    sanitize_string,
    validate_coordinates,
    validate_routing_mode,
    normalize_vehicle_type,
    validate_vehicle_type,
)
from voyagr.utils.geometry import (
    point_in_polygon,
    get_distance_between_points,
    decode_route_geometry,
)

route_limiter = RateLimiter(max_requests=100, window_seconds=60, key_prefix='voyagr:rl:route')
api_limiter = RateLimiter(max_requests=500, window_seconds=60, key_prefix='voyagr:rl:api')
auth_limiter = RateLimiter(max_requests=20, window_seconds=60, key_prefix='voyagr:rl:auth')
voice_limiter = RateLimiter(max_requests=60, window_seconds=60, key_prefix='voyagr:rl:voice')

# Set voice_limiter for navigation blueprint
set_voice_limiter(voice_limiter)

# Initialize Flask-Limiter if available (more robust, supports Redis backend)
flask_limiter: Optional[Any] = None
_RATELIMIT_STORAGE_URI = rate_limit_storage_uri()
if RATE_LIMITING_AVAILABLE and Limiter is not None:
    try:
        flask_limiter = Limiter(
            key_func=get_client_ip,
            app=app,
            default_limits=["500 per minute", "10000 per hour"],
            storage_uri=_RATELIMIT_STORAGE_URI,
        )
        logger.info(
            "[SECURITY] Flask-Limiter enabled (storage=%s) with default limits: 500/min, 10000/hr",
            _RATELIMIT_STORAGE_URI.split('://')[0] if '://' in _RATELIMIT_STORAGE_URI else _RATELIMIT_STORAGE_URI,
        )
    except Exception as e:
        logger.warning(f"[SECURITY] Flask-Limiter initialization failed: {e}. Using fallback.")
        flask_limiter = None
else:
    logger.info("[SECURITY] Flask-Limiter not available. Using in-memory rate limiting.")

# ============================================================================
# PHASE 5: REQUEST VALIDATION HELPER FUNCTIONS
# ============================================================================
# sanitize_string, validate_coordinates, validate_routing_mode,
# normalize_vehicle_type, and validate_vehicle_type are imported from
# voyagr.utils.validation (single source of truth, shared with the blueprints).
# validate_route_request stays here because it also enforces monolith-specific
# cost/waypoint rules via resolve_route_cost_params.

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

    vehicle_type_raw = data.get('vehicle_type', 'petrol_diesel')
    vehicle_type = normalize_vehicle_type(vehicle_type_raw)
    # Mutate request data so downstream code sees canonical type.
    try:
        data['vehicle_type'] = vehicle_type
    except Exception:
        pass
    if not validate_vehicle_type(vehicle_type):
        return False, f"Invalid vehicle_type: {vehicle_type_raw}"

    # Validate numeric fields
    try:
        cost_params = resolve_route_cost_params(data)
        fuel_efficiency = cost_params['fuel_efficiency']
        fuel_price = cost_params['fuel_price']
        energy_efficiency = cost_params['energy_efficiency']
        electricity_price = cost_params['electricity_price']

        if fuel_efficiency < 0 or fuel_price < 0 or energy_efficiency < 0 or electricity_price < 0:
            return False, "Numeric values cannot be negative"
    except (ValueError, TypeError):
        return False, "Invalid numeric values"

    # Validate waypoints if provided (for multi-stop routes)
    waypoints: List[Any] = data.get('waypoints', [])
    if waypoints:
        if len(waypoints) > 25:
            return False, "Maximum 25 waypoints allowed (DoS prevention)"
        if len(waypoints) < 2:
            return False, "Need at least 2 waypoints for multi-stop route"

    return True, None

# ============================================================================
# RESPONSE COMPRESSION (Phase 3 Optimization)
# ============================================================================
if Compress:
    Compress(app)
    logger.info("[COMPRESSION] Gzip compression enabled")
else:
    logger.warning("[COMPRESSION] flask-compress not installed, compression disabled")
    logger.info("[COMPRESSION] Install with: pip install flask-compress")

VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
OSRM_URL = os.getenv('OSRM_URL', 'http://router.project-osrm.org/route/v1')
USE_OSRM = os.getenv('USE_OSRM', 'false').lower() == 'true'

# Log routing configuration on startup
logger.info(f"[ROUTING] Valhalla: {VALHALLA_URL}, GraphHopper: {GRAPHHOPPER_URL}")

# ============================================================================
# GRAPHHOPPER CAMERA AVOIDANCE CONFIGURATION
# ============================================================================
# GraphHopper with pre-loaded camera areas for camera avoidance
# Priority: GraphHopper (if camera avoidance enabled) → Valhalla → OSRM
USE_GRAPHHOPPER_CAMERA_AVOIDANCE = os.getenv('USE_GRAPHHOPPER_CAMERA_AVOIDANCE', 'true').lower() == 'true'
GRAPHHOPPER_TIMEOUT = int(os.getenv('GRAPHHOPPER_TIMEOUT', '30'))  # Increased timeout for long routes

# ============================================================================
# ROUTING ENGINE CONFIGURATION
# ============================================================================
# Routing engine priority: Valhalla (PRIMARY) → OSRM (FALLBACK)

# ============================================================================
# CONFIGURABLE RATES (Environment Variables)
# ============================================================================
# Toll rates (£ per km) - configurable via environment variables
TOLL_RATES = {
    'motorway': float(os.getenv('TOLL_RATE_MOTORWAY', '0.15')),
    'a_road': float(os.getenv('TOLL_RATE_A_ROAD', '0.05')),
    'local': float(os.getenv('TOLL_RATE_LOCAL', '0.0'))
}

# CAZ rates (£ per entry) - configurable via environment variables
CAZ_RATES = {
    'petrol_diesel': float(os.getenv('CAZ_RATE_PETROL_DIESEL', '8.0')),
    'electric': float(os.getenv('CAZ_RATE_ELECTRIC', '0.0')),
    'hybrid': float(os.getenv('CAZ_RATE_HYBRID', '4.0'))
}

# CAZ entry frequency (km between entries) - configurable
CAZ_ENTRY_FREQUENCY_KM = float(os.getenv('CAZ_ENTRY_FREQUENCY_KM', '50.0'))

# ============================================================================
# CAZ ZONES DATA - Comprehensive UK Clean Air Zones with Polygon Boundaries
# ============================================================================
# Each zone has: name, polygon boundary, pricing tiers, pass types, exemptions, purchase URL
CAZ_ZONES_DATA = {
    'london_ulez': {
        'name': 'London ULEZ',
        'city': 'London',
        'type': 'ULEZ',  # Ultra Low Emission Zone
        'daily_charge': 12.50,
        'currency': 'GBP',
        # Simplified polygon for London ULEZ (North/South Circular boundary)
        'polygon': [
            (51.5874, -0.2270), (51.5890, -0.1650), (51.5850, -0.1050), (51.5750, -0.0450),
            (51.5550, -0.0150), (51.5250, -0.0050), (51.4950, 0.0050), (51.4650, -0.0150),
            (51.4450, -0.0450), (51.4350, -0.0850), (51.4350, -0.1350), (51.4450, -0.1850),
            (51.4650, -0.2250), (51.4950, -0.2450), (51.5250, -0.2550), (51.5550, -0.2450),
            (51.5874, -0.2270)  # Close polygon
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 12.50, 'available': True},
            'weekly': {'price': None, 'available': False},
            'monthly': {'price': None, 'available': False},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 12.50, 'available': True, 'note': 'Auto Pay with 10% discount'}
        },
        'exemptions': [
            'Electric vehicles (100% battery electric)',
            'Vehicles meeting Euro 6 diesel or Euro 4 petrol standards',
            'Disabled tax class vehicles',
            'Historic vehicles (40+ years old)',
            'Military vehicles',
            'NHS vehicles with exemption'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later (approx. 2006+)',
            'diesel': 'Euro 6 or later (approx. 2015+)',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://tfl.gov.uk/modes/driving/ultra-low-emission-zone'
    },
    'london_cc': {
        'name': 'London Congestion Charge',
        'city': 'London',
        'type': 'CC',  # Congestion Charge
        'daily_charge': 15.00,
        'currency': 'GBP',
        # Central London Congestion Charge zone (smaller inner zone)
        'polygon': [
            (51.5250, -0.1550), (51.5300, -0.1350), (51.5280, -0.1150), (51.5200, -0.0950),
            (51.5100, -0.0850), (51.5000, -0.0850), (51.4900, -0.0950), (51.4850, -0.1150),
            (51.4870, -0.1350), (51.4950, -0.1550), (51.5050, -0.1650), (51.5150, -0.1650),
            (51.5250, -0.1550)  # Close polygon
        ],
        'operating_hours': '07:00-18:00',
        'operating_days': 'Mon-Fri (excl. bank holidays)',
        'passes': {
            'daily': {'price': 15.00, 'available': True},
            'weekly': {'price': None, 'available': False},
            'monthly': {'price': 331.50, 'available': True, 'note': 'Fleet discount'},
            'annual': {'price': 3315.00, 'available': True, 'note': 'Fleet discount'},
            'auto_pay': {'price': 15.00, 'available': True}
        },
        'exemptions': [
            'Electric vehicles (100% battery electric)',
            'Disabled Blue Badge holders',
            'NHS exemption holders',
            'Residents (90% discount)',
            'Licensed taxis',
            'Motorcycles, mopeds, bicycles'
        ],
        'vehicle_requirements': {
            'petrol': 'All subject to charge',
            'diesel': 'All subject to charge',
            'hybrid': 'Subject to charge unless registered for Cleaner Vehicle Discount',
            'electric': 'Exempt (Cleaner Vehicle Discount)'
        },
        'purchase_url': 'https://tfl.gov.uk/modes/driving/congestion-charge'
    },
    'birmingham': {
        'name': 'Birmingham CAZ',
        'city': 'Birmingham',
        'type': 'CAZ',
        'daily_charge': 8.00,
        'currency': 'GBP',
        'polygon': [
            (52.4950, -1.9200), (52.4980, -1.8900), (52.4900, -1.8650), (52.4800, -1.8550),
            (52.4650, -1.8600), (52.4550, -1.8750), (52.4520, -1.9000), (52.4580, -1.9250),
            (52.4700, -1.9350), (52.4850, -1.9300), (52.4950, -1.9200)  # Close polygon
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 8.00, 'available': True},
            'weekly': {'price': 48.00, 'available': True},
            'monthly': {'price': 168.00, 'available': True},
            'annual': {'price': 1680.00, 'available': True},
            'auto_pay': {'price': 8.00, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles',
            'Historic vehicles (40+ years old)',
            'Military vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.brumbreathes.co.uk/'
    },
    'bath': {
        'name': 'Bath CAZ',
        'city': 'Bath',
        'type': 'CAZ',
        'daily_charge': 9.00,
        'currency': 'GBP',
        'polygon': [
            (51.3950, -2.3800), (51.3970, -2.3550), (51.3900, -2.3400), (51.3800, -2.3450),
            (51.3720, -2.3600), (51.3750, -2.3800), (51.3850, -2.3900), (51.3950, -2.3800)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 9.00, 'available': True},
            'weekly': {'price': 45.00, 'available': True},
            'monthly': {'price': 162.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 9.00, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles',
            'Historic vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.bathnes.gov.uk/bath-clean-air-zone'
    },
    'bristol': {
        'name': 'Bristol CAZ',
        'city': 'Bristol',
        'type': 'CAZ',
        'daily_charge': 9.00,
        'currency': 'GBP',
        'polygon': [
            (51.4650, -2.6100), (51.4680, -2.5850), (51.4600, -2.5650), (51.4500, -2.5600),
            (51.4400, -2.5700), (51.4350, -2.5900), (51.4400, -2.6100), (51.4500, -2.6200),
            (51.4600, -2.6200), (51.4650, -2.6100)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 9.00, 'available': True},
            'weekly': {'price': 45.00, 'available': True},
            'monthly': {'price': 162.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 9.00, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles',
            'Historic vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.bristol.gov.uk/bristol-clean-air-zone'
    },
    'portsmouth': {
        'name': 'Portsmouth CAZ',
        'city': 'Portsmouth',
        'type': 'CAZ',
        'daily_charge': 10.00,
        'currency': 'GBP',
        'polygon': [
            (50.8050, -1.1000), (50.8100, -1.0850), (50.8050, -1.0700), (50.7950, -1.0700),
            (50.7900, -1.0850), (50.7950, -1.1000), (50.8050, -1.1000)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 10.00, 'available': True},
            'weekly': {'price': 50.00, 'available': True},
            'monthly': {'price': 180.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 10.00, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.portsmouth.gov.uk/cleanairzone'
    },
    'sheffield': {
        'name': 'Sheffield CAZ',
        'city': 'Sheffield',
        'type': 'CAZ',
        'daily_charge': 10.00,
        'currency': 'GBP',
        'polygon': [
            (53.3900, -1.4800), (53.3920, -1.4600), (53.3850, -1.4450), (53.3750, -1.4500),
            (53.3700, -1.4650), (53.3750, -1.4850), (53.3850, -1.4900), (53.3900, -1.4800)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 10.00, 'available': True},
            'weekly': {'price': 50.00, 'available': True},
            'monthly': {'price': 180.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 10.00, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.sheffield.gov.uk/cleanairzone'
    },
    'newcastle': {
        'name': 'Newcastle CAZ',
        'city': 'Newcastle',
        'type': 'CAZ',
        'daily_charge': 12.50,
        'currency': 'GBP',
        'polygon': [
            (54.9800, -1.6300), (54.9820, -1.6050), (54.9750, -1.5850), (54.9650, -1.5900),
            (54.9600, -1.6100), (54.9650, -1.6350), (54.9750, -1.6400), (54.9800, -1.6300)
        ],
        'operating_hours': '00:00-23:59',
        'operating_days': 'Daily',
        'passes': {
            'daily': {'price': 12.50, 'available': True},
            'weekly': {'price': 62.50, 'available': True},
            'monthly': {'price': 225.00, 'available': True},
            'annual': {'price': None, 'available': False},
            'auto_pay': {'price': 12.50, 'available': False}
        },
        'exemptions': [
            'Electric vehicles',
            'Euro 6 diesel vehicles',
            'Euro 4 petrol vehicles',
            'Disabled tax class vehicles'
        ],
        'vehicle_requirements': {
            'petrol': 'Euro 4 or later',
            'diesel': 'Euro 6 or later',
            'hybrid': 'Must meet petrol/diesel standard',
            'electric': 'Exempt'
        },
        'purchase_url': 'https://www.newcastle.gov.uk/cleanairzone'
    }
}

# CAZ Pass Types - used for vehicle profile selection
CAZ_PASS_TYPES = [
    {'id': 'none', 'name': 'No Pass', 'description': 'No CAZ pass - will be charged at each zone'},
    {'id': 'exempt_electric', 'name': 'Electric Vehicle Exempt', 'description': 'Electric vehicles are exempt from all UK CAZ charges'},
    {'id': 'exempt_euro6', 'name': 'Euro 6/4 Compliant', 'description': 'Vehicle meets Euro 6 diesel or Euro 4 petrol standards'},
    {'id': 'exempt_disabled', 'name': 'Disabled Tax Class', 'description': 'Vehicle registered in disabled tax class'},
    {'id': 'exempt_historic', 'name': 'Historic Vehicle', 'description': 'Vehicle is 40+ years old (historic classification)'},
    {'id': 'exempt_military', 'name': 'Military Vehicle', 'description': 'Military vehicle exemption'},
    {'id': 'pass_daily', 'name': 'Daily Pass', 'description': 'Valid daily pass purchased for specific zones'},
    {'id': 'pass_weekly', 'name': 'Weekly Pass', 'description': 'Valid weekly pass for specific zones'},
    {'id': 'pass_monthly', 'name': 'Monthly Pass', 'description': 'Valid monthly pass for specific zones'},
    {'id': 'pass_annual', 'name': 'Annual Pass', 'description': 'Valid annual pass for specific zones'},
    {'id': 'auto_pay', 'name': 'Auto Pay Registered', 'description': 'Registered for automatic payment (TfL Auto Pay, etc.)'}
]


# check_route_in_caz lives in voyagr.services.costs (single source of truth);
# imported at module scope below.

# ============================================================================
# ROUTE CACHING SYSTEM (Phase 3 Optimization)
# ============================================================================

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

    def _make_key(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        routing_mode: str,
        vehicle_type: str,
        enable_hazard_avoidance: bool = False,
        avoid_traffic_lights: bool = False,
        avoid_cameras: bool = True,
        avoid_railway_crossings: bool = False,
        avoid_caz_zones: bool = False,
        avoid_tolls: bool = False,
        avoid_motorways: bool = False,
        avoid_ferries: bool = False,
        avoid_unpaved: bool = False,
        prefer_scenic: bool = False,
        prefer_quiet: bool = False,
        route_optimization: str = 'fastest',
        max_detour: float = 20.0,
        avoid_points: Optional[List[Dict[str, Any]]] = None,
        via_points: Optional[List[Dict[str, Any]]] = None,
        stops: Optional[List[Dict[str, Any]]] = None,
        departure_time: Optional[str] = None,
    ) -> str:
        """Create cache key from route parameters."""
        from voyagr.services.routing.route_cache_key import build_route_cache_key
        return build_route_cache_key(
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
            routing_mode=routing_mode,
            vehicle_type=vehicle_type,
            enable_hazard_avoidance=enable_hazard_avoidance,
            avoid_traffic_lights=avoid_traffic_lights,
            avoid_cameras=avoid_cameras,
            avoid_railway_crossings=avoid_railway_crossings,
            avoid_caz_zones=avoid_caz_zones,
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            avoid_unpaved=avoid_unpaved,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            route_optimization=route_optimization,
            max_detour=max_detour,
            avoid_points=avoid_points,
            via_points=via_points,
            stops=stops,
            departure_time=departure_time,
        )

    def get(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        routing_mode: str,
        vehicle_type: str,
        enable_hazard_avoidance: bool = False,
        avoid_traffic_lights: bool = False,
        avoid_cameras: bool = True,
        avoid_railway_crossings: bool = False,
        avoid_caz_zones: bool = False,
        avoid_tolls: bool = False,
        avoid_motorways: bool = False,
        avoid_ferries: bool = False,
        avoid_unpaved: bool = False,
        prefer_scenic: bool = False,
        prefer_quiet: bool = False,
        route_optimization: str = 'fastest',
        max_detour: float = 20.0,
        avoid_points: Optional[List[Dict[str, Any]]] = None,
        via_points: Optional[List[Dict[str, Any]]] = None,
        stops: Optional[List[Dict[str, Any]]] = None,
        departure_time: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get cached route if available and not expired."""
        with self.lock:
            key = self._make_key(
                start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras,
                avoid_railway_crossings, avoid_caz_zones, avoid_tolls, avoid_motorways,
                avoid_ferries, avoid_unpaved, prefer_scenic, prefer_quiet,
                route_optimization, max_detour, avoid_points, via_points, stops, departure_time,
            )

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

    def set(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        routing_mode: str,
        vehicle_type: str,
        route_data: Dict[str, Any],
        enable_hazard_avoidance: bool = False,
        avoid_traffic_lights: bool = False,
        avoid_cameras: bool = True,
        avoid_railway_crossings: bool = False,
        avoid_caz_zones: bool = False,
        avoid_tolls: bool = False,
        avoid_motorways: bool = False,
        avoid_ferries: bool = False,
        avoid_unpaved: bool = False,
        prefer_scenic: bool = False,
        prefer_quiet: bool = False,
        route_optimization: str = 'fastest',
        max_detour: float = 20.0,
        avoid_points: Optional[List[Dict[str, Any]]] = None,
        via_points: Optional[List[Dict[str, Any]]] = None,
        stops: Optional[List[Dict[str, Any]]] = None,
        departure_time: Optional[str] = None,
    ) -> None:
        """Cache a route calculation."""
        with self.lock:
            key = self._make_key(
                start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras,
                avoid_railway_crossings, avoid_caz_zones, avoid_tolls, avoid_motorways,
                avoid_ferries, avoid_unpaved, prefer_scenic, prefer_quiet,
                route_optimization, max_detour, avoid_points, via_points, stops, departure_time,
            )

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

# Set route_cache for routing blueprint
set_route_cache(route_cache)


# ============================================================================
# DATABASE CONNECTION POOLING (single source of truth: voyagr/models)
# ============================================================================
from voyagr.models import db_connection, init_db

# Database setup
DB_FILE = 'voyagr_web.db'

# Camera hazard buckets: single source of truth is voyagr.config (shared with the
# Optimised-route camera scoring in voyagr.services.routing.optimised_route).
from voyagr.config import CAMERA_HAZARD_BUCKETS


# init_db (with migrate_legacy_camera_hazard_preferences and
# apply_camera_hazard_penalty_defaults) lives in voyagr.models.database
# (single source of truth); invoked here at startup.

init_db()

# Initialize dashcam blueprint after database is ready
if dashcam_available:
    try:
        init_dashcam_blueprint(app, db_path=DB_FILE)
        logger.info("[DASHCAM] Blueprint initialized successfully")
    except Exception as e:
        logger.warning(f"[DASHCAM] Failed to initialize blueprint: {e}")


# ============================================================================
# COST CALCULATION (single source of truth: voyagr/services/costs.py)
# ============================================================================
from voyagr.services.costs import (
    CostCalculator,
    calculate_caz_cost,
    calculate_energy_cost,
    calculate_fuel_cost,
    calculate_toll_cost,
    check_route_in_caz,
    invalidate_hazard_cache,
    invalidate_route_cache,
)

# Initialize cost calculator
cost_calculator = CostCalculator()

# Set cost_calculator for costs blueprint
set_cost_calculator(cost_calculator)

# Initialize speed limit detector
speed_limit_detector = SpeedLimitDetector() if SpeedLimitDetector else None

# Set speed_limit_detector for navigation blueprint
if speed_limit_detector:
    set_speed_limit_detector(speed_limit_detector)

# ============================================================================
# CACHE INVALIDATION
# ============================================================================
# invalidate_hazard_cache and invalidate_route_cache live in
# voyagr.services.costs (single source of truth); imported at module scope above.

# Cost calculation functions
# decode_route_geometry is imported from voyagr.utils.geometry (single source of truth).


# valhalla_maneuver_dict and extract_valhalla_maneuvers live in
# voyagr.services.routing.maneuvers (imported at module scope below).


# calculate_fuel_cost, calculate_energy_cost, calculate_toll_cost and
# calculate_caz_cost live in voyagr.services.costs (single source of truth);
# imported at module scope above.

# Hazard avoidance functions

# get_distance_between_points is imported from voyagr.utils.geometry (single source of truth).


def clear_camera_hazard_buckets(hazards: Dict[str, Any]) -> None:
    """Clear all SCDB-derived camera buckets (when master optimised-routing toggle is off)."""
    for key in list(hazards.keys()):
        if key.startswith('camera_') or key == 'camera':
            hazards[key] = []


def filter_camera_hazards_by_preferences(hazards: Dict[str, Any]) -> None:
    """Remove disabled camera subtypes from routing/scoring inputs (respects hazard_preferences)."""
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT hazard_type, enabled FROM hazard_preferences WHERE hazard_type LIKE 'camera_%' OR hazard_type = 'camera'"
            )
            rows = cursor.fetchall()
        pref_on = {h[0]: bool(h[1]) for h in rows}
        for key in list(hazards.keys()):
            if (key.startswith('camera_') or key == 'camera') and key in pref_on and not pref_on[key]:
                hazards[key] = []
    except Exception as e:
        logger.warning(f"[HAZARDS] filter_camera_hazards_by_preferences: {e}")


def count_scdb_cameras(hazards: Dict[str, Any]) -> int:
    return sum(len(hazards.get(k, [])) for k in CAMERA_HAZARD_BUCKETS)


# fetch_hazards_for_route, fetch_tomtom_incidents and merge_hazards_with_tomtom_incidents
# live in voyagr.services.hazards (single source of truth); imported at module scope below.


# build_graphhopper_custom_model and build_valhalla_exclude_locations live in
# voyagr.services.hazards (single source of truth); imported at module scope below.


# ============================================================================
# GRAPHHOPPER CAMERA AVOIDANCE ROUTING
# ============================================================================
# UK camera grid sections (camera_areas.geojson) — see voyagr.services.hazards

# route_with_graphhopper moved to voyagr.services.routing.engines (single source of
# truth; the full camera/OSM-hazard/CAZ/avoid-point model). Imported at module scope below.


# build_graphhopper_optimised_route_entry moved to
# voyagr.services.routing.route_entries (imported above).
# This breaks the circular enrichment.py → voyagr_web dependency.


# valhalla_route_json_to_standard_routes and valhalla_trip_json_to_std_route_entry
# live in voyagr.services.routing.valhalla_parsing (imported at module scope below).


# ensure_optimised_camera_avoiding_route, ensure_shortest_respects_camera_avoidance,
# ensure_scenic_valhalla_route, fetch_valhalla_auto_json, fetch_valhalla_auto_shorter_json
# and graphhopper_qualifies_as_optimised live in
# voyagr.services.routing.optimised_route (single source of truth). The ensure_* and
# graphhopper_qualifies_as_optimised names are imported at module scope below;
# enrichment.py calls the ensure_* helpers via voyagr_web.*.


def fetch_shortest_route_json(
    url: str,
    headers: Dict[str, str],
    locations: List[Dict[str, Any]],
    exclude_locations: Optional[List[Dict[str, Any]]],
    *,
    enable_hazard_avoidance: bool,
    avoid_cameras: bool,
    timeout: int = 10,
) -> Tuple[Optional[Dict[str, Any]], bool]:
    """auto_shorter with exclusion-first behaviour; always falls back so 📏 Shortest is offered."""
    from voyagr.services.routing.optimised_route import fetch_valhalla_auto_shorter_preferring_exclusions

    prefer = bool(enable_hazard_avoidance and avoid_cameras and exclude_locations)
    return fetch_valhalla_auto_shorter_preferring_exclusions(
        url, headers, locations,
        exclude_locations=exclude_locations or None,
        timeout=timeout,
        prefer_exclusions=prefer,
    )












def primary_route_api_fields(routes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Top-level hazard fields for /api/route (mirrors routes[0] for frontend preview)."""
    primary = routes[0] if routes else {}
    return {
        'hazard_count': primary.get('hazard_count', 0),
        'hazard_penalty_seconds': primary.get('hazard_penalty_seconds', 0),
        'hazards': primary.get('hazards', []),
    }




from voyagr.services.routing.costing import (
    VALID_ROUTE_OPTIMIZATIONS,
    build_auto_costing_options as _build_auto_costing_options,
)
from voyagr.services.routing.request_params import parse_route_request
from voyagr.services.routing.enrichment import RouteEnrichmentContext, apply_valhalla_route_enrichment
from voyagr.services.routing.route_variety import dedupe_similar_routes
from voyagr.services.routing.hazard_prep import HazardPrefs, prepare_route_hazards
from voyagr.services.routing.orchestrator import (
    build_valhalla_baseline_request_payload,
    build_valhalla_discovery_payload,
    build_valhalla_retry_payload,
    build_valhalla_route_payload,
    build_route_success_response,
    classify_valhalla_route_data,
    find_baseline_cameras_on_route,
    post_valhalla_route,
)
from voyagr.services.routing.osrm_fallback import OsrmRouteContext, build_osrm_routes
from voyagr.services.routing.maneuvers import extract_valhalla_maneuvers, valhalla_maneuver_dict
from voyagr.services.routing.route_entries import (
    build_graphhopper_optimised_route_entry,
    build_valhalla_alternate_route_entries,
    build_valhalla_route_entry,
)
# FallbackChainOptimizer / get_traffic_duration_multiplier live in
# voyagr.services.routing.engines (single source of truth). ParallelRoutingEngine
# there is used by the routing debug blueprint.
from voyagr.services.routing.engines import (
    FallbackChainOptimizer,
    attempt_graphhopper_camera_route,
    get_traffic_duration_multiplier,
    route_with_graphhopper,
)
# Hazard helpers: single source of truth is voyagr.services.hazards. These were
# previously duplicated inline in this module; imported here so /api/route,
# /api/multi-stop-route and GraphHopper avoidance all share one implementation.
from voyagr.services.hazards import (
    fetch_hazards_for_route,
    fetch_tomtom_incidents,
    merge_hazards_with_tomtom_incidents,
    build_valhalla_exclude_locations,
    build_prioritised_valhalla_exclude_locations,
    get_hazards_on_route,
    score_route_by_hazards,
)
from voyagr.services.routing.optimised_route import (
    ensure_optimised_camera_avoiding_route,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    ensure_scenic_valhalla_route,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    ensure_costing_preference_variety_routes,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    ensure_shortest_respects_camera_avoidance,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    graphhopper_qualifies_as_optimised,
)
from voyagr.services.routing.valhalla_parsing import (
    valhalla_route_json_to_standard_routes,
    valhalla_trip_json_to_std_route_entry,
)
from voyagr.services.routing.discovery import append_distinct_valhalla_route_types


# build_valhalla_baseline_request_payload lives in
# voyagr.services.routing.orchestrator (imported at module scope below).


# get_hazards_on_route and score_route_by_hazards (plus the proximity/marker
# helpers) live in voyagr.services.hazards (single source of truth); imported at
# module scope below.

# MONITORING_DASHBOARD_HTML now lives in templates/monitoring_dashboard.html
# and is served via render_template() in voyagr/api/core.py.

# HTML_TEMPLATE now lives in templates/index.html and is served via
# render_template() in voyagr/api/core.py (kwargs: build_index_template_kwargs).

# GET / is served by voyagr.api.core.index (registered before duplicate routes here).

# Core routes (/api/config, /monitoring, /manifest.json, /service-worker.js)
# moved to voyagr/api/core.py blueprint

# Vehicle routes (/api/vehicles, /api/vehicles/<id>/caz-pass) moved to voyagr/api/vehicles.py blueprint

# CAZ routes (/api/caz-zones, /api/caz-pass-types, /api/caz-check, /api/charging-stations)
# moved to voyagr/api/caz.py blueprint

# Trip routes (/api/trip-history, /api/trip-analytics) moved to voyagr/api/trips.py blueprint

# Traffic routes (/api/traffic-conditions, /api/route-traffic-flow, /api/tomtom-incidents)
# moved to voyagr/api/traffic.py blueprint

# Routing debug routes (/api/test-routing-engines, /api/debug-route, /api/cache-stats, /api/cache-clear)
# moved to voyagr/api/routing.py blueprint

# FallbackChainOptimizer moved to voyagr.services.routing.engines (imported above).


# ParallelRoutingEngine moved to voyagr.services.routing.engines (used by the
# routing debug blueprint voyagr/api/routing.py); the unused monolith copy was removed.




# get_traffic_duration_multiplier moved to voyagr.services.routing.engines (imported above).


@app.route('/api/route', methods=['POST'])
@rate_limit(route_limiter)
def calculate_route():
    """
    Calculate route using available routing engines.
    Supports: Valhalla (PRIMARY), OSRM (FALLBACK)
    Mobile-optimized with proper error handling and fallbacks.
    """
    import time
    import sys
    route_start_time = time.time()

    # FORCE OUTPUT TO APPEAR IMMEDIATELY
    print(f"\n{'='*80}", flush=True)
    print(f"[API] /api/route endpoint HIT at {time.time()}", flush=True)
    print(f"{'='*80}\n", flush=True)
    sys.stdout.flush()

    try:
        data = request.json
        print(f"[API] Request data: {data}", flush=True)
        sys.stdout.flush()
        logger.info(f"[ROUTE] Received request: {data}")

        # ================================================================
        # PHASE 5: Validate request parameters
        # ================================================================
        is_valid, error_msg = validate_route_request(data)
        logger.info(f"[ROUTE] Validation result: is_valid={is_valid}, error={error_msg}")
        if not is_valid:
            logger.warning(f"[VALIDATION] Request validation failed: {error_msg}")
            return jsonify({'success': False, 'error': error_msg}), 400

        # Parse + normalize the request body (pure; unit-tested in
        # tests/test_route_request_params.py). Unpack into the local names the
        # rest of this handler already uses so downstream logic is unchanged.
        p = parse_route_request(data)
        start = p.start
        end = p.end
        routing_mode = p.routing_mode
        valhalla_costing = p.valhalla_costing
        vehicle_type = p.vehicle_type
        fuel_efficiency = p.fuel_efficiency
        fuel_price = p.fuel_price
        energy_efficiency = p.energy_efficiency
        electricity_price = p.electricity_price
        include_tolls = p.include_tolls
        include_caz = p.include_caz
        caz_exempt = p.caz_exempt
        avoid_caz = p.avoid_caz
        enable_hazard_avoidance = p.enable_hazard_avoidance
        avoid_traffic_lights = p.avoid_traffic_lights
        avoid_railway_crossings = p.avoid_railway_crossings
        avoid_cameras = p.avoid_cameras
        apply_caz_routing_avoidance = p.apply_caz_routing_avoidance
        avoid_tolls = p.avoid_tolls
        avoid_motorways = p.avoid_motorways
        avoid_ferries = p.avoid_ferries
        prefer_scenic = p.prefer_scenic
        prefer_quiet = p.prefer_quiet
        avoid_unpaved = p.avoid_unpaved
        route_optimization = p.route_optimization
        max_detour = p.max_detour
        avoid_points = p.avoid_points
        via_points = p.via_points
        stops = p.stops
        optimize_stop_order = p.optimize_stop_order
        round_trip = p.round_trip
        departure_time = p.departure_time
        time_windows = p.time_windows
        total_stop_time = p.total_stop_time
        start_coords = p.start_coords
        end_coords = p.end_coords
        start_lat, start_lon = p.start_lat, p.start_lon
        end_lat, end_lon = p.end_lat, p.end_lon
        force_refresh = p.force_refresh
        is_reroute = p.is_reroute

        cache_kwargs = dict(
            enable_hazard_avoidance=enable_hazard_avoidance,
            avoid_traffic_lights=avoid_traffic_lights,
            avoid_cameras=avoid_cameras,
            avoid_railway_crossings=avoid_railway_crossings,
            avoid_caz_zones=apply_caz_routing_avoidance,
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            avoid_unpaved=avoid_unpaved,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            route_optimization=route_optimization,
            max_detour=max_detour,
            avoid_points=avoid_points,
            via_points=via_points,
            stops=stops,
            departure_time=departure_time,
        )

        logger.info(f"[ROUTE] Via-points: {len(via_points)}, Stops: {len(stops)}, Total stop time: {total_stop_time} min")

        # DEBUG: Log request received
        print(f"\n{'='*80}")
        print("[API REQUEST] /api/route called")
        print(f"[API REQUEST] enable_hazard_avoidance={enable_hazard_avoidance}")
        print(f"{'='*80}\n")
        logger.info(f"[API REQUEST] Route calculation started: ({start},{end}), hazard_avoidance={enable_hazard_avoidance}")

        # ====================================================================
        # MULTI-DROP ROUTING: when optimize_stop_order is set and there are >= 2
        # intermediate points, delegate to the multi-drop engine. Returns a
        # ready-to-jsonify response, or None to fall through to standard routing.
        # (voyagr.services.routing.multidrop.build_route_multidrop_response)
        # ====================================================================
        from voyagr.services.routing.multidrop import build_route_multidrop_response
        md_response = build_route_multidrop_response(p)
        if md_response is not None:
            return jsonify(md_response)

        # ====================================================================
        # PHASE 3 OPTIMIZATION: Check route cache first
        # ====================================================================
        from voyagr.services.routing.route_cache_key import should_bypass_route_cache, build_route_cache_key
        db_cache_key = build_route_cache_key(
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
            routing_mode=routing_mode,
            vehicle_type=vehicle_type,
            **cache_kwargs,
        )
        if not should_bypass_route_cache(
            force_refresh=force_refresh,
            is_reroute=is_reroute,
            avoid_points=avoid_points,
        ):
            cached_route = route_cache.get(
                start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, **cache_kwargs,
            )
            if cached_route:
                logger.info(
                    f"[CACHE] HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon}) "
                    f"with hazard_avoidance={enable_hazard_avoidance}"
                )
                cached_route['cached'] = True
                cached_route['cache_stats'] = route_cache.get_stats()
                return jsonify(cached_route)

            db_cached_route = cost_calculator.get_cached_route_from_db(db_cache_key)
            if db_cached_route:
                logger.info(
                    f"[CACHE] DB HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon}) "
                    f"key={db_cache_key[:48]}..."
                )
                db_cached_route['cached'] = True
                db_cached_route['cache_stats'] = route_cache.get_stats()
                route_cache.set(
                    start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                    db_cached_route, **cache_kwargs,
                )
                return jsonify(db_cached_route)

            # Fallback to legacy coord-only lookup for pre-migration cache rows
            legacy_cached_route = cost_calculator.get_cached_route_from_db_legacy(
                start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type
            )
            if legacy_cached_route:
                logger.info(
                    f"[CACHE] DB LEGACY HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon}) "
                    "(coord-only match, pre-migration row)"
                )
                legacy_cached_route['cached'] = True
                legacy_cached_route['cache_stats'] = route_cache.get_stats()
                route_cache.set(
                    start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                    legacy_cached_route, **cache_kwargs,
                )
                return jsonify(legacy_cached_route)
        elif is_reroute or force_refresh or avoid_points:
            logger.info('[CACHE] BYPASS: reroute/force_refresh/avoid_points requires live routing')

        # Fetch + assemble hazards (SCDB cameras, TomTom incidents, avoid_points,
        # camera-preference filter, OSM traffic-light/railway overlays). Extracted to
        # voyagr.services.routing.hazard_prep; behaviour/logging unchanged.
        hazards = prepare_route_hazards(
            start_lat, start_lon, end_lat, end_lon,
            HazardPrefs(
                avoid_points=avoid_points,
                avoid_cameras=avoid_cameras,
                avoid_traffic_lights=avoid_traffic_lights,
                avoid_railway_crossings=avoid_railway_crossings,
                enable_hazard_avoidance=enable_hazard_avoidance,
            ),
        )

        # ====================================================================
        # ROUTING ENGINE PRIORITY:
        # 1. GraphHopper with camera areas (if hazard avoidance enabled)
        # 2. Valhalla (PRIMARY fallback)
        # 3. OSRM (SECONDARY fallback)
        # ====================================================================
        valhalla_error = None

        logger.debug(f"\n[ROUTING] Starting route calculation from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")

        # Calculate route bounding box for camera area selection
        route_bbox = {
            'min_lat': min(start_lat, end_lat),
            'max_lat': max(start_lat, end_lat),
            'min_lon': min(start_lon, end_lon),
            'max_lon': max(start_lon, end_lon)
        }

        # ====================================================================
        # TRY GRAPHHOPPER FIRST (car-only; camera avoidance). Extracted to
        # voyagr.services.routing.engines.attempt_graphhopper_camera_route.
        # ====================================================================
        graphhopper_route, graphhopper_error = attempt_graphhopper_camera_route(
            hazards=hazards,
            route_bbox=route_bbox,
            start_lat=start_lat, start_lon=start_lon,
            end_lat=end_lat, end_lon=end_lon,
            routing_mode=routing_mode,
            enable_hazard_avoidance=enable_hazard_avoidance,
            avoid_cameras=avoid_cameras,
            avoid_traffic_lights=avoid_traffic_lights,
            avoid_railway_crossings=avoid_railway_crossings,
            apply_caz_routing_avoidance=apply_caz_routing_avoidance,
            avoid_points=avoid_points if avoid_points else None,
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            avoid_unpaved=avoid_unpaved,
            prefer_scenic=prefer_scenic,
            prefer_quiet=prefer_quiet,
            route_optimization=route_optimization,
        )

        logger.debug(f"[ROUTING] Valhalla URL: {VALHALLA_URL}")

        valhalla_start_time = time.time()
        # Defaults if Valhalla try exits early; overwritten when waypoints are processed.
        route_locations = [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}]
        has_waypoints = False

        # One traffic factor per response, resolved at most once and only when a route
        # was actually built. Every option must be scaled by the same value: the
        # preview shows them side by side and filter_routes_by_max_detour measures
        # them against each other, so mixing adjusted and free-flow durations both
        # misreports ETAs and makes the detour cull depend on the time of day.
        # get_traffic_duration_multiplier is uncached and hits TomTom when a key is
        # configured, so it must not be called per route.
        resolved_traffic_factors: List[Tuple[float, str]] = []

        def traffic_factors() -> Tuple[float, str]:
            """(multiplier, level) for this request; walking/cycling are never adjusted."""
            if not resolved_traffic_factors:
                resolved_traffic_factors.append(
                    get_traffic_duration_multiplier(start_lat, start_lon)
                    if valhalla_costing == 'auto' else (1.0, 'N/A')
                )
            return resolved_traffic_factors[0]

        try:
            url = f"{VALHALLA_URL}/route"

            # Define headers for all Valhalla requests
            headers = {
                'User-Agent': 'Voyagr-PWA/1.0',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }

            # ================================================================
            # HAZARD AVOIDANCE: Build exclude_locations if enabled
            # ================================================================
            # route_bbox already calculated above for GraphHopper

            # Build exclude_locations (more efficient than exclude_polygons)
            # No circumference limit - can send many more locations
            exclude_locations = []
            if enable_hazard_avoidance:
                exclude_locations = build_prioritised_valhalla_exclude_locations(
                    hazards,
                    route_bbox=route_bbox,
                    start_lat=start_lat, start_lon=start_lon,
                    end_lat=end_lat, end_lon=end_lon,
                    apply_caz_routing_avoidance=apply_caz_routing_avoidance,
                )

            # ================================================================
            # BUILD LOCATIONS ARRAY WITH VIA-POINTS AND STOPS
            # ================================================================
            # Combine start, via-points, stops, and end into ordered locations
            def build_locations_with_waypoints(start_lat, start_lon, end_lat, end_lon, via_points, stops):
                """Build Valhalla locations array with via-points and stops."""
                locations = [{"lat": start_lat, "lon": start_lon}]

                # Combine via-points and stops
                intermediate = []
                for vp in via_points:
                    intermediate.append({
                        'lat': float(vp.get('lat', 0)),
                        'lon': float(vp.get('lon', 0)),
                        'type': 'via'
                    })
                for s in stops:
                    intermediate.append({
                        'lat': float(s.get('lat', 0)),
                        'lon': float(s.get('lon', 0)),
                        'type': 'stop',
                        'duration': s.get('duration', 15)
                    })

                # Simple greedy optimization: visit closest point next
                if intermediate:
                    remaining = intermediate.copy()
                    current = {'lat': start_lat, 'lon': start_lon}

                    while remaining:
                        closest_idx = 0
                        closest_dist = float('inf')

                        for i, wp in enumerate(remaining):
                            dist = ((wp['lat'] - current['lat'])**2 + (wp['lon'] - current['lon'])**2)**0.5
                            if dist < closest_dist:
                                closest_dist = dist
                                closest_idx = i

                        wp = remaining.pop(closest_idx)
                        locations.append({"lat": wp['lat'], "lon": wp['lon']})
                        current = wp

                locations.append({"lat": end_lat, "lon": end_lon})
                return locations

            # Build locations array
            route_locations = build_locations_with_waypoints(start_lat, start_lon, end_lat, end_lon, via_points, stops)
            has_waypoints = len(route_locations) > 2

            if has_waypoints:
                logger.info(f"[ROUTE] Multi-stop route with {len(route_locations)} locations")

            enrich_ctx = RouteEnrichmentContext(
                url=url, headers=headers, route_locations=route_locations,
                has_waypoints=has_waypoints, start_lat=start_lat, start_lon=start_lon,
                end_lat=end_lat, end_lon=end_lon, route_bbox=route_bbox, hazards=hazards,
                enable_hazard_avoidance=enable_hazard_avoidance, avoid_cameras=avoid_cameras,
                graphhopper_route=graphhopper_route, cost_calculator=cost_calculator,
                vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                electricity_price=electricity_price, include_tolls=include_tolls,
                include_caz=include_caz, caz_exempt=caz_exempt,
                max_detour=max_detour,
                valhalla_costing=valhalla_costing,
                prefer_scenic=prefer_scenic,
                prefer_quiet=prefer_quiet,
                avoid_tolls=avoid_tolls,
                avoid_motorways=avoid_motorways,
                avoid_ferries=avoid_ferries,
                avoid_unpaved=avoid_unpaved,
                route_optimization=route_optimization,
            )

            # Valhalla allows at most 50 exclude_locations (error 157). Segmented
            # multi-request routing was removed — it caused "No path could be found"
            # when segments were blocked; exclusions are capped at 50 upstream.

            # Build request payload (standard 2-point routing). Extracted to
            # voyagr.services.routing.orchestrator.build_valhalla_route_payload.
            payload = build_valhalla_route_payload(
                route_locations=route_locations,
                has_waypoints=has_waypoints,
                start_lat=start_lat, start_lon=start_lon,
                end_lat=end_lat, end_lon=end_lon,
                valhalla_costing=valhalla_costing,
                avoid_tolls=avoid_tolls,
                avoid_motorways=avoid_motorways,
                avoid_ferries=avoid_ferries,
                prefer_scenic=prefer_scenic,
                prefer_quiet=prefer_quiet,
                avoid_unpaved=avoid_unpaved,
                route_optimization=route_optimization,
                departure_time=departure_time,
                exclude_locations=exclude_locations,
            )

            # Calculate distance to determine appropriate timeout
            # Longer routes need more time (Valhalla can take 30+ seconds for 500+ km routes)
            straight_line_km = ((end_lat - start_lat)**2 + (end_lon - start_lon)**2)**0.5 * 111  # ~111 km per degree
            # PHASE 4 OPTIMIZATION: Reduce timeout to max 10s to fit within Gateway limits
            route_timeout = max(5, min(10, int(3 + straight_line_km / 100)))  # 5-10 seconds cap

            print(f"[Valhalla] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
            print(f"[Valhalla] URL: {url}")
            print(f"[Valhalla] Hazard avoidance: {enable_hazard_avoidance}, Locations: {len(exclude_locations) if exclude_locations else 0}")
            print(f"[Valhalla] Estimated distance: {straight_line_km:.0f} km, Timeout: {route_timeout}s")
            # HTTP POST + transport-error classification extracted to
            # orchestrator.post_valhalla_route (status handling/parsing stay here).
            _post_outcome = post_valhalla_route(url, payload, headers, route_timeout)
            if _post_outcome.timed_out:
                print(f"[Valhalla] Request timed out after {route_timeout}s")
                return jsonify({'error': 'Route calculation timed out. Try a shorter route or moving start/end points closer.'}), 408
            response = _post_outcome.response
            if _post_outcome.error:
                print(f"[Valhalla] Request failed: {_post_outcome.error}")
                valhalla_error = _post_outcome.error
            if response is not None:
                print(f"[Valhalla] Response status: {response.status_code}", flush=True)
            if response and response.status_code != 200:
                _vb = response.text[:1200] if response.text else ''
                print(f"[Valhalla] Response body: {_vb}", flush=True)
                logger.warning(f"[VALHALLA] HTTP {response.status_code} body: {_vb}")

            if response and response.status_code == 200:
                route_data = response.json()
                print(f"[Valhalla] Response keys: {route_data.keys()}", flush=True)

                # Classify the parsed 200 body (error / missing trip). Extracted to
                # orchestrator.classify_valhalla_route_data (pure; control flow unchanged).
                valhalla_error = classify_valhalla_route_data(route_data)
                if valhalla_error:
                    print(f"[Valhalla] {valhalla_error}", flush=True)
                    if 'trip' not in route_data:
                        print(f"[Valhalla] Response keys: {list(route_data.keys())}", flush=True)
                        print(f"[Valhalla] Full response: {json.dumps(route_data, indent=2)[:1000]}", flush=True)

                if 'trip' in route_data and 'legs' in route_data['trip']:
                    # Extract all available routes
                    routes = []

                    # ================================================================
                    # TRAFFIC-ADJUSTED ETA: Apply only for auto (car) mode
                    # Walking/cycling times should not be adjusted by road traffic
                    # ================================================================
                    base_time_minutes = route_data['trip']['summary']['time'] / 60
                    traffic_multiplier, traffic_level = traffic_factors()
                    if valhalla_costing == 'auto':
                        logger.info(f"[ETA] Base: {base_time_minutes:.0f}min, Traffic: {traffic_level} ({traffic_multiplier:.2f}x), Adjusted: {base_time_minutes * traffic_multiplier:.0f}min")
                    else:
                        logger.info(f"[ETA] {valhalla_costing}: {base_time_minutes:.0f} min (no traffic adjustment)")

                    # Main route entry. Cost + hazard + maneuver assembly is shared with the
                    # alternates via route_entries.build_valhalla_route_entry.
                    routes.append(build_valhalla_route_entry(
                        trip=route_data['trip'], name='Fastest', route_id=1,
                        traffic_multiplier=traffic_multiplier, traffic_level=traffic_level,
                        include_traffic_fields=True,
                        hazards=hazards, cost_calculator=cost_calculator,
                        vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                        fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                        electricity_price=electricity_price, include_tolls=include_tolls,
                        include_caz=include_caz, caz_exempt=caz_exempt,
                    ))
                    logger.info(f"[VALHALLA] Extracted {len(routes[0].get('maneuvers') or [])} maneuvers from route")
                    # Primary route geometry + hazard count are reused below by the
                    # Optimised Discovery step (baseline it compares against).
                    route_geometry = routes[0].get('geometry')
                    hazard_count = routes[0].get('hazard_count', 0)

                    # Alternative routes (if available) - Valhalla uses 'alternates' not 'alternatives'
                    routes.extend(build_valhalla_alternate_route_entries(
                        route_data,
                        first_route_id=2,
                        traffic_multiplier=traffic_multiplier,
                        traffic_level=traffic_level,
                        hazards=hazards, cost_calculator=cost_calculator,
                        vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                        fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                        electricity_price=electricity_price, include_tolls=include_tolls,
                        include_caz=include_caz, caz_exempt=caz_exempt,
                    ))

                    routes = dedupe_similar_routes(routes)

                    # ================================================================
                    # REQUEST ADDITIONAL DISTINCT ROUTE TYPES (Scenic, Quiet, Optimised Discovery)
                    # Only for auto mode; pedestrian/bicycle use single costing
                    # ================================================================
                    routes = append_distinct_valhalla_route_types(
                        routes,
                        valhalla_costing=valhalla_costing,
                        enable_hazard_avoidance=enable_hazard_avoidance,
                        url=url, headers=headers,
                        route_locations=route_locations, has_waypoints=has_waypoints,
                        start_lat=start_lat, start_lon=start_lon,
                        end_lat=end_lat, end_lon=end_lon,
                        route_bbox=route_bbox, route_geometry=route_geometry,
                        hazard_count=hazard_count, hazards=hazards,
                        cost_calculator=cost_calculator, avoid_cameras=avoid_cameras,
                        vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                        fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                        electricity_price=electricity_price, include_tolls=include_tolls,
                        include_caz=include_caz, caz_exempt=caz_exempt,
                        prefer_scenic=prefer_scenic,
                        prefer_quiet=prefer_quiet,
                        avoid_tolls=avoid_tolls,
                        avoid_motorways=avoid_motorways,
                        avoid_ferries=avoid_ferries,
                        avoid_unpaved=avoid_unpaved,
                        traffic_multiplier=traffic_multiplier,
                        traffic_level=traffic_level,
                    )

                    print(f"[Valhalla] SUCCESS: {len(routes)} routes found")

                    # Post-Valhalla enrichment (GH Optimised merge, ensure_*, annotate, reorder)
                    enrich_ctx.traffic_multiplier = traffic_multiplier
                    enrich_ctx.traffic_level = traffic_level
                    routes = apply_valhalla_route_enrichment(routes, enrich_ctx, log_label='primary')

                    # ================================================================
                    # PHASE 5: Record success in fallback chain optimizer
                    # ================================================================
                    valhalla_elapsed = (time.time() - valhalla_start_time) * 1000
                    fallback_optimizer.record_success('valhalla', valhalla_elapsed)

                    # ================================================================
                    # PHASE 3 OPTIMIZATION: Cache the successful route
                    # ================================================================
                    # Determine source based on what was used
                    routing_source = 'Valhalla ✅'
                    if graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=avoid_cameras):
                        routing_source = 'GraphHopper+Valhalla ✅'

                    response_data = build_route_success_response(
                        routes,
                        source=routing_source,
                        camera_avoidance_engine=(
                            'GraphHopper' if graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=avoid_cameras)
                            else 'Valhalla'
                        ),
                        total_stop_time=total_stop_time,
                        via_points_count=len(via_points),
                        stops_count=len(stops),
                        start_lat=start_lat, start_lon=start_lon,
                        end_lat=end_lat, end_lon=end_lon,
                    )

                    # Cache the route for future requests
                    route_cache.set(
                        start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                        response_data, **cache_kwargs,
                    )
                    print(f"[CACHE] STORED: Route cached in memory with hazard_avoidance={enable_hazard_avoidance}")

                    # ================================================================
                    # PHASE 4: Persistent database caching for long-term storage
                    # ================================================================
                    cost_calculator.cache_route_to_db(
                        start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                        response_data, routing_source, cache_key=db_cache_key,
                    )
                    print("[CACHE] STORED: Route cached in database")

                    return jsonify(response_data)
                else:
                    valhalla_error = f"Unexpected response format: {route_data.keys()}"
            else:
                valhalla_error = f"HTTP {response.status_code}"
        except requests.exceptions.Timeout:
            valhalla_error = "Timeout (>10s)"
            print(f"[Valhalla] Timeout error: {valhalla_error}")
        except requests.exceptions.ConnectionError as e:
            valhalla_error = f"Connection error: {str(e)}"
            print(f"[Valhalla] Connection error: {valhalla_error}")
        except Exception as e:
            valhalla_error = str(e)
            print(f"[Valhalla] Exception: {valhalla_error}")
            print(f"[Valhalla] Exception type: {type(e).__name__}")
            print(f"[Valhalla] Response type: {type(response) if 'response' in locals() else 'N/A'}")
            if 'response' in locals():
                print(f"[Valhalla] Response status: {response.status_code if hasattr(response, 'status_code') else 'N/A'}")
                print(f"[Valhalla] Response text: {response.text if hasattr(response, 'text') else 'N/A'}")
            import traceback
            traceback.print_exc()

        if valhalla_error:
            print(f"[Valhalla] Failed: {valhalla_error}")

            # ================================================================
            # RETRY WITH FEWER EXCLUSIONS IF ROUTE NOT FOUND
            # ================================================================
            # If Valhalla failed because it couldn't find a route with all exclusions,
            # retry with progressively fewer exclusions (some hazards may be unavoidable)
            if enable_hazard_avoidance and exclude_locations and len(exclude_locations) > 10:
                retry_limits = [50, 20, 10]  # Try with 50, then 20, then 10 exclusions
                for retry_limit in retry_limits:
                    if retry_limit >= len(exclude_locations):
                        continue  # Skip if we already tried this many

                    logger.warning(f"[VALHALLA] Retrying with {retry_limit} exclude_locations (reduced from {len(exclude_locations)})")
                    print(f"[Valhalla] RETRY: Reducing exclusions to {retry_limit} locations")

                    try:
                        # Rebuild with fewer exclusions (prioritized by distance to route)
                        retry_locations = build_valhalla_exclude_locations(
                            hazards,
                            route_bbox=route_bbox,
                            max_hazards=retry_limit,
                            start_lat=start_lat,
                            start_lon=start_lon,
                            end_lat=end_lat,
                            end_lon=end_lon
                        )

                        # Build retry payload (use same costing as initial request).
                        # Extracted to orchestrator.build_valhalla_retry_payload.
                        retry_payload = build_valhalla_retry_payload(
                            start_lat=start_lat, start_lon=start_lon,
                            end_lat=end_lat, end_lon=end_lon,
                            valhalla_costing=valhalla_costing,
                            exclude_locations=retry_locations,
                            avoid_tolls=avoid_tolls,
                            avoid_motorways=avoid_motorways,
                            avoid_ferries=avoid_ferries,
                            prefer_scenic=prefer_scenic,
                            prefer_quiet=prefer_quiet,
                            avoid_unpaved=avoid_unpaved,
                            route_optimization=route_optimization,
                        )

                        retry_response = requests.post(url, json=retry_payload, timeout=10, headers=headers)

                        if retry_response.status_code == 200:
                            retry_data = retry_response.json()
                            if 'trip' in retry_data and 'legs' in retry_data['trip']:
                                logger.info(f"[VALHALLA] RETRY SUCCESS with {retry_limit} exclusions!")
                                print(f"[Valhalla] RETRY SUCCESS: Route found with {retry_limit} exclusions")

                                # Process the retry response via the shared route-entry
                                # builder (maneuver lengths in metres, matching the
                                # previous inline retry behaviour).
                                retry_multiplier, retry_traffic_level = traffic_factors()
                                routes = [build_valhalla_route_entry(
                                    trip=retry_data['trip'], name='Fastest', route_id=1,
                                    traffic_multiplier=retry_multiplier,
                                    traffic_level=retry_traffic_level,
                                    include_traffic_fields=True,
                                    maneuver_length_in_meters=True,
                                    hazards=hazards, cost_calculator=cost_calculator,
                                    vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                    fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                    electricity_price=electricity_price, include_tolls=include_tolls,
                                    include_caz=include_caz, caz_exempt=caz_exempt,
                                )]
                                logger.info(f"[VALHALLA] Retry route has {len(routes[0].get('maneuvers') or [])} maneuvers")
                                # The retry payload asks for alternates too; offer them
                                # instead of leaving the preview with a lone Fastest.
                                routes.extend(build_valhalla_alternate_route_entries(
                                    retry_data,
                                    first_route_id=2,
                                    traffic_multiplier=retry_multiplier,
                                    traffic_level=retry_traffic_level,
                                    maneuver_length_in_meters=True,
                                    hazards=hazards, cost_calculator=cost_calculator,
                                    vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                    fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                    electricity_price=electricity_price, include_tolls=include_tolls,
                                    include_caz=include_caz, caz_exempt=caz_exempt,
                                ))

                                retry_enrich = RouteEnrichmentContext(
                                    url=url, headers=headers, route_locations=route_locations,
                                    has_waypoints=has_waypoints, start_lat=start_lat, start_lon=start_lon,
                                    end_lat=end_lat, end_lon=end_lon, route_bbox=route_bbox, hazards=hazards,
                                    enable_hazard_avoidance=enable_hazard_avoidance, avoid_cameras=avoid_cameras,
                                    graphhopper_route=graphhopper_route, cost_calculator=cost_calculator,
                                    vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                    fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                    electricity_price=electricity_price, include_tolls=include_tolls,
                                    include_caz=include_caz, caz_exempt=caz_exempt,
                                    traffic_multiplier=retry_multiplier,
                                    traffic_level=retry_traffic_level,
                                    max_detour=max_detour,
                                    valhalla_costing=valhalla_costing,
                                    prefer_scenic=prefer_scenic,
                                    prefer_quiet=prefer_quiet,
                                    avoid_tolls=avoid_tolls,
                                    avoid_motorways=avoid_motorways,
                                    avoid_ferries=avoid_ferries,
                                    avoid_unpaved=avoid_unpaved,
                                    route_optimization=route_optimization,
                                )
                                routes = apply_valhalla_route_enrichment(
                                    routes, retry_enrich, log_label='retry',
                                )

                                print(f"[Valhalla] RETRY SUCCESS: {len(routes)} routes found")

                                # Record success
                                valhalla_elapsed = (time.time() - valhalla_start_time) * 1000
                                fallback_optimizer.record_success('valhalla', valhalla_elapsed)

                                # Determine source
                                retry_source = 'Valhalla ✅ (Retry)'
                                if graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=avoid_cameras):
                                    retry_source = 'GraphHopper+Valhalla ✅'

                                # Build response (shared shape with primary/recovery paths)
                                response_data = build_route_success_response(
                                    routes,
                                    source=retry_source,
                                    camera_avoidance_engine=(
                                        'GraphHopper' if graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=avoid_cameras)
                                        else 'Valhalla'
                                    ),
                                    total_stop_time=total_stop_time,
                                    via_points_count=len(via_points),
                                    stops_count=len(stops),
                                    start_lat=start_lat, start_lon=start_lon,
                                    end_lat=end_lat, end_lon=end_lon,
                                )

                                # Cache the route
                                route_cache.set(
                                    start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                                    response_data, **cache_kwargs,
                                )
                                print("[CACHE] STORED: Retry route cached in memory")

                                cache_source = 'GraphHopper+Valhalla' if (graphhopper_route and graphhopper_route.get('success')) else 'Valhalla'
                                cost_calculator.cache_route_to_db(
                                    start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                                    response_data, cache_source, cache_key=db_cache_key,
                                )
                                print("[CACHE] STORED: Retry route cached in database")

                                # Return the successful retry response
                                return jsonify(response_data)
                    except Exception as retry_e:
                        logger.warning(f"[VALHALLA] Retry with {retry_limit} exclusions failed: {retry_e}")
                        continue  # Try next retry limit

            # ================================================================
            # PHASE 5: Record failure in fallback chain optimizer
            # ================================================================
            if valhalla_error:  # Only record if all retries failed
                fallback_optimizer.record_failure('valhalla')

        # Only fallback to OSRM if Valhalla failed (including all retries)
        if not valhalla_error:
            # Valhalla succeeded (either first attempt or retry) - skip OSRM fallback
            logger.info("[ROUTING] Valhalla succeeded, skipping OSRM fallback")
        else:
            # ----------------------------------------------------------------
            # GraphHopper often succeeds while Valhalla rejects hazard-heavy payloads (HTTP 400).
            # Return GH ⚡ Optimised + baseline Valhalla (no exclude_locations) before OSRM.
            # ----------------------------------------------------------------
            recovery_data: Optional[Dict[str, Any]] = None
            if graphhopper_route and graphhopper_route.get('success'):
                try:
                    tr_mult, tr_level = traffic_factors()
                    gh_entry = None
                    if graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=avoid_cameras):
                        gh_entry = build_graphhopper_optimised_route_entry(
                            graphhopper_route,
                            hazards,
                            cost_calculator,
                            vehicle_type=vehicle_type,
                            fuel_efficiency=fuel_efficiency,
                            fuel_price=fuel_price,
                            energy_efficiency=energy_efficiency,
                            electricity_price=electricity_price,
                            include_tolls=include_tolls,
                            include_caz=include_caz,
                            caz_exempt=caz_exempt,
                            traffic_multiplier=tr_mult,
                            traffic_level=tr_level,
                            include_traffic_fields=True,
                        )
                    routes_out: List[Dict[str, Any]] = []
                    if gh_entry:
                        routes_out.append(gh_entry)

                    baseline_payload = build_valhalla_baseline_request_payload(
                        start_lat=start_lat,
                        start_lon=start_lon,
                        end_lat=end_lat,
                        end_lon=end_lon,
                        route_locations=route_locations,
                        has_waypoints=has_waypoints,
                        valhalla_costing=valhalla_costing,
                        avoid_tolls=avoid_tolls,
                        avoid_motorways=avoid_motorways,
                        avoid_ferries=avoid_ferries,
                        departure_time=departure_time,
                        prefer_scenic=prefer_scenic,
                        prefer_quiet=prefer_quiet,
                        avoid_unpaved=avoid_unpaved,
                        route_optimization=route_optimization,
                    )
                    logger.info("[ROUTING] Recovery: requesting baseline Valhalla (no exclude_locations)")
                    vrec = requests.post(url, json=baseline_payload, timeout=15, headers=headers)
                    valhalla_baseline_ok = False
                    if vrec.status_code == 200:
                        rd = vrec.json()
                        if rd.get('error'):
                            logger.warning(f"[ROUTING] Recovery Valhalla error in JSON: {rd.get('error')}")
                        elif 'trip' in rd:
                            v_routes = valhalla_route_json_to_standard_routes(
                                rd,
                                valhalla_costing=valhalla_costing,
                                start_lat=start_lat,
                                start_lon=start_lon,
                                hazards=hazards,
                                cost_calculator=cost_calculator,
                                vehicle_type=vehicle_type,
                                fuel_efficiency=fuel_efficiency,
                                fuel_price=fuel_price,
                                energy_efficiency=energy_efficiency,
                                electricity_price=electricity_price,
                                include_tolls=include_tolls,
                                include_caz=include_caz,
                                caz_exempt=caz_exempt,
                                traffic_factors=(tr_mult, tr_level),
                            )
                            if v_routes:
                                routes_out.extend(v_routes)
                                valhalla_baseline_ok = True
                                logger.info(f"[ROUTING] Recovery: baseline Valhalla returned {len(v_routes)} route(s)")
                    else:
                        _rbody = vrec.text[:800] if vrec.text else ''
                        logger.warning(f"[ROUTING] Recovery Valhalla HTTP {vrec.status_code}: {_rbody}")

                    if routes_out:
                        recovery_enrich = RouteEnrichmentContext(
                            url=url, headers=headers, route_locations=route_locations,
                            has_waypoints=has_waypoints, start_lat=start_lat, start_lon=start_lon,
                            end_lat=end_lat, end_lon=end_lon, route_bbox=route_bbox, hazards=hazards,
                            enable_hazard_avoidance=enable_hazard_avoidance, avoid_cameras=avoid_cameras,
                            graphhopper_route=graphhopper_route, cost_calculator=cost_calculator,
                            vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                            fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                            electricity_price=electricity_price, include_tolls=include_tolls,
                            include_caz=include_caz, caz_exempt=caz_exempt,
                            traffic_multiplier=tr_mult,
                            traffic_level=tr_level,
                            max_detour=max_detour,
                            valhalla_costing=valhalla_costing,
                            prefer_scenic=prefer_scenic,
                            prefer_quiet=prefer_quiet,
                            avoid_tolls=avoid_tolls,
                            avoid_motorways=avoid_motorways,
                            avoid_ferries=avoid_ferries,
                            avoid_unpaved=avoid_unpaved,
                            route_optimization=route_optimization,
                        )
                        routes_out = apply_valhalla_route_enrichment(
                            routes_out, recovery_enrich, merge_graphhopper=False, log_label='recovery',
                        )

                    if routes_out:
                        if enable_hazard_avoidance and hazards:
                            routes_out = sorted(
                                routes_out,
                                key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)),
                            )
                        for idx, route in enumerate(routes_out):
                            route['id'] = idx + 1

                        routing_source = (
                            'GraphHopper+Valhalla ✅'
                            if valhalla_baseline_ok
                            else 'GraphHopper (Valhalla hazard request failed)'
                        )
                        recovery_data = build_route_success_response(
                            routes_out,
                            source=routing_source,
                            camera_avoidance_engine=(
                                'GraphHopper' if graphhopper_qualifies_as_optimised(graphhopper_route, avoid_cameras=avoid_cameras)
                                else 'Valhalla'
                            ),
                            total_stop_time=total_stop_time,
                            via_points_count=len(via_points),
                            stops_count=len(stops),
                            start_lat=start_lat, start_lon=start_lon,
                            end_lat=end_lat, end_lon=end_lon,
                        )
                        route_cache.set(
                            start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                            recovery_data, **cache_kwargs,
                        )
                        cost_calculator.cache_route_to_db(
                            start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                            recovery_data, routing_source, cache_key=db_cache_key,
                        )
                        logger.info(f"[ROUTING] Recovery response: {routing_source}, {len(routes_out)} route(s)")
                except Exception as rec_e:
                    logger.warning(f"[ROUTING] GraphHopper/Valhalla recovery failed: {rec_e}")

            if recovery_data is not None:
                return jsonify(recovery_data)

            # Fallback to OSRM (public service); use profile matching routing mode
            osrm_profile = 'driving' if valhalla_costing == 'auto' else ('foot' if valhalla_costing == 'pedestrian' else 'bike')
            logger.info(f"[OSRM] Trying fallback with profile={osrm_profile} ({start_lon},{start_lat}) to ({end_lon},{end_lat})")
            osrm_url = (
                f"{OSRM_URL}/{osrm_profile}/{start_lon},{start_lat};{end_lon},{end_lat}"
                f"?alternatives=true&overview=full&steps=true&annotations=maxspeed"
            )
            try:
                headers = {
                    'User-Agent': 'Voyagr-PWA/1.0',
                    'Accept': 'application/json'
                }
                logger.debug(f"[OSRM] URL: {osrm_url}")
                osrm_start = time.time()
                response = requests.get(osrm_url, timeout=15, headers=headers)
                osrm_elapsed = (time.time() - osrm_start) * 1000
                logger.info(f"[OSRM] Response status: {response.status_code}, elapsed: {osrm_elapsed:.0f}ms")

                if response.status_code == 200:
                    route_data = response.json()
                    if route_data.get('code') == 'Ok' and 'routes' in route_data:
                        # Build standard route entries from OSRM alternatives.
                        # Extracted to voyagr.services.routing.osrm_fallback for
                        # offline testing; behaviour (cost estimate, hazard
                        # scoring, maneuvers) is unchanged.
                        routes = build_osrm_routes(
                            route_data,
                            OsrmRouteContext(
                                hazards=hazards,
                                vehicle_type=vehicle_type,
                                fuel_efficiency=fuel_efficiency,
                                fuel_price=fuel_price,
                                energy_efficiency=energy_efficiency,
                                electricity_price=electricity_price,
                                include_tolls=include_tolls,
                                include_caz=include_caz,
                                caz_exempt=caz_exempt,
                            ),
                        )

                        print(f"[OSRM] SUCCESS: {len(routes)} routes found")

                        # ================================================================
                        # HAZARD AVOIDANCE: Reorder routes by hazard penalty if enabled
                        # ================================================================
                        if enable_hazard_avoidance and hazards:
                            # Sort routes by hazard penalty (ascending - fewer hazards first)
                            routes_sorted = sorted(routes, key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)))
                            print("[HAZARDS] Routes reordered by hazard penalty:")
                            for idx, route in enumerate(routes_sorted):
                                print(f"  Route {idx+1}: {route['name']} - Hazard penalty: {route.get('hazard_penalty_seconds', 0):.0f}s, Count: {route.get('hazard_count', 0)}")
                            routes = routes_sorted

                        # ================================================================
                        # PHASE 5: Record success in fallback chain optimizer
                        # ================================================================
                        osrm_elapsed = (time.time() - route_start_time) * 1000
                        fallback_optimizer.record_success('osrm', osrm_elapsed)

                        response_data = {
                            'success': True,
                            'routes': routes,
                            'source': 'OSRM (Fallback)',
                            'routing_degraded': True,
                            'routing_warning': (
                                'Local Valhalla/GraphHopper unavailable — basic route only, '
                                'no camera avoidance or multi-route comparison.'
                            ),
                            'engines_failed': {
                                'valhalla': valhalla_error,
                                'graphhopper': graphhopper_error,
                            },
                            'distance': f'{routes[0]["distance_km"]:.2f} km',
                            'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                            'geometry': routes[0]['geometry'],
                            'geometry_precision': routes[0].get('geometry_precision', 5),
                            'fuel_cost': routes[0]['fuel_cost'],
                            'fuel_litres': routes[0].get('fuel_litres', 0),
                            'toll_cost': routes[0]['toll_cost'],
                            'caz_cost': routes[0]['caz_cost'],
                            'start_lat': start_lat,
                            'start_lon': start_lon,
                            'end_lat': end_lat,
                            'end_lon': end_lon,
                            **primary_route_api_fields(routes),
                        }

                        # ================================================================
                        # PHASE 4: Persistent database caching for long-term storage
                        # ================================================================
                        cost_calculator.cache_route_to_db(
                            start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                            response_data, 'OSRM', cache_key=db_cache_key,
                        )
                        print("[CACHE] STORED: Route cached in database")

                        return jsonify(response_data)
                    else:
                        print(f"[OSRM] Unexpected response: {route_data.get('code')}")
                else:
                    print(f"[OSRM] HTTP {response.status_code}")
            except requests.exceptions.Timeout:
                print("[OSRM] Timeout (>10s)")
                fallback_optimizer.record_failure('osrm')
            except requests.exceptions.ConnectionError as e:
                print(f"[OSRM] Connection error: {str(e)}")
                fallback_optimizer.record_failure('osrm')
            except Exception as e:
                print(f"[OSRM] Error: {str(e)}")
                fallback_optimizer.record_failure('osrm')

            # All routing engines failed - log summary
            logger.error("\n[ROUTING SUMMARY]")
            logger.error(f"  Valhalla ({VALHALLA_URL}): {valhalla_error}")
            logger.error("  OSRM (fallback): Failed")
            logger.error(f"[ROUTING] All routing engines failed for route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")

            # Provide diagnostic information
            diagnostic_info = {
                'valhalla_url': VALHALLA_URL,
                'osrm_url': 'http://router.project-osrm.org',
                'valhalla_error': str(valhalla_error),
                'deployment_hint': 'Try /api/test-routing-engines for diagnostics.'
            }

            return jsonify({
                'success': False,
                'error': f'All routing engines failed. Valhalla: {valhalla_error}. Please check your internet connection or try again later.',
                'diagnostic': diagnostic_info
            })

    except Exception as e:
        print(f"[Error] {str(e)}")
        return jsonify({'success': False, 'error': f'Error: {str(e)}'})

@app.route('/api/multi-stop-route', methods=['POST'])
def calculate_multi_stop_route():
    """
    Calculate a multi-drop route with optional stop order optimization,
    per-leg breakdown, time windows, and round-trip support.

    Request parsing, hazard prep and response formatting live in
    voyagr.services.routing.multidrop.build_multidrop_route_from_request.
    """
    from voyagr.services.routing.multidrop import build_multidrop_route_from_request
    result, status = build_multidrop_route_from_request(request.json or {})
    return jsonify(result), status

# Navigation routes (/api/weather, /api/analytics, /api/speed-limit, etc.)
# moved to voyagr/api/navigation.py blueprint

# ============================================================================
# HAZARD AVOIDANCE ENDPOINTS
# Moved to voyagr/api/hazards.py blueprint:
# - /api/hazard-preferences, /api/hazards/add-camera, /api/hazards/report
# - /api/hazards/nearby, /api/cameras/area, /api/traffic-lights, /api/railway-crossings/area
# ============================================================================

# Navigation routes moved to voyagr/api/navigation.py blueprint:
# - /api/lane-guidance, /api/speed-warnings, /api/voice/speak, /api/voice/command
# - /api/weather, /api/analytics, /api/speed-limit, /api/speed-violation
# - /api/speed-limit/metrics, /api/speed-limit/quota, /api/speed-limit/metrics/reset

# Search routes moved to voyagr/api/search.py blueprint:
# - /api/parking-search, /api/poi-search, /api/search-history, /api/favorites

# Settings routes moved to voyagr/api/settings.py blueprint:
# - /api/app-settings, /api/gesture-event, /api/ml-predictions, /api/traffic-patterns

# ============================================================================
# Monitoring routes moved to voyagr/api/monitoring.py blueprint
# ============================================================================

# ============================================================================
# PHASE 5: PARALLEL ROUTING ENGINE TESTING & FALLBACK CHAIN OPTIMIZATION
# Routes moved to voyagr/api/costs.py blueprint:
# - /api/cost-breakdown, /api/route-comparison, /api/cache-statistics
# - /api/cost-prediction, /api/cost-optimization
# ============================================================================

# Initialize fallback chain optimizer
fallback_optimizer = FallbackChainOptimizer()

# Set fallback_optimizer for routing blueprint
set_fallback_optimizer(fallback_optimizer)


# Route handlers moved to voyagr/api/routing.py and voyagr/api/costs.py blueprints

# Removed remaining Phase 5 routes: /api/monitoring/phase5/engine-comparison,
# /api/monitoring/phase5/performance-summary, /api/monitoring/phase5/validation-stats, /api/batch
# All these routes are now served by voyagr/api/routing.py blueprint


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))

    # ====================================================================
    # Routing engines initialization
    # ====================================================================
    print("\n[STARTUP] Using routing engines (Valhalla/OSRM)")

    # Initialize and start monitoring
    if get_monitor:
        monitor = get_monitor()
        # Set monitor for monitoring blueprint
        set_monitor(monitor)
        monitor.start_monitoring()
        try:
            print("[OK] Routing engine monitoring started")
        except UnicodeEncodeError:
            print("[OK] Routing engine monitoring started (emoji display disabled)")

    print("\n" + "="*60)
    print("[STARTUP] Voyagr Web App is running!")
    print("="*60)

    print("\n[INFO] Access the app at:")
    print(f"   http://localhost:{port}")
    print("\n[INFO] Access from your Pixel 6:")
    print("   1. Find your PC's IP address (usually 192.168.x.x)")
    print("   2. Open browser on Pixel 6")
    print(f"   3. Go to: http://YOUR_PC_IP:{port}")
    print("\n[INFO] Monitoring Dashboard:")
    print(f"   http://localhost:{port}/monitoring")
    print("\n" + "="*60 + "\n")

    try:
        app.run(host='0.0.0.0', port=port, debug=False)
    finally:
        if get_monitor:
            monitor = get_monitor()
            monitor.stop_monitoring()

