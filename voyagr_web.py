#!/usr/bin/env python3
"""
Voyagr Web App - Full-featured Flask-based navigation app
Run this on your PC and access from any device with a browser
Features: Route calculation, cost estimation, multi-stop routing, trip history, vehicle profiles
"""

from flask import Flask, render_template_string, request, jsonify, send_file, after_this_request
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
    from flask_limiter.util import get_remote_address
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    Limiter = None  # type: ignore
    get_remote_address = None  # type: ignore
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
    from overpass_helper import query_overpass, build_traffic_signals_query, build_corridor_traffic_signals_query, build_poi_query, get_overpass_cache_stats
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

    # Add environment-configured origins (production domains, etc.)
    env_origins = os.getenv('ALLOWED_ORIGINS', '').strip()
    if env_origins:
        origins.extend([origin.strip() for origin in env_origins.split(',') if origin.strip()])

    return origins

ALLOWED_ORIGINS: List[str] = _get_allowed_origins()

CORS(app, resources={
    r"/api/*": {
        "origins": ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["http://localhost:5000"],
        "methods": ["GET", "POST", "OPTIONS", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": False
    }
})

# ============================================================================
# MODULAR API BLUEPRINTS REGISTRATION
# ============================================================================
# Import and register API blueprints from voyagr.api module
# These blueprints contain extracted route handlers organized by functionality
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
class RateLimiter:
    """Simple in-memory rate limiter for API endpoints."""
    def __init__(self, max_requests: int = 100, window_seconds: int = 60) -> None:
        self.max_requests: int = max_requests
        self.window_seconds: int = window_seconds
        self.requests: Dict[str, List[Tuple[float, int]]] = {}  # {ip: [(timestamp, count)]}
        self.lock: threading.Lock = threading.Lock()

    def is_allowed(self, ip: str) -> bool:
        """Check if IP is allowed to make a request."""
        with self.lock:
            now: float = time.time()
            if ip not in self.requests:
                self.requests[ip] = []

            # Remove old requests outside the window
            self.requests[ip] = [
                (ts, count) for ts, count in self.requests[ip]
                if now - ts < self.window_seconds
            ]

            # Count total requests in window
            total: int = sum(count for _, count in self.requests[ip])

            if total >= self.max_requests:
                return False

            # Add new request
            if self.requests[ip] and self.requests[ip][-1][0] == now:
                # Same second, increment count
                ts, count = self.requests[ip][-1]
                self.requests[ip][-1] = (ts, count + 1)
            else:
                self.requests[ip].append((now, 1))

            return True

# Initialize rate limiters for different endpoints
route_limiter = RateLimiter(max_requests=100, window_seconds=60)  # 100 requests/min for routes
api_limiter = RateLimiter(max_requests=500, window_seconds=60)    # 500 requests/min for general APIs
auth_limiter = RateLimiter(max_requests=20, window_seconds=60)    # 20 requests/min for auth endpoints
voice_limiter = RateLimiter(max_requests=60, window_seconds=60)   # 60 requests/min for voice endpoints

# Set voice_limiter for navigation blueprint
set_voice_limiter(voice_limiter)

def rate_limit(limiter: RateLimiter) -> Callable[[F], F]:
    """Decorator for rate limiting endpoints using in-memory limiter."""
    def decorator(f: F) -> F:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            ip: Optional[str] = request.remote_addr
            if ip and not limiter.is_allowed(ip):
                logger.warning(f"Rate limit exceeded for IP: {ip}")
                return jsonify({'success': False, 'error': 'Rate limit exceeded. Try again later.'}), 429
            return f(*args, **kwargs)
        return decorated_function  # type: ignore
    return decorator

# Initialize Flask-Limiter if available (more robust, supports Redis backend)
flask_limiter: Optional[Any] = None
if RATE_LIMITING_AVAILABLE and Limiter is not None:
    try:
        flask_limiter = Limiter(
            key_func=get_remote_address,
            app=app,
            default_limits=["500 per minute", "10000 per hour"],
            storage_uri="memory://",  # Use Redis in production: "redis://localhost:6379"
        )
        logger.info("[SECURITY] Flask-Limiter enabled with default limits: 500/min, 10000/hr")
    except Exception as e:
        logger.warning(f"[SECURITY] Flask-Limiter initialization failed: {e}. Using fallback.")
        flask_limiter = None
else:
    logger.info("[SECURITY] Flask-Limiter not available. Using in-memory rate limiting.")

# ============================================================================
# AUTHENTICATION
# ============================================================================
# Simple API key authentication (can be extended with JWT tokens)
VALID_API_KEYS = set(os.getenv('API_KEYS', 'voyagr-default-key').split(','))

def require_auth(f: F) -> F:
    """Decorator for API key authentication."""
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        # Allow requests from localhost without auth (for development)
        if request.remote_addr in ['127.0.0.1', 'localhost']:
            return f(*args, **kwargs)

        # Check for API key in header or query parameter
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key')

        if not api_key or api_key not in VALID_API_KEYS:
            logger.warning(f"Unauthorized API access attempt from {request.remote_addr}")
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        return f(*args, **kwargs)
    return decorated_function  # type: ignore

# ============================================================================
# PHASE 5: REQUEST VALIDATION HELPER FUNCTIONS
# ============================================================================

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
    import re
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

def normalize_vehicle_type(vehicle_type: Any) -> str:
    """
    Normalize vehicle type values coming from clients.

    Canonical internal values:
    - petrol_diesel
    - electric
    - hybrid
    - pedestrian
    - bicycle
    """
    if vehicle_type is None:
        return 'petrol_diesel'

    vt = str(vehicle_type).strip().lower()
    aliases = {
        # Common client values
        'petrol': 'petrol_diesel',
        'diesel': 'petrol_diesel',
        'gas': 'petrol_diesel',
        'gasoline': 'petrol_diesel',
        'ice': 'petrol_diesel',
        # Some UIs might send generic values
        'car': 'petrol_diesel',
    }
    return aliases.get(vt, vt)

def validate_vehicle_type(vehicle_type: str) -> bool:
    """Validate vehicle type.

    Note: 'pedestrian' and 'bicycle' are valid when routing_mode matches,
    as they represent the travel mode rather than actual vehicle types.
    """
    vt = normalize_vehicle_type(vehicle_type)
    valid_types: List[str] = ['petrol_diesel', 'electric', 'hybrid', 'pedestrian', 'bicycle']
    return vt in valid_types

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
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))

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
GRAPHHOPPER_CAMERA_AREAS_COUNT = int(os.getenv('GRAPHHOPPER_CAMERA_AREAS_COUNT', '128'))  # Number of camera_area_N features (UK only)
GRAPHHOPPER_TIMEOUT = int(os.getenv('GRAPHHOPPER_TIMEOUT', '30'))  # Increased timeout for long routes

# Load camera areas from geojson file for bbox filtering
CAMERA_AREAS_DATA = None
try:
    camera_areas_path = os.path.join(os.path.dirname(__file__), 'camera_areas.geojson')
    if os.path.exists(camera_areas_path):
        with open(camera_areas_path, 'r') as f:
            CAMERA_AREAS_DATA = json.load(f)
        logger.info(f"[GRAPHHOPPER] Loaded {len(CAMERA_AREAS_DATA.get('features', []))} camera areas from geojson")
    else:
        logger.warning(f"[GRAPHHOPPER] camera_areas.geojson not found at {camera_areas_path}")
except Exception as e:
    logger.error(f"[GRAPHHOPPER] Failed to load camera_areas.geojson: {e}")

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


def check_route_in_caz(route_coords: List[Tuple[float, float]], vehicle_caz_pass: str = 'none') -> Dict[str, Any]:
    """
    Check if a route passes through any CAZ zones and calculate charges.

    Args:
        route_coords: List of (lat, lon) tuples representing the route
        vehicle_caz_pass: The CAZ pass/exemption type the vehicle has

    Returns:
        Dictionary with:
        - zones_crossed: List of zone IDs the route passes through
        - total_charge: Total CAZ charge (0 if exempt/has pass)
        - is_exempt: Whether the vehicle is exempt
        - pass_covers: Whether a pass covers the charges
        - zone_details: Details of each zone crossed
    """
    result = {
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
        return f"{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f},{routing_mode},{vehicle_type},{enable_hazard_avoidance},{int(avoid_traffic_lights)},{int(avoid_cameras)},{int(avoid_railway_crossings)},{int(avoid_caz_zones)}"

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
# DATABASE CONNECTION POOLING (Phase 3 Optimization)
# ============================================================================

class DatabasePool:
    """Simple connection pool for SQLite database."""

    def __init__(self, db_file: str, pool_size: int = 5) -> None:
        """Initialize connection pool."""
        self.db_file = db_file
        self.pool_size = pool_size
        self.connections: List[Any] = []
        self.available: List[Any] = []
        self.lock = threading.Lock()
        self._initialize_pool()

    def _initialize_pool(self):
        """Initialize the connection pool."""
        for _ in range(self.pool_size):
            conn = sqlite3.connect(self.db_file, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self.connections.append(conn)
            self.available.append(conn)

    def get_connection(self) -> Any:
        """Get a connection from the pool."""
        with self.lock:
            if self.available:
                return self.available.pop()
            else:
                # Create new connection if pool exhausted - track it for cleanup
                conn = sqlite3.connect(self.db_file, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                self.connections.append(conn)  # Track for proper cleanup
                logger.debug(f"[DB POOL] Created overflow connection (total: {len(self.connections)})")
                return conn

    def return_connection(self, conn: Any) -> None:
        """Return a connection to the pool."""
        with self.lock:
            if len(self.available) < self.pool_size:
                self.available.append(conn)
            else:
                # Close overflow connections
                try:
                    conn.close()
                    if conn in self.connections:
                        self.connections.remove(conn)
                except Exception as e:
                    logger.warning(f"[DB POOL] Error closing overflow connection: {e}")

    def close_all(self) -> None:
        """Close all connections in the pool."""
        with self.lock:
            for conn in self.connections:
                try:
                    conn.close()
                except Exception as e:
                    logger.warning(f"[DB POOL] Error closing connection: {e}")
            self.connections.clear()
            self.available.clear()

# Database setup
DB_FILE = 'voyagr_web.db'
db_pool = None  # Will be initialized after DB creation

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
    # NOTE: All cameras now have HIGH priority to avoid (consolidated camera setting)
    # Penalty of 800s (~13 minutes) for all camera types ensures routes avoid them
    hazard_preferences = [
        ('camera', 800, 1, 100),                 # 800s (13 min) - high priority
        ('traffic_light', 400, 1, 80),            # OSM traffic lights (lower than cameras)
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

# Initialize database connection pool (Phase 3 Optimization)
db_pool = DatabasePool(DB_FILE, pool_size=5)
logger.info("[DB POOL] Initialized with 5 connections")

# ============================================================================
# ASYNC COST CALCULATION (Phase 3 Optimization)
# ============================================================================

class CostCalculator:
    """Advanced cost calculator for routes with breakdown and comparison."""

    def __init__(self):
        """Initialize cost calculator."""
        self.cache = {}
        self.lock = threading.Lock()
        self.cost_history = []  # Track cost calculations for analytics

    def calculate_costs(self, distance_km: float, vehicle_type: str, fuel_efficiency: float, fuel_price: float,
                       energy_efficiency: float, electricity_price: float, include_tolls: bool, include_caz: bool, caz_exempt: bool, route_coords: Optional[List[Tuple[float, float]]] = None) -> Dict[str, Any]:
        """Calculate all costs for a route.

        Args:
            distance_km: Route distance in kilometers
            vehicle_type: Type of vehicle (petrol_diesel, electric, hybrid)
            fuel_efficiency: Fuel efficiency in L/100km or kWh/100km
            fuel_price: Fuel price in GBP/L or GBP/kWh
            energy_efficiency: Energy efficiency in kWh/100km (for EVs)
            electricity_price: Electricity price in GBP/kWh
            include_tolls: Whether to include toll costs
            include_caz: Whether to include CAZ costs
            caz_exempt: Whether vehicle is CAZ exempt
            route_coords: List of (lat, lon) tuples for the route (used for toll/CAZ detection)

        Returns:
            Dictionary with fuel_cost, toll_cost, caz_cost, total_cost
        """
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

        # Calculate toll cost - ONLY if route passes through known toll roads
        # Pass route coordinates to enable location-based toll detection
        if include_tolls:
            toll_cost = calculate_toll_cost(distance_km, 'motorway', route_coords=route_coords)

        # Calculate CAZ cost - ONLY if route passes through known CAZ zones
        # Pass route coordinates to enable location-based CAZ detection
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
                                    electricity_price: float, include_tolls: bool, include_caz: bool, caz_exempt: bool) -> Dict[str, Any]:
        """Calculate detailed cost breakdown with per-unit costs."""
        costs = self.calculate_costs(distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt)

        # Calculate per-unit costs
        cost_per_km: float = costs['total_cost'] / distance_km if distance_km > 0 else 0.0
        cost_per_minute: float = costs['total_cost'] / duration_minutes if duration_minutes > 0 else 0.0

        # Calculate fuel efficiency metrics
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

        # Find best routes
        cheapest = min(comparisons, key=lambda x: x['total_cost'])
        fastest = min(comparisons, key=lambda x: x['duration_minutes'])
        shortest = min(comparisons, key=lambda x: x['distance_km'])

        return {
            'routes': comparisons,
            'recommendations': {
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
                'shortest': {
                    'route_id': shortest['route_id'],
                    'distance_saved': round(max(c['distance_km'] for c in comparisons) - shortest['distance_km'], 2),
                    'reason': f"Saves {round(max(c['distance_km'] for c in comparisons) - shortest['distance_km'], 2)} km compared to longest"
                }
            }
        }

    def cache_route_to_db(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str,
                         vehicle_type: str, route_data: Dict[str, Any], source: str) -> bool:
        """Cache a route to the database for long-term storage and analytics."""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            distance_km = route_data.get('distance_km', 0)
            duration_minutes = route_data.get('duration_minutes', 0)
            fuel_cost = route_data.get('fuel_cost', 0)
            toll_cost = route_data.get('toll_cost', 0)
            caz_cost = route_data.get('caz_cost', 0)
            total_cost = fuel_cost + toll_cost + caz_cost

            # Try to insert or update
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
            return_db_connection(conn)
            return True
        except Exception as e:
            logger.error(f"[Cache] Error caching route to DB: {e}")
            return False

    def get_cached_route_from_db(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float,
                                routing_mode: str, vehicle_type: str) -> Optional[Dict[str, Any]]:
        """Retrieve a cached route from the database."""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute('''
                SELECT route_data, access_count FROM persistent_route_cache
                WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
                AND routing_mode=? AND vehicle_type=?
            ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type))

            result = cursor.fetchone()
            if result:
                route_data_str = result[0]
                # Update access count
                cursor.execute('''
                    UPDATE persistent_route_cache
                    SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
                    WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
                    AND routing_mode=? AND vehicle_type=?
                ''', (start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type))
                conn.commit()
                return_db_connection(conn)
                return json.loads(route_data_str)

            return_db_connection(conn)
            return None
        except Exception as e:
            logger.error(f"[Cache] Error retrieving cached route: {e}")
            return None

    def get_cache_statistics(self) -> Dict[str, Any]:
        """Get statistics about the persistent route cache."""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # Total cached routes
            cursor.execute('SELECT COUNT(*) FROM persistent_route_cache')
            total_routes = cursor.fetchone()[0]

            # Most accessed routes
            cursor.execute('''
                SELECT start_lat, start_lon, end_lat, end_lon, access_count
                FROM persistent_route_cache
                ORDER BY access_count DESC LIMIT 5
            ''')
            most_accessed = cursor.fetchall()

            # Average cost
            cursor.execute('SELECT AVG(total_cost) FROM persistent_route_cache')
            avg_cost = cursor.fetchone()[0] or 0

            # Total distance cached
            cursor.execute('SELECT SUM(distance_km) FROM persistent_route_cache')
            total_distance = cursor.fetchone()[0] or 0

            return_db_connection(conn)

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
            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute('''
                SELECT AVG(total_cost / distance_km) as avg_cost_per_km
                FROM persistent_route_cache
                WHERE vehicle_type = ? AND distance_km > ? AND distance_km < ?
            ''', (vehicle_type, distance_km * 0.8, distance_km * 1.2))

            result = cursor.fetchone()
            historical_cost_per_km = result[0] if result and result[0] else None

            return_db_connection(conn)

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
            conn = get_db_connection()
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
            return_db_connection(conn)
            return True
        except Exception as e:
            logger.error(f"[Cache] Error caching alternative routes: {e}")
            return False

    def get_alternative_route_cache_info(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, Any]:
        """Get cache information for alternative routes."""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute('''
                SELECT COUNT(*), AVG(total_cost), SUM(access_count)
                FROM persistent_route_cache
                WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?
            ''', (start_lat, start_lon, end_lat, end_lon))

            result = cursor.fetchone()
            return_db_connection(conn)

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
def invalidate_hazard_cache():
    """Invalidate hazard-related caches when hazard data is updated."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Clear expired hazard reports (older than 24 hours)
        cursor.execute('''
            DELETE FROM community_hazard_reports
            WHERE expiry_timestamp < ?
        ''', (int(time.time()),))

        conn.commit()
        return_db_connection(conn)
        logger.info("Hazard cache invalidated and expired reports cleaned")
        return True
    except Exception as e:
        logger.error(f"Error invalidating hazard cache: {e}")
        return False

def invalidate_route_cache():
    """Invalidate route cache when preferences change."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Clear routes older than 24 hours
        cursor.execute('''
            DELETE FROM persistent_route_cache
            WHERE last_accessed < datetime('now', '-24 hours')
        ''')

        conn.commit()
        return_db_connection(conn)
        logger.info("Route cache invalidated and old routes cleaned")
        return True
    except Exception as e:
        logger.error(f"Error invalidating route cache: {e}")
        return False

# Cost calculation functions
def decode_route_geometry(geometry: str, precision: int = 5) -> List[Tuple[float, float]]:
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

def calculate_fuel_cost(distance_km: float, fuel_efficiency_l_per_100km: float, fuel_price_gbp_per_l: float) -> float:
    """Calculate fuel cost for a route."""
    fuel_needed = (distance_km / 100) * fuel_efficiency_l_per_100km
    return fuel_needed * fuel_price_gbp_per_l

def calculate_energy_cost(distance_km: float, energy_efficiency_kwh_per_100km: float, electricity_price_gbp_per_kwh: float) -> float:
    """Calculate energy cost for EV."""
    energy_needed = (distance_km / 100) * energy_efficiency_kwh_per_100km
    return energy_needed * electricity_price_gbp_per_kwh

def calculate_toll_cost(_distance_km: float, _route_type: str = 'motorway', route_coords: Optional[List[Tuple[float, float]]] = None) -> float:
    """Calculate toll cost based on actual toll roads, not distance.

    IMPORTANT: Toll costs are NOT calculated based on distance anymore.
    The _distance_km and _route_type parameters are kept for backward compatibility.
    Only charges tolls if route passes through known UK toll roads:
    - M6 Toll (£3.50)
    - Dartford Crossing (£2.50)
    - Severn Bridge (£6.70)
    - Humber Bridge (£2.00)

    Returns 0.0 by default (conservative approach) unless route_coords provided.

    Args:
        distance_km: Route distance (DEPRECATED - no longer used)
        route_type: Type of route (DEPRECATED - no longer used)
        route_coords: List of route coordinates to check for toll roads

    Returns:
        Toll cost in GBP (0 if no toll roads detected or no coordinates provided)
    """
    # If no coordinates provided, don't charge tolls (conservative approach)
    # This prevents false toll charges on non-toll routes
    if not route_coords or len(route_coords) == 0:
        return 0.0

    # Known UK toll roads with approximate locations
    TOLL_ROADS: Dict[str, Dict[str, float]] = {
        'M6 Toll': {'lat': 52.5, 'lon': -1.9, 'cost': 3.50, 'radius_km': 15},
        'Dartford Crossing': {'lat': 51.45, 'lon': 0.2, 'cost': 2.50, 'radius_km': 10},
        'Severn Bridge': {'lat': 51.4, 'lon': -2.6, 'cost': 6.70, 'radius_km': 15},
        'Humber Bridge': {'lat': 53.7, 'lon': -0.4, 'cost': 2.00, 'radius_km': 10},
    }

    # Check if route passes through any known toll roads
    total_toll: float = 0.0
    tolls_charged: Set[str] = set()

    for coord in route_coords:
        if isinstance(coord, (list, tuple)) and len(coord) >= 2:
            lat, lon = coord[0], coord[1]

            for toll_name, toll_data in TOLL_ROADS.items():
                if toll_name not in tolls_charged:
                    # Simple distance check
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
    """Calculate Congestion Charge Zone cost using polygon-based boundary detection.

    Uses precise polygon boundaries for each UK CAZ zone instead of radius-based detection.
    Checks if route coordinates fall within actual zone boundaries.

    Args:
        _distance_km: Route distance (DEPRECATED - kept for backward compatibility)
        vehicle_type: Type of vehicle (petrol_diesel, electric, hybrid)
        is_exempt: Whether vehicle is CAZ exempt (legacy parameter)
        route_coords: List of route coordinates to check for CAZ zones
        vehicle_caz_pass: The CAZ pass/exemption type (from CAZ_PASS_TYPES)

    Returns:
        Tuple of (cost, details_dict) where details_dict contains:
        - zones_crossed: List of zone IDs crossed
        - total_charge: Total charge amount
        - is_exempt: Whether vehicle is exempt
        - pass_covers: Whether a pass covers the charges
        - zone_details: Details of each zone
    """
    # Default empty result
    empty_result: Dict[str, Any] = {
        'zones_crossed': [],
        'total_charge': 0.0,
        'is_exempt': False,
        'pass_covers': False,
        'zone_details': []
    }

    # Legacy exemption check
    if is_exempt:
        empty_result['is_exempt'] = True
        return 0.0, empty_result

    # Electric vehicles are always exempt
    if vehicle_type == 'electric':
        empty_result['is_exempt'] = True
        return 0.0, empty_result

    # Map vehicle_caz_pass 'exempt_electric' for electric vehicles
    if vehicle_caz_pass == 'exempt_electric':
        empty_result['is_exempt'] = True
        return 0.0, empty_result

    # If no coordinates provided, don't charge CAZ (conservative approach)
    if not route_coords or len(route_coords) == 0:
        return 0.0, empty_result

    # Use polygon-based detection
    caz_result = check_route_in_caz(route_coords, vehicle_caz_pass)

    return caz_result['total_charge'], caz_result

# Hazard avoidance functions

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

# ============================================================================
# DATABASE HELPER FUNCTION (Phase 3 Optimization)
# ============================================================================

def get_db_connection():
    """Get a database connection from the pool."""
    global db_pool
    if db_pool is None:
        # Fallback if pool not initialized
        return sqlite3.connect(DB_FILE)
    return db_pool.get_connection()

def return_db_connection(conn: Any) -> None:
    """Return a database connection to the pool."""
    global db_pool
    if db_pool is not None:
        db_pool.return_connection(conn)
    else:
        conn.close()

def fetch_hazards_for_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, List[Dict[str, Any]]]:
    """Fetch hazards within bounding box of route."""
    try:
        # ====================================================================
        # PHASE 3 OPTIMIZATION: Use connection pool instead of direct connect
        # ====================================================================
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

        # Skip community reports for custom model (only cameras are used for avoidance)
        # Community reports are still used for post-processing hazard scoring

        return_db_connection(conn)
        return hazards
    except Exception as e:
        logger.error(f"Error fetching hazards: {e}")
        return {}


# ============================================================================
# TOMTOM TRAFFIC INCIDENTS API - HYBRID INTEGRATION
# ============================================================================
# TomTom provides real-time data for: accidents, roadworks, road closures, jams
# This data is converted to Valhalla exclude_locations format and merged with
# existing SCDB camera data for comprehensive hazard avoidance.
# ============================================================================

def fetch_tomtom_incidents(bbox: Dict[str, float], incident_types: Optional[List[str]] = None) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetch real-time traffic incidents from TomTom Traffic Incidents API.

    Args:
        bbox: Bounding box with keys: north, south, east, west
        incident_types: Optional list of incident types to fetch.
                       Default: ['Accident', 'RoadWorks', 'RoadClosed', 'Jam', 'LaneClosed']

    Returns:
        Dictionary of incident types with lat/lon locations, compatible with hazards format

    TomTom Category Codes:
        0: Unknown, 1: Accident, 2: Fog, 3: DangerousConditions, 4: Rain, 5: Ice,
        6: Jam, 7: LaneClosed, 8: RoadClosed, 9: RoadWorks, 10: Wind, 11: Flooding,
        14: BrokenDownVehicle
    """
    tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')

    if not tomtom_api_key:
        logger.warning("[TOMTOM] No API key configured - skipping real-time incidents")
        return {}

    # Default incident types to fetch (most relevant for routing)
    if incident_types is None:
        incident_types = ['1', '6', '7', '8', '9', '14']  # Accident, Jam, LaneClosed, RoadClosed, RoadWorks, BrokenDownVehicle

    # TomTom category code to Voyagr hazard type mapping
    category_mapping = {
        '1': 'accident',           # Accident
        '3': 'debris',             # DangerousConditions
        '6': 'jam',                # Jam (traffic congestion) - will be added to hazards
        '7': 'lane_closed',        # LaneClosed
        '8': 'road_closed',        # RoadClosed
        '9': 'roadworks',          # RoadWorks
        '14': 'debris',            # BrokenDownVehicle
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
        # TomTom Incident Details API v5
        # bbox format: minLon,minLat,maxLon,maxLat (west,south,east,north)
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

        # Reduce timeout to 3s to prevent route calculation delays
        response = requests.get(url, params=params, timeout=3)

        if response.status_code == 200:
            data = response.json()
            incident_list = data.get('incidents', [])

            logger.info(f"[TOMTOM] Received {len(incident_list)} incidents from API")

            for incident in incident_list:
                try:
                    # Get incident properties
                    props = incident.get('properties', {})
                    icon_category = str(props.get('iconCategory', '0'))
                    geometry = incident.get('geometry', {})

                    # Map TomTom category to Voyagr hazard type
                    hazard_type = category_mapping.get(icon_category, None)
                    if hazard_type is None:
                        continue  # Skip unknown incident types

                    # Get description from events
                    events = props.get('events', [])
                    description = events[0].get('description', 'Traffic incident') if events else 'Traffic incident'

                    # Add location information
                    from_location = props.get('from', '')
                    to_location = props.get('to', '')
                    if from_location and to_location:
                        description = f"{description} ({from_location} to {to_location})"

                    # Get coordinates based on geometry type
                    coords = geometry.get('coordinates', [])
                    geo_type = geometry.get('type', '')

                    if geo_type == 'Point' and len(coords) >= 2:
                        # Single point: [lon, lat]
                        incidents[hazard_type].append({
                            'lat': coords[1],
                            'lon': coords[0],
                            'description': description,
                            'severity': 'high' if icon_category in ['1', '8'] else 'medium',
                            'source': 'TomTom',
                            'original_type': icon_category
                        })
                    elif geo_type == 'LineString' and len(coords) > 0:
                        # Line: use start, middle, and end points for better avoidance
                        # This ensures long incidents (like roadworks) are properly avoided
                        points_to_add = []

                        # Always add start point
                        if len(coords[0]) >= 2:
                            points_to_add.append((coords[0][1], coords[0][0]))

                        # Add middle point for longer incidents
                        if len(coords) > 2:
                            mid_idx = len(coords) // 2
                            if len(coords[mid_idx]) >= 2:
                                points_to_add.append((coords[mid_idx][1], coords[mid_idx][0]))

                        # Always add end point
                        if len(coords) > 1 and len(coords[-1]) >= 2:
                            points_to_add.append((coords[-1][1], coords[-1][0]))

                        for lat, lon in points_to_add:
                            incidents[hazard_type].append({
                                'lat': lat,
                                'lon': lon,
                                'description': description,
                                'severity': 'high' if icon_category in ['1', '8'] else 'medium',
                                'source': 'TomTom',
                                'original_type': icon_category
                            })
                    elif geo_type == 'MultiPoint':
                        # Multiple points
                        for coord in coords:
                            if len(coord) >= 2:
                                incidents[hazard_type].append({
                                    'lat': coord[1],
                                    'lon': coord[0],
                                    'description': description,
                                    'severity': 'high' if icon_category in ['1', '8'] else 'medium',
                                    'source': 'TomTom',
                                    'original_type': icon_category
                                })

                except Exception as parse_error:
                    logger.warning(f"[TOMTOM] Error parsing incident: {parse_error}")
                    continue

            # Log summary
            total_incidents = sum(len(v) for v in incidents.values())
            logger.info(f"[TOMTOM] Parsed {total_incidents} incident points: "
                       f"accidents={len(incidents['accident'])}, "
                       f"roadworks={len(incidents['roadworks'])}, "
                       f"road_closed={len(incidents['road_closed'])}, "
                       f"jam={len(incidents['jam'])}, "
                       f"debris={len(incidents['debris'])}")

            return incidents

        elif response.status_code == 403:
            logger.warning("[TOMTOM] API key invalid or quota exceeded")
            return {}
        else:
            logger.warning(f"[TOMTOM] API returned status {response.status_code}: {response.text[:200]}")
            return {}

    except requests.exceptions.Timeout:
        logger.warning("[TOMTOM] API request timed out")
        return {}
    except Exception as e:
        logger.error(f"[TOMTOM] Error fetching incidents: {e}")
        return {}


def merge_hazards_with_tomtom_incidents(hazards: Dict[str, List[Dict[str, Any]]],
                                         tomtom_incidents: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Merge existing hazards (cameras from SCDB) with TomTom real-time incidents.

    Args:
        hazards: Existing hazards dictionary (cameras, community reports)
        tomtom_incidents: Real-time incidents from TomTom API

    Returns:
        Merged hazards dictionary with both static and real-time data
    """
    merged = hazards.copy()

    # Add new hazard types from TomTom that may not exist in base hazards
    for hazard_type in ['road_closed', 'lane_closed', 'jam']:
        if hazard_type not in merged:
            merged[hazard_type] = []

    # Merge TomTom incidents into hazards
    for incident_type, incident_list in tomtom_incidents.items():
        if incident_type in merged:
            merged[incident_type].extend(incident_list)
        else:
            merged[incident_type] = incident_list

    # Log merge summary
    camera_count = len(merged.get('camera', []))
    tomtom_count = sum(len(tomtom_incidents.get(t, [])) for t in tomtom_incidents.keys())
    total_count = sum(len(v) for v in merged.values())

    logger.info(f"[HYBRID] Merged hazards: {camera_count} cameras + {tomtom_count} TomTom incidents = {total_count} total")

    return merged


def build_graphhopper_custom_model(hazards: Dict[str, List[Dict[str, Any]]], route_bbox: Optional[Dict[str, float]] = None, max_hazards: int = 25) -> Dict[str, Any]:
    """
    Build GraphHopper Custom Model to avoid hazards.

    Uses GraphHopper's custom model 'areas' feature to define circular zones around hazards
    and applies priority penalties to routes passing through those zones.

    Args:
        hazards: Dictionary of hazard types and their locations
        route_bbox: Optional bounding box to filter hazards (keys: min_lat, max_lat, min_lon, max_lon)
        max_hazards: Maximum number of hazards to include (to avoid huge payloads)

    Returns:
        Custom model dictionary for GraphHopper API
    """
    try:
        # Collect all hazards with priority weighting
        all_hazards = []

        # Priority weights for different hazard types
        hazard_weights = {
            'camera': 50.0,                  # High priority - strong avoidance
            'traffic_light': 40.0,           # OSM traffic signals (when enabled)
            'police': 30.0,                  # Medium-high priority
            'railway_crossing': 35.0,        # OSM level crossings (dynamic polygons; must be >= 30)
            'accident': 20.0,                # Medium priority
            'roadworks': 15.0,               # Medium-low priority
            'pothole': 5.0,                  # Very low priority
            'debris': 5.0                    # Very low priority
        }

        for hazard_type, hazard_list in hazards.items():
            weight = hazard_weights.get(hazard_type, 10.0)
            # Only include high-priority hazards (cameras, traffic lights, police)
            if weight >= 30.0:
                for hazard in hazard_list:
                    # Filter by bounding box if provided (with 10% margin)
                    if route_bbox:
                        margin = 0.1  # 10% margin
                        lat_margin = (route_bbox['max_lat'] - route_bbox['min_lat']) * margin
                        lon_margin = (route_bbox['max_lon'] - route_bbox['min_lon']) * margin

                        if not (route_bbox['min_lat'] - lat_margin <= hazard['lat'] <= route_bbox['max_lat'] + lat_margin and
                                route_bbox['min_lon'] - lon_margin <= hazard['lon'] <= route_bbox['max_lon'] + lon_margin):
                            continue  # Skip hazards outside bounding box

                    all_hazards.append({
                        'lat': hazard['lat'],
                        'lon': hazard['lon'],
                        'type': hazard_type,
                        'weight': weight
                    })

        # Sort by weight (highest first) and limit to max_hazards
        all_hazards.sort(key=lambda h: h['weight'], reverse=True)
        all_hazards = all_hazards[:max_hazards]

        if not all_hazards:
            logger.warning(f"[CUSTOM_MODEL] No high-priority hazards found")
            return {}

        # Build GeoJSON areas with circular polygons around each hazard
        import math

        areas_geojson = {
            "type": "FeatureCollection",
            "features": []
        }

        priority_rules = []
        radius_meters = 30  # 30 meter radius around each hazard (reduced from 50m for performance)

        for idx, hazard in enumerate(all_hazards):
            area_id = f"hazard_{idx}"

            # Convert radius from meters to degrees (approximate)
            # 1 degree latitude ≈ 111km
            # 1 degree longitude ≈ 111km * cos(latitude)
            lat_offset = radius_meters / 111000
            lon_offset = radius_meters / (111000 * math.cos(math.radians(hazard['lat'])))

            # Create 6-point hexagon polygon (reduced from 8-point for performance)
            coordinates = []
            for i in range(7):  # 7 points to close the polygon
                angle = (i / 6) * 2 * math.pi
                lat = hazard['lat'] + lat_offset * math.sin(angle)
                lon = hazard['lon'] + lon_offset * math.cos(angle)
                coordinates.append([lon, lat])

            # Add area to GeoJSON
            areas_geojson["features"].append({
                "type": "Feature",
                "id": area_id,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coordinates]
                }
            })

            # Calculate priority multiplier based on hazard weight
            # Traffic light cameras: 0.05 (very strong avoidance, but not complete to allow routing)
            # Speed cameras: 0.1 (strong avoidance)
            # Police: 0.3 (medium avoidance)
            if hazard['weight'] >= 100:
                multiplier = 0.05  # Very strong avoidance (changed from 0 to allow routing)
            elif hazard['weight'] >= 50:
                multiplier = 0.1  # Strong avoidance (changed from 0.01)
            else:
                multiplier = 0.3  # Medium avoidance (changed from 0.1)

            # Add priority rule for this hazard area
            priority_rules.append({
                "if": f"in_{area_id}",
                "multiply_by": str(multiplier)
            })

        custom_model = {
            "priority": priority_rules,
            "areas": areas_geojson
        }

        logger.info(f"[CUSTOM_MODEL] Built model with {len(all_hazards)} hazard areas (from {sum(len(h) for h in hazards.values())} total hazards)")
        logger.debug(f"[CUSTOM_MODEL] Priority rules: {len(priority_rules)}")
        return custom_model

    except Exception as e:
        logger.error(f"[CUSTOM_MODEL] Error building custom model: {e}")
        return {}  # Return empty model on error

def build_valhalla_exclude_locations(hazards: Dict[str, List[Dict[str, Any]]], route_bbox: Optional[Dict[str, float]] = None, max_hazards: int = 100, start_lat: Optional[float] = None, start_lon: Optional[float] = None, end_lat: Optional[float] = None, end_lon: Optional[float] = None) -> List[Dict[str, float]]:
    """
    Build Valhalla exclude_locations to avoid hazards.

    This is more efficient than exclude_polygons and has no circumference limit.
    Valhalla will map each location to the closest road and exclude it.

    Args:
        hazards: Dictionary of hazard types and their locations
        route_bbox: Optional bounding box to filter hazards (keys: min_lat, max_lat, min_lon, max_lon)
        max_hazards: Maximum number of hazards to include (no hard limit, but keep reasonable for performance)
        start_lat, start_lon, end_lat, end_lon: Route endpoints for distance-based prioritization

    Returns:
        List of locations in Valhalla format: [{"lat": lat, "lon": lon}, ...]
    """
    try:
        # Hazard weights (higher = more important to avoid)
        # FIXED: All hazards should be avoided, not just high-priority ones
        # The weights determine PRIORITY when we hit max_hazards limit
        # UPDATED: Added TomTom real-time incident types (road_closed, lane_closed, jam)
        hazard_weights = {
            'camera': 50.0,            # Highest priority - always avoid
            'road_closed': 45.0,       # TomTom: Very high - road is impassable
            'police': 40.0,            # High priority
            'accident': 35.0,          # High priority - safety hazard (TomTom + community)
            'traffic_light': 38.0,     # OSM traffic signals (when enabled)
            'lane_closed': 32.0,       # TomTom: Medium-high - reduces capacity
            'roadworks': 30.0,         # Medium-high priority (TomTom + community)
            'jam': 25.0,               # TomTom: Medium - traffic congestion
            'railway_crossing': 20.0,  # Medium priority
            'pothole': 15.0,           # Lower priority
            'debris': 15.0             # Lower priority (TomTom + community)
        }

        # Collect ALL hazards with weights (not just high-priority)
        all_hazards = []

        for hazard_type, hazard_list in hazards.items():
            weight = hazard_weights.get(hazard_type, 10.0)
            # FIXED: Include ALL hazard types, not just those with weight >= 30
            # This ensures routes with avoidance have FEWER hazards, not more
            for hazard in hazard_list:
                # Filter by bounding box if provided (with margin to cover detour routes)
                if route_bbox:
                    # Use 50% margin OR minimum 0.15 degrees (~17km), whichever is larger
                    # This ensures we capture cameras on detour routes even for short trips
                    margin_percent = 0.5
                    min_margin_degrees = 0.15  # ~17km

                    lat_margin = max(
                        (route_bbox['max_lat'] - route_bbox['min_lat']) * margin_percent,
                        min_margin_degrees
                    )
                    lon_margin = max(
                        (route_bbox['max_lon'] - route_bbox['min_lon']) * margin_percent,
                        min_margin_degrees
                    )

                    if not (route_bbox['min_lat'] - lat_margin <= hazard['lat'] <= route_bbox['max_lat'] + lat_margin and
                            route_bbox['min_lon'] - lon_margin <= hazard['lon'] <= route_bbox['max_lon'] + lon_margin):
                        continue  # Skip hazards outside bounding box

                # Calculate perpendicular distance to route line (for prioritization)
                distance_to_route = float('inf')
                if start_lat is not None and start_lon is not None and end_lat is not None and end_lon is not None:
                    # Calculate perpendicular distance from point to line segment
                    # Using the formula: distance = |cross product| / |line length|

                    # Vector from start to end
                    dx = end_lon - start_lon
                    dy = end_lat - start_lat

                    # Vector from start to hazard
                    px = hazard['lon'] - start_lon
                    py = hazard['lat'] - start_lat

                    # Calculate line length squared
                    line_length_sq = dx * dx + dy * dy

                    if line_length_sq > 0:
                        # Calculate projection parameter (0 = at start, 1 = at end)
                        t = max(0, min(1, (px * dx + py * dy) / line_length_sq))

                        # Find closest point on line segment
                        closest_lon = start_lon + t * dx
                        closest_lat = start_lat + t * dy

                        # Calculate perpendicular distance to closest point on line
                        distance_to_route = get_distance_between_points(
                            hazard['lat'], hazard['lon'],
                            closest_lat, closest_lon
                        )
                    else:
                        # Start and end are the same point - use distance to start
                        distance_to_route = get_distance_between_points(
                            hazard['lat'], hazard['lon'],
                            start_lat, start_lon
                        )

                all_hazards.append({
                    'lat': hazard['lat'],
                    'lon': hazard['lon'],
                    'type': hazard_type,
                    'weight': weight,
                    'distance_to_route': distance_to_route
                })

        # Sort by distance to route (closest first), then by weight
        # This ensures we exclude cameras that are actually ON or NEAR the route
        all_hazards.sort(key=lambda h: (h['distance_to_route'], -h['weight']))
        all_hazards = all_hazards[:max_hazards]

        if not all_hazards:
            logger.warning(f"[VALHALLA] No high-priority hazards found for exclude_locations")
            return []

        # Build exclude_locations list (just lat/lon pairs)
        exclude_locations = []
        for hazard in all_hazards:
            exclude_locations.append({
                "lat": hazard['lat'],
                "lon": hazard['lon']
            })

        total_hazards = sum(len(h) for h in hazards.values())
        logger.info(f"[VALHALLA] Built {len(exclude_locations)} exclude_locations (from {total_hazards} total hazards)")

        # Log bounding box info for debugging
        if route_bbox and exclude_locations:
            logger.info(f"[VALHALLA] Bounding box: lat [{route_bbox['min_lat']:.4f}, {route_bbox['max_lat']:.4f}], lon [{route_bbox['min_lon']:.4f}, {route_bbox['max_lon']:.4f}]")
            # Calculate margins for logging (same formula as in the loop)
            margin_percent = 0.5
            min_margin_degrees = 0.15
            lat_margin_log = max((route_bbox['max_lat'] - route_bbox['min_lat']) * margin_percent, min_margin_degrees)
            lon_margin_log = max((route_bbox['max_lon'] - route_bbox['min_lon']) * margin_percent, min_margin_degrees)
            logger.info(f"[VALHALLA] Margins applied: lat={lat_margin_log:.4f} (~{lat_margin_log*111:.1f}km), lon={lon_margin_log:.4f} (~{lon_margin_log*111:.1f}km)")

        return exclude_locations

    except Exception as e:
        logger.error(f"[VALHALLA] Error building exclude_locations: {e}")
        return []  # Return empty list on error


# ============================================================================
# GRAPHHOPPER CAMERA AVOIDANCE ROUTING
# ============================================================================
# Uses pre-loaded camera areas from camera_areas.geojson for efficient routing

def build_graphhopper_camera_avoidance_model(route_bbox: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """
    Build GraphHopper custom model that references camera areas within route bounding box.

    The camera areas are loaded at GraphHopper startup from camera_areas.geojson.
    This function filters areas by route bounding box to improve performance on long routes.

    Args:
        route_bbox: Optional bounding box with keys: min_lat, max_lat, min_lon, max_lon
                   If provided, only camera areas intersecting this bbox will be included

    Returns:
        GraphHopper custom_model dict with priority rules
    """
    try:
        area_conditions = []

        # If we have bbox and camera areas data, filter by bbox
        if route_bbox and CAMERA_AREAS_DATA:
            # Add 20% margin to bbox to catch cameras on detour routes
            margin = 0.2
            lat_margin = (route_bbox['max_lat'] - route_bbox['min_lat']) * margin
            lon_margin = (route_bbox['max_lon'] - route_bbox['min_lon']) * margin

            bbox_min_lat = route_bbox['min_lat'] - lat_margin
            bbox_max_lat = route_bbox['max_lat'] + lat_margin
            bbox_min_lon = route_bbox['min_lon'] - lon_margin
            bbox_max_lon = route_bbox['max_lon'] + lon_margin

            # Filter camera areas by bounding box
            for feature in CAMERA_AREAS_DATA.get('features', []):
                area_id = feature.get('id', '')
                if not area_id.startswith('camera_area_'):
                    continue

                # Extract area index from ID (e.g., "camera_area_42" -> 42)
                try:
                    area_index = int(area_id.replace('camera_area_', ''))
                except ValueError:
                    continue

                # Get geometry to check if it intersects with route bbox
                geometry = feature.get('geometry', {})
                if geometry.get('type') == 'MultiPolygon':
                    coordinates = geometry.get('coordinates', [])

                    # Check if any polygon in the MultiPolygon intersects with bbox
                    intersects = False
                    for polygon in coordinates:
                        for ring in polygon:
                            for coord in ring:
                                lon, lat = coord[0], coord[1]
                                if (bbox_min_lat <= lat <= bbox_max_lat and
                                    bbox_min_lon <= lon <= bbox_max_lon):
                                    intersects = True
                                    break
                            if intersects:
                                break
                        if intersects:
                            break

                    if intersects:
                        area_conditions.append(f"in_camera_area_{area_index}")

            logger.info(f"[GRAPHHOPPER] Filtered to {len(area_conditions)} camera areas within route bbox (from {GRAPHHOPPER_CAMERA_AREAS_COUNT} total)")

        else:
            # No bbox filtering - include ALL camera areas (fallback for short routes)
            for i in range(GRAPHHOPPER_CAMERA_AREAS_COUNT):
                area_conditions.append(f"in_camera_area_{i}")
            logger.info(f"[GRAPHHOPPER] Using ALL {len(area_conditions)} camera areas (no bbox filtering)")

        # If no areas match, return empty model
        if not area_conditions:
            logger.warning(f"[GRAPHHOPPER] No camera areas found for route bbox - using empty model")
            return {}

        # Build the condition string with filtered areas
        condition_str = " || ".join(area_conditions)

        custom_model = {
            "priority": [
                {
                    "if": condition_str,
                    "multiply_by": "0.01"  # Strong avoidance (99% penalty)
                }
            ]
        }

        return custom_model

    except Exception as e:
        logger.error(f"[GRAPHHOPPER] Error building camera avoidance model: {e}")
        return {}


def route_with_graphhopper(
    start_lat: float, start_lon: float,
    end_lat: float, end_lon: float,
    enable_camera_avoidance: bool = True,
    route_bbox: Optional[Dict[str, float]] = None,
    traffic_light_hazards: Optional[List[Dict[str, Any]]] = None,
    railway_crossing_hazards: Optional[List[Dict[str, Any]]] = None,
    avoid_caz_zones: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Route using GraphHopper with optional camera avoidance via pre-loaded areas.

    Args:
        start_lat, start_lon: Start coordinates
        end_lat, end_lon: End coordinates
        enable_camera_avoidance: Whether to use camera avoidance custom model
        route_bbox: Bounding box of route for area selection
        traffic_light_hazards: Optional OSM traffic light points to avoid (dynamic polygons)
        railway_crossing_hazards: Optional OSM level crossing points (separate from traffic lights)
        avoid_caz_zones: Penalize edges inside UK CAZ/ULEZ polygons (same data as costing)

    Returns:
        Route data dict or None if failed
    """
    try:
        from voyagr.services.hazards import (
            merge_graphhopper_custom_model_parts,
            build_graphhopper_caz_avoidance_model,
            build_graphhopper_custom_model as gh_build_hazard_model,
        )

        url = f"{GRAPHHOPPER_URL}/route"

        headers = {
            'User-Agent': 'Voyagr-PWA/1.0',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

        # Build request payload (used for POST + custom_model flows)
        payload: Dict[str, Any] = {
            "points": [[start_lon, start_lat], [end_lon, end_lat]],  # GraphHopper uses [lon, lat]
            "profile": "car",
            "locale": "en",
            "instructions": True,
            "points_encoded": True,
            "elevation": False
        }

        custom_model: Optional[Dict[str, Any]] = None
        cam_model: Optional[Dict[str, Any]] = None
        if enable_camera_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE:
            cam_model = build_graphhopper_camera_avoidance_model(route_bbox) or None

        osm_dynamic: Dict[str, List[Dict[str, Any]]] = {}
        if traffic_light_hazards:
            osm_dynamic['traffic_light'] = traffic_light_hazards
        if railway_crossing_hazards:
            osm_dynamic['railway_crossing'] = railway_crossing_hazards

        tl_rx_model: Optional[Dict[str, Any]] = None
        if osm_dynamic:
            tl_rx_model = gh_build_hazard_model(
                osm_dynamic,
                route_bbox=route_bbox,
                max_hazards=22,
            ) or None

        caz_model: Optional[Dict[str, Any]] = None
        if avoid_caz_zones:
            caz_model = build_graphhopper_caz_avoidance_model(route_bbox) or None

        custom_model = merge_graphhopper_custom_model_parts(cam_model, tl_rx_model, caz_model)
        if custom_model:
            payload["custom_model"] = custom_model
            logger.info("[GRAPHHOPPER] Using custom model (cameras, OSM hazards, and/or CAZ polygons)")

        logger.info(f"[GRAPHHOPPER] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")

        # GraphHopper deployments vary:
        # - Many self-hosted instances support GET /route with query params.
        # - Custom models generally require POST with JSON + ch.disable=true.
        response: Optional[requests.Response] = None

        if custom_model:
            # Custom model + CH disable must be sent as a query param.
            response = requests.post(
                url,
                params={"ch.disable": "true"},
                json=payload,
                timeout=GRAPHHOPPER_TIMEOUT,
                headers=headers,
            )
            if response.status_code != 200:
                logger.warning(f"[GRAPHHOPPER] POST(custom_model) failed (HTTP {response.status_code}); retrying GET(no custom_model)")
                response = None

        if response is None:
            # Prefer GET for broad compatibility.
            params_point = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "instructions": "true",
                "points_encoded": "true",
                "elevation": "false",
            }
            response = requests.get(url, params=params_point, timeout=GRAPHHOPPER_TIMEOUT, headers={'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json'})

            # Some deployments use `points` instead of `point` (historical / custom setups).
            if response.status_code != 200:
                params_points = dict(params_point)
                params_points.pop("point", None)
                params_points["points"] = [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"]
                response = requests.get(url, params=params_points, timeout=GRAPHHOPPER_TIMEOUT, headers={'User-Agent': 'Voyagr-PWA/1.0', 'Accept': 'application/json'})

            # If GET fails, try POST without a custom model (some deployments accept JSON POST only).
            if response.status_code != 200:
                logger.warning(f"[GRAPHHOPPER] GET failed (HTTP {response.status_code}); retrying POST(no custom_model)")
                payload_no_model = dict(payload)
                payload_no_model.pop("custom_model", None)
                response = requests.post(url, json=payload_no_model, timeout=GRAPHHOPPER_TIMEOUT, headers=headers)

        if response.status_code == 200:
            data = response.json()

            if 'paths' in data and len(data['paths']) > 0:
                path = data['paths'][0]

                # Extract route data
                route_data = {
                    'success': True,
                    'source': 'GraphHopper',
                    'distance_km': path.get('distance', 0) / 1000,
                    'duration_seconds': path.get('time', 0) / 1000,
                    'geometry': path.get('points', ''),  # Encoded polyline
                    'instructions': path.get('instructions', []),
                    'bbox': path.get('bbox', []),
                    'camera_avoidance': enable_camera_avoidance and USE_GRAPHHOPPER_CAMERA_AVOIDANCE
                }

                logger.info(f"[GRAPHHOPPER] Route found: {route_data['distance_km']:.1f}km, {route_data['duration_seconds']/60:.0f}min")
                return route_data
            else:
                logger.warning(f"[GRAPHHOPPER] No paths in response")
                return None
        else:
            error_msg = response.text[:500] if response.text else f"HTTP {response.status_code}"
            logger.warning(f"[GRAPHHOPPER] Request failed: {error_msg}")
            return None

    except requests.exceptions.Timeout:
        logger.warning(f"[GRAPHHOPPER] Request timeout after {GRAPHHOPPER_TIMEOUT}s")
        return None
    except Exception as e:
        logger.error(f"[GRAPHHOPPER] Error: {e}")
        return None


def get_hazards_on_route(route_points: List[Tuple[float, float]], hazards: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Get list of hazards that are on or near the route.
    Returns hazards with their lat, lon, type, and description.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        hazards_on_route = []

        # Get hazard preferences
        cursor.execute("SELECT hazard_type, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
        preferences = {row[0]: {'threshold': row[1]} for row in cursor.fetchall()}
        return_db_connection(conn)

        # Decode polyline to get route points
        try:
            if isinstance(route_points, str):
                if not polyline:
                    return []
                decoded_points = polyline.decode(route_points, 6)  # Valhalla precision
            else:
                decoded_points = route_points
        except Exception as e:
            logger.error(f"Error decoding polyline: {e}")
            return []

        # OPTIMIZATION: Sample route points for faster hazard detection
        sample_interval = max(1, len(decoded_points) // 100)  # Max 100 sample points
        sampled_points = decoded_points[::sample_interval]

        # Check each hazard against route
        for hazard_type, hazard_list in hazards.items():
            if hazard_type not in preferences:
                continue

            if len(hazard_list) == 0:
                continue

            threshold = preferences[hazard_type]['threshold']

            for hazard in hazard_list:
                hazard_lat = hazard.get('lat')
                hazard_lon = hazard.get('lon')

                # OPTIMIZATION: Find minimum distance using sampled points (10-100x faster)
                min_distance = float('inf')
                for point_lat, point_lon in sampled_points:
                    distance = get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                    min_distance = min(min_distance, distance)
                    # Early exit if already beyond threshold
                    if min_distance > threshold * 2:
                        break

                # If hazard is within threshold, add to list
                if min_distance <= threshold:
                    # Use original_type if available (for speed cameras), otherwise use hazard_type
                    display_type = hazard.get('original_type', hazard_type)
                    hazards_on_route.append({
                        'lat': hazard_lat,
                        'lon': hazard_lon,
                        'type': display_type,
                        'description': hazard.get('description', 'Hazard detected'),
                        'distance': round(min_distance, 0)
                    })

        return hazards_on_route
    except Exception as e:
        logger.error(f"Error getting hazards on route: {e}")
        return []

def score_route_by_hazards(route_points: List[Tuple[float, float]], hazards: Dict[str, List[Dict[str, Any]]]) -> Tuple[float, int]:
    """
    Calculate hazard score for a route based on proximity to hazards.

    Traffic light cameras are weighted with a multiplier to ensure they are the highest priority hazard.
    Closer cameras receive exponentially higher penalties to strongly discourage routes passing near them.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        total_penalty = 0
        hazard_count = 0

        # Get hazard preferences from database, or use defaults if table doesn't exist
        try:
            cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
            preferences = {row[0]: {'penalty': row[1], 'threshold': row[2]} for row in cursor.fetchall()}
            if not preferences:
                # Table exists but is empty - use defaults
                logger.info(f"[HAZARDS] hazard_preferences table is empty, using defaults")
                preferences = {
                    'camera': {'penalty': 60, 'threshold': 500},
                    'traffic_light': {'penalty': 45, 'threshold': 80},
                    'police': {'penalty': 30, 'threshold': 1000},
                    'roadworks': {'penalty': 15, 'threshold': 500},
                    'accident': {'penalty': 30, 'threshold': 500}
                }
        except Exception as e:
            # Table doesn't exist - use default preferences for all camera types
            logger.info(f"[HAZARDS] hazard_preferences table not found, using defaults: {e}")
            preferences = {
                'camera': {'penalty': 60, 'threshold': 500},
                'traffic_light': {'penalty': 45, 'threshold': 80},
                'police': {'penalty': 30, 'threshold': 1000},
                'roadworks': {'penalty': 15, 'threshold': 500},
                'accident': {'penalty': 30, 'threshold': 500}
            }

        return_db_connection(conn)

        logger.info(f"[HAZARDS] Scoring with preferences: {list(preferences.keys())}")
        logger.info(f"[HAZARDS] Hazards to score: {[(k, len(v)) for k, v in hazards.items() if v]}")

        # Decode polyline to get route points
        try:
            if isinstance(route_points, str):
                if not polyline:
                    logger.warning("polyline module not available, cannot decode route points")
                    return 0, 0
                decoded_points = polyline.decode(route_points, 6)  # Valhalla precision
                logger.info(f"[HAZARDS] Decoded {len(decoded_points)} route points from polyline string")
            else:
                decoded_points = route_points
                logger.info(f"[HAZARDS] Using {len(decoded_points)} route points directly (type: {type(route_points)})")
        except Exception as e:
            logger.error(f"[HAZARDS] Error decoding polyline: {e}")
            return 0, 0

        if not decoded_points or len(decoded_points) == 0:
            logger.warning(f"[HAZARDS] No route points to score!")
            return 0, 0

        # Check each hazard against route
        for hazard_type, hazard_list in hazards.items():
            if hazard_type not in preferences:
                logger.debug(f"[HAZARDS] Skipping {hazard_type} - not in preferences")
                continue

            if len(hazard_list) == 0:
                logger.debug(f"[HAZARDS] Skipping {hazard_type} - no hazards in list")
                continue

            pref = preferences[hazard_type]
            threshold = pref['threshold']
            penalty = pref['penalty']

            logger.info(f"[HAZARDS] Processing {len(hazard_list)} {hazard_type} hazards (threshold={threshold}m, penalty={penalty}s)")

            # OPTIMIZATION: Sample route points for faster scoring
            # Use 500 sample points to ensure cameras aren't missed (avg ~500m between samples for 250km route)
            sample_interval = max(1, len(decoded_points) // 500)  # Max 500 sample points
            sampled_points = decoded_points[::sample_interval]
            logger.info(f"[HAZARDS] Sampling {len(sampled_points)} points from {len(decoded_points)} total (interval={sample_interval})")

            for idx, hazard in enumerate(hazard_list):
                hazard_lat = hazard.get('lat')
                hazard_lon = hazard.get('lon')

                # OPTIMIZATION: Find minimum distance using sampled points (10-100x faster)
                min_distance = float('inf')
                for point_lat, point_lon in sampled_points:
                    distance = get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                    min_distance = min(min_distance, distance)
                    # Early exit if already beyond threshold
                    if min_distance > threshold * 2:
                        break

                # If hazard is within threshold, add penalty
                if min_distance <= threshold:
                    # CAMERA PRIORITY: Apply distance-based multiplier for ALL camera types
                    # Cameras closer to route get exponentially higher penalty
                    if hazard_type in ('camera', 'traffic_light'):
                        # Proximity multiplier: 1.0 at threshold, 3.0 at 0m
                        # Formula: 1 + (2 * (1 - distance/threshold))
                        proximity_multiplier = 1.0 + (2.0 * (1.0 - min_distance / threshold))
                        distance_multiplier = max(1.0, proximity_multiplier)
                        applied_penalty = penalty * distance_multiplier
                    else:
                        applied_penalty = penalty

                    total_penalty += applied_penalty
                    hazard_count += 1

                    # Log first few cameras found for debugging
                    if hazard_count <= 3:
                        logger.info(f"[HAZARDS] Camera #{hazard_count} found: {min_distance:.0f}m from route, penalty={applied_penalty:.0f}s")

                    if idx < 3:  # Log first 3 hazards
                        logger.debug(f"[HAZARDS]   Hazard {idx+1}: distance={min_distance:.0f}m, penalty={applied_penalty:.0f}s")

        logger.info(f"[HAZARDS] Route scoring complete: total_penalty={total_penalty:.0f}s, hazard_count={hazard_count}")
        return total_penalty, hazard_count
    except Exception as e:
        logger.error(f"Error scoring route: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 0, 0

MONITORING_DASHBOARD_HTML = '''
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Voyagr Routing Monitoring Dashboard</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .header-controls { display: flex; gap: 10px; align-items: center; }
        .refresh-timer { color: white; font-size: 14px; }
        .pause-toggle { padding: 8px 16px; background: rgba(255,255,255,0.2); color: white; border: 1px solid white; border-radius: 4px; cursor: pointer; font-size: 13px; }
        .pause-toggle:hover { background: rgba(255,255,255,0.3); }

        .section-title { font-size: 18px; font-weight: 600; color: #333; margin: 30px 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #667eea; }

        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card h2 { font-size: 16px; color: #333; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }

        .engine-status { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f9f9f9; border-radius: 6px; margin-bottom: 10px; }
        .engine-info { flex: 1; }
        .engine-name { font-weight: 500; color: #333; }
        .engine-details { font-size: 12px; color: #666; margin-top: 4px; }
        .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .status-up { background: #4caf50; color: white; }
        .status-down { background: #f44336; color: white; }
        .status-degraded { background: #ff9800; color: white; }
        .status-unknown { background: #9e9e9e; color: white; }

        .alert-count { display: inline-block; background: #f44336; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-left: 10px; }
        .alert-item { padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: start; }
        .alert-critical { background: #f8d7da; border-left-color: #f44336; }
        .alert-warning { background: #fff3cd; border-left-color: #ff9800; }
        .alert-info { background: #d1ecf1; border-left-color: #2196f3; }
        .alert-content { flex: 1; }
        .alert-time { font-size: 11px; color: #666; margin-top: 4px; }
        .alert-resolve { padding: 4px 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .alert-resolve:hover { background: #5568d3; }

        .metric-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 28px; font-weight: 700; margin: 10px 0; }
        .metric-label { font-size: 12px; opacity: 0.9; }

        .cost-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px; }
        .cost-row:last-child { border-bottom: none; }
        .cost-label { color: #666; }
        .cost-value { font-weight: 600; color: #333; }

        .chart-container { position: relative; height: 300px; margin: 20px 0; }
        .chart-small { position: relative; height: 200px; margin: 15px 0; }

        .filter-buttons { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
        .filter-btn { padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .filter-btn.active { background: #667eea; color: white; border-color: #667eea; }

        .button-group { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
        button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn-primary { background: #667eea; color: white; }
        .btn-primary:hover { background: #5568d3; }
        .btn-secondary { background: #e0e0e0; color: #333; }
        .btn-secondary:hover { background: #d0d0d0; }
        .btn-success { background: #4caf50; color: white; }
        .btn-success:hover { background: #45a049; }

        .loading { text-align: center; padding: 20px; color: #999; }
        .spinner { display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .spike-alert { background: #fff3cd; border-left: 4px solid #ff9800; padding: 12px; border-radius: 4px; margin-bottom: 10px; font-size: 12px; }
        .spike-date { font-weight: 600; color: #ff9800; }

        .refresh-time { font-size: 12px; color: #999; margin-top: 10px; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }

        @media (max-width: 768px) {
            .grid, .grid-2 { grid-template-columns: 1fr; }
            .header { flex-direction: column; gap: 15px; }
            .header-controls { width: 100%; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1>🚀 Voyagr Routing Monitoring Dashboard</h1>
                <p>Real-time health monitoring & cost analysis for Valhalla and OSRM</p>
            </div>
            <div class="header-controls">
                <div class="refresh-timer">Next refresh: <span id="refreshCountdown">60</span>s</div>
                <button class="pause-toggle" onclick="toggleAutoRefresh()">⏸ Pause</button>
            </div>
        </div>

        <!-- Real-Time Status Section -->
        <div class="section-title">🔍 Real-Time Engine Status</div>
        <div class="grid">
            <div class="card">
                <h2>Engine Health</h2>
                <div id="engineStatus" class="loading"><div class="spinner"></div> Loading...</div>
                <div class="button-group">
                    <button class="btn-primary" onclick="manualHealthCheck()">🔄 Check Now</button>
                </div>
                <div class="refresh-time">Last updated: <span id="lastUpdate">--:--:--</span></div>
            </div>

            <div class="card">
                <h2>⚠️ Alert Summary</h2>
                <div id="alertSummary" class="loading"><div class="spinner"></div> Loading...</div>
                <div class="filter-buttons" id="alertFilters"></div>
                <div class="button-group">
                    <button class="btn-secondary" onclick="loadAlerts()">🔄 Refresh</button>
                </div>
            </div>

            <div class="card">
                <h2>📊 Cost Metrics</h2>
                <div id="costMetrics" class="loading"><div class="spinner"></div> Loading...</div>
                <div class="button-group">
                    <button class="btn-secondary" onclick="loadCostMetrics()">🔄 Refresh</button>
                </div>
            </div>
        </div>

        <!-- Alerts Section -->
        <div class="section-title">⚠️ Recent Alerts (Last 10)</div>
        <div class="card">
            <div id="alertsList" class="loading"><div class="spinner"></div> Loading...</div>
            <div class="button-group">
                <button class="btn-secondary" onclick="loadAlerts()">🔄 Refresh Alerts</button>
            </div>
        </div>

        <!-- Cost Analysis Section -->
        <div class="section-title">💰 Cost Analysis & Trends</div>

        <!-- Cost Metrics Cards -->
        <div class="grid">
            <div class="metric-card">
                <div class="metric-label">Today's Cost</div>
                <div class="metric-value" id="todayCost">$0.00</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">30-Day Total</div>
                <div class="metric-value" id="totalCost">$0.00</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Projected Monthly</div>
                <div class="metric-value" id="projectedCost">$0.00</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Cost Alert Status</div>
                <div class="metric-value" id="costAlertStatus" style="font-size: 16px;">✅ Normal</div>
            </div>
        </div>

        <!-- Charts -->
        <div class="grid-2">
            <div class="card">
                <h2>📈 Bandwidth Usage (30 days)</h2>
                <div class="chart-container">
                    <canvas id="bandwidthChart"></canvas>
                </div>
            </div>

            <div class="card">
                <h2>📊 API Request Volume (7 days)</h2>
                <div class="chart-container">
                    <canvas id="requestChart"></canvas>
                </div>
            </div>
        </div>

        <div class="grid-2">
            <div class="card">
                <h2>💵 Cost Breakdown</h2>
                <div class="chart-small">
                    <canvas id="costBreakdownChart"></canvas>
                </div>
            </div>

            <div class="card">
                <h2>📉 Daily Cost Trend (30 days)</h2>
                <div class="chart-container">
                    <canvas id="costTrendChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Cost Spikes Section -->
        <div class="card">
            <h2>⚡ Cost Spikes Detected</h2>
            <div id="costSpikes" class="loading"><div class="spinner"></div> Loading...</div>
        </div>

        <!-- Controls Section -->
        <div class="section-title">🎛️ Manual Controls</div>
        <div class="grid">
            <div class="card">
                <h2>Engine Controls</h2>
                <div class="button-group">
                    <button class="btn-primary" onclick="manualHealthCheck()">🔄 Refresh All Engines</button>
                </div>
            </div>

            <div class="card">
                <h2>Alert Controls</h2>
                <div id="engineResolveButtons"></div>
            </div>

            <div class="card">
                <h2>Export & Settings</h2>
                <div class="button-group">
                    <button class="btn-secondary" onclick="exportCostHistory()">📥 Export CSV (30d)</button>
                </div>
                <div style="margin-top: 10px;">
                    <label>Time Period:
                        <select id="timePeriod" onchange="updateCharts()" style="padding: 4px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="7">7 Days</option>
                            <option value="30" selected>30 Days</option>
                            <option value="90">90 Days</option>
                        </select>
                    </label>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>Auto-refresh every 60 seconds | <a href="/" style="color: #667eea; text-decoration: none;">Back to Voyagr</a></p>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
    <script>
        let autoRefreshInterval = null;
        let countdownInterval = null;
        let isAutoRefreshPaused = false;
        let charts = {};
        let countdownValue = 60;

        // XSS sanitization function
        function sanitizeHTML(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // Initialize
        window.addEventListener('load', () => {
            loadAllData();
            startAutoRefresh();
            loadPausePreference();
        });

        function startAutoRefresh() {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
            if (countdownInterval) clearInterval(countdownInterval);

            autoRefreshInterval = setInterval(() => {
                if (!isAutoRefreshPaused) {
                    loadAllData();
                }
            }, 60000); // 60 seconds

            countdownInterval = setInterval(() => {
                if (!isAutoRefreshPaused) {
                    countdownValue--;
                    if (countdownValue <= 0) countdownValue = 60;
                    document.getElementById('refreshCountdown').textContent = countdownValue;
                }
            }, 1000);
        }

        function toggleAutoRefresh() {
            isAutoRefreshPaused = !isAutoRefreshPaused;
            localStorage.setItem('dashboardAutoRefreshPaused', isAutoRefreshPaused);
            const btn = event.target;
            btn.textContent = isAutoRefreshPaused ? '▶ Resume' : '⏸ Pause';
            btn.style.background = isAutoRefreshPaused ? 'rgba(255,100,100,0.3)' : 'rgba(255,255,255,0.2)';
        }

        function loadPausePreference() {
            const paused = localStorage.getItem('dashboardAutoRefreshPaused') === 'true';
            if (paused) {
                isAutoRefreshPaused = true;
                const btn = document.querySelector('.pause-toggle');
                btn.textContent = '▶ Resume';
                btn.style.background = 'rgba(255,100,100,0.3)';
            }
        }

        async function loadAllData() {
            loadEngineStatus();
            loadAlerts();
            loadCostMetrics();
            updateCharts();
        }

        async function loadEngineStatus() {
            try {
                const response = await fetch('/api/monitoring/engine-status');
                const data = await response.json();

                if (data.success) {
                    const html = data.engines.map(engine => {
                        const statusIcon = engine.status === 'up' ? '✅' : engine.status === 'degraded' ? '⚠️' : '❌';
                        const engineName = sanitizeHTML(engine.engine).toUpperCase();
                        const statusText = sanitizeHTML(engine.status);
                        const responseTime = sanitizeHTML(engine.response_time_ms);
                        const uptime = sanitizeHTML(engine.uptime_24h);
                        return `
                            <div class="engine-status">
                                <div class="engine-info">
                                    <div class="engine-name">${statusIcon} ${engineName}</div>
                                    <div class="engine-details">Response: ${responseTime}ms | Uptime: ${uptime}% | Last: ${new Date(engine.last_check).toLocaleTimeString()}</div>
                                </div>
                                <span class="status-badge status-${statusText}">${statusText.toUpperCase()}</span>
                            </div>
                        `;
                    }).join('');
                    document.getElementById('engineStatus').innerHTML = html;
                    updateLastUpdate();
                }
            } catch (error) {
                console.error('Error loading engine status:', error);
                document.getElementById('engineStatus').innerHTML = '<div style="color: red;">Error loading status</div>';
            }
        }

        async function loadAlerts() {
            try {
                const response = await fetch('/api/monitoring/alerts/unresolved?limit=10');
                const data = await response.json();

                if (data.success) {
                    // Load alert summary
                    const response2 = await fetch('/api/monitoring/alerts/summary');
                    const summary = await response2.json();

                    if (summary.success) {
                        const total = summary.summary.total_alerts;
                        const critical = summary.summary.critical_count;
                        const warning = summary.summary.warning_count;

                        document.getElementById('alertSummary').innerHTML = `
                            <div style="font-size: 14px; line-height: 1.8;">
                                <div>🔴 Critical: <strong>${critical}</strong></div>
                                <div>⚠️ Warning: <strong>${warning}</strong></div>
                                <div>Total Unresolved: <strong>${total}</strong></div>
                            </div>
                        `;

                        // Load filter buttons
                        const filterHTML = `
                            <button class="filter-btn active" onclick="filterAlerts('all')">All (${total})</button>
                            <button class="filter-btn" onclick="filterAlerts('critical')">Critical (${critical})</button>
                            <button class="filter-btn" onclick="filterAlerts('warning')">Warning (${warning})</button>
                        `;
                        document.getElementById('alertFilters').innerHTML = filterHTML;
                    }

                    // Load alerts list
                    if (data.alerts && data.alerts.length > 0) {
                        const html = data.alerts.map(alert => {
                            const severityIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
                            const engineName = sanitizeHTML(alert.engine).toUpperCase();
                            const alertType = sanitizeHTML(alert.alert_type);
                            const severity = sanitizeHTML(alert.severity);
                            const alertId = parseInt(alert.id, 10);
                            return `
                                <div class="alert-item alert-${severity}">
                                    <div class="alert-content">
                                        <strong>${severityIcon} ${engineName}</strong> - ${alertType}
                                        <div class="alert-time">${new Date(alert.created_at).toLocaleString()}</div>
                                    </div>
                                    <button class="alert-resolve" onclick="resolveAlert(${alertId})">Resolve</button>
                                </div>
                            `;
                        }).join('');
                        document.getElementById('alertsList').innerHTML = html;
                    } else {
                        document.getElementById('alertsList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">✅ No unresolved alerts</div>';
                    }

                    // Load engine resolve buttons
                    const engines = ['valhalla', 'osrm'];
                    const resolveHTML = engines.map(engine => `
                        <button class="btn-secondary" onclick="resolveAllEngineAlerts('${engine}')" style="margin-bottom: 8px; width: 100%;">Resolve All ${engine.toUpperCase()} Alerts</button>
                    `).join('');
                    document.getElementById('engineResolveButtons').innerHTML = resolveHTML;
                }
            } catch (error) {
                console.error('Error loading alerts:', error);
                document.getElementById('alertsList').innerHTML = '<div style="color: red;">Error loading alerts</div>';
            }
        }

        async function loadCostMetrics() {
            try {
                const days = document.getElementById('timePeriod').value || 30;

                // Get cost history
                const historyResp = await fetch(`/api/monitoring/costs/history?days=${days}`);
                const history = await historyResp.json();

                // Get estimate
                const estimateResp = await fetch(`/api/monitoring/costs/estimate?days=${days}`);
                const estimate = await estimateResp.json();

                // Get trends
                const trendsResp = await fetch(`/api/monitoring/costs/trends?days=${days}`);
                const trends = await trendsResp.json();

                if (history.success && estimate.success && trends.success) {
                    const summary = history.history.summary;
                    const today = new Date().toISOString().split('T')[0];
                    const todayCost = history.history.history.find(h => h.date === today)?.estimated_cost || 0;

                    document.getElementById('todayCost').textContent = `$${todayCost.toFixed(2)}`;
                    document.getElementById('totalCost').textContent = `$${summary.total_cost.toFixed(2)}`;
                    document.getElementById('projectedCost').textContent = `$${estimate.estimate.total_monthly_cost.toFixed(2)}`;

                    const alertStatus = trends.trends.cost_alert_threshold_exceeded ? '⚠️ Alert' : '✅ Normal';
                    const alertColor = trends.trends.cost_alert_threshold_exceeded ? '#f44336' : '#4caf50';
                    document.getElementById('costAlertStatus').textContent = alertStatus;
                    document.getElementById('costAlertStatus').style.color = alertColor;

                    // Load cost spikes
                    if (trends.trends.cost_spikes && trends.trends.cost_spikes.length > 0) {
                        const spikesHTML = trends.trends.cost_spikes.map(spike => `
                            <div class="spike-alert">
                                <span class="spike-date">${sanitizeHTML(spike.date)}</span>: +${sanitizeHTML(spike.increase_pct)}% increase (${sanitizeHTML(spike.bandwidth_gb)}GB, ${sanitizeHTML(spike.requests)} requests)
                            </div>
                        `).join('');
                        document.getElementById('costSpikes').innerHTML = spikesHTML;
                    } else {
                        document.getElementById('costSpikes').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">✅ No cost spikes detected</div>';
                    }
                }
            } catch (error) {
                console.error('Error loading cost metrics:', error);
            }
        }

        async function updateCharts() {
            try {
                const days = document.getElementById('timePeriod').value || 30;

                // Bandwidth chart
                const bandwidthResp = await fetch(`/api/monitoring/costs/bandwidth?days=${days}`);
                const bandwidth = await bandwidthResp.json();
                updateBandwidthChart(bandwidth.bandwidth);

                // Request chart
                const requestResp = await fetch(`/api/monitoring/costs/requests?days=7`);
                const requests = await requestResp.json();
                updateRequestChart(requests.requests);

                // Cost breakdown
                const estimateResp = await fetch(`/api/monitoring/costs/estimate?days=${days}`);
                const estimate = await estimateResp.json();
                updateCostBreakdownChart(estimate.estimate);

                // Cost trend
                const historyResp = await fetch(`/api/monitoring/costs/history?days=${days}`);
                const history = await historyResp.json();
                updateCostTrendChart(history.history.history);
            } catch (error) {
                console.error('Error updating charts:', error);
            }
        }

        function updateBandwidthChart(data) {
            const ctx = document.getElementById('bandwidthChart').getContext('2d');
            if (charts.bandwidth) charts.bandwidth.destroy();

            const labels = data.map(d => d.date).reverse();
            const outbound = data.map(d => d.outbound_gb).reverse();

            charts.bandwidth = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Outbound (GB)',
                        data: outbound,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true } }
                }
            });
        }

        function updateRequestChart(data) {
            const ctx = document.getElementById('requestChart').getContext('2d');
            if (charts.request) charts.request.destroy();

            const dates = Object.keys(data).sort().slice(-7);
            const healthChecks = dates.map(d => data[d]['valhalla_health_check'] || 0);
            const routeCalcs = dates.map(d => data[d]['valhalla_route_calculation'] || 0);

            charts.request = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'Health Checks',
                            data: healthChecks,
                            backgroundColor: '#4caf50'
                        },
                        {
                            label: 'Route Calculations',
                            data: routeCalcs,
                            backgroundColor: '#2196f3'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true } }
                }
            });
        }

        function updateCostBreakdownChart(estimate) {
            const ctx = document.getElementById('costBreakdownChart').getContext('2d');
            if (charts.breakdown) charts.breakdown.destroy();

            charts.breakdown = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Bandwidth', 'Compute', 'Requests'],
                    datasets: [{
                        data: [estimate.bandwidth_cost, estimate.compute_cost, estimate.request_cost],
                        backgroundColor: ['#667eea', '#764ba2', '#f44336']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true } }
                }
            });
        }

        function updateCostTrendChart(history) {
            const ctx = document.getElementById('costTrendChart').getContext('2d');
            if (charts.trend) charts.trend.destroy();

            const labels = history.map(h => h.date);
            const costs = history.map(h => h.estimated_cost);

            charts.trend = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Daily Cost ($)',
                        data: costs,
                        borderColor: '#f44336',
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true } }
                }
            });
        }

        async function manualHealthCheck() {
            try {
                const btn = event.target;
                btn.disabled = true;
                btn.textContent = '⏳ Checking...';

                const response = await fetch('/api/monitoring/health-check', { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    loadEngineStatus();
                    alert('✅ Health check completed!');
                }

                btn.disabled = false;
                btn.textContent = '🔄 Refresh All Engines';
            } catch (error) {
                console.error('Error during health check:', error);
                alert('❌ Error during health check');
                event.target.disabled = false;
                event.target.textContent = '🔄 Refresh All Engines';
            }
        }

        async function resolveAlert(alertId) {
            try {
                const response = await fetch(`/api/monitoring/alerts/${alertId}/resolve`, { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                    loadAlerts();
                }
            } catch (error) {
                console.error('Error resolving alert:', error);
            }
        }

        async function resolveAllEngineAlerts(engine) {
            try {
                const response = await fetch(`/api/monitoring/alerts/engine/${engine}/resolve-all`, { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                    loadAlerts();
                }
            } catch (error) {
                console.error('Error resolving alerts:', error);
            }
        }

        function filterAlerts(severity) {
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            // Filter logic would go here
        }

        async function exportCostHistory() {
            try {
                const days = document.getElementById('timePeriod').value || 30;
                window.location.href = `/api/monitoring/costs/export?days=${days}`;
            } catch (error) {
                console.error('Error exporting:', error);
                alert('Error exporting cost history');
            }
        }

        function updateLastUpdate() {
            const now = new Date();
            document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
        }
    </script>
</body>
</html>
'''

HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#667eea">
    <meta name="description" content="Full-featured navigation app with route planning, cost estimation, and trip tracking">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Voyagr">
    <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect fill='%23667eea' width='192' height='192'/><text x='50%' y='50%' font-size='100' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='central'>V</text></svg>">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect fill='%23667eea' width='192' height='192'/><text x='50%' y='50%' font-size='100' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='central'>V</text></svg>">
    <link rel="manifest" href="/manifest.json">
    <title>Voyagr Navigation</title>
    <link href="/static/vendor/maplibre-gl.css" rel="stylesheet" />
    <link rel="stylesheet" href="/static/css/voyagr.css?v=20260109t" />
    <script src="/static/vendor/maplibre-gl.js"></script>
    <script src="/static/js/maplibre-helpers.js?v=20260117t"></script>
    <script src="/static/vendor/supabase.min.js"></script>
    <!-- Google Plus Codes Service -->
    <script src="/static/js/modules/services/google-plus-codes-service.js?v=20260117t"></script>
    <!-- External JavaScript modules -->
    <script src="/static/js/modules/traffic-lights.js?v=20260117t"></script>
    <script src="/static/js/voyagr-core.js?v=20260211t4"></script>
    <script src="/static/js/voyagr-app.js?v=20260211t4"></script>
    <script src="/static/js/app.js?v=20260117t"></script>
    <!-- CSS moved to /static/css/voyagr.css -->
</head>
<body>
    <div class="app-container">
        <!-- Full-screen map -->
        <div id="map"></div>

        <!-- Floating Action Buttons -->
        <div class="fab-container">
            <button class="fab" title="Current Location" onclick="getCurrentLocation()">📍</button>
            <button class="fab" title="Voice Control" id="voiceFab" onclick="toggleVoiceInput()">🎤</button>

        </div>

        <!-- Bottom Sheet Drawer -->
        <div class="bottom-sheet" id="bottomSheet">
            <div class="bottom-sheet-handle"></div>

            <div class="bottom-sheet-header">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <h2 id="sheetTitle">🗺️ Navigation</h2>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center;">
                        <button class="fab" title="Saved Routes" onclick="switchTab('savedRoutes')" style="width: 40px; height: 40px; font-size: 18px; background: #E91E63; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">⭐</button>
                        <button class="fab" title="Analytics" onclick="switchTab('routeAnalytics')" style="width: 40px; height: 40px; font-size: 18px; background: #FF5722; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">📊</button>
                        <button class="fab" title="Share Route" onclick="switchTab('routeSharing')" style="width: 40px; height: 40px; font-size: 18px; background: #9C27B0; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">🔗</button>
                        <button class="fab" title="Route Options" onclick="switchTab('routeComparison')" style="width: 40px; height: 40px; font-size: 18px; background: #4CAF50; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">🛣️</button>
                        <button class="fab" title="Trip History" onclick="switchTab('tripHistory')" style="width: 40px; height: 40px; font-size: 18px; background: #FF9800; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">📋</button>
                        <button class="fab" title="Dashcam" onclick="switchTab('dashcam')" style="width: 40px; height: 40px; font-size: 18px; background: #E91E63; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">📹</button>
                        <button class="fab" title="Settings" onclick="switchTab('settings')" style="width: 40px; height: 40px; font-size: 18px; background: #667eea; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">⚙️</button>
                        <button class="fab" title="Collapse" onclick="collapseBottomSheet()" style="width: 40px; height: 40px; font-size: 18px; background: #999; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 8px;">▼</button>
                    </div>
                </div>
            </div>

            <div class="bottom-sheet-content">
                <!-- NAVIGATION TAB (DEFAULT) -->
                <div id="navigationTab">
                <!-- Location Inputs -->
                <div class="form-group">
                    <label for="start">Start Location</label>
                    <div class="location-input-group">
                        <input type="text" id="start" placeholder="Enter address or tap map" oninput="showAutocomplete('start')" onfocus="showAutocomplete('start')">
                        <div class="location-btn-container">
                            <button type="button" class="location-btn" title="Use current location" onclick="setCurrentLocation('start')">📍</button>
                            <button type="button" class="location-btn" title="Pick from map" onclick="pickLocationFromMap('start')">🗺️</button>
                        </div>
                        <div class="autocomplete-dropdown" id="autocompleteStart"></div>
                    </div>
                </div>

                <!-- Swap Start/Destination Button -->
                <div style="display: flex; justify-content: center; margin: -5px 0 5px 0;">
                    <button type="button" id="swapLocationsBtn" onclick="swapStartAndDestination()" style="padding: 6px 16px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 20px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; transition: all 0.2s ease;" title="Swap start and destination">
                        <span style="font-size: 16px;">⇅</span>
                        <span style="font-size: 12px; color: #666;">Swap</span>
                    </button>
                </div>

                <div class="form-group">
                    <label for="end">Destination</label>
                    <div class="location-input-group">
                        <input type="text" id="end" placeholder="Enter address or tap map" oninput="showAutocomplete('end')" onfocus="showAutocomplete('end')">
                        <div class="location-btn-container">
                            <button type="button" class="location-btn" title="Use current location" onclick="setCurrentLocation('end')">📍</button>
                            <button type="button" class="location-btn" title="Pick from map" onclick="pickLocationFromMap('end')">🗺️</button>
                        </div>
                        <div class="autocomplete-dropdown" id="autocompleteEnd"></div>
                        <div class="search-history-dropdown" id="searchHistoryDropdown"></div>
                    </div>
                </div>

                <!-- VIA-POINTS AND STOPS SECTION (NEW) -->
                <div class="form-group" style="background: #FFFDE7; padding: 12px; border-radius: 8px; margin-top: 10px;">
                    <label style="margin-bottom: 8px; display: block;">📍 Via-Points & Stops</label>

                    <!-- Via-Point Address Input -->
                    <div style="margin-bottom: 8px; position: relative;">
                        <div style="display: flex; gap: 6px;">
                            <input type="text" id="viaPointAddress" placeholder="Type address for via-point..." autocomplete="off"
                                   oninput="showAutocomplete('viaPointAddress')" onfocus="showAutocomplete('viaPointAddress')"
                                   onkeydown="if(event.key==='Enter'){event.preventDefault();addViaPointFromAddress();}"
                                   style="flex: 1; padding: 8px 10px; border: 1px solid #FF9800; border-radius: 6px; font-size: 12px; outline: none;">
                            <button onclick="addViaPointFromAddress()" style="padding: 8px 12px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap;">📍 Add Via</button>
                            <button id="addViaPointBtn" onclick="toggleAddViaPoint()" title="Pick via-point on map" style="padding: 8px 10px; border: 1px solid #FF9800; background: white; border-radius: 6px; cursor: pointer; font-size: 14px; color: #FF9800;">🗺️</button>
                        </div>
                        <div class="autocomplete-dropdown" id="autocompleteViaPoint"></div>
                    </div>

                    <!-- Stop Address Input -->
                    <div style="margin-bottom: 8px; position: relative;">
                        <div style="display: flex; gap: 6px;">
                            <input type="text" id="stopAddress" placeholder="Type address for stop..." autocomplete="off"
                                   oninput="showAutocomplete('stopAddress')" onfocus="showAutocomplete('stopAddress')"
                                   onkeydown="if(event.key==='Enter'){event.preventDefault();addStopFromAddress();}"
                                   style="flex: 1; padding: 8px 10px; border: 1px solid #E91E63; border-radius: 6px; font-size: 12px; outline: none;">
                            <button onclick="addStopFromAddress()" style="padding: 8px 12px; background: #E91E63; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap;">🛑 Add Stop</button>
                            <button id="addStopBtn" onclick="toggleAddStop()" title="Pick stop on map" style="padding: 8px 10px; border: 1px solid #E91E63; background: white; border-radius: 6px; cursor: pointer; font-size: 14px; color: #E91E63;">🗺️</button>
                        </div>
                        <div class="autocomplete-dropdown" id="autocompleteStop"></div>
                    </div>

                    <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                        <button onclick="clearAllWaypoints()" style="flex: 1; padding: 8px 12px; border: 1px solid #999; background: white; border-radius: 6px; cursor: pointer; font-size: 12px; color: #666;">✕ Clear All</button>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <button id="editRouteBtn" onclick="toggleRouteEditing()" style="width: 100%; padding: 10px 12px; border: 2px solid #4CAF50; background: white; border-radius: 6px; cursor: pointer; font-size: 13px; color: #4CAF50; font-weight: 600;">✏️ Edit Route (Drag to modify)</button>
                    </div>
                    <div id="waypointsList">
                        <div style="color: #999; font-size: 12px; padding: 10px;">No waypoints added. Type an address above or use the map buttons.</div>
                    </div>
                    <div style="font-size: 11px; color: #888; margin-top: 8px;">
                        <strong>Via-Points:</strong> Route must pass through (e.g., scenic route)<br>
                        <strong>Stops:</strong> Places to park/stop (adds time to journey)<br>
                        <strong>Edit Route:</strong> Drag orange markers on route to modify path
                    </div>
                </div>

                <!-- Vehicle Type Selector -->
                <div class="form-group">
                    <label for="vehicleType">🚗 Vehicle Type</label>
                    <select id="vehicleType" onchange="updateVehicleType()" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        <option value="petrol_diesel">🚗 Car (Petrol/Diesel)</option>
                        <option value="electric">⚡ Electric Vehicle</option>
                        <option value="motorcycle">🏍️ Motorcycle</option>
                        <option value="truck">🚚 Truck</option>
                        <option value="van">🚐 Van</option>
                    </select>
                </div>

                <!-- Routing Mode Selector -->
                <div class="form-group">
                    <label>🛣️ Routing Mode</label>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button class="routing-mode-btn active" id="routingAuto" onclick="setRoutingMode('auto')">🚗 Auto</button>
                        <button class="routing-mode-btn" id="routingPedestrian" onclick="setRoutingMode('pedestrian')">🚶 Walk</button>
                        <button class="routing-mode-btn" id="routingBicycle" onclick="setRoutingMode('bicycle')">🚴 Bike</button>
                    </div>
                </div>

                <!-- Route Calculation Button (MOVED TO TOP FOR VISIBILITY) -->
                <button class="btn-calculate" onclick="calculateRoute()" style="margin-top: 15px; margin-bottom: 20px;">🚀 Calculate Route</button>

                <!-- Auto GPS Location Toggle (NEW FEATURE) -->
                <div class="form-group" style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-top: 15px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <label style="margin: 0; font-weight: 500; color: #333;">
                            📍 Auto-Use Current Location as Start
                        </label>
                        <input type="checkbox" id="autoGpsToggle" style="width: 20px; height: 20px; cursor: pointer;" onchange="toggleAutoGpsLocation()">
                    </div>
                    <div style="font-size: 12px; color: #666; margin-top: 8px;">
                        When enabled, your current GPS location will automatically be used as the start location for route calculations.
                    </div>
                </div>

                <!-- Favorite Locations Section (Phase 2) -->
                <div class="favorites-section" id="favoritesSection" style="display: none;">
                    <h3>⭐ Favorite Locations</h3>
                    <div class="favorites-grid" id="favoritesGrid"></div>
                </div>

                <!-- Lane Guidance Display (Phase 2 - Enhanced Smart Lane Recognition) -->
                <div class="lane-guidance-display" id="laneGuidanceDisplay">
                    <div class="lane-guidance-header">
                        <span class="lane-guidance-title">🛣️ Lane Guidance</span>
                        <span class="lane-guidance-badge" id="laneGuidanceBadge"></span>
                    </div>
                    <div class="lane-visual" id="laneVisual"></div>
                    <div class="lane-guidance-text" id="laneGuidanceText"></div>
                </div>

                <!-- Speed Warning Display (Phase 2) -->
                <div class="speed-warning-display" id="speedWarningDisplay">
                    <div class="speed-warning-text" id="speedWarningText"></div>
                    <div class="speed-warning-details" id="speedWarningDetails"></div>
                </div>

                <!-- Variable Speed Limit Display (NEW) -->
                <div class="variable-speed-display" id="variableSpeedDisplay" style="display: none;">
                    <div class="variable-speed-header">
                        <span class="variable-speed-icon">🚗</span>
                        <span class="variable-speed-title">Variable Speed Limit</span>
                    </div>
                    <div class="variable-speed-content">
                        <div class="variable-speed-limit" id="variableSpeedLimit">70 mph</div>
                        <div class="variable-speed-info" id="variableSpeedInfo"></div>
                    </div>
                </div>

                <!-- Quick Search Buttons -->
                <div class="quick-search">
                    <button class="quick-search-btn" onclick="quickSearch('parking')">
                        <span class="quick-search-btn-icon">🅿️</span>
                        <span>Parking</span>
                    </button>
                    <button class="quick-search-btn" onclick="quickSearch('fuel')">
                        <span class="quick-search-btn-icon">⛽</span>
                        <span>Fuel</span>
                    </button>
                    <button class="quick-search-btn" onclick="quickSearch('food')">
                        <span class="quick-search-btn-icon">🍔</span>
                        <span>Food</span>
                    </button>
                    <button class="quick-search-btn" onclick="quickSearch('charging')">
                        <span class="quick-search-btn-icon">🔌</span>
                        <span>EV Charge</span>
                    </button>
                    <button class="quick-search-btn" onclick="quickSearch('pharmacy')">
                        <span class="quick-search-btn-icon">💊</span>
                        <span>Pharmacy</span>
                    </button>
                    <button class="quick-search-btn" onclick="quickSearch('hospital')">
                        <span class="quick-search-btn-icon">🏥</span>
                        <span>Hospital</span>
                    </button>
                </div>
                <div id="alongRouteSearch" style="display: none; margin-top: 8px;">
                    <button onclick="searchAlongRoute()" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                        🔍 Search Along Route
                    </button>
                    <div id="alongRouteCategories" style="display: none; margin-top: 8px;">
                        <div class="quick-search">
                            <button class="quick-search-btn" onclick="searchAlongRouteByType('fuel')">⛽ Fuel</button>
                            <button class="quick-search-btn" onclick="searchAlongRouteByType('food')">🍔 Food</button>
                            <button class="quick-search-btn" onclick="searchAlongRouteByType('charging')">🔌 EV</button>
                            <button class="quick-search-btn" onclick="searchAlongRouteByType('parking')">🅿️ Park</button>
                        </div>
                    </div>
                </div>

                <!-- Trip Info -->
                <div class="trip-info" id="tripInfo">
                    <div class="trip-info-row">
                        <span class="trip-info-label">Distance:</span>
                        <span class="trip-info-value" id="distance">-</span>
                    </div>
                    <div class="trip-info-row">
                        <span class="trip-info-label">Duration:</span>
                        <span class="trip-info-value" id="time">-</span>
                    </div>
                    <div class="trip-info-row">
                        <span class="trip-info-label">Fuel Cost:</span>
                        <span class="trip-info-value" id="fuelCost">-</span>
                    </div>
                    <div class="trip-info-row">
                        <span class="trip-info-label">Toll Cost:</span>
                        <span class="trip-info-value" id="tollCost">-</span>
                    </div>
                </div>

                <!-- Status Message -->
                <div id="status" class="status"></div>

                <!-- Go Now / Start Navigation Button -->
                <button id="startNavBtnSheet" class="btn-calculate" onclick="startNavigation()" style="background: #34A853; margin-top: 10px; display: none;">🧭 Go Now - Start Navigation</button>

                <!-- Add to Favorites Button (Phase 2) -->
                <button class="btn-calculate" onclick="addCurrentToFavorites()" style="background: #764ba2; margin-top: 10px;">⭐ Save Location</button>

                <!-- ML Predictions Display (Phase 3) -->
                <div class="ml-predictions-section" id="mlPredictionsSection">
                    <div class="ml-predictions-title">💡 Smart Route Suggestions</div>
                    <div id="mlPredictionsList"></div>
                </div>

                <!-- Voice Control Section -->
                <div class="voice-section">
                    <h3>🎤 Voice Control</h3>
                    <div class="voice-controls">
                        <button id="voiceBtn" class="btn-voice" onclick="toggleVoiceInput()">
                            <span id="voiceBtnText">🎤 Listen</span>
                        </button>
                        <button class="btn-voice-secondary" onclick="speakText('Voice control ready. Say a command.')">
                            🔊 Test
                        </button>
                    </div>
                    <div id="voiceStatus" class="voice-status"></div>
                    <div id="voiceTranscript" class="voice-transcript"></div>
                </div>

                <button class="btn-clear" onclick="clearForm()" style="width: 100%; margin-top: 20px;">Clear All</button>
                </div>

                <!-- UNIFIED SETTINGS TAB -->
                <div id="settingsTab" style="display: none;">
                    <!-- Back Button -->
                    <div style="margin-bottom: 15px;">
                        <button onclick="goBackToPreviousTab()" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                            ← Back
                        </button>
                    </div>

                    <!-- Account Section (Supabase) -->
                    <div class="preferences-section" id="accountSection">
                        <h3>👤 Account</h3>
                        <div id="accountStatus" style="font-size: 12px; color: #666; margin-bottom: 10px;">
                            Loading account status...
                        </div>

                        <div id="accountSignedOut" style="display: none;">
                            <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 10px;">
                                <input id="authEmail" type="email" placeholder="Email" autocomplete="email"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;" />
                                <input id="authPassword" type="password" placeholder="Password" autocomplete="current-password"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;" />
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <button onclick="authSignInEmail()" style="padding: 10px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                                    Sign in
                                </button>
                                <button onclick="authSignUpEmail()" style="padding: 10px; background: #f5f5f5; color: #333; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                                    Create account
                                </button>
                            </div>

                            <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr; gap: 10px;">
                                <button onclick="authSignInProvider('google')" style="padding: 10px; background: #fff; color: #333; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                                    Continue with Google
                                </button>
                            </div>
                            <div style="font-size: 11px; color: #888; margin-top: 8px;">
                                Tip: login lives here in Settings so it never interrupts navigation.
                            </div>
                        </div>

                        <div id="accountSignedIn" style="display: none;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                                <div style="font-size: 13px; color: #333;">
                                    Signed in as <strong id="accountEmail">-</strong>
                                </div>
                                <button onclick="authSignOut()" style="padding: 8px 12px; background: #fff; color: #c62828; border: 1px solid #ffcdd2; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;">
                                    Sign out
                                </button>
                            </div>
                            <div style="margin-top: 10px; font-size: 11px; color: #666;">
                                Your on-device (guest) profile can stay separate. On first sign-in, you can choose to import it into your account profile.
                            </div>
                        </div>
                    </div>

                    <!-- Unit Preferences Section -->
                    <div class="preferences-section">
                        <h3>📏 Unit Preferences</h3>

                        <div class="preference-item">
                            <span class="preference-label">📏 Distance Unit</span>
                            <select id="distanceUnit" onchange="updateDistanceUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="km">Kilometers (km)</option>
                                <option value="mi">Miles (mi)</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">⚡ Speed Unit</span>
                            <select id="speedUnit" onchange="updateSpeedUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="kmh">km/h</option>
                                <option value="mph">mph</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🌡️ Temperature</span>
                            <select id="temperatureUnit" onchange="updateTemperatureUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="celsius">Celsius (°C)</option>
                                <option value="fahrenheit">Fahrenheit (°F)</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">💱 Currency</span>
                            <select id="currencyUnit" onchange="updateCurrencyUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="GBP">GBP (£)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Hazard Avoidance Section -->
                    <div class="preferences-section">
                        <h3>⚠️ Hazard Avoidance</h3>

                        <div class="preference-item">
                            <span class="preference-label">Avoid Tolls</span>
                            <button class="toggle-switch" id="avoidTolls" data-pref="tolls" onclick="togglePreference('tolls')"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Avoid CAZ</span>
                            <button class="toggle-switch" id="avoidCAZ" data-pref="caz" onclick="togglePreference('caz')"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">⚡ Optimised Routing (cameras)</span>
                            <button class="toggle-switch" id="avoidCameras" data-pref="cameras" onclick="togglePreference('cameras')"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🚦 Avoid Traffic Lights (OSM)</span>
                            <button class="toggle-switch" id="avoidTrafficLights" data-pref="trafficLightsAvoid" onclick="togglePreference('trafficLightsAvoid')"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Uses OpenStreetMap traffic signal locations. Independent of Optimised Routing and railway crossings — enable only what you need.</p>

                        <div class="preference-item">
                            <span class="preference-label">🚂 Avoid Railway Crossings (OSM)</span>
                            <button class="toggle-switch" id="avoidRailwayCrossings" data-pref="railwayCrossingsAvoid" onclick="togglePreference('railwayCrossingsAvoid')"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Uses OpenStreetMap <code>railway=level_crossing</code> nodes. Separate from traffic lights; works best with Optimised Routing enabled for GraphHopper avoidance.</p>

                        <div class="preference-item">
                            <span class="preference-label">📊 Variable Speed Alerts</span>
                            <button class="toggle-switch" id="variableSpeedAlerts" data-pref="variableSpeedAlerts" onclick="togglePreference('variableSpeedAlerts')"></button>
                        </div>
                    </div>

                    <!-- Route Avoidance Section -->
                    <div class="preferences-section">
                        <h3>🚫 Route Avoidance</h3>
                        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Avoid specific road types when calculating routes</p>

                        <div class="preference-item">
                            <span class="preference-label">💰 Avoid Toll Roads</span>
                            <button class="toggle-switch" id="avoidTollRoads" onclick="toggleAvoidancePreference('tollRoads')" data-pref="tollRoads"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🛣️ Avoid Motorways</span>
                            <button class="toggle-switch" id="avoidMotorways" onclick="toggleAvoidancePreference('motorways')" data-pref="motorways"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">⛴️ Avoid Ferries</span>
                            <button class="toggle-switch" id="avoidFerries" onclick="toggleAvoidancePreference('ferries')" data-pref="ferries"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: 5px 0 0 0;">These apply to all routes including multi-drop legs via Valhalla costing options</p>
                    </div>

                    <!-- Navigation Automation Section -->
                    <div class="preferences-section">
                        <h3>🤖 Navigation Automation</h3>
                        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Automatic updates and rerouting during navigation</p>

                        <div class="preference-item">
                            <span class="preference-label">🚦 Auto-Update Traffic</span>
                            <button class="toggle-switch active" id="autoTrafficUpdateToggle" onclick="toggleAutoTrafficUpdate()" style="background: #4CAF50; border-color: #4CAF50;"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Automatically check traffic every 5 minutes and reroute if faster route found</p>

                        <div class="preference-item">
                            <span class="preference-label">🔄 Auto-Reroute on Deviation</span>
                            <button class="toggle-switch active" id="autoRerouteDeviationToggle" onclick="toggleAutoRerouteOnDeviation()" style="background: #4CAF50; border-color: #4CAF50;"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Automatically recalculate route when you go off-route for more than 10 seconds</p>

                        <div class="preference-item">
                            <span class="preference-label">🔔 Manual Traffic Update</span>
                            <button onclick="manualTrafficUpdate()" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                                Update Now
                            </button>
                        </div>
                    </div>

                    <!-- CAZ Information Section -->
                    <div class="preferences-section">
                        <h3>🚗 Clean Air Zones (CAZ)</h3>
                        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">UK Clean Air Zones with charges, passes, and exemptions</p>

                        <button onclick="showCAZInfo()" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 10px;">
                            📋 View CAZ Zones & Pricing
                        </button>

                        <div id="cazInfoContainer" style="display: none; border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: #fafafa;"></div>
                    </div>

                    <!-- Route Preferences Section -->
                    <div class="preferences-section">
                        <h3>🛣️ Route Preferences</h3>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="avoidHighways" onchange="saveRoutePreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px;">Avoid Highways</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="preferScenic" onchange="saveRoutePreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px;">Prefer Scenic</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="preferQuiet" onchange="saveRoutePreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px;">Prefer Quiet</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="avoidUnpaved" onchange="saveRoutePreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px;">Avoid Unpaved</span>
                            </label>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Route Optimization</span>
                            <select id="routeOptimization" onchange="saveRoutePreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="fastest">⚡ Fastest</option>
                                <option value="shortest">📏 Shortest</option>
                                <option value="cheapest">💰 Cheapest</option>
                                <option value="eco">🌱 Eco-Friendly</option>
                                <option value="balanced">⚖️ Balanced</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Max Detour Allowed</span>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <input type="range" id="maxDetour" min="0" max="50" value="20" onchange="updateDetourLabel()" style="flex: 1; cursor: pointer;">
                                <span id="detourLabel" style="font-size: 13px; font-weight: 500; min-width: 40px;">20%</span>
                            </div>
                        </div>
                    </div>

                    <!-- Multi-Drop Settings Section -->
                    <div class="preferences-section">
                        <h3>📦 Multi-Drop Settings</h3>
                        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Configure multi-stop delivery and route optimization</p>

                        <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 15px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="optimizeStopOrder" checked onchange="saveMultiDropPreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <span style="font-size: 13px; font-weight: 500;">Optimize Stop Order</span>
                                    <div style="font-size: 11px; color: #888;">Automatically find the most efficient route through all stops</div>
                                </div>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="roundTrip" onchange="saveMultiDropPreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <span style="font-size: 13px; font-weight: 500;">Round Trip</span>
                                    <div style="font-size: 11px; color: #888;">Return to starting point after all stops</div>
                                </div>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="trafficAwareRouting" checked onchange="saveMultiDropPreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <span style="font-size: 13px; font-weight: 500;">Traffic-Aware Routing</span>
                                    <div style="font-size: 11px; color: #888;">Use real-time traffic data for route calculation and ETAs</div>
                                </div>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="avoidRoadClosures" checked onchange="saveMultiDropPreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <span style="font-size: 13px; font-weight: 500;">Avoid Road Closures</span>
                                    <div style="font-size: 11px; color: #888;">Automatically route around closed roads and incidents</div>
                                </div>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="avoidIncidents" checked onchange="saveMultiDropPreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <span style="font-size: 13px; font-weight: 500;">Avoid Accidents & Roadworks</span>
                                    <div style="font-size: 11px; color: #888;">Route around reported accidents, roadworks, and hazards</div>
                                </div>
                            </label>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Departure Time</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="datetime-local" id="departureTime" onchange="saveMultiDropPreferences()" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <button onclick="clearDepartureTime()" style="padding: 8px 12px; border: 1px solid #ddd; background: #f5f5f5; border-radius: 4px; cursor: pointer; font-size: 12px;">Now</button>
                            </div>
                            <div style="font-size: 11px; color: #888; margin-top: 4px;">Set departure time for accurate ETAs. Leave empty to use current time.</div>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🕐 Best Time to Leave</span>
                            <button onclick="analysebestTimeToLeave()" style="padding: 10px 16px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%;">
                                Analyse Best Departure Time
                            </button>
                        </div>
                        <div id="bestTimeResult" style="display: none; margin-top: 8px; padding: 12px; background: #f0f4ff; border-radius: 8px; border: 1px solid #dde4ff;">
                            <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px;">Recommended Departure Times</div>
                            <div id="bestTimeSlots" style="font-size: 12px; color: #555;"></div>
                        </div>
                    </div>

                    <!-- Display Preferences Section -->
                    <div class="preferences-section">
                        <h3>🎨 Display Preferences</h3>

                        <div class="preference-item">
                            <span class="preference-label">🗺️ Map Theme</span>
                        </div>
                        <div class="theme-selector">
                            <button class="theme-option active" onclick="setMapTheme('standard')">
                                <div class="theme-preview standard"></div>
                                Standard
                            </button>
                            <button class="theme-option" onclick="setMapTheme('satellite')">
                                <div class="theme-preview satellite"></div>
                                Satellite
                            </button>
                            <button class="theme-option" onclick="setMapTheme('dark')">
                                <div class="theme-preview dark"></div>
                                Dark
                            </button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🌙 UI Theme</span>
                        </div>
                        <div class="theme-selector">
                            <button class="theme-option" id="themeLight" onclick="setTheme('light')">
                                ☀️ Light
                            </button>
                            <button class="theme-option" id="themeDark" onclick="setTheme('dark')">
                                🌙 Dark
                            </button>
                            <button class="theme-option" id="themeAuto" onclick="setTheme('auto')">
                                🔄 Auto
                            </button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🔍 Smart Zoom</span>
                            <button class="toggle-switch" id="smartZoomToggle" onclick="toggleSmartZoom()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">📷 Show Cameras on Map</span>
                            <button class="toggle-switch active" id="showCamerasToggle" onclick="toggleShowCameras()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🚥 OSM Traffic Lights on Map</span>
                            <button class="toggle-switch" id="showOsmTrafficLightsToggle" onclick="toggleShowOsmTrafficLights()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🛤️ OSM Railway Crossings on Map</span>
                            <button class="toggle-switch" id="showOsmRailwayCrossingsToggle" onclick="toggleShowOsmRailwayCrossings()"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Level crossings from OpenStreetMap (<code>railway=level_crossing</code>). Independent of the “Avoid railway crossings” routing option.</p>

                        <div class="preference-item">
                            <span class="preference-label">🚦 Show Traffic Flow</span>
                            <button class="toggle-switch" id="showTrafficToggle" onclick="toggleTrafficLayer()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🚥 Show Traffic Lights</span>
                            <button class="toggle-switch active" id="trafficLightsToggle" onclick="toggleTrafficLights()" style="background: #4CAF50; border-color: #4CAF50;"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Display traffic signal markers (🔴🟡🟢) along your route</p>

                        <div class="preference-item">
                            <span class="preference-label">🛤️ Route Traffic Edges</span>
                            <button class="toggle-switch active" id="routeTrafficToggle" onclick="toggleRouteTraffic()" style="background: #4CAF50; border-color: #4CAF50;"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Show traffic conditions as colored edges along your route (green/orange/red/black)</p>

                        <div class="preference-item">
                            <span class="preference-label">🛣️ Road Name Labels</span>
                            <button class="toggle-switch active" id="roadLabelsToggle" onclick="toggleRoadLabels()" style="background: #4CAF50; border-color: #4CAF50;"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Display motorway, A-road, and street names on the map</p>

                        <div class="preference-item">
                            <span class="preference-label">🏢 3D Buildings</span>
                            <button class="toggle-switch active" id="buildings3DToggle" onclick="toggle3DBuildings()" style="background: #4CAF50; border-color: #4CAF50;"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Show 3D building extrusions on the map</p>

                        <div class="preference-item">
                            <span class="preference-label">📍 Google Plus Codes</span>
                            <button class="toggle-switch" id="googlePlusCodesToggle" onclick="toggleGooglePlusCodes()"></button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: -5px 0 10px 0;">Enable Plus Code input for destination search (free, offline-capable)</p>

                        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-top: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">📷 AR & 3D View</h4>
                            <div class="preference-item">
                                <span class="preference-label">👓 AR Navigation</span>
                                <button class="toggle-switch" id="arModeBtn" onclick="toggleARMode()"></button>
                            </div>
                            <div class="preference-item">
                                <span class="preference-label">🚗 3D Driver View</span>
                                <button class="toggle-switch" id="driverPerspectiveToggle" onclick="toggleDriverPerspective()"></button>
                            </div>
                        </div>
                    </div>

                    <!-- Parking Preferences Section -->
                    <div class="preferences-section">
                        <h3>🅿️ Parking Preferences</h3>

                        <div class="preference-item">
                            <span class="preference-label">Max Walking Distance</span>
                            <select id="parkingMaxWalkingDistance" onchange="saveParkingPreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="5">5 minutes (400m)</option>
                                <option value="10" selected>10 minutes (800m)</option>
                                <option value="15">15 minutes (1.2km)</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Preferred Parking Type</span>
                            <select id="parkingPreferredType" onchange="saveParkingPreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="any" selected>Any Type</option>
                                <option value="garage">Garage</option>
                                <option value="street">Street Parking</option>
                                <option value="lot">Parking Lot</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Price Preference</span>
                            <select id="parkingPricePreference" onchange="saveParkingPreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="any" selected>Any Price</option>
                                <option value="free">Free Only (Any Type)</option>
                                <option value="free_street">🆓 Free Street Parking</option>
                                <option value="paid">Paid Parking</option>
                            </select>
                        </div>
                    </div>

                    <!-- Voice Preferences Section -->
                    <div class="preferences-section">
                        <h3>🎤 Voice Preferences</h3>



                        <div class="preference-item">
                            <span class="preference-label">Turn Announcement Distance (1st)</span>
                            <select id="voiceTurnDistance1" onchange="saveVoicePreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="300">300 meters</option>
                                <option value="500" selected>500 meters</option>
                                <option value="800">800 meters</option>
                                <option value="1000">1 kilometer</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Turn Announcement Distance (2nd)</span>
                            <select id="voiceTurnDistance2" onchange="saveVoicePreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="100">100 meters</option>
                                <option value="150">150 meters</option>
                                <option value="200" selected>200 meters</option>
                                <option value="300">300 meters</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Turn Announcement Distance (3rd)</span>
                            <select id="voiceTurnDistance3" onchange="saveVoicePreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="50">50 meters</option>
                                <option value="75">75 meters</option>
                                <option value="100" selected>100 meters</option>
                                <option value="150">150 meters</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Hazard Warning Distance</span>
                            <select id="voiceHazardDistance" onchange="saveVoicePreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="300">300 meters</option>
                                <option value="500" selected>500 meters</option>
                                <option value="800">800 meters</option>
                                <option value="1000">1 kilometer</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Voice Frequency</span>
                            <select id="voiceFrequencyMode" onchange="saveVoicePreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="all">All announcements</option>
                                <option value="important">Important only (turns &amp; hazards)</option>
                                <option value="minimal">Minimal (turns only)</option>
                            </select>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🔊 Voice Announcements</span>
                            <button class="toggle-switch" id="voiceAnnouncementsEnabled" onclick="toggleVoiceAnnouncements()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">📷 Camera Alert Type</span>
                            <select id="cameraAlertType" onchange="saveCameraAlertPreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="off">Off</option>
                                <option value="voice" selected>Voice Only</option>
                                <option value="chime">Chime Only</option>
                                <option value="both">Voice + Chime</option>
                            </select>
                            <div style="font-size: 11px; color: #888; margin-top: 4px;">Alert when approaching speed cameras and traffic light cameras</div>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">📷 Camera Alert Distance</span>
                            <select id="cameraAlertDistance" onchange="saveCameraAlertPreferences()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="200">200 meters</option>
                                <option value="300">300 meters</option>
                                <option value="500" selected>500 meters</option>
                                <option value="800">800 meters</option>
                                <option value="1000">1 kilometer</option>
                            </select>
                        </div>
                    </div>

                    <!-- Advanced Features Section -->
                    <div class="preferences-section">
                        <h3>⚙️ Advanced Features</h3>

                        <div class="preference-item">
                            <span class="preference-label">🤖 Smart Route Predictions</span>
                            <button class="toggle-switch" id="mlPredictionsEnabled" onclick="toggleMLPredictions()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🔋 Battery Saving Mode</span>
                            <button class="toggle-switch" id="batterySavingMode" onclick="toggleBatterySavingMode()"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">🤝 Gesture Control</span>
                            <button class="toggle-switch" id="gestureEnabled" onclick="toggleGestureControl()"></button>
                        </div>

                        <div id="gestureSettings" style="display: none; margin-left: 15px; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 6px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 8px;">Shake Sensitivity:</label>
                            <select id="gestureSensitivity" onchange="updateGestureSensitivity()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="low">Low (Easy to trigger)</option>
                                <option value="medium" selected>Medium (Balanced)</option>
                                <option value="high">High (Hard to trigger)</option>
                            </select>
                            <label style="font-size: 12px; color: #666; display: block; margin-top: 10px; margin-bottom: 8px;">Shake Action:</label>
                            <select id="gestureAction" onchange="updateGestureAction()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="recalculate">Recalculate Route</option>
                                <option value="report">Report Hazard</option>
                                <option value="clear">Clear Route</option>
                            </select>
                        </div>
                    </div>

                    <!-- PWA App Section -->
                    <div class="preferences-section">
                        <h3>📱 App Controls</h3>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <button onclick="refreshApp()" style="padding: 12px 16px; background: #2196F3; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                🔄 Refresh App
                            </button>
                            <button onclick="checkForUpdates()" style="padding: 12px 16px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                📥 Check Updates
                            </button>
                        </div>
                        <p style="font-size: 11px; color: #888; margin: 0 0 10px 0;">Refresh to reload the app. Check Updates to get the latest version.</p>

                        <div id="pwaStatus" style="padding: 10px; background: #f5f5f5; border-radius: 6px; font-size: 12px; color: #666;">
                            <span id="pwaVersionText">App version: Loading...</span>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px;">
                        <button class="btn-calculate" onclick="recalculateRouteWithPreferences()" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 12px; font-size: 14px; cursor: pointer; font-weight: 500;">🔄 Recalculate Route</button>
                        <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; background: #666; color: white; border: none; border-radius: 4px; padding: 12px; font-size: 14px; cursor: pointer; font-weight: 500;">← Back to Navigation</button>
                    </div>
                </div>

                <!-- TRIP HISTORY TAB (NEW FEATURE) -->
                <div id="tripHistoryTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>📋 Trip History</h3>

                        <!-- Search/Filter -->
                        <div class="form-group">
                            <input type="text" id="tripSearchInput" placeholder="Search by location or date..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 10px;">
                        </div>

                        <!-- Trip List -->
                        <div id="tripHistoryList">
                            <div style="text-align: center; padding: 20px; color: #999;">Loading trips...</div>
                        </div>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
                </div>

                <!-- DASHCAM TAB (NEW FEATURE) -->
                <div id="dashcamTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>📹 Dashcam Recorder</h3>

                        <!-- Recording Status -->
                        <div id="dashcamStatus" style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                            <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Recording Status</div>
                            <div id="dashcamStatusText" style="font-size: 24px; font-weight: bold; color: #999;">⏹️ Stopped</div>
                            <div id="dashcamRecordingTime" style="font-size: 12px; color: #666; margin-top: 8px; display: none;">Recording time: <span id="recordingDuration">00:00:00</span></div>
                        </div>

                        <!-- Recording Controls -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <button id="dashcamStartBtn" class="routing-mode-btn" onclick="startDashcamRecording()" style="background: #4CAF50; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 14px;">🔴 Start Recording</button>
                            <button id="dashcamStopBtn" class="routing-mode-btn" onclick="stopDashcamRecording()" style="background: #F44336; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 14px; display: none;">⏹️ Stop Recording</button>
                        </div>

                        <!-- Recording Indicator (During Navigation) -->
                        <div id="dashcamIndicator" style="display: none; background: #FFEBEE; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #F44336;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 20px; animation: blink 1s infinite;">🔴</span>
                                <div>
                                    <div style="font-weight: 500; color: #C62828;">Recording in progress</div>
                                    <div style="font-size: 12px; color: #666;">Video is being saved with GPS metadata</div>
                                </div>
                            </div>
                        </div>

                        <!-- Dashcam Settings -->
                        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">⚙️ Recording Settings</h4>

                            <div class="preference-item" style="margin-bottom: 12px;">
                                <span class="preference-label">Video Resolution</span>
                                <select id="dashcamResolution" onchange="updateDashcamSettings()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                    <option value="720p">720p (HD)</option>
                                    <option value="1080p" selected>1080p (Full HD)</option>
                                    <option value="1440p">1440p (2K)</option>
                                </select>
                            </div>

                            <div class="preference-item" style="margin-bottom: 12px;">
                                <span class="preference-label">Frame Rate</span>
                                <select id="dashcamFps" onchange="updateDashcamSettings()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                    <option value="24">24 FPS</option>
                                    <option value="30" selected>30 FPS</option>
                                    <option value="60">60 FPS</option>
                                </select>
                            </div>

                            <div class="preference-item" style="margin-bottom: 12px;">
                                <span class="preference-label">Audio Recording</span>
                                <button class="toggle-switch" id="dashcamAudio" onclick="updateDashcamSettings()" style="margin-left: auto;"></button>
                            </div>

                            <div class="preference-item">
                                <span class="preference-label">Retention Period</span>
                                <select id="dashcamRetention" onchange="updateDashcamSettings()" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                    <option value="7">7 Days</option>
                                    <option value="14" selected>14 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="90">90 Days</option>
                                </select>
                            </div>
                        </div>

                        <!-- Storage Information -->
                        <div style="background: #E3F2FD; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #1565C0;">💾 Storage Information</h4>
                            <div style="font-size: 13px; line-height: 1.6;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>Total Recordings:</span>
                                    <strong id="dashcamTotalRecordings">0</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>Total Size:</span>
                                    <strong id="dashcamTotalSize">0 MB</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span>Oldest Recording:</span>
                                    <strong id="dashcamOldestRecording">-</strong>
                                </div>
                            </div>
                        </div>

                        <!-- Recordings List -->
                        <div style="margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px;">📹 Recent Recordings</h4>
                            <div id="dashcamRecordingsList">
                                <div style="text-align: center; padding: 20px; color: #999;">No recordings yet</div>
                            </div>
                        </div>

                        <!-- Cleanup Button -->
                        <button onclick="cleanupOldDashcamRecordings()" style="width: 100%; background: #FF9800; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: 500; margin-bottom: 15px;">🗑️ Cleanup Old Recordings</button>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
                </div>

                <!-- ROUTE SHARING TAB (NEW FEATURE) -->
                <div id="routeSharingTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>🔗 Share Route</h3>

                        <!-- Share Options -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <button class="routing-mode-btn" onclick="generateShareLink()" style="background: #667eea;">
                                🔗 Copy Link
                            </button>
                            <button class="routing-mode-btn" onclick="generateQRCode()" style="background: #FF9800;">
                                📱 QR Code
                            </button>
                        </div>

                        <!-- Share Link Display -->
                        <div id="shareLinkContainer" style="display: none; margin-bottom: 15px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Share Link:</label>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="shareLink" readonly style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #f5f5f5;">
                                <button onclick="copyShareLink()" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-weight: 500;">Copy</button>
                            </div>
                        </div>

                        <!-- QR Code Display -->
                        <div id="qrCodeContainer" style="display: none; text-align: center; margin-bottom: 15px;">
                            <div id="qrCode" style="display: inline-block; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 4px;"></div>
                            <button onclick="downloadQRCode()" style="width: 100%; background: #FF9800; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: 500; margin-top: 10px;">📥 Download QR Code</button>
                        </div>

                        <!-- Route Summary -->
                        <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px;">Route Summary</h4>
                            <div style="font-size: 13px; color: #333; line-height: 1.6;">
                                <div>📍 <strong id="shareStart">Start: -</strong></div>
                                <div>📍 <strong id="shareEnd">End: -</strong></div>
                                <div>📏 <strong id="shareDistance">Distance: -</strong></div>
                                <div>⏱️ <strong id="shareTime">Duration: -</strong></div>
                                <div>💰 <strong id="shareCost">Total Cost: -</strong></div>
                            </div>
                        </div>

                        <!-- Social Share -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <button onclick="shareViaWhatsApp()" style="background: #25D366; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: 500;">💬 WhatsApp</button>
                            <button onclick="shareViaEmail()" style="background: #EA4335; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: 500;">📧 Email</button>
                        </div>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
                </div>

                <!-- ROUTE ANALYTICS TAB (NEW FEATURE) -->
                <div id="routeAnalyticsTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>📊 Trip Analytics</h3>

                        <!-- Summary Stats -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <div style="background: #E3F2FD; padding: 12px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #1976D2;" id="totalTrips">0</div>
                                <div style="font-size: 12px; color: #666;">Total Trips</div>
                            </div>
                            <div style="background: #F3E5F5; padding: 12px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #7B1FA2;" id="totalDistance">0</div>
                                <div style="font-size: 12px; color: #666;">Total Distance</div>
                            </div>
                            <div style="background: #E8F5E9; padding: 12px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #388E3C;" id="totalCost">£0</div>
                                <div style="font-size: 12px; color: #666;">Total Cost</div>
                            </div>
                            <div style="background: #FFF3E0; padding: 12px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #F57C00;" id="avgDuration">0</div>
                                <div style="font-size: 12px; color: #666;">Avg Duration</div>
                            </div>
                        </div>

                        <!-- Most Frequent Routes -->
                        <div style="margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px;">🔄 Most Frequent Routes</h4>
                            <div id="frequentRoutesList">
                                <div style="text-align: center; padding: 20px; color: #999;">Loading...</div>
                            </div>
                        </div>

                        <!-- Cost Breakdown -->
                        <div style="margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px;">💰 Cost Breakdown</h4>
                            <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>⛽ Fuel Cost:</span>
                                    <strong id="totalFuelCost">£0.00</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>🛣️ Toll Cost:</span>
                                    <strong id="totalTollCost">£0.00</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span>🚗 CAZ Cost:</span>
                                    <strong id="totalCAZCost">£0.00</strong>
                                </div>
                            </div>
                        </div>



                        <!-- Time Statistics -->
                        <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px;">⏱️ Time Statistics</h4>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>Total Time:</span>
                                <strong id="totalTime">0 hours</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Average Speed:</span>
                                <strong id="avgSpeed">0 km/h</strong>
                            </div>
                        </div>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
                </div>

                <!-- SAVED ROUTES TAB (NEW FEATURE) -->
                <div id="savedRoutesTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>⭐ Saved Routes</h3>

                        <!-- Save Current Route -->
                        <div style="margin-bottom: 15px;">
                            <input type="text" id="routeName" placeholder="Route name (e.g., 'Home to Work')" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; margin-bottom: 8px;">
                            <button onclick="saveCurrentRoute()" style="width: 100%; background: #E91E63; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: 500;">💾 Save Current Route</button>
                        </div>

                        <!-- Saved Routes List -->
                        <div id="savedRoutesList">
                            <div style="text-align: center; padding: 20px; color: #999;">No saved routes yet</div>
                        </div>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
                </div>

                <!-- ROUTE PREVIEW TAB (NEW FEATURE) -->
                <div id="routePreviewTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>📍 Route Preview</h3>

                        <!-- Route Summary -->
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div>
                                    <div style="font-size: 12px; opacity: 0.9;">📏 Distance</div>
                                    <div style="font-size: 24px; font-weight: bold;" id="previewDistance">-</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; opacity: 0.9;">⏱️ Duration</div>
                                    <div style="font-size: 24px; font-weight: bold;" id="previewDuration">-</div>
                                </div>
                            </div>
                            <div style="border-top: 1px solid rgba(255,255,255,0.3); padding-top: 12px;">
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">📍 Route</div>
                                <div style="font-size: 13px;" id="previewRoute">-</div>
                            </div>
                        </div>

                        <!-- Cost Breakdown -->
                        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">💰 Cost Breakdown</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                                <div>
                                    <div style="color: #666; margin-bottom: 4px;">⛽ Fuel</div>
                                    <div style="font-weight: bold; color: #333;" id="previewFuelCost">-</div>
                                    <div style="color: #555; font-size: 12px; margin-top: 3px; font-weight: 500;" id="previewFuelLitres"></div>
                                </div>
                                <div>
                                    <div style="color: #666; margin-bottom: 4px;">🛣️ Tolls</div>
                                    <div style="font-weight: bold; color: #333;" id="previewTollCost">-</div>
                                </div>
                                <div>
                                    <div style="color: #666; margin-bottom: 4px;">🚗 CAZ</div>
                                    <div style="font-weight: bold; color: #333;" id="previewCAZCost">-</div>
                                </div>
                                <div>
                                    <div style="color: #666; margin-bottom: 4px;">💵 Total</div>
                                    <div style="font-weight: bold; color: #667eea; font-size: 14px;" id="previewTotalCost">-</div>
                                </div>
                            </div>
                            <!-- CAZ Status Display -->
                            <div id="cazStatusContainer" style="display: none; margin-top: 10px; padding: 8px; background: #f5f5f5; border-radius: 6px;"></div>
                        </div>

                        <!-- Hazard Information -->
                        <div id="hazardInfoContainer" style="display: none; background: #FFF3E0; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #FF9800;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #E65100;">⚠️ Hazards Detected</h4>
                            <div style="font-size: 13px; line-height: 1.6;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="color: #666;">Hazard Count:</span>
                                    <strong id="previewHazardCount">0</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #666;">Time Penalty:</span>
                                    <strong id="previewHazardPenalty">0 min</strong>
                                </div>
                            </div>
                        </div>

                        <!-- Route Details -->
                        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">📋 Route Details</h4>
                            <div style="font-size: 13px; line-height: 1.6;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="color: #666;">Routing Engine:</span>
                                    <strong id="previewRoutingEngine">-</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="color: #666;">Routing Mode:</span>
                                    <strong id="previewRoutingMode">-</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: #666;">Vehicle Type:</span>
                                    <strong id="previewVehicleType">-</strong>
                                </div>
                            </div>
                        </div>

                        <!-- Alternative Routes (if available) -->
                        <div id="previewAlternativeRoutesContainer" style="display: none; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">🛣️ Alternative Routes</h4>
                            <div id="previewAlternativeRoutesList"></div>
                        </div>

                        <!-- Parking Section -->
                        <div id="parkingSection" style="display: none; background: #FFF3E0; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #FF9800;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #E65100;">🅿️ Parking Options</h4>
                            <div id="parkingList" style="margin-bottom: 10px;"></div>
                            <button onclick="clearParkingSelection()" style="width: 100%; background: #FF9800; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 13px;">
                                ✕ Clear Parking Selection
                            </button>
                        </div>

                        <!-- Action Buttons -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <button onclick="overviewRoute()" style="background: #9C27B0; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                🗺️ Overview Route
                            </button>
                            <button onclick="startNavigationFromPreview()" style="background: #34A853; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                🧭 Start Navigation
                            </button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <button onclick="findParkingNearDestination()" style="background: #FF9800; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                🅿️ Find Parking
                            </button>
                            <button onclick="showRouteComparison()" style="background: #FF5722; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                📊 Compare Routes
                            </button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 10px;">
                            <button onclick="showAllRoutes()" style="background: #667eea; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                🗺️ Show All Routes on Map
                            </button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <button onclick="switchTab('settings')" style="background: #2196F3; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px;">
                                ⚙️ Route Settings
                            </button>
                            <button onclick="switchTab('navigation')" style="background: #999; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px;">
                                ✏️ Modify Route
                            </button>
                        </div>
                    </div>
                </div>

                <!-- JOURNEY SUMMARY MODAL (NEW) -->
                <div id="journeySummaryModal" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: white; z-index: 2000; padding: 20px; box-sizing: border-box; overflow-y: auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 40px; margin-bottom: 10px;">🏁</div>
                        <h2 style="margin: 0; color: #333;">Journey Complete!</h2>
                        <p style="color: #666; margin: 5px 0;">You have arrived at your destination.</p>
                    </div>

                    <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #2196F3;" id="summaryDistance">-</div>
                                <div style="font-size: 12px; color: #666;">Total Distance</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #4CAF50;" id="summaryTime">-</div>
                                <div style="font-size: 12px; color: #666;">Total Time</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #FF9800;" id="summaryCost">-</div>
                                <div style="font-size: 12px; color: #666;">Estimated Cost</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #9C27B0;" id="summaryAvgSpeed">-</div>
                                <div style="font-size: 12px; color: #666;">Avg Speed</div>
                            </div>
                        </div>
                    </div>

                    <button onclick="closeJourneySummary()" style="width: 100%; padding: 15px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
                        Done
                    </button>
                </div>

                <!-- ROUTE COMPARISON TAB (NEW FEATURE) -->
                <div id="routeComparisonTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>🛣️ Route Options</h3>
                        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Compare different route types with hazard counts</p>

                        <!-- Route Comparison List -->
                        <div id="routeComparisonList">
                            <div style="text-align: center; padding: 20px; color: #999;">Calculate a route to see options</div>
                        </div>

                        <!-- Real-time Traffic Update -->
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
                            <button onclick="updateTrafficConditions()" style="width: 100%; background: #FF6F00; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                🚦 Update Traffic Conditions
                            </button>
                            <div id="trafficStatus" style="font-size: 12px; color: #666; margin-top: 8px; text-align: center;">Last updated: Never</div>
                        </div>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
                </div>
            </div>
        </div>

        <!-- Turn-by-Turn Navigation Display Widget -->
        <div id="turnInstructionWidget" class="turn-instruction-widget" style="display: none;">
            <!-- Next Turn Display (Always Visible When Navigating) -->
            <div id="nextTurnDisplay" class="next-turn-display" onclick="toggleInstructionsList()">
                <div class="turn-icon-container">
                    <span id="nextTurnIcon" class="turn-icon">↑</span>
                </div>
                <div class="turn-info-container">
                    <div id="nextTurnDistance" class="turn-distance">Follow Route</div>
                    <div id="nextTurnInstruction" class="turn-instruction">Continue on current road</div>
                    <div id="nextTurnStreet" class="turn-street"></div>
                </div>
                <div class="expand-indicator">
                    <span id="expandIcon">▼</span>
                </div>
            </div>

            <!-- Expandable Full Instructions Panel -->
            <div id="instructionsPanel" class="instructions-panel" style="display: none;">
                <div class="instructions-header">
                    <span>📋 All Instructions</span>
                    <span id="instructionsCount" class="instructions-count">0 steps</span>
                </div>
                <div id="instructionsList" class="instructions-list">
                    <!-- Instructions will be populated dynamically -->
                </div>
            </div>
        </div>

        <!-- Speed Widget - Driver-friendly speedometer with speed limit display -->
        <!-- z-index: 300 in mobile layout hierarchy -->
        <div id="speedWidget" class="speed-widget" style="position: absolute; top: 20px; right: 20px; z-index: 300; background: rgba(255,255,255,0.95); padding: 12px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.25); display: none; min-width: 100px; text-align: center; border-left: 4px solid #4CAF50;">
            <!-- Current Speed (large, prominent) -->
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <div>
                    <div id="speedValue" style="font-size: 42px; font-weight: bold; color: #333; line-height: 1;">0</div>
                    <div id="speedUnitDisplay" style="font-size: 12px; color: #666; margin-top: -4px;">km/h</div>
                </div>
                <!-- Speed Limit Circle (like road signs) -->
                <div id="speedLimitCircle" style="width: 50px; height: 50px; border-radius: 50%; border: 4px solid #E53935; background: white; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <div id="speedLimitValue" style="font-size: 18px; font-weight: bold; color: #333; line-height: 1;">…</div>
                    <div id="speedLimitUnit" style="font-size: 8px; color: #666;">km/h</div>
                </div>
            </div>
            <!-- Speeding Warning -->
            <div id="speedWarning" style="font-size: 12px; color: #FF5722; font-weight: bold; display: none; margin-top: 6px; background: #FFEBEE; padding: 4px 8px; border-radius: 4px;">⚠️ OVER LIMIT</div>
        </div>

        <!-- Notification Container -->
        <!-- z-index: 500 in mobile layout hierarchy - always on top of content -->
        <div id="notificationContainer" class="notification-container" style="position: fixed; top: 20px; right: 20px; z-index: 500; max-width: 400px;"></div>

        <!-- Gesture Indicator (Phase 3) -->
        <div class="gesture-indicator" id="gestureIndicator">👋</div>

        <!-- Navigation Control Buttons -->
        <!-- z-index: 200 in mobile layout hierarchy -->
        <div id="navControlButtons" class="nav-control-buttons" style="position: absolute; bottom: 100px; right: 20px; z-index: 200; display: flex; flex-direction: column; gap: 10px;">
            <button id="startTrackingBtn" class="fab" title="Start GPS Tracking" onclick="startGPSTracking()" style="background: #4285F4;">📡</button>
            <button id="startNavBtn" class="fab" title="Start Navigation" onclick="startNavigation()" style="background: #34A853; display: none;">🧭</button>
            <button id="zoomFollowToggle" class="fab active" title="Zoom & Follow Vehicle" onclick="toggleZoomAndFollow()" style="background: #FF9800; display: none;">📍</button>
            <button id="journeyOverviewBtn" class="fab" title="Journey Overview" onclick="toggleJourneyOverview()" style="background: #9C27B0; display: none;">🗺️</button>
        </div>

        <!-- Current Road Name Bar - Shows road name during navigation -->
        <div id="roadNameBar" style="display: none; position: absolute; bottom: 155px; left: 50%; transform: translateX(-50%); z-index: 250; background: rgba(0,0,0,0.8); color: white; padding: 6px 18px; border-radius: 20px; font-size: 14px; font-weight: 600; white-space: nowrap; max-width: 80%; overflow: hidden; text-overflow: ellipsis; text-align: center; backdrop-filter: blur(10px);">
            <span id="currentRoadName">--</span>
        </div>

        <!-- Journey Summary Bar - Shows remaining distance, ETA, and time during navigation -->
        <div id="journeySummaryBar" class="journey-summary-bar" style="display: none;">
            <div class="journey-summary-item">
                <span class="journey-summary-icon">📍</span>
                <div class="journey-summary-content">
                    <span id="remainingDistance" class="journey-summary-value">--</span>
                    <span class="journey-summary-label">remaining</span>
                </div>
            </div>
            <div class="journey-summary-divider"></div>
            <div class="journey-summary-item">
                <span class="journey-summary-icon">⏱️</span>
                <div class="journey-summary-content">
                    <span id="remainingTime" class="journey-summary-value">--</span>
                    <span class="journey-summary-label">to go</span>
                </div>
            </div>
            <div class="journey-summary-divider"></div>
            <div class="journey-summary-item">
                <span class="journey-summary-icon">🏁</span>
                <div class="journey-summary-content">
                    <span id="etaTime" class="journey-summary-value">--:--</span>
                    <span class="journey-summary-label">arrival</span>
                </div>
            </div>
        </div>
    </div>

    <!-- CSS for Notifications -->
    <style>
        .in-app-notification {
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease-out;
        }

        .notification-info {
            border-left: 4px solid #2196F3;
            background: #E3F2FD;
        }

        .notification-success {
            border-left: 4px solid #4CAF50;
            background: #E8F5E9;
        }

        .notification-warning {
            border-left: 4px solid #FF9800;
            background: #FFF3E0;
        }

        .notification-error {
            border-left: 4px solid #F44336;
            background: #FFEBEE;
        }

        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes blink {
            0%, 49% { opacity: 1; }
            50%, 100% { opacity: 0.3; }
        }

    <!-- JavaScript moved to /static/js/ -->
    <script>
        // ============================================================
        // DASHCAM FUNCTIONALITY
        // ============================================================

        let dashcamState = {
            isRecording: false,
            recordingStartTime: null,
            recordingDurationInterval: null,
            currentRecordingId: null,
            recordingMetadata: []
        };

        // Initialize dashcam on page load
        window.addEventListener('load', () => {
            loadDashcamRecordings();
            loadDashcamSettings();
        });

        async function startDashcamRecording() {
            try {
                const response = await fetch('/api/dashcam/start', { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    dashcamState.isRecording = true;
                    dashcamState.recordingStartTime = Date.now();
                    dashcamState.currentRecordingId = data.recording_id;
                    dashcamState.recordingMetadata = [];

                    // Update UI
                    updateDashcamUI();
                    startRecordingTimer();
                    showNotification('Dashcam recording started', 'success');

                    // Show recording indicator
                    document.getElementById('dashcamIndicator').style.display = 'block';

                    // Start collecting GPS metadata
                    startDashcamMetadataCollection();
                } else {
                    showNotification('Failed to start recording: ' + data.error, 'error');
                }
            } catch (error) {
                console.error('Error starting dashcam:', error);
                showNotification('Error starting dashcam recording', 'error');
            }
        }

        async function stopDashcamRecording() {
            try {
                const response = await fetch('/api/dashcam/stop', { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    dashcamState.isRecording = false;
                    clearInterval(dashcamState.recordingDurationInterval);

                    // Update UI
                    updateDashcamUI();
                    document.getElementById('dashcamIndicator').style.display = 'none';

                    showNotification('Dashcam recording stopped', 'success');

                    // Reload recordings list
                    loadDashcamRecordings();
                } else {
                    showNotification('Failed to stop recording: ' + data.error, 'error');
                }
            } catch (error) {
                console.error('Error stopping dashcam:', error);
                showNotification('Error stopping dashcam recording', 'error');
            }
        }

        function startRecordingTimer() {
            if (dashcamState.recordingDurationInterval) {
                clearInterval(dashcamState.recordingDurationInterval);
            }

            dashcamState.recordingDurationInterval = setInterval(() => {
                if (dashcamState.isRecording && dashcamState.recordingStartTime) {
                    const elapsed = Math.floor((Date.now() - dashcamState.recordingStartTime) / 1000);
                    const hours = Math.floor(elapsed / 3600);
                    const minutes = Math.floor((elapsed % 3600) / 60);
                    const seconds = elapsed % 60;

                    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                    document.getElementById('recordingDuration').textContent = timeStr;
                }
            }, 1000);
        }

        function startDashcamMetadataCollection() {
            // Collect GPS metadata every 5 seconds during recording
            const metadataInterval = setInterval(async () => {
                if (!dashcamState.isRecording) {
                    clearInterval(metadataInterval);
                    return;
                }

                // Get current GPS position if available
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(async (position) => {
                        const { latitude, longitude } = position.coords;
                        const speed = position.coords.speed || 0;
                        const heading = position.coords.heading || 0;

                        try {
                            await fetch('/api/dashcam/metadata', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    recording_id: dashcamState.currentRecordingId,
                                    latitude,
                                    longitude,
                                    speed,
                                    heading,
                                    timestamp: new Date().toISOString()
                                })
                            });
                        } catch (error) {
                            console.error('Error sending metadata:', error);
                        }
                    });
                }
            }, 5000);
        }

        function updateDashcamUI() {
            const startBtn = document.getElementById('dashcamStartBtn');
            const stopBtn = document.getElementById('dashcamStopBtn');
            const statusText = document.getElementById('dashcamStatusText');
            const recordingTime = document.getElementById('dashcamRecordingTime');

            if (dashcamState.isRecording) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'block';
                statusText.textContent = '🔴 Recording...';
                statusText.style.color = '#F44336';
                recordingTime.style.display = 'block';
            } else {
                startBtn.style.display = 'block';
                stopBtn.style.display = 'none';
                statusText.textContent = '⏹️ Stopped';
                statusText.style.color = '#999';
                recordingTime.style.display = 'none';
            }
        }

        async function loadDashcamRecordings() {
            try {
                const response = await fetch('/api/dashcam/recordings');
                const data = await response.json();

                if (data.success && data.recordings) {
                    const recordingsList = document.getElementById('dashcamRecordingsList');

                    if (data.recordings.length === 0) {
                        recordingsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No recordings yet</div>';
                        return;
                    }

                    let html = '';
                    data.recordings.forEach(recording => {
                        const startTime = new Date(recording.start_time).toLocaleString();
                        const duration = recording.duration_seconds ? `${Math.floor(recording.duration_seconds / 60)}m ${Math.floor(recording.duration_seconds % 60)}s` : 'Recording...';
                        const size = recording.file_size_mb ? `${recording.file_size_mb.toFixed(1)} MB` : '-';
                        // Sanitize recording_id to prevent XSS via onclick
                        const recordingId = String(recording.recording_id).replace(/[^a-zA-Z0-9_-]/g, '');

                        html += `
                            <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 500; color: #333;">📹 ${startTime}</div>
                                    <div style="font-size: 12px; color: #666;">Duration: ${duration} | Size: ${size}</div>
                                </div>
                                <button onclick="deleteDashcamRecording('${recordingId}')" style="background: #F44336; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Delete</button>
                            </div>
                        `;
                    });

                    recordingsList.innerHTML = html;

                    // Update storage info
                    const totalSize = data.recordings.reduce((sum, r) => sum + (r.file_size_mb || 0), 0);
                    document.getElementById('dashcamTotalRecordings').textContent = data.recordings.length;
                    document.getElementById('dashcamTotalSize').textContent = `${totalSize.toFixed(1)} MB`;

                    if (data.recordings.length > 0) {
                        const oldestDate = new Date(data.recordings[data.recordings.length - 1].start_time).toLocaleDateString();
                        document.getElementById('dashcamOldestRecording').textContent = oldestDate;
                    }
                }
            } catch (error) {
                console.error('Error loading dashcam recordings:', error);
            }
        }

        async function deleteDashcamRecording(recordingId) {
            if (!confirm('Are you sure you want to delete this recording?')) return;

            try {
                const response = await fetch(`/api/dashcam/recordings/${recordingId}`, { method: 'DELETE' });
                const data = await response.json();

                if (data.success) {
                    showNotification('Recording deleted', 'success');
                    loadDashcamRecordings();
                } else {
                    showNotification('Failed to delete recording', 'error');
                }
            } catch (error) {
                console.error('Error deleting recording:', error);
                showNotification('Error deleting recording', 'error');
            }
        }

        async function cleanupOldDashcamRecordings() {
            if (!confirm('This will delete all recordings older than the retention period. Continue?')) return;

            try {
                const response = await fetch('/api/dashcam/cleanup', { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    showNotification(`Cleaned up ${data.deleted_count} old recordings`, 'success');
                    loadDashcamRecordings();
                } else {
                    showNotification('Cleanup failed: ' + data.error, 'error');
                }
            } catch (error) {
                console.error('Error cleaning up recordings:', error);
                showNotification('Error cleaning up recordings', 'error');
            }
        }

        function loadDashcamSettings() {
            try {
                const response = fetch('/api/dashcam/settings');
                response.then(r => r.json()).then(data => {
                    if (data.success && data.settings) {
                        document.getElementById('dashcamResolution').value = data.settings.resolution || '1080p';
                        document.getElementById('dashcamFps').value = data.settings.fps || '30';
                        document.getElementById('dashcamRetention').value = data.settings.retention_days || '14';

                        const audioBtn = document.getElementById('dashcamAudio');
                        if (data.settings.audio) {
                            audioBtn.classList.add('active');
                        }
                    }
                });
            } catch (error) {
                console.error('Error loading dashcam settings:', error);
            }
        }

        async function updateDashcamSettings() {
            try {
                const settings = {
                    resolution: document.getElementById('dashcamResolution').value,
                    fps: parseInt(document.getElementById('dashcamFps').value),
                    audio: document.getElementById('dashcamAudio').classList.contains('active'),
                    retention_days: parseInt(document.getElementById('dashcamRetention').value)
                };

                const response = await fetch('/api/dashcam/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                });

                const data = await response.json();
                if (data.success) {
                    showNotification('Dashcam settings updated', 'success');
                } else {
                    showNotification('Failed to update settings', 'error');
                }
            } catch (error) {
                console.error('Error updating dashcam settings:', error);
                showNotification('Error updating settings', 'error');
            }
        }
    </script>
    <!-- API Keys injected from server -->
    <script>
        window.TOMTOM_API_KEY = '{{ tomtom_api_key }}';
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    tomtom_key = os.getenv('TOMTOM_API_KEY', '')
    return render_template_string(HTML_TEMPLATE, tomtom_api_key=tomtom_key)

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

class FallbackChainOptimizer:
    """
    PHASE 5: Intelligent fallback chain with error handling and timeout management.
    Primary: Valhalla → Secondary: OSRM
    """
    def __init__(self):
        self.engine_stats = {
            'valhalla': {'failures': 0, 'successes': 0, 'avg_time': 0},
            'osrm': {'failures': 0, 'successes': 0, 'avg_time': 0}
        }
        self.lock = threading.Lock()

    def record_success(self, engine: str, response_time_ms: float) -> None:
        """Record successful routing request."""
        with self.lock:
            stats = self.engine_stats[engine]
            stats['successes'] += 1
            # Update average time
            total_time = stats['avg_time'] * (stats['successes'] - 1) + response_time_ms
            stats['avg_time'] = total_time / stats['successes']

    def record_failure(self, engine: str) -> None:
        """Record failed routing request."""
        with self.lock:
            self.engine_stats[engine]['failures'] += 1

    def get_engine_health(self) -> Dict[str, Any]:
        """Get health status of all engines."""
        health: Dict[str, Any] = {}
        for engine, stats in self.engine_stats.items():
            total = stats['successes'] + stats['failures']
            success_rate = (stats['successes'] / total * 100) if total > 0 else 0
            health[engine] = {
                'success_rate': round(success_rate, 1),
                'successes': stats['successes'],
                'failures': stats['failures'],
                'avg_response_time_ms': round(stats['avg_time'], 0)
            }
        return health

    def get_recommended_engine(self) -> str:
        """Get recommended engine based on health and performance."""
        health = self.get_engine_health()
        # Prefer engines with higher success rate and lower response time
        scored: Dict[str, float] = {}
        for engine, stats in health.items():
            # Score = success_rate (0-100) - response_time_penalty
            penalty: float = min(stats['avg_response_time_ms'] / 100, 50)  # Max 50 point penalty
            score: float = stats['success_rate'] - penalty
            scored[engine] = score

        return max(scored.items(), key=lambda x: x[1])[0] if scored else 'valhalla'

class ParallelRoutingEngine:
    """
    PHASE 5: Parallel routing engine for testing all 3 engines simultaneously.
    Compares performance, accuracy, and response times.
    """
    def __init__(self):
        self.results = {}
        self.lock = threading.Lock()

    def request_graphhopper(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from GraphHopper in parallel."""
        try:
            start_time = time.time()
            url = f"{GRAPHHOPPER_URL}/route"
            params = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "ch.disable": "true"
            }
            headers = {
                'User-Agent': 'Voyagr-PWA/1.0',
                'Accept': 'application/json'
            }
            response = requests.get(url, params=params, timeout=10, headers=headers)
            elapsed = (time.time() - start_time) * 1000

            with self.lock:
                if response.status_code == 200:
                    data = response.json()
                    if 'paths' in data and len(data['paths']) > 0:
                        path = data['paths'][0]
                        self.results['graphhopper'] = {
                            'success': True,
                            'distance_km': path.get('distance', 0) / 1000,
                            'duration_minutes': path.get('time', 0) / 60000,
                            'response_time_ms': elapsed,
                            'status': 'OK'
                        }
                    else:
                        self.results['graphhopper'] = {'success': False, 'error': 'No paths', 'response_time_ms': elapsed}
                else:
                    self.results['graphhopper'] = {'success': False, 'error': f'HTTP {response.status_code}', 'response_time_ms': elapsed}
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['graphhopper'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            with self.lock:
                self.results['graphhopper'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def request_valhalla(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from Valhalla in parallel."""
        try:
            start_time = time.time()
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": "auto",
                "alternates": 3
            }
            headers = {
                'User-Agent': 'Voyagr-PWA/1.0',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
            response = requests.post(url, json=payload, timeout=10, headers=headers)
            elapsed = (time.time() - start_time) * 1000

            with self.lock:
                if response.status_code == 200:
                    data = response.json()
                    if 'trip' in data and 'legs' in data['trip']:
                        summary = data['trip']['summary']
                        self.results['valhalla'] = {
                            'success': True,
                            'distance_km': summary.get('length', 0),
                            'duration_minutes': summary.get('time', 0) / 60,
                            'response_time_ms': elapsed,
                            'status': 'OK'
                        }
                    else:
                        self.results['valhalla'] = {'success': False, 'error': 'No trip', 'response_time_ms': elapsed}
                else:
                    self.results['valhalla'] = {'success': False, 'error': f'HTTP {response.status_code}', 'response_time_ms': elapsed}
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['valhalla'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            with self.lock:
                self.results['valhalla'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def request_osrm(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from OSRM in parallel."""
        try:
            start_time = time.time()
            url = f"{OSRM_URL}/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
            params = {
                'overview': 'full',
                'alternatives': 'true',
                'steps': 'true'
            }
            headers = {
                'User-Agent': 'Voyagr-PWA/1.0',
                'Accept': 'application/json'
            }
            response = requests.get(url, params=params, timeout=10, headers=headers)
            elapsed = (time.time() - start_time) * 1000

            with self.lock:
                if response.status_code == 200:
                    data = response.json()
                    if 'routes' in data and len(data['routes']) > 0:
                        route = data['routes'][0]
                        self.results['osrm'] = {
                            'success': True,
                            'distance_km': route.get('distance', 0) / 1000,
                            'duration_minutes': route.get('duration', 0) / 60,
                            'response_time_ms': elapsed,
                            'status': 'OK'
                        }
                    else:
                        self.results['osrm'] = {'success': False, 'error': 'No routes', 'response_time_ms': elapsed}
                else:
                    self.results['osrm'] = {'success': False, 'error': f'HTTP {response.status_code}', 'response_time_ms': elapsed}
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['osrm'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            with self.lock:
                self.results['osrm'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def run_parallel(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, Any]:
        """Run all 3 routing engines in parallel."""
        threads = [
            threading.Thread(target=self.request_graphhopper, args=(start_lat, start_lon, end_lat, end_lon)),
            threading.Thread(target=self.request_valhalla, args=(start_lat, start_lon, end_lat, end_lon)),
            threading.Thread(target=self.request_osrm, args=(start_lat, start_lon, end_lat, end_lon))
        ]

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join(timeout=12)  # Wait max 12 seconds

        return self.results




def get_traffic_duration_multiplier(lat: float, lon: float) -> tuple:
    """
    Get traffic-based duration multiplier for more accurate ETAs.
    Returns (multiplier, traffic_level) tuple.

    Valhalla uses historical average speeds which often underestimate travel time
    during peak hours. This function queries real-time traffic to adjust the ETA.
    """
    try:
        tomtom_api_key = os.getenv('TOMTOM_API_KEY', '')
        if not tomtom_api_key:
            # No API key - use time-of-day based estimation
            hour = datetime.now().hour
            day_of_week = datetime.now().weekday()

            # Peak hours: 7-9am and 4-7pm on weekdays
            is_weekday = day_of_week < 5
            is_morning_peak = 7 <= hour <= 9
            is_evening_peak = 16 <= hour <= 19

            if is_weekday and (is_morning_peak or is_evening_peak):
                return (1.35, 'Peak Hours')  # 35% longer during rush hour
            elif is_weekday and 9 < hour < 16:
                return (1.15, 'Daytime')  # 15% longer during day
            else:
                return (1.0, 'Off-Peak')  # No adjustment

        # Query TomTom Traffic Flow API
        url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
        params = {
            'key': tomtom_api_key,
            'point': f"{lat},{lon}",
            'unit': 'KMPH'
        }

        response = requests.get(url, params=params, timeout=3)
        if response.status_code == 200:
            data = response.json()
            flow_data = data.get('flowSegmentData', {})
            current_speed = flow_data.get('currentSpeed', 50)
            free_flow_speed = flow_data.get('freeFlowSpeed', 50)

            if free_flow_speed > 0 and current_speed > 0:
                # Calculate multiplier: if current is 50% of free flow, multiply by 2
                multiplier = min(free_flow_speed / current_speed, 2.0)  # Cap at 2x

                # Determine traffic level
                ratio = current_speed / free_flow_speed
                if ratio >= 0.9:
                    traffic_level = 'Free Flow'
                elif ratio >= 0.7:
                    traffic_level = 'Light Traffic'
                    multiplier = max(multiplier, 1.1)  # At least 10% increase
                elif ratio >= 0.5:
                    traffic_level = 'Moderate Traffic'
                    multiplier = max(multiplier, 1.25)  # At least 25% increase
                else:
                    traffic_level = 'Heavy Traffic'
                    multiplier = max(multiplier, 1.5)  # At least 50% increase

                logger.info(f"[TRAFFIC] Multiplier: {multiplier:.2f}x ({traffic_level}), speeds: {current_speed}/{free_flow_speed} km/h")
                return (multiplier, traffic_level)

        return (1.0, 'Unknown')
    except Exception as e:
        logger.warning(f"[TRAFFIC] Failed to get traffic multiplier: {e}")
        return (1.0, 'Unknown')


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

        start = data.get('start', '').strip()
        end = data.get('end', '').strip()
        routing_mode = data.get('routing_mode', 'auto')
        # Valhalla costing: must be auto, pedestrian, or bicycle for correct routes/ETAs
        valhalla_costing = routing_mode if routing_mode in ('auto', 'pedestrian', 'bicycle') else 'auto'
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)
        caz_exempt = data.get('caz_exempt', False)
        avoid_caz = data.get('avoid_caz', True)
        enable_hazard_avoidance = data.get('enable_hazard_avoidance', False)
        avoid_traffic_lights = data.get('avoid_traffic_lights', True)
        avoid_railway_crossings = data.get('avoid_railway_crossings', True)
        avoid_cameras = data.get('avoid_cameras', True)

        # Align with calculate_caz_cost: no routing penalties when exempt or fully electric
        apply_caz_routing_avoidance = bool(
            avoid_caz and not caz_exempt and vehicle_type != 'electric'
        )

        # Route avoidance preferences (Valhalla costing options)
        avoid_tolls = data.get('avoid_tolls', False)
        avoid_motorways = data.get('avoid_motorways', False)
        avoid_ferries = data.get('avoid_ferries', False)

        # VIA-POINTS AND STOPS
        via_points = data.get('via_points', [])  # [{lat, lon, name, type: 'via'}]
        stops = data.get('stops', [])  # [{lat, lon, name, type: 'stop', duration: 15}]

        # Multi-drop settings from frontend
        optimize_stop_order = data.get('optimize_stop_order', False)
        round_trip = data.get('round_trip', False)
        departure_time = data.get('departure_time')
        time_windows = data.get('time_windows')

        # Calculate total stop time
        total_stop_time = sum(s.get('duration', 15) for s in stops)

        logger.info(f"[ROUTE] Via-points: {len(via_points)}, Stops: {len(stops)}, Total stop time: {total_stop_time} min")

        # DEBUG: Log request received
        print(f"\n{'='*80}")
        print(f"[API REQUEST] /api/route called")
        print(f"[API REQUEST] enable_hazard_avoidance={enable_hazard_avoidance}")
        print(f"{'='*80}\n")
        logger.info(f"[API REQUEST] Route calculation started: ({start},{end}), hazard_avoidance={enable_hazard_avoidance}")

        # Parse coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)
        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords

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
                        hazards_md['camera'] = []
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
                logger.warning(f"[MULTI-DROP] Optimization failed, falling through to standard routing")

        # ====================================================================
        # PHASE 3 OPTIMIZATION: Check route cache first
        # ====================================================================
        cached_route = route_cache.get(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance)
        if cached_route:
            logger.info(f"[CACHE] HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon}) with hazard_avoidance={enable_hazard_avoidance}")
            cached_route['cached'] = True
            cached_route['cache_stats'] = route_cache.get_stats()
            return jsonify(cached_route)

        # Fetch hazards (always fetch for scoring, even if avoidance is disabled)
        hazard_start = time.time()
        hazards = fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)
        hazard_elapsed = (time.time() - hazard_start) * 1000
        logger.info(f"[HAZARDS] Fetched camera hazards in {hazard_elapsed:.0f}ms: {[(k, len(v)) for k, v in hazards.items() if v]}")

        # ====================================================================
        # HYBRID INTEGRATION: Fetch TomTom real-time incidents
        # Combines SCDB cameras with TomTom accidents, roadworks, closures
        # ====================================================================
        tomtom_start = time.time()
        try:
            # Build bounding box for TomTom API
            tomtom_bbox = {
                'north': max(start_lat, end_lat) + 0.1,  # 10km buffer
                'south': min(start_lat, end_lat) - 0.1,
                'east': max(start_lon, end_lon) + 0.1,
                'west': min(start_lon, end_lon) - 0.1
            }

            # Fetch real-time incidents from TomTom
            tomtom_incidents = fetch_tomtom_incidents(tomtom_bbox)

            if tomtom_incidents:
                hazards = merge_hazards_with_tomtom_incidents(hazards, tomtom_incidents)
                tomtom_elapsed = (time.time() - tomtom_start) * 1000
                logger.info(f"[TOMTOM] Merged real-time incidents in {tomtom_elapsed:.0f}ms")

                # Extract road closures as additional exclude_locations
                road_closures = tomtom_incidents.get('road_closed', [])
                if road_closures:
                    closure_count = len(road_closures)
                    logger.info(f"[TOMTOM] {closure_count} road closures found - will be excluded from routing")
            else:
                logger.debug("[TOMTOM] No real-time incidents found for route area")
        except Exception as e:
            logger.warning(f"[TOMTOM] Failed to fetch incidents (using cameras only): {e}")

        if not avoid_cameras:
            hazards['camera'] = []

        if avoid_traffic_lights:
            try:
                from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
                _south = min(start_lat, end_lat) - 0.1
                _north = max(start_lat, end_lat) + 0.1
                _west = min(start_lon, end_lon) - 0.1
                _east = max(start_lon, end_lon) + 0.1
                hazards['traffic_light'] = fetch_traffic_lights_osm_bbox(_south, _north, _west, _east)
                logger.info(f"[TRAFFIC_LIGHTS] Merged {len(hazards.get('traffic_light', []))} OSM traffic signals for routing")
            except Exception as e:
                logger.warning(f"[TRAFFIC_LIGHTS] Could not load OSM traffic lights: {e}")
                hazards['traffic_light'] = []
        else:
            hazards['traffic_light'] = []

        if avoid_railway_crossings:
            try:
                from voyagr.services.hazards import fetch_railway_crossings_osm_bbox
                _rs = min(start_lat, end_lat) - 0.1
                _rn = max(start_lat, end_lat) + 0.1
                _rw = min(start_lon, end_lon) - 0.1
                _re = max(start_lon, end_lon) + 0.1
                hazards['railway_crossing'] = fetch_railway_crossings_osm_bbox(_rs, _rn, _rw, _re)
                logger.info(f"[RAILWAY_CROSSINGS] Merged {len(hazards.get('railway_crossing', []))} OSM level crossings for routing")
            except Exception as e:
                logger.warning(f"[RAILWAY_CROSSINGS] Could not load OSM railway crossings: {e}")
                hazards['railway_crossing'] = []
        else:
            hazards['railway_crossing'] = []

        if enable_hazard_avoidance:
            logger.info(f"[HAZARDS] Hazard avoidance ENABLED - will use exclude_locations")
        else:
            logger.info(f"[HAZARDS] Hazard avoidance DISABLED - will score route but not avoid hazards")

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
                graphhopper_route = route_with_graphhopper(
                    start_lat, start_lon, end_lat, end_lon,
                    enable_camera_avoidance=avoid_cameras,
                    route_bbox=route_bbox,
                    traffic_light_hazards=_tl_gh if _tl_gh else None,
                    railway_crossing_hazards=_rx_gh if _rx_gh else None,
                    avoid_caz_zones=apply_caz_routing_avoidance,
                )
                if graphhopper_route and graphhopper_route.get('success'):
                    logger.info(f"[GRAPHHOPPER] ✅ Route found with camera avoidance")
                else:
                    graphhopper_error = "No route found"
                    logger.warning(f"[GRAPHHOPPER] No route found, falling back to Valhalla")
            except Exception as e:
                graphhopper_error = str(e)
                logger.warning(f"[GRAPHHOPPER] Error: {e}, falling back to Valhalla")

        logger.debug(f"[ROUTING] Valhalla URL: {VALHALLA_URL}")

        valhalla_start_time = time.time()
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
                    remaining_slots = 50 - len(closure_excludes)

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
                    if exclude_locations:
                        logger.info(f"[VALHALLA] Using {len(exclude_locations)} exclude_locations for hazard avoidance")
                    else:
                        logger.warning(f"[VALHALLA] No exclude_locations generated, using standard routing")
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

            # ================================================================
            # SEGMENTED ROUTING - DISABLED
            # ================================================================
            # NOTE: Valhalla has a hard limit of 50 exclude_locations (error 157)
            # Segmented routing was designed to work around this, but it causes
            # "No path could be found" errors when segments are blocked.
            # We now respect the 50 limit from the start.
            use_segmented_routing = False
            num_segments = 1

            # Segmented routing disabled - use standard routing with max 50 exclusions
            if False and enable_hazard_avoidance and len(exclude_locations) > 75:
                # Determine number of segments based on camera density
                if len(exclude_locations) > 150:
                    num_segments = 3  # 150 total exclusions
                else:
                    num_segments = 2  # 100 total exclusions

                use_segmented_routing = True
                logger.info(f"[VALHALLA] High camera density ({len(exclude_locations)} cameras) - using {num_segments}-segment routing")
                print(f"[Valhalla] SEGMENTED ROUTING: {num_segments} segments for {len(exclude_locations)} cameras")

                # Calculate each segment separately
                try:
                    # ================================================================
                    # STEP 1: Get baseline route WITH ALTERNATES to extract real waypoints
                    # ================================================================
                    logger.info(f"[VALHALLA] Step 1: Getting baseline route with alternates")
                    baseline_payload = {
                        "locations": route_locations,  # Use locations with via-points
                        "costing": "auto",
                        "alternates": 3 if not has_waypoints else 0,  # No alternates for multi-stop
                        "directions_options": {"generalize": 0}  # Full geometry - follow roads on bends
                    }

                    baseline_response = requests.post(url, json=baseline_payload, timeout=10, headers=headers)

                    if baseline_response.status_code != 200:
                        logger.error(f"[VALHALLA] Baseline route failed: HTTP {baseline_response.status_code}")
                        use_segmented_routing = False
                    elif 'trip' not in baseline_response.json() or 'legs' not in baseline_response.json()['trip']:
                        logger.error(f"[VALHALLA] Baseline route invalid response structure")
                        use_segmented_routing = False
                    else:
                        # Extract baseline route geometry
                        baseline_data = baseline_response.json()
                        baseline_geometry = baseline_data['trip']['legs'][0]['shape']
                        baseline_coords = polyline.decode(baseline_geometry, precision=6)

                        logger.info(f"[VALHALLA] Baseline route has {len(baseline_coords)} points")

                        # ================================================================
                        # REQUEST DISTINCT ROUTE TYPES (Fastest, Shortest, Cheapest, Eco)
                        # ================================================================
                        alternative_routes = []

                        # Helper function to build a route entry
                        def build_route_entry(name, geometry, distance_km, duration_sec):
                            coords = polyline.decode(geometry, precision=6)
                            penalty, hazard_count = score_route_by_hazards(coords, hazards)
                            hazards_list = get_hazards_on_route(coords, hazards)
                            costs = cost_calculator.calculate_costs(
                                distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                route_coords=coords
                            )
                            return {
                                'name': name,
                                'distance_km': round(distance_km, 2),
                                'duration_minutes': round(duration_sec / 60, 0),
                                'geometry': geometry,
                                'fuel_cost': costs['fuel_cost'],
                                'fuel_litres': costs['fuel_litres'],
                                'toll_cost': costs['toll_cost'],
                                'caz_cost': costs['caz_cost'],
                                'hazard_penalty_seconds': penalty,
                                'hazard_count': hazard_count,
                                'hazards': hazards_list
                            }

                        # Build exclude_locations for alternative routes (use top 50 cameras closest to route)
                        alt_exclude = []
                        if enable_hazard_avoidance and hazards:
                            try:
                                alt_exclude = build_valhalla_exclude_locations(
                                    hazards, route_bbox=route_bbox, max_hazards=50,
                                    start_lat=start_lat, start_lon=start_lon,
                                    end_lat=end_lat, end_lon=end_lon
                                )
                                logger.info(f"[VALHALLA] Alt routes: using {len(alt_exclude)} exclude_locations")
                            except Exception as e:
                                logger.warning(f"[VALHALLA] Failed to build alt exclude_locations: {e}")

                        # Route 1: Shortest Distance (auto_shorter costing) WITH camera avoidance
                        try:
                            shortest_payload = {
                                "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                                "costing": "auto_shorter"
                            }
                            if alt_exclude:
                                shortest_payload["exclude_locations"] = alt_exclude
                            logger.info(f"[VALHALLA] Requesting Shortest route with {len(alt_exclude)} exclusions")
                            sh_response = requests.post(url, json=shortest_payload, timeout=10, headers=headers)
                            if sh_response.status_code == 200:
                                sh_data = sh_response.json()
                                if 'trip' in sh_data and 'legs' in sh_data['trip']:
                                    sh_geom = sh_data['trip']['legs'][0]['shape']
                                    sh_dist = sh_data['trip']['summary']['length']
                                    sh_time = sh_data['trip']['summary']['time']
                                    alternative_routes.append(build_route_entry('📏 Shortest', sh_geom, sh_dist, sh_time))
                                    logger.info(f"[VALHALLA] Shortest: {sh_dist:.1f}km")
                        except Exception as e:
                            logger.warning(f"[VALHALLA] Shortest route failed: {e}")

                        # Route 2: Fastest route (standard auto costing) WITH camera avoidance
                        try:
                            fastest_payload = {
                                "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                                "costing": "auto",
                                "directions_options": {"generalize": 0}
                            }
                            if alt_exclude:
                                fastest_payload["exclude_locations"] = alt_exclude
                            logger.info(f"[VALHALLA] Requesting Fastest route with {len(alt_exclude)} exclusions")
                            fast_response = requests.post(url, json=fastest_payload, timeout=10, headers=headers)
                            if fast_response.status_code == 200:
                                fast_data = fast_response.json()
                                if 'trip' in fast_data and 'legs' in fast_data['trip']:
                                    fast_geom = fast_data['trip']['legs'][0]['shape']
                                    fast_dist = fast_data['trip']['summary']['length']
                                    fast_time = fast_data['trip']['summary']['time']
                                    alternative_routes.append(build_route_entry('⚡ Fastest', fast_geom, fast_dist, fast_time))
                                    logger.info(f"[VALHALLA] Fastest: {fast_dist:.1f}km, {fast_time/60:.0f}min")
                        except Exception as e:
                            logger.warning(f"[VALHALLA] Fastest route failed: {e}")

                        # Route 4: Optimised Discovery - Aggressively exclude all route cameras
                        # This finds routes that completely avoid camera-heavy roads
                        try:
                            # Get cameras that are ON the baseline route (within 100m)
                            baseline_cameras = []
                            for hazard in alt_exclude[:30]:  # Check top 30 cameras
                                for coord in baseline_coords[::10]:  # Sample every 10th point
                                    dist = ((hazard['lat'] - coord[0])**2 + (hazard['lon'] - coord[1])**2)**0.5
                                    if dist < 0.001:  # ~100m
                                        baseline_cameras.append(hazard)
                                        break

                            if baseline_cameras:
                                # Request route excluding specifically the cameras on the baseline
                                discovery_payload = {
                                    "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                                    "costing": "auto",
                                    "exclude_locations": baseline_cameras[:50],
                                    "directions_options": {"generalize": 0}
                                }

                                logger.info(f"[DISCOVERY] Requesting optimised route excluding {len(baseline_cameras)} baseline cameras")
                                disc_response = requests.post(url, json=discovery_payload, timeout=10, headers=headers)

                                if disc_response.status_code == 200:
                                    disc_data = disc_response.json()
                                    if 'trip' in disc_data and 'legs' in disc_data['trip']:
                                        disc_geom = disc_data['trip']['legs'][0]['shape']
                                        disc_dist = disc_data['trip']['summary']['length']
                                        disc_time = disc_data['trip']['summary']['time']
                                        route_entry = build_route_entry('⚡ Optimised Discovery', disc_geom, disc_dist, disc_time)

                                        # Only add if it has fewer cameras than baseline
                                        if route_entry['hazard_count'] < len(baseline_cameras):
                                            alternative_routes.append(route_entry)
                                            logger.info(f"[DISCOVERY] Optimised: {disc_dist:.1f}km, {route_entry['hazard_count']} cameras (was {len(baseline_cameras)})")
                        except Exception as e:
                            logger.warning(f"[DISCOVERY] Optimised discovery failed: {e}")

                        # Extract waypoints at equal intervals along the route
                        waypoints = []
                        waypoints.append({"lat": start_lat, "lon": start_lon})  # Start point

                        for i in range(1, num_segments):
                            # Calculate index at i/num_segments position
                            idx = int((i / num_segments) * len(baseline_coords))
                            idx = min(idx, len(baseline_coords) - 1)  # Ensure within bounds

                            waypoint_lat, waypoint_lon = baseline_coords[idx]
                            waypoints.append({"lat": waypoint_lat, "lon": waypoint_lon})
                            logger.info(f"[VALHALLA] Waypoint {i}: ({waypoint_lat:.4f},{waypoint_lon:.4f}) at index {idx}/{len(baseline_coords)}")

                        waypoints.append({"lat": end_lat, "lon": end_lon})  # End point

                        logger.info(f"[VALHALLA] Extracted {len(waypoints)} waypoints from baseline route")

                    # ================================================================
                    # STEP 2: Calculate each segment separately
                    # ================================================================
                    if not use_segmented_routing:
                        raise Exception("Baseline route failed - cannot extract waypoints")

                    total_distance = 0
                    total_duration = 0
                    all_geometries = []
                    all_maneuvers = []  # Collect maneuvers from all segments

                    logger.info(f"[VALHALLA] Step 2: Calculating {num_segments} segments with real waypoints")

                    # Calculate each segment
                    for i in range(num_segments):
                        seg_start = waypoints[i]
                        seg_end = waypoints[i + 1]

                        logger.info(f"[VALHALLA] Segment {i+1}/{num_segments}: ({seg_start['lat']:.4f},{seg_start['lon']:.4f}) → ({seg_end['lat']:.4f},{seg_end['lon']:.4f})")

                        # Build segment bounding box
                        seg_bbox = {
                            'min_lat': min(seg_start['lat'], seg_end['lat']),
                            'max_lat': max(seg_start['lat'], seg_end['lat']),
                            'min_lon': min(seg_start['lon'], seg_end['lon']),
                            'max_lon': max(seg_start['lon'], seg_end['lon'])
                        }

                        # Build exclude_locations for this segment (max 50)
                        seg_exclude = build_valhalla_exclude_locations(
                            hazards,
                            route_bbox=seg_bbox,
                            max_hazards=50,
                            start_lat=seg_start['lat'],
                            start_lon=seg_start['lon'],
                            end_lat=seg_end['lat'],
                            end_lon=seg_end['lon']
                        )

                        logger.info(f"[VALHALLA] Segment {i+1}: {len(seg_exclude)} exclude_locations")

                        # Build segment payload
                        seg_payload = {
                            "locations": [seg_start, seg_end],
                            "costing": "auto",
                            "alternatives": False,
                            "directions_options": {"generalize": 0}
                        }

                        if seg_exclude:
                            seg_payload["exclude_locations"] = seg_exclude

                        # Make segment request
                        seg_response = requests.post(url, json=seg_payload, timeout=10, headers=headers)

                        if seg_response.status_code == 200:
                            seg_data = seg_response.json()
                            if 'trip' in seg_data and 'legs' in seg_data['trip']:
                                # Extract segment data
                                seg_distance = seg_data['trip']['summary']['length']  # km
                                seg_duration = seg_data['trip']['summary']['time']  # seconds
                                seg_geometry = seg_data['trip']['legs'][0]['shape']

                                total_distance += seg_distance
                                total_duration += seg_duration
                                all_geometries.append(seg_geometry)

                                # Extract maneuvers from this segment
                                for leg in seg_data['trip']['legs']:
                                    if 'maneuvers' in leg:
                                        for m in leg['maneuvers']:
                                            all_maneuvers.append({
                                                'instruction': m.get('instruction', ''),
                                                'type': m.get('type', 0),
                                                'distance': m.get('length', 0) * 1000,  # km to m
                                                'time': m.get('time', 0),
                                                'lat': m.get('begin_shape_index', 0),
                                                'lon': m.get('end_shape_index', 0),
                                                'street_names': m.get('street_names', []),
                                                'begin_street_names': m.get('begin_street_names', []),
                                                'begin_shape_index': m.get('begin_shape_index', 0),
                                                'end_shape_index': m.get('end_shape_index', 0)
                                            })

                                logger.info(f"[VALHALLA] Segment {i+1} SUCCESS: {seg_distance:.2f}km, {seg_duration/60:.0f}min")
                            else:
                                logger.error(f"[VALHALLA] Segment {i+1} FAILED: Invalid response structure")
                                logger.error(f"[VALHALLA] Response: {seg_data}")
                                use_segmented_routing = False
                                break
                        else:
                            logger.error(f"[VALHALLA] Segment {i+1} FAILED: HTTP {seg_response.status_code}")
                            logger.error(f"[VALHALLA] Error: {seg_response.text[:500]}")
                            use_segmented_routing = False
                            break

                    # If all segments succeeded, build combined route
                    if use_segmented_routing:
                        logger.info(f"[VALHALLA] All segments calculated successfully")
                        logger.info(f"[VALHALLA] Total: {total_distance:.2f}km, {total_duration/60:.0f}min")

                        # Decode and combine geometries
                        combined_coords = []
                        for geom in all_geometries:
                            coords = polyline.decode(geom, precision=6)
                            combined_coords.extend(coords)

                        # Re-encode combined geometry
                        combined_geometry = polyline.encode(combined_coords, precision=6)

                        # Calculate costs
                        costs = cost_calculator.calculate_costs(
                            total_distance,
                            vehicle_type,
                            fuel_efficiency,
                            fuel_price,
                            energy_efficiency,
                            electricity_price,
                            include_tolls,
                            include_caz,
                            caz_exempt,
                            combined_coords
                        )

                        fuel_cost = costs['fuel_cost']
                        fuel_litres = costs['fuel_litres']
                        toll_cost = costs['toll_cost']
                        caz_cost = costs['caz_cost']
                        energy_cost = fuel_cost if vehicle_type == 'electric' else 0.0

                        # Score hazards on combined route
                        hazard_penalty, hazard_count = score_route_by_hazards(combined_coords, hazards)
                        hazards_on_route = get_hazards_on_route(combined_coords, hazards)

                        logger.info(f"[HAZARDS] Segmented route scoring complete: total_penalty={hazard_penalty}s, hazard_count={hazard_count}")

                        # Build combined route response - include camera-avoiding route + alternatives
                        logger.info(f"[VALHALLA] Combined route has {len(all_maneuvers)} maneuvers from all segments")
                        routes = [{
                            'name': 'Camera Avoiding Route',
                            'distance_km': total_distance,
                            'duration_minutes': total_duration / 60,
                            'geometry': combined_geometry,
                            'fuel_cost': fuel_cost,
                            'fuel_litres': fuel_litres,
                            'toll_cost': toll_cost,
                            'caz_cost': caz_cost,
                            'energy_cost': energy_cost,
                            'total_cost': fuel_cost + toll_cost + caz_cost + energy_cost,
                            'hazard_penalty_seconds': hazard_penalty,
                            'hazard_count': hazard_count,
                            'hazards': hazards_on_route,
                            'maneuvers': all_maneuvers
                        }]

                        # Add alternative routes from baseline (may have cameras but different paths)
                        if alternative_routes:
                            routes.extend(alternative_routes)
                            logger.info(f"[VALHALLA] Added {len(alternative_routes)} alternative routes to response")

                        # Sort all routes by hazard count (fewest first)
                        routes = sorted(routes, key=lambda r: (r.get('hazard_count', 0), r.get('duration_minutes', 0)))

                        response_data = {
                            'success': True,
                            'routes': routes,
                            'source': f'Valhalla ✅ ({num_segments}-Segment)',
                            'routing_mode': routing_mode,
                            'vehicle_type': vehicle_type,
                            'hazard_avoidance_enabled': enable_hazard_avoidance,
                            # Top-level fields for frontend compatibility
                            'geometry': combined_geometry,
                            'distance': f'{total_distance:.2f} km',
                            'time': f'{int(total_duration // 60)} min',
                            'fuel_cost': fuel_cost,
                            'fuel_litres': fuel_litres,
                            'toll_cost': toll_cost,
                            'caz_cost': caz_cost,
                            'energy_cost': energy_cost,
                            'hazards': hazards_on_route,
                            'hazard_count': hazard_count
                        }

                        # Cache the route
                        route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance)
                        print(f"[CACHE] STORED: Segmented route cached in memory")

                        cost_calculator.cache_route_to_db(
                            start_lat, start_lon, end_lat, end_lon,
                            routing_mode, vehicle_type,
                            routes[0],  # route_data
                            f'Valhalla ({num_segments}-Segment)'  # source
                        )
                        print(f"[CACHE] STORED: Segmented route cached in database")

                        logger.info(f"[VALHALLA] Segmented routing complete: {hazard_count} hazards, {total_distance:.2f}km")
                        print(f"[Valhalla] SEGMENTED SUCCESS: {num_segments} segments, {hazard_count} hazards")

                        return jsonify(response_data)

                except Exception as e:
                    logger.error(f"[VALHALLA] Segmented routing failed: {e}")
                    import traceback
                    logger.error(f"[VALHALLA] Traceback: {traceback.format_exc()}")
                    use_segmented_routing = False

            # Build request payload (standard 2-point routing)
            payload = {
                "locations": route_locations if has_waypoints else [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": valhalla_costing,
                "alternates": 3 if (valhalla_costing == 'auto' and not has_waypoints) else 0,
                "directions_options": {"generalize": 0}
            }

            if valhalla_costing == 'pedestrian':
                payload["costing_options"] = {"pedestrian": {"walking_speed": 5.1, "use_ferry": not avoid_ferries}}
            elif valhalla_costing == 'bicycle':
                payload["costing_options"] = {"bicycle": {"cycling_speed": 18, "use_bike_lanes": True, "use_ferry": not avoid_ferries}}
            elif valhalla_costing in ('auto', 'auto_shorter'):
                auto_opts = {}
                if avoid_tolls:
                    auto_opts["use_tolls"] = 0
                if avoid_motorways:
                    auto_opts["use_highways"] = 0
                if avoid_ferries:
                    auto_opts["use_ferry"] = 0
                if auto_opts:
                    payload["costing_options"] = {valhalla_costing: auto_opts}
                    logger.info(f"[VALHALLA] Avoidance options: tolls={avoid_tolls}, motorways={avoid_motorways}, ferries={avoid_ferries}")

            # Traffic-aware routing: use departure time for time-dependent routing
            if valhalla_costing == 'auto':
                if departure_time:
                    payload["date_time"] = {"type": 1, "value": departure_time}
                    logger.info(f"[VALHALLA] Time-dependent routing with departure: {departure_time}")
                else:
                    from datetime import datetime as dt_now
                    now_str = dt_now.now().strftime('%Y-%m-%dT%H:%M')
                    payload["date_time"] = {"type": 1, "value": now_str}
                    logger.info(f"[VALHALLA] Time-dependent routing with current time: {now_str}")

            if exclude_locations:
                payload["exclude_locations"] = exclude_locations
                logger.debug(f"[VALHALLA] Added {len(exclude_locations)} exclude_locations to request")

            # Calculate distance to determine appropriate timeout
            # Longer routes need more time (Valhalla can take 30+ seconds for 500+ km routes)
            straight_line_km = ((end_lat - start_lat)**2 + (end_lon - start_lon)**2)**0.5 * 111  # ~111 km per degree
            # PHASE 4 OPTIMIZATION: Reduce timeout to max 10s to fit within Gateway limits
            route_timeout = max(5, min(10, int(3 + straight_line_km / 100)))  # 5-10 seconds cap

            print(f"[Valhalla] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
            print(f"[Valhalla] URL: {url}")
            print(f"[Valhalla] Hazard avoidance: {enable_hazard_avoidance}, Locations: {len(exclude_locations) if exclude_locations else 0}")
            try:
                print(f"[Valhalla] Estimated distance: {straight_line_km:.0f} km, Timeout: {route_timeout}s")
                response = requests.post(url, json=payload, timeout=route_timeout, headers=headers)
                print(f"[Valhalla] Response status: {response.status_code}", flush=True)
            except requests.exceptions.Timeout:
                print(f"[Valhalla] Request timed out after {route_timeout}s")
                return jsonify({'error': 'Route calculation timed out. Try a shorter route or moving start/end points closer.'}), 408
            except requests.exceptions.RequestException as e:
                print(f"[Valhalla] Request failed: {e}")
                valhalla_error = f"Routing service unreachable: {str(e)}"
                response = None
            if response and response.status_code != 200:
                print(f"[Valhalla] Response body: {response.text[:500]}", flush=True)

            if response and response.status_code == 200:
                route_data = response.json()
                print(f"[Valhalla] Response keys: {route_data.keys()}", flush=True)

                # DEBUG: Check for error in response
                if 'error' in route_data:
                    print(f"[Valhalla] ERROR in response: {route_data['error']}", flush=True)
                    valhalla_error = f"Valhalla returned error: {route_data['error']}"
                elif 'trip' not in route_data:
                    print(f"[Valhalla] ERROR: No 'trip' key in response. Keys: {list(route_data.keys())}", flush=True)
                    print(f"[Valhalla] Full response: {json.dumps(route_data, indent=2)[:1000]}", flush=True)
                    valhalla_error = "Valhalla response missing 'trip' key"

                if 'trip' in route_data and 'legs' in route_data['trip']:
                    # Extract all available routes
                    routes = []

                    # Main route
                    # NOTE: Valhalla returns distance in kilometers, not meters!
                    distance = route_data['trip']['summary']['length']
                    duration_seconds = route_data['trip']['summary']['time']
                    distance_km = distance  # Already in km, don't divide by 1000
                    base_time_minutes = duration_seconds / 60

                    # Extract route geometry
                    route_geometry = None
                    if 'legs' in route_data['trip']:
                        for leg in route_data['trip']['legs']:
                            if 'shape' in leg:
                                route_geometry = leg['shape']
                                break

                    # ================================================================
                    # TRAFFIC-ADJUSTED ETA: Apply only for auto (car) mode
                    # Walking/cycling times should not be adjusted by road traffic
                    # ================================================================
                    if valhalla_costing == 'auto':
                        traffic_multiplier, traffic_level = get_traffic_duration_multiplier(start_lat, start_lon)
                        time_minutes = base_time_minutes * traffic_multiplier
                        logger.info(f"[ETA] Base: {base_time_minutes:.0f}min, Traffic: {traffic_level} ({traffic_multiplier:.2f}x), Adjusted: {time_minutes:.0f}min")
                    else:
                        traffic_multiplier, traffic_level = 1.0, 'N/A'
                        time_minutes = base_time_minutes
                        logger.info(f"[ETA] {valhalla_costing}: {base_time_minutes:.0f} min (no traffic adjustment)")

                    # ================================================================
                    # PHASE 3 OPTIMIZATION: Use cost calculator with route coordinates
                    # ================================================================
                    # Valhalla returns shape as encoded polyline string
                    route_coords = decode_route_geometry(route_geometry, precision=6)

                    costs = cost_calculator.calculate_costs(
                        distance_km, vehicle_type, fuel_efficiency, fuel_price,
                        energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                        route_coords=route_coords
                    )
                    fuel_cost = costs['fuel_cost']
                    fuel_litres = costs['fuel_litres']
                    toll_cost = costs['toll_cost']
                    caz_cost = costs['caz_cost']
                    caz_details = costs.get('caz_details', {})

                    # Score route by hazards (always score, regardless of avoidance setting)
                    hazard_penalty = 0
                    hazard_count = 0
                    hazards_list = []
                    if hazards:
                        hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
                        hazards_list = get_hazards_on_route(route_geometry, hazards)
                        logger.info(f"[HAZARDS] Valhalla main route: penalty={hazard_penalty:.0f}s, count={hazard_count}, hazards_list={len(hazards_list)}")

                    # Extract turn-by-turn maneuvers from Valhalla response
                    maneuvers = []
                    if 'legs' in route_data['trip']:
                        for leg in route_data['trip']['legs']:
                            if 'maneuvers' in leg:
                                for maneuver in leg['maneuvers']:
                                    m_data = {
                                        'instruction': maneuver.get('instruction', ''),
                                        'verbal_pre_transition_instruction': maneuver.get('verbal_pre_transition_instruction', ''),
                                        'distance': maneuver.get('length', 0),  # km
                                        'time': maneuver.get('time', 0),  # seconds
                                        'type': maneuver.get('type', 0),
                                        'street_name': maneuver.get('street_names', [''])[0] if maneuver.get('street_names') else '',
                                        'begin_street_names': maneuver.get('begin_street_names', []),
                                        'begin_shape_index': maneuver.get('begin_shape_index', 0),
                                        'end_shape_index': maneuver.get('end_shape_index', 0),
                                        'speed_limit': maneuver.get('speed_limit', None),
                                    }
                                    if maneuver.get('type') == 26:
                                        m_data['roundabout_exit_count'] = maneuver.get('roundabout_exit_count', 0)
                                    maneuvers.append(m_data)
                    logger.info(f"[VALHALLA] Extracted {len(maneuvers)} maneuvers from route")

                    routes.append({
                        'id': 1,
                        'name': 'Fastest',
                        'distance_km': round(distance_km, 2),
                        'duration_minutes': round(time_minutes, 0),
                        'base_duration_minutes': round(base_time_minutes, 0),  # Original Valhalla estimate
                        'traffic_multiplier': round(traffic_multiplier, 2),
                        'traffic_level': traffic_level,
                        'fuel_cost': round(fuel_cost, 2),
                        'fuel_litres': round(fuel_litres, 2),
                        'toll_cost': round(toll_cost, 2),
                        'caz_cost': round(caz_cost, 2),
                        'caz_details': caz_details,
                        'geometry': route_geometry,
                        'geometry_precision': 6,
                        'hazard_penalty_seconds': round(hazard_penalty, 0),
                        'hazard_count': hazard_count,
                        'hazards': hazards_list,
                        'maneuvers': maneuvers,
                        'source': 'Valhalla',
                    })

                    # Alternative routes (if available) - Valhalla uses 'alternates' not 'alternatives'
                    if 'alternates' in route_data:
                        for idx, alt_route in enumerate(route_data['alternates'][:3]):
                            if 'trip' in alt_route and 'summary' in alt_route['trip']:
                                alt_distance = alt_route['trip']['summary']['length']
                                alt_duration_seconds = alt_route['trip']['summary']['time']
                                # NOTE: Valhalla returns distance in kilometers, not meters!
                                alt_distance_km = alt_distance  # Already in km, don't divide by 1000
                                alt_base_time_minutes = alt_duration_seconds / 60
                                # Apply same traffic multiplier to alternative routes
                                alt_time_minutes = alt_base_time_minutes * traffic_multiplier

                                # Extract geometry AND maneuvers from alternative routes
                                alt_geometry = None
                                alt_maneuvers = []
                                if 'legs' in alt_route['trip']:
                                    for leg in alt_route['trip']['legs']:
                                        if 'shape' in leg and alt_geometry is None:
                                            alt_geometry = leg['shape']
                                        # Extract maneuvers for this alternative route
                                        if 'maneuvers' in leg:
                                            for m in leg['maneuvers']:
                                                alt_maneuvers.append({
                                                    'instruction': m.get('instruction', ''),
                                                    'verbal_pre_transition_instruction': m.get('verbal_pre_transition_instruction', ''),
                                                    'distance': m.get('length', 0),  # km
                                                    'time': m.get('time', 0),  # seconds
                                                    'type': m.get('type', 0),
                                                    'street_names': m.get('street_names', []),
                                                    'begin_street_names': m.get('begin_street_names', []),
                                                    'begin_shape_index': m.get('begin_shape_index', 0),
                                                    'end_shape_index': m.get('end_shape_index', 0)
                                                })
                                logger.info(f"[VALHALLA] Alt route {idx+1}: Extracted {len(alt_maneuvers)} maneuvers")

                                # ================================================================
                                # PHASE 3 OPTIMIZATION: Use cost calculator with route coordinates
                                # ================================================================
                                # Decode alternative route geometry
                                alt_route_coords = decode_route_geometry(alt_geometry, precision=6)

                                alt_costs = cost_calculator.calculate_costs(
                                    alt_distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                    route_coords=alt_route_coords
                                )
                                alt_fuel_cost = alt_costs['fuel_cost']
                                alt_fuel_litres = alt_costs['fuel_litres']
                                alt_toll_cost = alt_costs['toll_cost']
                                alt_caz_cost = alt_costs['caz_cost']

                                # Score alternative route by hazards (always score, regardless of avoidance setting)
                                alt_hazard_penalty = 0
                                alt_hazard_count = 0
                                alt_hazards_list = []
                                if hazards:
                                    alt_hazard_penalty, alt_hazard_count = score_route_by_hazards(alt_geometry, hazards)
                                    alt_hazards_list = get_hazards_on_route(alt_geometry, hazards)
                                    logger.info(f"[HAZARDS] Valhalla alt route {idx+1}: penalty={alt_hazard_penalty:.0f}s, count={alt_hazard_count}, hazards_list={len(alt_hazards_list)}")

                                route_names = ['Shortest', 'Balanced', 'Alternative']
                                routes.append({
                                    'id': idx + 2,
                                    'name': route_names[idx] if idx < len(route_names) else f'Alternative {idx}',
                                    'distance_km': round(alt_distance_km, 2),
                                    'duration_minutes': round(alt_time_minutes, 0),
                                    'fuel_cost': round(alt_fuel_cost, 2),
                                    'fuel_litres': round(alt_fuel_litres, 2),
                                    'toll_cost': round(alt_toll_cost, 2),
                                    'caz_cost': round(alt_caz_cost, 2),
                                    'geometry': alt_geometry,
                                    'geometry_precision': 6,
                                    'hazard_penalty_seconds': round(alt_hazard_penalty, 0),
                                    'hazard_count': alt_hazard_count,
                                    'hazards': alt_hazards_list,
                                    'maneuvers': alt_maneuvers,
                                    'source': 'Valhalla',
                                })

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
                        def build_std_route_entry(name, geometry, distance_km, duration_sec, route_id, valhalla_data=None):
                            coords = polyline.decode(geometry, precision=6)
                            penalty, haz_count = score_route_by_hazards(coords, hazards)
                            hazards_list = get_hazards_on_route(coords, hazards)
                            costs = cost_calculator.calculate_costs(
                                distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                route_coords=coords
                            )

                            # Extract maneuvers from Valhalla response if available
                            route_maneuvers = []
                            if valhalla_data and 'trip' in valhalla_data and 'legs' in valhalla_data['trip']:
                                for leg in valhalla_data['trip']['legs']:
                                    if 'maneuvers' in leg:
                                        for m in leg['maneuvers']:
                                            route_maneuvers.append({
                                                'instruction': m.get('instruction', ''),
                                                'type': m.get('type', 0),
                                                'distance': m.get('length', 0) * 1000,  # km to m
                                                'time': m.get('time', 0),
                                                'lat': m.get('begin_shape_index', 0),
                                                'lon': m.get('end_shape_index', 0),
                                                'street_names': m.get('street_names', []),
                                                'begin_street_names': m.get('begin_street_names', []),
                                                'begin_shape_index': m.get('begin_shape_index', 0),
                                                'end_shape_index': m.get('end_shape_index', 0)
                                            })

                            return {
                                'id': route_id,
                                'name': name,
                                'distance_km': round(distance_km, 2),
                                'duration_minutes': round(duration_sec / 60, 0),
                                'fuel_cost': round(costs['fuel_cost'], 2),
                                'fuel_litres': round(costs['fuel_litres'], 2),
                                'toll_cost': round(costs['toll_cost'], 2),
                                'caz_cost': round(costs['caz_cost'], 2),
                                'geometry': geometry,
                                'geometry_precision': 6,
                                'hazard_penalty_seconds': round(penalty, 0),
                                'hazard_count': haz_count,
                                'hazards': hazards_list,
                                'maneuvers': route_maneuvers,
                                'source': 'Valhalla',
                            }

                        next_route_id = len(routes) + 1

                        # Route: Shortest Distance (auto_shorter costing)
                        try:
                            shortest_payload = {
                                "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                                "costing": "auto_shorter",
                                "directions_options": {"generalize": 0}
                            }
                            if alt_exclude:
                                shortest_payload["exclude_locations"] = alt_exclude
                            sh_response = requests.post(url, json=shortest_payload, timeout=10, headers=headers)
                            if sh_response.status_code == 200:
                                sh_data = sh_response.json()
                                if 'trip' in sh_data and 'legs' in sh_data['trip']:
                                    sh_geom = sh_data['trip']['legs'][0]['shape']
                                    sh_dist = sh_data['trip']['summary']['length']
                                    sh_time = sh_data['trip']['summary']['time']
                                    routes.append(build_std_route_entry('📏 Shortest', sh_geom, sh_dist, sh_time, next_route_id, sh_data))
                                    next_route_id += 1
                                    logger.info(f"[VALHALLA] Added Shortest route: {sh_dist:.1f}km")
                        except Exception as e:
                            logger.warning(f"[VALHALLA] Shortest route failed: {e}")

                        # Route: Optimised Discovery (aggressive camera avoidance)
                        try:
                            if route_geometry:
                                baseline_coords = polyline.decode(route_geometry, precision=6)
                                baseline_cameras = []
                                for hazard in alt_exclude[:30]:
                                    for coord in baseline_coords[::10]:
                                        dist = ((hazard['lat'] - coord[0])**2 + (hazard['lon'] - coord[1])**2)**0.5
                                        if dist < 0.001:
                                            baseline_cameras.append(hazard)
                                            break

                                if baseline_cameras:
                                    disc_payload = {
                                        "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                                        "costing": "auto",
                                        "exclude_locations": baseline_cameras[:50],
                                        "directions_options": {"generalize": 0}
                                    }
                                    disc_response = requests.post(url, json=disc_payload, timeout=10, headers=headers)
                                    if disc_response.status_code == 200:
                                        disc_data = disc_response.json()
                                        if 'trip' in disc_data and 'legs' in disc_data['trip']:
                                            disc_geom = disc_data['trip']['legs'][0]['shape']
                                            disc_dist = disc_data['trip']['summary']['length']
                                            disc_time = disc_data['trip']['summary']['time']
                                            route_entry = build_std_route_entry('⚡ Optimised', disc_geom, disc_dist, disc_time, next_route_id, disc_data)
                                            if route_entry['hazard_count'] < hazard_count:
                                                routes.append(route_entry)
                                                logger.info(f"[VALHALLA] Added Optimised route: {disc_dist:.1f}km, {route_entry['hazard_count']} cameras")
                        except Exception as e:
                            logger.warning(f"[VALHALLA] Optimised route failed: {e}")

                        logger.info(f"[VALHALLA] Final route count: {len(routes)}")

                    print(f"[Valhalla] SUCCESS: {len(routes)} routes found")

                    # ================================================================
                    # GRAPHHOPPER CAMERA-AVOIDING ROUTE: Add as priority option
                    # ================================================================
                    if graphhopper_route and graphhopper_route.get('success') and enable_hazard_avoidance:
                        try:
                            gh_distance_km = graphhopper_route.get('distance_km', 0)
                            gh_duration_min = graphhopper_route.get('duration_seconds', 0) / 60
                            gh_geometry = graphhopper_route.get('geometry', '')

                            # GraphHopper uses precision 5
                            if gh_geometry and polyline:
                                gh_coords = polyline.decode(gh_geometry, precision=5)
                                # Re-encode with precision 6 for consistency with Valhalla
                                gh_geometry_p6 = polyline.encode(gh_coords, precision=6)

                                # Calculate costs for GraphHopper route
                                gh_costs = cost_calculator.calculate_costs(
                                    gh_distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                    route_coords=gh_coords
                                )

                                # Score for hazards (should be very low since GraphHopper avoided them)
                                gh_hazard_penalty, gh_hazard_count = score_route_by_hazards(gh_coords, hazards)
                                gh_hazards_list = get_hazards_on_route(gh_coords, hazards)

                                # Apply traffic multiplier
                                gh_duration_min = gh_duration_min * traffic_multiplier

                                # Convert GraphHopper instructions to Valhalla-compatible maneuvers
                                gh_instructions = graphhopper_route.get('instructions', [])
                                gh_maneuvers = []

                                # GraphHopper sign values to Valhalla type mapping
                                # GraphHopper signs: -3=sharp left, -2=left, -1=slight left, 0=straight,
                                #                   1=slight right, 2=right, 3=sharp right, 4=finish,
                                #                   5=via, 6=roundabout
                                gh_sign_to_valhalla = {
                                    -3: 15,  # Sharp left -> Valhalla sharp left (15)
                                    -2: 16,  # Left -> Valhalla left (16)
                                    -1: 17,  # Slight left -> Valhalla slight left (17)
                                    0: 8,    # Straight -> Valhalla continue (8)
                                    1: 9,    # Slight right -> Valhalla slight right (9)
                                    2: 10,   # Right -> Valhalla right (10)
                                    3: 11,   # Sharp right -> Valhalla sharp right (11)
                                    4: 4,    # Finish -> Valhalla destination (4)
                                    5: 0,    # Via -> Valhalla none (0)
                                    6: 26,   # Roundabout -> Valhalla enter roundabout (26)
                                }

                                for instr in gh_instructions:
                                    sign = instr.get('sign', 0)
                                    valhalla_type = gh_sign_to_valhalla.get(sign, 8)  # Default to continue

                                    gh_maneuvers.append({
                                        'instruction': instr.get('text', ''),
                                        'distance': instr.get('distance', 0) / 1000,  # meters to km
                                        'time': instr.get('time', 0) / 1000,  # ms to seconds
                                        'type': valhalla_type,
                                        'street_names': [instr.get('street_name', '')] if instr.get('street_name') else [],
                                        'begin_shape_index': instr.get('interval', [0])[0] if instr.get('interval') else 0,
                                        'end_shape_index': instr.get('interval', [0, 0])[1] if instr.get('interval') and len(instr.get('interval', [])) > 1 else 0
                                    })

                                logger.info(f"[GRAPHHOPPER] Converted {len(gh_maneuvers)} instructions to maneuvers")

                                gh_route_entry = {
                                    'id': 0,  # Will be renumbered
                                    'name': '⚡ Optimised',
                                    'distance_km': round(gh_distance_km, 2),
                                    'duration_minutes': round(gh_duration_min, 0),
                                    'fuel_cost': round(gh_costs['fuel_cost'], 2),
                                    'fuel_litres': round(gh_costs['fuel_litres'], 2),
                                    'toll_cost': round(gh_costs['toll_cost'], 2),
                                    'caz_cost': round(gh_costs['caz_cost'], 2),
                                    'geometry': gh_geometry_p6,
                                    'geometry_precision': 6,
                                    'hazard_penalty_seconds': round(gh_hazard_penalty, 0),
                                    'hazard_count': gh_hazard_count,
                                    'hazards': gh_hazards_list,
                                    'maneuvers': gh_maneuvers,
                                    'source': 'GraphHopper'
                                }

                                # Remove any existing Valhalla "Optimised" route to avoid duplicates
                                # GraphHopper's camera avoidance is superior (uses pre-loaded area polygons)
                                routes = [r for r in routes if 'Optimised' not in r.get('name', '')]

                                # Insert at the beginning as the optimised option
                                routes.insert(0, gh_route_entry)
                                logger.info(f"[GRAPHHOPPER] Added Optimised route (replaced Valhalla Optimised): {gh_distance_km:.1f}km, {gh_hazard_count} cameras")
                        except Exception as e:
                            logger.warning(f"[GRAPHHOPPER] Failed to add GraphHopper route: {e}")

                    # ================================================================
                    # HAZARD AVOIDANCE: Reorder routes by hazard penalty if enabled
                    # ================================================================
                    if enable_hazard_avoidance and hazards:
                        # Sort routes by hazard penalty (ascending - fewer hazards first)
                        routes_sorted = sorted(routes, key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)))
                        print(f"[HAZARDS] Routes reordered by hazard penalty:")
                        for idx, route in enumerate(routes_sorted):
                            print(f"  Route {idx+1}: {route['name']} - Hazard penalty: {route.get('hazard_penalty_seconds', 0):.0f}s, Count: {route.get('hazard_count', 0)}")
                        routes = routes_sorted

                        # Renumber route IDs
                        for idx, route in enumerate(routes):
                            route['id'] = idx + 1

                    # ================================================================
                    # PHASE 5: Record success in fallback chain optimizer
                    # ================================================================
                    valhalla_elapsed = (time.time() - valhalla_start_time) * 1000
                    fallback_optimizer.record_success('valhalla', valhalla_elapsed)

                    # ================================================================
                    # PHASE 3 OPTIMIZATION: Cache the successful route
                    # ================================================================
                    # Add total stop time to duration if stops exist
                    total_duration_with_stops = routes[0]["duration_minutes"] + total_stop_time

                    # Determine source based on what was used
                    routing_source = 'Valhalla ✅'
                    if graphhopper_route and graphhopper_route.get('success'):
                        routing_source = 'GraphHopper+Valhalla ✅'

                    response_data = {
                        'success': True,
                        'routes': routes,
                        'source': routing_source,
                        'distance': f'{routes[0]["distance_km"]:.2f} km',
                        'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                        'total_time_with_stops': f'{total_duration_with_stops:.0f} minutes',
                        'total_stop_time': total_stop_time,
                        'via_points_count': len(via_points),
                        'stops_count': len(stops),
                        'geometry': routes[0]['geometry'],
                        'geometry_precision': routes[0].get('geometry_precision', 6),
                        'fuel_cost': routes[0]['fuel_cost'],
                        'fuel_litres': routes[0].get('fuel_litres', 0),
                        'toll_cost': routes[0]['toll_cost'],
                        'caz_cost': routes[0]['caz_cost'],
                        'caz_details': routes[0].get('caz_details', {}),
                        'maneuvers': routes[0].get('maneuvers', []),
                        'cached': False,
                        'camera_avoidance_engine': 'GraphHopper' if (graphhopper_route and graphhopper_route.get('success')) else 'Valhalla',
                        'start_lat': start_lat,
                        'start_lon': start_lon,
                        'end_lat': end_lat,
                        'end_lon': end_lon
                    }

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
                    print(f"[CACHE] STORED: Route cached in database")

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

                        # Build retry payload (use same costing as initial request)
                        retry_payload = {
                            "locations": [
                                {"lat": start_lat, "lon": start_lon},
                                {"lat": end_lat, "lon": end_lon}
                            ],
                            "costing": valhalla_costing,
                            "alternates": 3 if valhalla_costing == 'auto' else 0,
                            "exclude_locations": retry_locations,
                            "directions_options": {"generalize": 0}
                        }
                        if valhalla_costing == 'pedestrian':
                            retry_payload["costing_options"] = {"pedestrian": {"walking_speed": 5.1, "use_ferry": not avoid_ferries}}
                        elif valhalla_costing == 'bicycle':
                            retry_payload["costing_options"] = {"bicycle": {"cycling_speed": 18, "use_bike_lanes": True, "use_ferry": not avoid_ferries}}
                        elif valhalla_costing in ('auto', 'auto_shorter'):
                            auto_opts = {}
                            if avoid_tolls:
                                auto_opts["use_tolls"] = 0
                            if avoid_motorways:
                                auto_opts["use_highways"] = 0
                            if avoid_ferries:
                                auto_opts["use_ferry"] = 0
                            if auto_opts:
                                retry_payload["costing_options"] = {valhalla_costing: auto_opts}

                        retry_response = requests.post(url, json=retry_payload, timeout=10, headers=headers)

                        if retry_response.status_code == 200:
                            retry_data = retry_response.json()
                            if 'trip' in retry_data and 'legs' in retry_data['trip']:
                                logger.info(f"[VALHALLA] RETRY SUCCESS with {retry_limit} exclusions!")
                                print(f"[Valhalla] RETRY SUCCESS: Route found with {retry_limit} exclusions")

                                # Process the retry response (same as initial success)
                                routes = []

                                # Extract main route data
                                distance = retry_data['trip']['summary']['length']
                                duration_seconds = retry_data['trip']['summary']['time']
                                distance_km = distance  # Valhalla returns km
                                time_minutes = duration_seconds / 60

                                # Extract geometry
                                route_geometry = None
                                if 'legs' in retry_data['trip']:
                                    for leg in retry_data['trip']['legs']:
                                        if 'shape' in leg:
                                            route_geometry = leg['shape']
                                            break

                                # Decode route geometry
                                route_coords = decode_route_geometry(route_geometry, precision=6)

                                # Calculate costs
                                costs = cost_calculator.calculate_costs(
                                    distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                    route_coords=route_coords
                                )
                                fuel_cost = costs['fuel_cost']
                                fuel_litres = costs['fuel_litres']
                                toll_cost = costs['toll_cost']
                                caz_cost = costs['caz_cost']

                                # Score route by hazards
                                hazard_penalty = 0
                                hazard_count = 0
                                hazards_list = []
                                if hazards:
                                    hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
                                    hazards_list = get_hazards_on_route(route_geometry, hazards)
                                    logger.info(f"[HAZARDS] Valhalla retry route: penalty={hazard_penalty:.0f}s, count={hazard_count}, hazards_list={len(hazards_list)}")

                                # Extract maneuvers from retry response
                                retry_maneuvers = []
                                if 'trip' in retry_data and 'legs' in retry_data['trip']:
                                    for leg in retry_data['trip']['legs']:
                                        if 'maneuvers' in leg:
                                            for m in leg['maneuvers']:
                                                retry_maneuvers.append({
                                                    'instruction': m.get('instruction', ''),
                                                    'type': m.get('type', 0),
                                                    'distance': m.get('length', 0) * 1000,  # km to m
                                                    'time': m.get('time', 0),
                                                    'street_names': m.get('street_names', []),
                                                    'begin_shape_index': m.get('begin_shape_index', 0),
                                                    'end_shape_index': m.get('end_shape_index', 0)
                                                })
                                logger.info(f"[VALHALLA] Retry route has {len(retry_maneuvers)} maneuvers")

                                routes.append({
                                    'id': 1,
                                    'name': 'Fastest',
                                    'distance_km': round(distance_km, 2),
                                    'duration_minutes': round(time_minutes, 0),
                                    'fuel_cost': round(fuel_cost, 2),
                                    'fuel_litres': round(fuel_litres, 2),
                                    'toll_cost': round(toll_cost, 2),
                                    'caz_cost': round(caz_cost, 2),
                                    'geometry': route_geometry,
                                    'geometry_precision': 6,
                                    'hazard_penalty_seconds': round(hazard_penalty, 0),
                                    'hazard_count': hazard_count,
                                    'hazards': hazards_list,
                                    'maneuvers': retry_maneuvers,
                                    'source': 'Valhalla',
                                })

                                # Also request Shortest route with same reduced exclusions
                                try:
                                    shortest_payload = {
                                        "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                                        "costing": "auto_shorter",
                                        "directions_options": {"generalize": 0}
                                    }
                                    if retry_locations:
                                        shortest_payload["exclude_locations"] = retry_locations
                                    logger.info(f"[VALHALLA] Retry: Requesting Shortest route with {len(retry_locations)} exclusions")
                                    sh_response = requests.post(url, json=shortest_payload, timeout=10, headers=headers)
                                    if sh_response.status_code == 200:
                                        sh_data = sh_response.json()
                                        if 'trip' in sh_data and 'legs' in sh_data['trip']:
                                            sh_geom = sh_data['trip']['legs'][0]['shape']
                                            sh_dist = sh_data['trip']['summary']['length']
                                            sh_time = sh_data['trip']['summary']['time']
                                            sh_coords = decode_route_geometry(sh_geom, precision=6)
                                            sh_costs = cost_calculator.calculate_costs(
                                                sh_dist, vehicle_type, fuel_efficiency, fuel_price,
                                                energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                                route_coords=sh_coords
                                            )
                                            sh_hazard_penalty, sh_hazard_count = score_route_by_hazards(sh_geom, hazards) if hazards else (0, 0)
                                            sh_hazards_list = get_hazards_on_route(sh_geom, hazards) if hazards else []
                                            # Extract maneuvers for shortest route
                                            sh_maneuvers = []
                                            for leg in sh_data['trip']['legs']:
                                                if 'maneuvers' in leg:
                                                    for m in leg['maneuvers']:
                                                        sh_maneuvers.append({
                                                            'instruction': m.get('instruction', ''),
                                                            'type': m.get('type', 0),
                                                            'distance': m.get('length', 0) * 1000,
                                                            'time': m.get('time', 0),
                                                            'street_names': m.get('street_names', []),
                                                            'begin_shape_index': m.get('begin_shape_index', 0),
                                                            'end_shape_index': m.get('end_shape_index', 0)
                                                        })
                                            routes.append({
                                                'id': 2,
                                                'name': '📏 Shortest',
                                                'distance_km': round(sh_dist, 2),
                                                'duration_minutes': round(sh_time / 60, 0),
                                                'fuel_cost': round(sh_costs['fuel_cost'], 2),
                                                'fuel_litres': round(sh_costs['fuel_litres'], 2),
                                                'toll_cost': round(sh_costs['toll_cost'], 2),
                                                'caz_cost': round(sh_costs['caz_cost'], 2),
                                                'geometry': sh_geom,
                                                'geometry_precision': 6,
                                                'hazard_penalty_seconds': round(sh_hazard_penalty, 0),
                                                'hazard_count': sh_hazard_count,
                                                'hazards': sh_hazards_list,
                                                'maneuvers': sh_maneuvers,
                                                'source': 'Valhalla',
                                            })
                                            logger.info(f"[VALHALLA] Retry: Added Shortest route: {sh_dist:.1f}km")
                                except Exception as e:
                                    logger.warning(f"[VALHALLA] Retry Shortest route failed: {e}")

                                # ================================================================
                                # GRAPHHOPPER CAMERA-AVOIDING ROUTE: Add to retry routes
                                # (Same logic as the primary success path)
                                # ================================================================
                                if graphhopper_route and graphhopper_route.get('success') and enable_hazard_avoidance:
                                    try:
                                        gh_distance_km = graphhopper_route.get('distance_km', 0)
                                        gh_duration_min = graphhopper_route.get('duration_seconds', 0) / 60
                                        gh_geometry = graphhopper_route.get('geometry', '')

                                        if gh_geometry and polyline:
                                            gh_coords = polyline.decode(gh_geometry, precision=5)
                                            gh_geometry_p6 = polyline.encode(gh_coords, precision=6)

                                            gh_costs = cost_calculator.calculate_costs(
                                                gh_distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                                energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                                route_coords=gh_coords
                                            )

                                            gh_hazard_penalty, gh_hazard_count = score_route_by_hazards(gh_coords, hazards)
                                            gh_hazards_list = get_hazards_on_route(gh_coords, hazards)

                                            gh_instructions = graphhopper_route.get('instructions', [])
                                            gh_sign_to_valhalla = {
                                                -3: 15, -2: 16, -1: 17, 0: 8,
                                                1: 9, 2: 10, 3: 11, 4: 4, 5: 0, 6: 26,
                                            }
                                            gh_maneuvers = []
                                            for instr in gh_instructions:
                                                sign = instr.get('sign', 0)
                                                valhalla_type = gh_sign_to_valhalla.get(sign, 8)
                                                gh_maneuvers.append({
                                                    'instruction': instr.get('text', ''),
                                                    'distance': instr.get('distance', 0) / 1000,
                                                    'time': instr.get('time', 0) / 1000,
                                                    'type': valhalla_type,
                                                    'street_names': [instr.get('street_name', '')] if instr.get('street_name') else [],
                                                    'begin_shape_index': instr.get('interval', [0])[0] if instr.get('interval') else 0,
                                                    'end_shape_index': instr.get('interval', [0, 0])[1] if instr.get('interval') and len(instr.get('interval', [])) > 1 else 0
                                                })

                                            gh_route_entry = {
                                                'id': 0,
                                                'name': '⚡ Optimised',
                                                'distance_km': round(gh_distance_km, 2),
                                                'duration_minutes': round(gh_duration_min, 0),
                                                'fuel_cost': round(gh_costs['fuel_cost'], 2),
                                                'fuel_litres': round(gh_costs['fuel_litres'], 2),
                                                'toll_cost': round(gh_costs['toll_cost'], 2),
                                                'caz_cost': round(gh_costs['caz_cost'], 2),
                                                'geometry': gh_geometry_p6,
                                                'geometry_precision': 6,
                                                'hazard_penalty_seconds': round(gh_hazard_penalty, 0),
                                                'hazard_count': gh_hazard_count,
                                                'hazards': gh_hazards_list,
                                                'maneuvers': gh_maneuvers,
                                                'source': 'GraphHopper'
                                            }

                                            routes = [r for r in routes if 'Optimised' not in r.get('name', '')]
                                            routes.insert(0, gh_route_entry)
                                            logger.info(f"[GRAPHHOPPER] Added Optimised route to retry: {gh_distance_km:.1f}km, {gh_hazard_count} cameras")
                                    except Exception as e:
                                        logger.warning(f"[GRAPHHOPPER] Failed to add GraphHopper route to retry: {e}")

                                # Reorder by hazard penalty if avoidance enabled
                                if enable_hazard_avoidance and hazards:
                                    routes = sorted(routes, key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)))
                                    for idx, route in enumerate(routes):
                                        route['id'] = idx + 1

                                print(f"[Valhalla] RETRY SUCCESS: {len(routes)} routes found")

                                # Record success
                                valhalla_elapsed = (time.time() - valhalla_start_time) * 1000
                                fallback_optimizer.record_success('valhalla', valhalla_elapsed)

                                # Determine source
                                retry_source = 'Valhalla ✅ (Retry)'
                                if graphhopper_route and graphhopper_route.get('success'):
                                    retry_source = 'GraphHopper+Valhalla ✅'

                                # Build response
                                response_data = {
                                    'success': True,
                                    'routes': routes,
                                    'source': retry_source,
                                    'distance': f'{routes[0]["distance_km"]:.2f} km',
                                    'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                                    'geometry': routes[0]['geometry'],
                                    'geometry_precision': routes[0].get('geometry_precision', 6),
                                    'fuel_cost': routes[0]['fuel_cost'],
                                    'fuel_litres': routes[0].get('fuel_litres', 0),
                                    'toll_cost': routes[0]['toll_cost'],
                                    'caz_cost': routes[0]['caz_cost'],
                                    'maneuvers': routes[0].get('maneuvers', []),
                                    'cached': False,
                                    'camera_avoidance_engine': 'GraphHopper' if (graphhopper_route and graphhopper_route.get('success')) else 'Valhalla',
                                    'start_lat': start_lat,
                                    'start_lon': start_lon,
                                    'end_lat': end_lat,
                                    'end_lon': end_lon
                                }

                                # Cache the route
                                route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance, avoid_traffic_lights, avoid_cameras, avoid_railway_crossings, apply_caz_routing_avoidance)
                                print(f"[CACHE] STORED: Retry route cached in memory")

                                cache_source = 'GraphHopper+Valhalla' if (graphhopper_route and graphhopper_route.get('success')) else 'Valhalla'
                                cost_calculator.cache_route_to_db(
                                    start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                                    response_data, cache_source
                                )
                                print(f"[CACHE] STORED: Retry route cached in database")

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
            logger.info(f"[ROUTING] Valhalla succeeded, skipping OSRM fallback")
        else:
            # Fallback to OSRM (public service); use profile matching routing mode
            osrm_profile = 'driving' if valhalla_costing == 'auto' else ('foot' if valhalla_costing == 'pedestrian' else 'bike')
            logger.info(f"[OSRM] Trying fallback with profile={osrm_profile} ({start_lon},{start_lat}) to ({end_lon},{end_lat})")
            osrm_url = f"{OSRM_URL}/{osrm_profile}/{start_lon},{start_lat};{end_lon},{end_lat}?alternatives=true&overview=full&steps=true"
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
                        routes = []

                        # Process all available routes (up to 4)
                        for idx, route in enumerate(route_data['routes'][:4]):
                            distance = route.get('distance', 0)
                            duration = route.get('duration', 0)

                            distance_km = distance / 1000
                            time_min = duration / 60

                            # Extract route geometry from OSRM (polyline format)
                            route_geometry = route.get('geometry', None)

                            # Decode route geometry to get coordinates for toll/CAZ detection
                            route_coords = decode_route_geometry(route_geometry)

                            # Calculate costs
                            fuel_cost = 0
                            fuel_litres = 0  # litres for petrol/diesel, kWh for electric
                            toll_cost = 0
                            caz_cost = 0

                            if vehicle_type == 'electric':
                                fuel_litres = (distance_km / 100) * energy_efficiency  # kWh
                                fuel_cost = fuel_litres * electricity_price
                            else:
                                fuel_litres = (distance_km / 100) * fuel_efficiency  # litres
                                fuel_cost = fuel_litres * fuel_price

                            if include_tolls:
                                toll_cost = calculate_toll_cost(distance_km, 'motorway', route_coords=route_coords)

                            caz_details = {}
                            if include_caz and not caz_exempt:
                                caz_cost, caz_details = calculate_caz_cost(distance_km, vehicle_type, caz_exempt, route_coords=route_coords)

                            # Determine route type
                            if idx == 0:
                                route_type = 'Fastest'
                            elif idx == 1:
                                route_type = 'Shortest'
                            elif idx == 2:
                                route_type = 'Balanced'
                            else:
                                route_type = f'Alternative {idx}'

                            # Score route by hazards (always score, regardless of avoidance setting)
                            hazard_penalty = 0
                            hazard_count = 0
                            hazards_list = []
                            if hazards:
                                hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
                                hazards_list = get_hazards_on_route(route_geometry, hazards)
                                logger.info(f"[HAZARDS] OSRM route {idx+1}: penalty={hazard_penalty:.0f}s, count={hazard_count}, hazards_list={len(hazards_list)}")

                            routes.append({
                                'id': idx + 1,
                                'name': route_type,
                                'distance_km': round(distance_km, 2),
                                'duration_minutes': round(time_min, 0),
                                'fuel_cost': round(fuel_cost, 2),
                                'fuel_litres': round(fuel_litres, 2),
                                'toll_cost': round(toll_cost, 2),
                                'caz_cost': round(caz_cost, 2),
                                'geometry': route_geometry,
                                'geometry_precision': 5,
                                'hazard_penalty_seconds': round(hazard_penalty, 0),
                                'hazard_count': hazard_count,
                                'hazards': hazards_list,
                                'source': 'OSRM',
                            })

                        print(f"[OSRM] SUCCESS: {len(routes)} routes found")

                        # ================================================================
                        # HAZARD AVOIDANCE: Reorder routes by hazard penalty if enabled
                        # ================================================================
                        if enable_hazard_avoidance and hazards:
                            # Sort routes by hazard penalty (ascending - fewer hazards first)
                            routes_sorted = sorted(routes, key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)))
                            print(f"[HAZARDS] Routes reordered by hazard penalty:")
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
                            'end_lon': end_lon
                        }

                        # ================================================================
                        # PHASE 4: Persistent database caching for long-term storage
                        # ================================================================
                        cost_calculator.cache_route_to_db(
                            start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type,
                            response_data, 'OSRM'
                        )
                        print(f"[CACHE] STORED: Route cached in database")

                        return jsonify(response_data)
                    else:
                        print(f"[OSRM] Unexpected response: {route_data.get('code')}")
                else:
                    print(f"[OSRM] HTTP {response.status_code}")
            except requests.exceptions.Timeout:
                print(f"[OSRM] Timeout (>10s)")
                fallback_optimizer.record_failure('osrm')
            except requests.exceptions.ConnectionError as e:
                print(f"[OSRM] Connection error: {str(e)}")
                fallback_optimizer.record_failure('osrm')
            except Exception as e:
                print(f"[OSRM] Error: {str(e)}")
                fallback_optimizer.record_failure('osrm')

            # All routing engines failed - log summary
            logger.error(f"\n[ROUTING SUMMARY]")
            logger.error(f"  Valhalla ({VALHALLA_URL}): {valhalla_error}")
            logger.error(f"  OSRM (fallback): Failed")
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

    print(f"\n[INFO] Access the app at:")
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

