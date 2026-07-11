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
from datetime import datetime
import threading
import math
import time
from functools import wraps
from collections import OrderedDict
import logging
from typing import List, Dict, Tuple, Optional, Any, Callable, TypeVar, Set

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

# Reverse proxy: fix scheme / client IP when the edge sets X-Forwarded-* (Railway, nginx).
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

    def _make_key(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str, vehicle_type: str, enable_hazard_avoidance: bool = False, avoid_traffic_lights: bool = False, avoid_cameras: bool = True, avoid_railway_crossings: bool = False, avoid_caz_zones: bool = False) -> str:
        """Create cache key from route parameters."""
        return f"{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f},{routing_mode},{vehicle_type},{enable_hazard_avoidance},{int(avoid_traffic_lights)},{int(avoid_cameras)},{int(avoid_railway_crossings)},{int(avoid_caz_zones)},rv6"

    def get(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str, vehicle_type: str, enable_hazard_avoidance: bool = False, avoid_traffic_lights: bool = False, avoid_cameras: bool = True, avoid_railway_crossings: bool = False, avoid_caz_zones: bool = False) -> Optional[Dict[str, Any]]:
        """Get cached route if available and not expired."""
        with self.lock:
            key = self._make_key(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, avoid_caz_zones)

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

    def set(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str, vehicle_type: str, route_data: Dict[str, Any], enable_hazard_avoidance: bool = False, avoid_traffic_lights: bool = False, avoid_cameras: bool = True, avoid_railway_crossings: bool = False, avoid_caz_zones: bool = False) -> None:
        """Cache a route calculation."""
        with self.lock:
            key = self._make_key(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, avoid_caz_zones)

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
from voyagr.models import db_connection

# Database setup
DB_FILE = 'voyagr_web.db'

# Camera hazard buckets: single source of truth is voyagr.config (shared with the
# Optimised-route camera scoring in voyagr.services.routing.optimised_route).
from voyagr.config import CAMERA_HAZARD_BUCKETS


def migrate_legacy_camera_hazard_preferences(cursor: sqlite3.Cursor) -> None:
    """If DB only has legacy 'camera', copy settings into camera_* rows once."""
    cursor.execute(
        "SELECT COUNT(*) FROM hazard_preferences WHERE hazard_type LIKE 'camera_%'"
    )
    if cursor.fetchone()[0] > 0:
        return
    cursor.execute(
        "SELECT penalty_seconds, proximity_threshold_meters, enabled FROM hazard_preferences WHERE hazard_type='camera'"
    )
    cam = cursor.fetchone()
    penalty, threshold, enabled = (800, 100, 1) if not cam else (cam[0], cam[1], cam[2])
    for st in CAMERA_HAZARD_BUCKETS:
        cursor.execute(
            '''
            INSERT OR IGNORE INTO hazard_preferences
            (hazard_type, penalty_seconds, enabled, proximity_threshold_meters)
            VALUES (?, ?, ?, ?)
            ''',
            (st, penalty, int(enabled), threshold),
        )


def apply_camera_hazard_penalty_defaults(cursor: sqlite3.Cursor) -> None:
    """Keep SCDB camera penalty_seconds aligned: red-light 1200s, all other camera_* buckets 800s."""
    cursor.execute(
        "UPDATE hazard_preferences SET penalty_seconds = 1200 WHERE hazard_type = 'camera_red_light'"
    )
    cursor.execute(
        """UPDATE hazard_preferences SET penalty_seconds = 800 WHERE hazard_type IN (
            'camera_speed', 'camera_average_speed', 'camera_bus_lane', 'camera_mobile', 'camera_other'
        )"""
    )


def init_db():
    """Initialize database with all tables."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Trip history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY,
            user_id TEXT,
            start_lat REAL, start_lon REAL, start_address TEXT,
            end_lat REAL, end_lon REAL, end_address TEXT,
            distance_km REAL, duration_minutes REAL,
            fuel_cost REAL, toll_cost REAL, caz_cost REAL,
            routing_mode TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add user_id column if it doesn't exist (privacy: per-user scoping)
    try:
        cursor.execute('ALTER TABLE trips ADD COLUMN user_id TEXT')
    except Exception:
        pass  # Column already exists

    # Vehicle profiles table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY,
            name TEXT, vehicle_type TEXT,
            fuel_efficiency REAL, fuel_price REAL,
            energy_efficiency REAL, electricity_price REAL,
            is_caz_exempt INTEGER DEFAULT 0,
            caz_pass_type TEXT DEFAULT 'none',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add caz_pass_type column if it doesn't exist (migration for existing databases)
    try:
        cursor.execute('ALTER TABLE vehicles ADD COLUMN caz_pass_type TEXT DEFAULT "none"')
    except Exception:
        pass  # Column already exists

    # Charging stations table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS charging_stations (
            id INTEGER PRIMARY KEY,
            name TEXT, lat REAL, lon REAL,
            connector_type TEXT, power_kw REAL,
            cost_per_kwh REAL, availability TEXT
        )
    ''')

    # Hazard avoidance tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cameras (
            id INTEGER PRIMARY KEY,
            lat REAL, lon REAL, type TEXT,
            description TEXT, severity TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hazard_preferences (
            hazard_type TEXT PRIMARY KEY,
            penalty_seconds INTEGER,
            enabled INTEGER DEFAULT 1,
            proximity_threshold_meters INTEGER
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS route_hazards_cache (
            id INTEGER PRIMARY KEY,
            north REAL, south REAL, east REAL, west REAL,
            hazards_data TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create indexes for fast bounding box queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_cameras_lat_lon ON cameras(lat, lon)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_cameras_type ON cameras(type)')

    # Persistent route cache table (Phase 4 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS persistent_route_cache (
            id INTEGER PRIMARY KEY,
            start_lat REAL, start_lon REAL,
            end_lat REAL, end_lon REAL,
            routing_mode TEXT, vehicle_type TEXT,
            route_data TEXT,
            distance_km REAL, duration_minutes REAL,
            fuel_cost REAL, toll_cost REAL, caz_cost REAL,
            total_cost REAL,
            source TEXT,
            access_count INTEGER DEFAULT 1,
            last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS community_hazard_reports (
            report_id INTEGER PRIMARY KEY,
            user_id TEXT, hazard_type TEXT,
            lat REAL, lon REAL, description TEXT,
            severity TEXT, verification_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            expiry_timestamp INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Search history table (Phase 2 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY,
            user_id TEXT,
            query TEXT NOT NULL,
            result_name TEXT,
            lat REAL, lon REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add user_id column if it doesn't exist (privacy: per-user scoping)
    try:
        cursor.execute('ALTER TABLE search_history ADD COLUMN user_id TEXT')
    except Exception:
        pass  # Column already exists

    # Favorite locations table (Phase 2 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS favorite_locations (
            id INTEGER PRIMARY KEY,
            user_id TEXT,
            name TEXT NOT NULL,
            address TEXT,
            lat REAL NOT NULL, lon REAL NOT NULL,
            category TEXT DEFAULT 'location',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add user_id column if it doesn't exist (privacy: per-user scoping)
    try:
        cursor.execute('ALTER TABLE favorite_locations ADD COLUMN user_id TEXT')
    except Exception:
        pass  # Column already exists

    # Speed limit cache table (Phase 2 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS speed_limit_cache (
            id INTEGER PRIMARY KEY,
            lat REAL, lon REAL,
            speed_limit_mph INTEGER,
            road_type TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Anonymous speed-limit display feedback (confirmed vs wrong) for detector analytics
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS speed_limit_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outcome TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            displayed_mph INTEGER,
            source TEXT,
            client_ts INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Lane guidance cache table (Phase 2 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS lane_guidance_cache (
            id INTEGER PRIMARY KEY,
            lat REAL, lon REAL,
            current_lane INTEGER,
            recommended_lane INTEGER,
            total_lanes INTEGER,
            next_maneuver TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # ===== PHASE 3 FEATURES =====

    # Settings table for Phase 3 features (gesture, battery, themes, ML, units)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY,
            gesture_enabled INTEGER DEFAULT 1,
            gesture_sensitivity TEXT DEFAULT 'medium',
            gesture_action TEXT DEFAULT 'recalculate',
            battery_saving_mode INTEGER DEFAULT 0,
            map_theme TEXT DEFAULT 'standard',
            ml_predictions_enabled INTEGER DEFAULT 1,
            haptic_feedback_enabled INTEGER DEFAULT 1,
            distance_unit TEXT DEFAULT 'km',
            currency_unit TEXT DEFAULT 'GBP',
            speed_unit TEXT DEFAULT 'kmh',
            temperature_unit TEXT DEFAULT 'celsius',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # ML route predictions table (Phase 3 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ml_route_predictions (
            id INTEGER PRIMARY KEY,
            start_lat REAL, start_lon REAL,
            end_lat REAL, end_lon REAL,
            day_of_week INTEGER,
            hour_of_day INTEGER,
            frequency INTEGER DEFAULT 1,
            avg_duration_minutes REAL,
            avg_distance_km REAL,
            avg_fuel_cost REAL,
            confidence_score REAL,
            last_used DATETIME,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # ML traffic patterns table (Phase 3 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ml_traffic_patterns (
            id INTEGER PRIMARY KEY,
            lat REAL, lon REAL,
            day_of_week INTEGER,
            hour_of_day INTEGER,
            congestion_level INTEGER,
            avg_speed_kmh REAL,
            sample_count INTEGER DEFAULT 1,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Gesture events log (Phase 3 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS gesture_events (
            id INTEGER PRIMARY KEY,
            gesture_type TEXT,
            action_triggered TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Battery status log (Phase 3 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS battery_status_log (
            id INTEGER PRIMARY KEY,
            battery_level INTEGER,
            charging_status TEXT,
            gps_frequency_ms INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Dashcam recordings table (Dashcam feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dashcam_recordings (
            id INTEGER PRIMARY KEY,
            recording_id TEXT UNIQUE NOT NULL,
            trip_id TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            duration_seconds REAL,
            status TEXT DEFAULT 'recording',
            metadata_points INTEGER DEFAULT 0,
            file_path TEXT,
            file_size_mb REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Promo coupons (trial / person-bound lifetime) + per-user entitlements
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS promo_coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL COLLATE NOCASE,
            coupon_kind TEXT NOT NULL,
            trial_days INTEGER,
            bound_user_id TEXT,
            bound_email TEXT,
            max_redemptions INTEGER NOT NULL DEFAULT 1,
            redemption_count INTEGER NOT NULL DEFAULT 0,
            expires_at INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS promo_redemptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coupon_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            redeemed_at INTEGER NOT NULL,
            UNIQUE(coupon_id, user_id)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_entitlements (
            user_id TEXT PRIMARY KEY,
            lifetime INTEGER NOT NULL DEFAULT 0,
            trial_expires_at INTEGER,
            updated_at INTEGER NOT NULL
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_promo_coupons_code ON promo_coupons(code)')

    # Multi-drop and route avoidance settings columns (added dynamically for existing databases)
    multidrop_columns = [
        ('optimize_stop_order', 'INTEGER DEFAULT 1'),
        ('round_trip', 'INTEGER DEFAULT 0'),
        ('traffic_aware_routing', 'INTEGER DEFAULT 1'),
        ('avoid_road_closures', 'INTEGER DEFAULT 1'),
        ('avoid_incidents', 'INTEGER DEFAULT 1'),
        ('avoid_toll_roads', 'INTEGER DEFAULT 0'),
        ('avoid_motorways', 'INTEGER DEFAULT 0'),
        ('avoid_ferries', 'INTEGER DEFAULT 0'),
    ]
    for col_name, col_def in multidrop_columns:
        try:
            cursor.execute(f'ALTER TABLE app_settings ADD COLUMN {col_name} {col_def}')
        except Exception:
            pass  # Column already exists

    # Initialize app settings if not exists
    cursor.execute('SELECT COUNT(*) FROM app_settings')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO app_settings
            (gesture_enabled, gesture_sensitivity, gesture_action, battery_saving_mode, map_theme, ml_predictions_enabled, haptic_feedback_enabled,
             optimize_stop_order, round_trip, traffic_aware_routing, avoid_road_closures, avoid_incidents)
            VALUES (1, 'medium', 'recalculate', 0, 'standard', 1, 1,
                    1, 0, 1, 1, 1)
        ''')

    # Insert default hazard preferences if not exists
    hazard_preferences = [
        ('camera_speed', 800, 1, 100),
        ('camera_red_light', 1200, 1, 100),
        ('camera_average_speed', 800, 1, 100),
        ('camera_bus_lane', 800, 1, 100),
        ('camera_mobile', 800, 1, 150),
        ('camera_other', 800, 1, 100),
        ('camera', 800, 0, 100),                  # legacy bucket; replaced by camera_* rows
        ('traffic_light', 400, 1, 80),
        ('police', 180, 1, 200),
        ('roadworks', 300, 1, 500),
        ('accident', 600, 1, 500),
        ('railway_crossing', 120, 1, 100),
        ('pothole', 120, 0, 50),
        ('debris', 300, 0, 100),
    ]

    for hazard_type, penalty, enabled, threshold in hazard_preferences:
        cursor.execute('''
            INSERT OR IGNORE INTO hazard_preferences
            (hazard_type, penalty_seconds, enabled, proximity_threshold_meters)
            VALUES (?, ?, ?, ?)
        ''', (hazard_type, penalty, enabled, threshold))

    migrate_legacy_camera_hazard_preferences(cursor)
    apply_camera_hazard_penalty_defaults(cursor)

    conn.commit()
    conn.close()

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
    build_valhalla_route_entry,
)
# FallbackChainOptimizer / get_traffic_duration_multiplier live in
# voyagr.services.routing.engines (single source of truth). ParallelRoutingEngine
# there is used by the routing debug blueprint.
from voyagr.services.routing.engines import (
    FallbackChainOptimizer,
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
    get_hazards_on_route,
    score_route_by_hazards,
)
from voyagr.services.routing.optimised_route import (
    ensure_optimised_camera_avoiding_route,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    ensure_scenic_valhalla_route,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    ensure_shortest_respects_camera_avoidance,  # noqa: F401 - re-exported for enrichment.py vw.* calls
    graphhopper_qualifies_as_optimised,
)
from voyagr.services.routing.valhalla_parsing import (
    valhalla_route_json_to_standard_routes,
    valhalla_trip_json_to_std_route_entry,
)


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

        logger.info(f"[ROUTE] Via-points: {len(via_points)}, Stops: {len(stops)}, Total stop time: {total_stop_time} min")

        # DEBUG: Log request received
        print(f"\n{'='*80}")
        print("[API REQUEST] /api/route called")
        print(f"[API REQUEST] enable_hazard_avoidance={enable_hazard_avoidance}")
        print(f"{'='*80}\n")
        logger.info(f"[API REQUEST] Route calculation started: ({start},{end}), hazard_avoidance={enable_hazard_avoidance}")

        # ====================================================================
        # MULTI-DROP ROUTING: When optimize_stop_order is enabled and there
        # are stops, use the multi-drop engine for proper TSP optimization
        # ====================================================================
        all_intermediate = list(via_points) + list(stops)
        if optimize_stop_order and len(all_intermediate) >= 2:
            from voyagr.services.routing.multidrop import build_multidrop_route
            logger.info(f"[ROUTE] Multi-drop optimization requested with {len(all_intermediate)} stops")

            md_stops = []
            for item in all_intermediate:
                md_stops.append({
                    'lat': float(item.get('lat', 0)),
                    'lon': float(item.get('lon', 0)),
                    'name': item.get('name', 'Stop'),
                    'duration': item.get('duration', 0),
                    'type': item.get('type', 'via'),
                })

            md_exclude = []
            md_tl_for_gh = None
            md_rx_for_gh = None
            bbox_md = None
            if enable_hazard_avoidance:
                try:
                    all_lats = [start_lat, end_lat] + [s['lat'] for s in md_stops]
                    all_lons = [start_lon, end_lon] + [s['lon'] for s in md_stops]
                    hazards_md = fetch_hazards_for_route(min(all_lats), min(all_lons), max(all_lats), max(all_lons))
                    if not avoid_cameras:
                        clear_camera_hazard_buckets(hazards_md)
                    else:
                        filter_camera_hazards_by_preferences(hazards_md)
                    bbox_md = {
                        'min_lat': min(all_lats), 'max_lat': max(all_lats),
                        'min_lon': min(all_lons), 'max_lon': max(all_lons),
                    }
                    if avoid_traffic_lights:
                        from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
                        hazards_md['traffic_light'] = fetch_traffic_lights_osm_bbox(
                            bbox_md['min_lat'], bbox_md['max_lat'], bbox_md['min_lon'], bbox_md['max_lon'])
                        md_tl_for_gh = hazards_md.get('traffic_light')
                    else:
                        hazards_md['traffic_light'] = []
                    if avoid_railway_crossings:
                        from voyagr.services.hazards import fetch_railway_crossings_osm_bbox
                        hazards_md['railway_crossing'] = fetch_railway_crossings_osm_bbox(
                            bbox_md['min_lat'], bbox_md['max_lat'], bbox_md['min_lon'], bbox_md['max_lon'])
                        md_rx_for_gh = hazards_md.get('railway_crossing')
                    else:
                        hazards_md['railway_crossing'] = []
                    from voyagr.services.hazards import get_caz_valhalla_exclude_points
                    md_caz_pts = get_caz_valhalla_exclude_points(bbox_md, max_points=10) if apply_caz_routing_avoidance else []
                    md_cap = max(50 - len(md_caz_pts), 8)
                    md_exclude = build_valhalla_exclude_locations(hazards_md, route_bbox=bbox_md, max_hazards=md_cap)
                    if md_caz_pts:
                        md_exclude = (md_caz_pts + md_exclude)[:50]
                except Exception as e:
                    logger.warning(f"[MULTI-DROP] Hazard fetch failed: {e}")

            tw_dict = None
            if time_windows and isinstance(time_windows, dict):
                tw_dict = {int(k): v for k, v in time_windows.items()}

            # Use GraphHopper camera avoidance on multi-drop legs when optimised routing is on
            use_gh = enable_hazard_avoidance and routing_mode == 'auto'
            md_bbox = bbox_md if enable_hazard_avoidance else None

            md_result = build_multidrop_route(
                start={'lat': start_lat, 'lon': start_lon},
                end={'lat': end_lat, 'lon': end_lon},
                stops=md_stops,
                optimize_order=True,
                round_trip=round_trip,
                routing_mode=routing_mode,
                enable_hazard_avoidance=enable_hazard_avoidance,
                departure_time=departure_time,
                time_windows=tw_dict,
                exclude_locations=md_exclude if md_exclude else None,
                use_graphhopper_avoidance=use_gh,
                route_bbox=md_bbox,
                avoid_tolls=avoid_tolls,
                avoid_motorways=avoid_motorways,
                avoid_ferries=avoid_ferries,
                prefer_scenic=prefer_scenic,
                prefer_quiet=prefer_quiet,
                avoid_unpaved=avoid_unpaved,
                route_optimization=route_optimization,
                traffic_light_hazards=md_tl_for_gh,
                railway_crossing_hazards=md_rx_for_gh,
                avoid_caz_zones=apply_caz_routing_avoidance,
            )

            if md_result.get('success'):
                md_result['distance'] = f"{md_result['total_distance_km']:.2f} km"
                md_result['time'] = f"{md_result['total_duration_minutes']:.0f} minutes"
                md_result['total_time_with_stops'] = f"{md_result['total_duration_minutes']:.0f} minutes"
                md_result['total_stop_time'] = md_result.get('total_stop_time_minutes', 0)
                md_result['via_points_count'] = len(via_points)
                md_result['stops_count'] = len(stops)
                md_result['source'] = 'Voyagr Multi-Drop'
                md_result['start_lat'] = start_lat
                md_result['start_lon'] = start_lon
                md_result['end_lat'] = end_lat
                md_result['end_lon'] = end_lon
                md_result['cached'] = False
                md_result['multi_drop'] = True

                geometry = md_result.get('all_geometry', [])
                first_geom = geometry[0] if geometry else None
                first_precision = md_result['legs'][0].get('geometry_precision', 6) if md_result.get('legs') else 6

                if first_geom:
                    md_result['geometry'] = first_geom
                    md_result['geometry_precision'] = first_precision

                maneuvers = md_result.get('all_maneuvers', [])
                if maneuvers:
                    md_result['maneuvers'] = maneuvers

                # Build a routes array for compatibility with route comparison UI
                md_result['routes'] = [{
                    'id': 1,
                    'name': 'Multi-Drop' + (' (Optimized)' if md_result.get('optimized') else ''),
                    'distance_km': md_result['total_distance_km'],
                    'duration_minutes': md_result['total_duration_minutes'],
                    'fuel_cost': 0,
                    'fuel_litres': 0,
                    'toll_cost': 0,
                    'caz_cost': 0,
                    'hazard_count': 0,
                    'hazard_penalty_seconds': 0,
                    'geometry': first_geom,
                    'geometry_precision': first_precision,
                    'maneuvers': maneuvers,
                    'source': 'Voyagr Multi-Drop',
                }]

                return jsonify(md_result)
            else:
                logger.warning("[MULTI-DROP] Optimization failed, falling through to standard routing")

        # ====================================================================
        # PHASE 3 OPTIMIZATION: Check route cache first
        # ====================================================================
        cached_route = route_cache.get(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance)
        if cached_route:
            logger.info(f"[CACHE] HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon}) with hazard_avoidance={enable_hazard_avoidance}")
            cached_route['cached'] = True
            cached_route['cache_stats'] = route_cache.get_stats()
            return jsonify(cached_route)

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
        graphhopper_route = None
        graphhopper_error = None
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
        # TRY GRAPHHOPPER FIRST (if camera avoidance enabled)
        # Uses bbox filtering to only include relevant camera areas for performance
        # ====================================================================
        straight_line_km = ((end_lat - start_lat)**2 + (end_lon - start_lon)**2)**0.5 * 111

        # GraphHopper is car-only; skip for pedestrian/bicycle
        if enable_hazard_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE and routing_mode == 'auto':
            logger.info(f"[ROUTING] Trying GraphHopper with camera avoidance (route: {straight_line_km:.0f}km)...")
            try:
                _tl_gh = hazards.get('traffic_light', []) if avoid_traffic_lights else []
                _rx_gh = hazards.get('railway_crossing', []) if avoid_railway_crossings else []
                _cam_gh = {
                    k: hazards.get(k, [])
                    for k in CAMERA_HAZARD_BUCKETS
                    if hazards.get(k)
                } if avoid_cameras else None
                graphhopper_route = route_with_graphhopper(
                    start_lat, start_lon, end_lat, end_lon,
                    enable_camera_avoidance=avoid_cameras,
                    route_bbox=route_bbox,
                    traffic_light_hazards=_tl_gh if _tl_gh else None,
                    railway_crossing_hazards=_rx_gh if _rx_gh else None,
                    avoid_caz_zones=apply_caz_routing_avoidance,
                    avoid_points=avoid_points if avoid_points else None,
                    camera_hazards=_cam_gh if _cam_gh and any(_cam_gh.values()) else None,
                )
                if graphhopper_route and graphhopper_route.get('success'):
                    logger.info("[GRAPHHOPPER] ✅ Route found with camera avoidance")
                else:
                    graphhopper_error = "No route found"
                    logger.warning("[GRAPHHOPPER] No route found, falling back to Valhalla")
            except Exception as e:
                graphhopper_error = str(e)
                logger.warning(f"[GRAPHHOPPER] Error: {e}, falling back to Valhalla")

        logger.debug(f"[ROUTING] Valhalla URL: {VALHALLA_URL}")

        valhalla_start_time = time.time()
        # Defaults if Valhalla try exits early; overwritten when waypoints are processed.
        route_locations = [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}]
        has_waypoints = False
        # Default traffic factors so the retry/recovery paths (which run only when the
        # main success block never set them) always have a defined value.
        traffic_multiplier, traffic_level = 1.0, 'N/A'
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
                try:
                    # Use 500 max to cover all cameras in route area (typically 50-100)
                    # This will be reduced if Valhalla can't find a route
                    # Pass route coordinates for distance-based prioritization
                    # NOTE: Valhalla has a hard limit of 50 exclude_locations
                    # Exceeding this returns error 157: "Exceeded max avoid locations: 50"
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

                    from voyagr.services.hazards import get_caz_valhalla_exclude_points
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
                    if valhalla_costing == 'auto':
                        traffic_multiplier, traffic_level = get_traffic_duration_multiplier(start_lat, start_lon)
                        logger.info(f"[ETA] Base: {base_time_minutes:.0f}min, Traffic: {traffic_level} ({traffic_multiplier:.2f}x), Adjusted: {base_time_minutes * traffic_multiplier:.0f}min")
                    else:
                        traffic_multiplier, traffic_level = 1.0, 'N/A'
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
                    if 'alternates' in route_data:
                        route_names = ['Alternate', 'Balanced', 'Alternative']
                        for idx, alt_route in enumerate(route_data['alternates'][:3]):
                            if 'trip' in alt_route and 'summary' in alt_route['trip']:
                                alt_name = route_names[idx] if idx < len(route_names) else f'Alternative {idx}'
                                routes.append(build_valhalla_route_entry(
                                    trip=alt_route['trip'], name=alt_name, route_id=idx + 2,
                                    traffic_multiplier=traffic_multiplier,
                                    hazards=hazards, cost_calculator=cost_calculator,
                                    vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                    fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                    electricity_price=electricity_price, include_tolls=include_tolls,
                                    include_caz=include_caz, caz_exempt=caz_exempt,
                                ))

                    # ================================================================
                    # REQUEST ADDITIONAL DISTINCT ROUTE TYPES (Shortest, Optimised)
                    # Only for auto mode; pedestrian/bicycle use single costing
                    # ================================================================
                    if valhalla_costing == 'auto' and enable_hazard_avoidance and len(routes) < 3:
                        logger.info(f"[VALHALLA] Standard routing: Adding distinct route types ({len(routes)} routes so far)")

                        # Build exclude_locations for alternative routes (use top 50 cameras closest to route)
                        alt_exclude = []
                        if hazards:
                            try:
                                alt_exclude = build_valhalla_exclude_locations(
                                    hazards, route_bbox=route_bbox, max_hazards=50,
                                    start_lat=start_lat, start_lon=start_lon,
                                    end_lat=end_lat, end_lon=end_lon
                                )
                            except Exception as e:
                                logger.warning(f"[VALHALLA] Failed to build alt exclude_locations: {e}")

                        # Helper function to build a route entry for standard routing
                        # Optimised Discovery route entries are built by the shared
                        # build_valhalla_route_entry (metre-unit maneuvers, traffic_multiplier=1.0).
                        # The nested build_std_route_entry helper has been removed.
                        next_route_id = len(routes) + 1

                        # Route: Shortest Distance (auto_shorter costing); retry without exclusions if avoids over-constrain
                        try:
                            shortest_locs = route_locations if has_waypoints else [
                                {'lat': start_lat, 'lon': start_lon}, {'lat': end_lat, 'lon': end_lon},
                            ]
                            sh_data, sh_exclusions_applied = fetch_shortest_route_json(
                                url, headers, shortest_locs,
                                alt_exclude if alt_exclude else None,
                                enable_hazard_avoidance=enable_hazard_avoidance,
                                avoid_cameras=avoid_cameras,
                            )
                            if sh_data:
                                entry = valhalla_trip_json_to_std_route_entry(
                                    '📏 Shortest', sh_data, next_route_id, hazards, cost_calculator,
                                    vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                    fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                    electricity_price=electricity_price, include_tolls=include_tolls,
                                    include_caz=include_caz, caz_exempt=caz_exempt,
                                )
                                if entry:
                                    if sh_exclusions_applied:
                                        entry['camera_exclusions_applied'] = True
                                    routes.append(entry)
                                    next_route_id += 1
                                    logger.info(f"[VALHALLA] Added Shortest route: {entry['distance_km']:.1f}km")
                        except Exception as e:
                            logger.warning(f"[VALHALLA] Shortest route failed: {e}")

                        # Route: Optimised Discovery (aggressive camera avoidance)
                        try:
                            if route_geometry:
                                baseline_coords = polyline.decode(route_geometry, precision=6)
                                baseline_cameras = find_baseline_cameras_on_route(baseline_coords, alt_exclude)

                                if baseline_cameras:
                                    disc_payload = build_valhalla_discovery_payload(
                                        start_lat=start_lat, start_lon=start_lon,
                                        end_lat=end_lat, end_lon=end_lon,
                                        exclude_locations=baseline_cameras[:50],
                                    )
                                    disc_response = requests.post(url, json=disc_payload, timeout=10, headers=headers)
                                    if disc_response.status_code == 200:
                                        disc_data = disc_response.json()
                                        if 'trip' in disc_data and 'legs' in disc_data['trip']:
                                            disc_geom = disc_data['trip']['legs'][0]['shape']
                                            disc_dist = disc_data['trip']['summary']['length']
                                            disc_time = disc_data['trip']['summary']['time']
                                            route_entry = build_valhalla_route_entry(
                                                trip=disc_data['trip'],
                                                name='⚡ Optimised Discovery',
                                                route_id=next_route_id,
                                                traffic_multiplier=1.0,
                                                maneuver_length_in_meters=True,
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
                                            )
                                            if route_entry['hazard_count'] < hazard_count:
                                                route_entry['camera_exclusions_applied'] = True
                                                routes.append(route_entry)
                                                logger.info(f"[VALHALLA] Added Optimised Discovery route: {disc_dist:.1f}km, {route_entry['hazard_count']} cameras")
                        except Exception as e:
                            logger.warning(f"[VALHALLA] Optimised route failed: {e}")

                        logger.info(f"[VALHALLA] Final route count: {len(routes)}")

                    # auto_shorter (📏 Shortest) is not the same as Valhalla alternates labeled "Shortest".
                    # When we already had 3+ routes we skipped the distinct block; exclusions can also make
                    # the first auto_shorter attempt fail — ensure the true shortest option exists when missing.
                    if valhalla_costing == 'auto':
                        if not any('📏 Shortest' in (r.get('name') or '') for r in routes):
                            try:
                                ensure_exclude: List[Dict[str, Any]] = []
                                if enable_hazard_avoidance and hazards:
                                    try:
                                        ensure_exclude = build_valhalla_exclude_locations(
                                            hazards, route_bbox=route_bbox, max_hazards=50,
                                            start_lat=start_lat, start_lon=start_lon,
                                            end_lat=end_lat, end_lon=end_lon,
                                        )
                                    except Exception as ex:
                                        logger.warning(f'[VALHALLA] ensure Shortest: exclude build failed: {ex}')
                                locs_ensure = route_locations if has_waypoints else [
                                    {'lat': start_lat, 'lon': start_lon}, {'lat': end_lat, 'lon': end_lon},
                                ]
                                sh_ensure, sh_ensure_excl = fetch_shortest_route_json(
                                    url, headers, locs_ensure,
                                    ensure_exclude if ensure_exclude else None,
                                    enable_hazard_avoidance=enable_hazard_avoidance,
                                    avoid_cameras=avoid_cameras,
                                )
                                if sh_ensure:
                                    next_id = len(routes) + 1
                                    ent = valhalla_trip_json_to_std_route_entry(
                                        '📏 Shortest', sh_ensure, next_id, hazards, cost_calculator,
                                        vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                        fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                        electricity_price=electricity_price, include_tolls=include_tolls,
                                        include_caz=include_caz, caz_exempt=caz_exempt,
                                    )
                                    if ent:
                                        if sh_ensure_excl:
                                            ent['camera_exclusions_applied'] = True
                                        routes.append(ent)
                                        logger.info(
                                            f'[VALHALLA] Added Shortest route (ensure): {ent["distance_km"]:.1f}km'
                                        )
                            except Exception as e:
                                logger.warning(f'[VALHALLA] ensure Shortest failed: {e}')

                    print(f"[Valhalla] SUCCESS: {len(routes)} routes found")

                    # Post-Valhalla enrichment (GH Optimised merge, ensure_*, annotate, reorder)
                    enrich_ctx.traffic_multiplier = traffic_multiplier
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
                    route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance)
                    print(f"[CACHE] STORED: Route cached in memory with hazard_avoidance={enable_hazard_avoidance}")

                    # ================================================================
                    # PHASE 4: Persistent database caching for long-term storage
                    # ================================================================
                    cost_calculator.cache_route_to_db(
                        start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                        response_data, 'Valhalla'
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
                                # builder (no traffic adjustment; maneuver lengths in metres,
                                # matching the previous inline retry behaviour).
                                routes = [build_valhalla_route_entry(
                                    trip=retry_data['trip'], name='Fastest', route_id=1,
                                    traffic_multiplier=1.0, include_traffic_fields=False,
                                    maneuver_length_in_meters=True,
                                    hazards=hazards, cost_calculator=cost_calculator,
                                    vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                    fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                    electricity_price=electricity_price, include_tolls=include_tolls,
                                    include_caz=include_caz, caz_exempt=caz_exempt,
                                )]
                                logger.info(f"[VALHALLA] Retry route has {len(routes[0].get('maneuvers') or [])} maneuvers")

                                # Also request Shortest (auto_shorter); retry without exclusions if reduced avoids still block routing
                                try:
                                    retry_short_locs = route_locations if has_waypoints else [
                                        {'lat': start_lat, 'lon': start_lon}, {'lat': end_lat, 'lon': end_lon},
                                    ]
                                    logger.info(
                                        f"[VALHALLA] Retry: Requesting Shortest route with {len(retry_locations)} exclusions"
                                    )
                                    sh_data, sh_excl_applied = fetch_shortest_route_json(
                                        url, headers, retry_short_locs,
                                        retry_locations if retry_locations else None,
                                        enable_hazard_avoidance=enable_hazard_avoidance,
                                        avoid_cameras=avoid_cameras,
                                    )
                                    if sh_data:
                                        rent = valhalla_trip_json_to_std_route_entry(
                                            '📏 Shortest', sh_data, 2, hazards, cost_calculator,
                                            vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                            fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                            electricity_price=electricity_price, include_tolls=include_tolls,
                                            include_caz=include_caz, caz_exempt=caz_exempt,
                                        )
                                        if rent:
                                            if sh_excl_applied:
                                                rent['camera_exclusions_applied'] = True
                                            routes.append(rent)
                                            logger.info(
                                                f"[VALHALLA] Retry: Added Shortest route: {rent['distance_km']:.1f}km"
                                            )
                                except Exception as e:
                                    logger.warning(f"[VALHALLA] Retry Shortest route failed: {e}")

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
                                    traffic_multiplier=traffic_multiplier,
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
                                route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance)
                                print("[CACHE] STORED: Retry route cached in memory")

                                cache_source = 'GraphHopper+Valhalla' if (graphhopper_route and graphhopper_route.get('success')) else 'Valhalla'
                                cost_calculator.cache_route_to_db(
                                    start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                                    response_data, cache_source
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
                    tr_mult = 1.0
                    if valhalla_costing == 'auto':
                        tr_mult, _ = get_traffic_duration_multiplier(start_lat, start_lon)
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
                            )
                            if v_routes:
                                routes_out.extend(v_routes)
                                valhalla_baseline_ok = True
                                logger.info(f"[ROUTING] Recovery: baseline Valhalla returned {len(v_routes)} route(s)")
                    else:
                        _rbody = vrec.text[:800] if vrec.text else ''
                        logger.warning(f"[ROUTING] Recovery Valhalla HTTP {vrec.status_code}: {_rbody}")

                    # Baseline Valhalla is fastest + alternates only; add distance-shortest (auto_shorter) as third option.
                    if valhalla_costing == 'auto' and routes_out:
                        if not any('📏 Shortest' in (r.get('name') or '') for r in routes_out):
                            try:
                                rec_excl: List[Dict[str, Any]] = []
                                if enable_hazard_avoidance and hazards:
                                    try:
                                        rec_excl = build_valhalla_exclude_locations(
                                            hazards, route_bbox=route_bbox, max_hazards=50,
                                            start_lat=start_lat, start_lon=start_lon,
                                            end_lat=end_lat, end_lon=end_lon,
                                        )
                                    except Exception as rex:
                                        logger.warning(f'[ROUTING] Recovery Shortest: exclude build failed: {rex}')
                                locs_rec = route_locations if has_waypoints else [
                                    {'lat': start_lat, 'lon': start_lon}, {'lat': end_lat, 'lon': end_lon},
                                ]
                                sh_rec, sh_rec_excl = fetch_shortest_route_json(
                                    url, headers, locs_rec,
                                    rec_excl if rec_excl else None,
                                    enable_hazard_avoidance=enable_hazard_avoidance,
                                    avoid_cameras=avoid_cameras,
                                )
                                if sh_rec:
                                    rid = len(routes_out) + 1
                                    rent = valhalla_trip_json_to_std_route_entry(
                                        '📏 Shortest', sh_rec, rid, hazards, cost_calculator,
                                        vehicle_type=vehicle_type, fuel_efficiency=fuel_efficiency,
                                        fuel_price=fuel_price, energy_efficiency=energy_efficiency,
                                        electricity_price=electricity_price, include_tolls=include_tolls,
                                        include_caz=include_caz, caz_exempt=caz_exempt,
                                    )
                                    if rent:
                                        if sh_rec_excl:
                                            rent['camera_exclusions_applied'] = True
                                        routes_out.append(rent)
                                        logger.info('[ROUTING] Recovery: added 📏 Shortest (auto_shorter)')
                            except Exception as rec_s_e:
                                logger.warning(f'[ROUTING] Recovery Shortest failed: {rec_s_e}')

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
                            recovery_data, enable_hazard_avoidance, avoid_traffic_lights,
                            avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance,
                        )
                        cost_calculator.cache_route_to_db(
                            start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                            recovery_data, routing_source,
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
                            response_data, 'OSRM'
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
    """
    try:
        from voyagr.services.routing.multidrop import build_multidrop_route

        data = request.json or {}
        start_raw = data.get('start', '')
        end_raw = data.get('end', '')
        waypoints = data.get('waypoints', [])
        stops_list = data.get('stops', [])
        routing_mode = data.get('routing_mode', 'auto')
        optimize = data.get('optimize_order', True)
        round_trip = data.get('round_trip', False)
        departure_time = data.get('departure_time')
        time_windows = data.get('time_windows')
        enable_hazard_avoidance = data.get('enable_hazard_avoidance', False)
        avoid_tolls = data.get('avoid_tolls', False)
        avoid_motorways = data.get('avoid_motorways', False)
        avoid_ferries = data.get('avoid_ferries', False)
        prefer_scenic_ms = bool(data.get('prefer_scenic', False))
        prefer_quiet_ms = bool(data.get('prefer_quiet', False))
        avoid_unpaved_ms = bool(data.get('avoid_unpaved', False))
        route_optimization_ms = str(data.get('route_optimization', 'fastest') or 'fastest').lower()
        if route_optimization_ms not in VALID_ROUTE_OPTIMIZATIONS:
            route_optimization_ms = 'fastest'
        avoid_caz = data.get('avoid_caz', True)
        caz_exempt = data.get('caz_exempt', False)
        vehicle_type_ms = normalize_vehicle_type(data.get('vehicle_type', 'petrol_diesel'))
        apply_caz_ms = bool(avoid_caz and not caz_exempt and vehicle_type_ms != 'electric')

        all_stops = list(stops_list)
        for wp in waypoints:
            if isinstance(wp, dict):
                all_stops.append({
                    'lat': wp.get('lat', 0),
                    'lon': wp.get('lon', 0),
                    'name': wp.get('name', 'Waypoint'),
                    'duration': wp.get('duration', 0),
                    'type': wp.get('type', 'via'),
                })
            elif isinstance(wp, str):
                wp_coords = validate_coordinates(wp)
                if wp_coords:
                    all_stops.append({
                        'lat': wp_coords[0], 'lon': wp_coords[1],
                        'name': 'Waypoint', 'duration': 0, 'type': 'via',
                    })

        if len(all_stops) < 1:
            return jsonify({'success': False, 'error': 'Need at least 1 stop'}), 400
        if len(all_stops) > 25:
            return jsonify({'success': False, 'error': 'Maximum 25 stops allowed'}), 400

        start_coords = validate_coordinates(start_raw) if start_raw else None
        end_coords = validate_coordinates(end_raw) if end_raw else None

        if not start_coords:
            first = all_stops.pop(0)
            start_loc = {'lat': float(first['lat']), 'lon': float(first['lon'])}
        else:
            start_loc = {'lat': start_coords[0], 'lon': start_coords[1]}

        end_loc = None
        if end_coords:
            end_loc = {'lat': end_coords[0], 'lon': end_coords[1]}

        if not all_stops:
            return jsonify({'success': False, 'error': 'Need at least 1 stop besides start/end'}), 400

        tw_dict = None
        if time_windows and isinstance(time_windows, dict):
            tw_dict = {int(k): v for k, v in time_windows.items()}

        bbox = None
        exclude_locations = []
        if enable_hazard_avoidance:
            try:
                from voyagr.services.hazards import (
                    fetch_hazards_for_route,
                    build_valhalla_exclude_locations,
                    get_caz_valhalla_exclude_points,
                )
                min_lat = min(start_loc['lat'], *(s['lat'] for s in all_stops))
                max_lat = max(start_loc['lat'], *(s['lat'] for s in all_stops))
                min_lon = min(start_loc['lon'], *(s['lon'] for s in all_stops))
                max_lon = max(start_loc['lon'], *(s['lon'] for s in all_stops))
                hazards = fetch_hazards_for_route(min_lat, min_lon, max_lat, max_lon)
                bbox = {
                    'min_lat': min_lat, 'max_lat': max_lat,
                    'min_lon': min_lon, 'max_lon': max_lon,
                }
                md_caz_pts = get_caz_valhalla_exclude_points(bbox, max_points=10) if apply_caz_ms else []
                md_cap = max(50 - len(md_caz_pts), 8)
                exclude_locations = build_valhalla_exclude_locations(
                    hazards, route_bbox=bbox, max_hazards=md_cap)
                if md_caz_pts:
                    exclude_locations = (md_caz_pts + exclude_locations)[:50]
            except Exception as e:
                logger.warning(f"[MULTI-DROP] Hazard fetch failed: {e}")

        use_gh = enable_hazard_avoidance and routing_mode == 'auto'
        gh_bbox = bbox if enable_hazard_avoidance else None

        result = build_multidrop_route(
            start=start_loc,
            end=end_loc,
            stops=all_stops,
            optimize_order=optimize,
            round_trip=round_trip,
            routing_mode=routing_mode,
            enable_hazard_avoidance=enable_hazard_avoidance,
            departure_time=departure_time,
            time_windows=tw_dict,
            exclude_locations=exclude_locations if exclude_locations else None,
            use_graphhopper_avoidance=use_gh,
            route_bbox=gh_bbox,
            avoid_tolls=avoid_tolls,
            avoid_motorways=avoid_motorways,
            avoid_ferries=avoid_ferries,
            prefer_scenic=prefer_scenic_ms,
            prefer_quiet=prefer_quiet_ms,
            avoid_unpaved=avoid_unpaved_ms,
            route_optimization=route_optimization_ms,
            avoid_caz_zones=apply_caz_ms,
        )

        if not result.get('success'):
            return jsonify(result), 500

        result['distance'] = f"{result['total_distance_km']:.2f} km"
        result['time'] = f"{result['total_duration_minutes']:.0f} minutes"
        result['source'] = 'Voyagr Multi-Drop'

        return jsonify(result)

    except Exception as e:
        logger.error(f"[MULTI-DROP] Error: {e}")
        return jsonify({'success': False, 'error': str(e)})

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

