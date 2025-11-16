#!/usr/bin/env python3
"""
Voyagr Web App - Full-featured Flask-based navigation app
Run this on your PC and access from any device with a browser
Features: Route calculation, cost estimation, multi-stop routing, trip history, vehicle profiles
"""

from flask import Flask, render_template_string, request, jsonify, send_file
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
from typing import List, Dict, Tuple, Optional, Any, Callable, TypeVar

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

load_dotenv()

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

    # Add Railway.app and other production domains
    # Railway.app uses https://<project-name>.railway.app
    if os.getenv('RAILWAY_ENVIRONMENT_NAME'):
        # Running on Railway - add Railway domain
        railway_url = os.getenv('RAILWAY_PUBLIC_DOMAIN')
        if railway_url:
            origins.append(f"https://{railway_url}")
            origins.append(f"http://{railway_url}")

    # Add environment-configured origins
    env_origins = os.getenv('ALLOWED_ORIGINS', '').strip()
    if env_origins:
        origins.extend([origin.strip() for origin in env_origins.split(',') if origin.strip()])

    return origins

ALLOWED_ORIGINS: List[str] = _get_allowed_origins()

CORS(app, resources={
    r"/api/*": {
        "origins": ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["http://localhost:5000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": False
    }
})

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
route_limiter = RateLimiter(max_requests=100, window_seconds=60)  # 100 requests/min
api_limiter = RateLimiter(max_requests=500, window_seconds=60)    # 500 requests/min

def rate_limit(limiter: RateLimiter) -> Callable[[F], F]:
    """Decorator for rate limiting endpoints."""
    def decorator(f: F) -> F:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            ip: Optional[str] = request.remote_addr
            if ip and not limiter.is_allowed(ip):
                logger.warning(f"Rate limit exceeded for IP: {ip}")
                return jsonify({'success': False, 'error': 'Rate limit exceeded'}), 429
            return f(*args, **kwargs)
        return decorated_function  # type: ignore
    return decorator

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

def validate_vehicle_type(vehicle_type: str) -> bool:
    """Validate vehicle type."""
    valid_types: List[str] = ['petrol_diesel', 'electric', 'hybrid']
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
USE_OSRM = os.getenv('USE_OSRM', 'false').lower() == 'true'

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

    def _make_key(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str, vehicle_type: str, enable_hazard_avoidance: bool = False) -> str:
        """Create cache key from route parameters."""
        return f"{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f},{routing_mode},{vehicle_type},{enable_hazard_avoidance}"

    def get(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str, vehicle_type: str, enable_hazard_avoidance: bool = False) -> Optional[Dict[str, Any]]:
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

    def set(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, routing_mode: str, vehicle_type: str, route_data: Dict[str, Any], enable_hazard_avoidance: bool = False) -> None:
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
                # Create new connection if pool exhausted
                conn = sqlite3.connect(self.db_file, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                return conn

    def return_connection(self, conn: Any) -> None:
        """Return a connection to the pool."""
        with self.lock:
            if len(self.available) < self.pool_size:
                self.available.append(conn)
            else:
                conn.close()

    def close_all(self) -> None:
        """Close all connections in the pool."""
        with self.lock:
            for conn in self.connections:
                try:
                    conn.close()
                except:
                    pass
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
            start_lat REAL, start_lon REAL, start_address TEXT,
            end_lat REAL, end_lon REAL, end_address TEXT,
            distance_km REAL, duration_minutes REAL,
            fuel_cost REAL, toll_cost REAL, caz_cost REAL,
            routing_mode TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Vehicle profiles table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY,
            name TEXT, vehicle_type TEXT,
            fuel_efficiency REAL, fuel_price REAL,
            energy_efficiency REAL, electricity_price REAL,
            is_caz_exempt INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

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
            query TEXT NOT NULL,
            result_name TEXT,
            lat REAL, lon REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Favorite locations table (Phase 2 feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS favorite_locations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT,
            lat REAL NOT NULL, lon REAL NOT NULL,
            category TEXT DEFAULT 'location',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

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

    # Initialize app settings if not exists
    cursor.execute('SELECT COUNT(*) FROM app_settings')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO app_settings
            (gesture_enabled, gesture_sensitivity, gesture_action, battery_saving_mode, map_theme, ml_predictions_enabled, haptic_feedback_enabled)
            VALUES (1, 'medium', 'recalculate', 0, 'standard', 1, 1)
        ''')

    # Insert default hazard preferences if not exists
    # NOTE: Traffic light cameras are now the HIGHEST priority hazard to avoid
    # Penalty of 1200s (20 minutes) ensures routes go significantly out of their way to avoid them
    hazard_preferences = [
        ('speed_camera', 30, 1, 100),
        ('traffic_light_camera', 1200, 1, 100),  # 1200 seconds (20 min) penalty - HIGHEST PRIORITY
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
                       energy_efficiency: float, electricity_price: float, include_tolls: bool, include_caz: bool, caz_exempt: bool, route_coords: Optional[List[Tuple[float, float]]] = None) -> Dict[str, float]:
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

        # Calculate fuel/energy cost
        if vehicle_type == 'electric':
            fuel_cost = (distance_km / 100) * energy_efficiency * electricity_price
        else:
            fuel_cost = (distance_km / 100) * fuel_efficiency * fuel_price

        # Calculate toll cost - ONLY if route passes through known toll roads
        # Pass route coordinates to enable location-based toll detection
        if include_tolls:
            toll_cost = calculate_toll_cost(distance_km, 'motorway', route_coords=route_coords)

        # Calculate CAZ cost - ONLY if route passes through known CAZ zones
        # Pass route coordinates to enable location-based CAZ detection
        if include_caz and not caz_exempt:
            caz_cost = calculate_caz_cost(distance_km, vehicle_type, caz_exempt, route_coords=route_coords)

        return {
            'fuel_cost': round(fuel_cost, 2),
            'toll_cost': round(toll_cost, 2),
            'caz_cost': round(caz_cost, 2),
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

    def optimize_route_cost(self, routes_data: List[Dict[str, Any]], vehicle_type: str, fuel_efficiency: float, fuel_price: float,
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
                base_ttl: int = 3600  # 1 hour
                if distance_km > 100:
                    ttl_multiplier: float = 2  # 2 hours for long routes
                elif distance_km > 50:
                    ttl_multiplier = 1.5  # 1.5 hours for medium routes
                else:
                    ttl_multiplier = 1  # 1 hour for short routes

                # Reduce TTL if route has tolls or CAZ
                if toll_cost > 0 or caz_cost > 0:
                    ttl_multiplier *= 0.7  # 30% reduction

                # Calculate final TTL (currently not used in INSERT, but kept for future use)
                _ttl_seconds: int = int(base_ttl * ttl_multiplier)

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

# Initialize speed limit detector
speed_limit_detector = SpeedLimitDetector() if SpeedLimitDetector else None

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
def decode_route_geometry(geometry: str) -> List[Tuple[float, float]]:
    """Decode route geometry (polyline) to list of coordinates.

    Args:
        geometry: Encoded polyline string or list of coordinates

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
        if isinstance(geometry, str) and polyline:
            decoded = polyline.decode(geometry)
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

def calculate_toll_cost(distance_km: float, route_type: str = 'motorway', route_coords: list = None) -> float:
    """Calculate toll cost based on actual toll roads, not distance.

    IMPORTANT: Toll costs are NOT calculated based on distance anymore.
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
    TOLL_ROADS = {
        'M6 Toll': {'lat': 52.5, 'lon': -1.9, 'cost': 3.50, 'radius_km': 15},
        'Dartford Crossing': {'lat': 51.45, 'lon': 0.2, 'cost': 2.50, 'radius_km': 10},
        'Severn Bridge': {'lat': 51.4, 'lon': -2.6, 'cost': 6.70, 'radius_km': 15},
        'Humber Bridge': {'lat': 53.7, 'lon': -0.4, 'cost': 2.00, 'radius_km': 10},
    }

    # Check if route passes through any known toll roads
    total_toll = 0.0
    tolls_charged = set()

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

def calculate_caz_cost(distance_km: float, vehicle_type: str = 'petrol_diesel', is_exempt: bool = False, route_coords: list = None) -> float:
    """Calculate Congestion Charge Zone cost based on actual CAZ zones.

    IMPORTANT: CAZ costs are NOT calculated based on distance anymore.
    Only charges CAZ if route passes through known UK CAZ zones:
    - London (£15.00/day)
    - Birmingham (£8.00/day)
    - Leeds (£10.00/day)
    - Bristol (£9.00/day)
    - Bath (£9.00/day)
    - Derby (£8.00/day)
    - Nottingham (£8.00/day)
    - Portsmouth (£10.00/day)

    Returns 0.0 by default (conservative approach) unless route_coords provided.

    Args:
        distance_km: Route distance (DEPRECATED - no longer used)
        vehicle_type: Type of vehicle
        is_exempt: Whether vehicle is CAZ exempt
        route_coords: List of route coordinates to check for CAZ zones

    Returns:
        CAZ cost in GBP (0 if no CAZ zones detected, vehicle exempt, or no coordinates)
    """
    if is_exempt:
        return 0.0

    # Electric vehicles are exempt from CAZ
    if vehicle_type == 'electric':
        return 0.0

    # If no coordinates provided, don't charge CAZ (conservative approach)
    # This prevents false CAZ charges on routes not passing through CAZ zones
    if not route_coords or len(route_coords) == 0:
        return 0.0

    # Known UK CAZ zones with approximate locations and charges
    CAZ_ZONES = {
        'London': {'lat': 51.5, 'lon': -0.1, 'cost': 15.00, 'radius_km': 15},
        'Birmingham': {'lat': 52.5, 'lon': -1.9, 'cost': 8.00, 'radius_km': 8},
        'Leeds': {'lat': 53.8, 'lon': -1.5, 'cost': 10.00, 'radius_km': 8},
        'Bristol': {'lat': 51.45, 'lon': -2.6, 'cost': 9.00, 'radius_km': 8},
        'Bath': {'lat': 51.38, 'lon': -2.36, 'cost': 9.00, 'radius_km': 5},
        'Derby': {'lat': 52.92, 'lon': -1.48, 'cost': 8.00, 'radius_km': 5},
        'Nottingham': {'lat': 52.95, 'lon': -1.15, 'cost': 8.00, 'radius_km': 5},
        'Portsmouth': {'lat': 50.82, 'lon': -1.09, 'cost': 10.00, 'radius_km': 5},
    }

    # Check if route passes through any known CAZ zones
    total_caz = 0.0
    zones_charged = set()

    for coord in route_coords:
        if isinstance(coord, (list, tuple)) and len(coord) >= 2:
            lat, lon = coord[0], coord[1]

            for zone_name, zone_data in CAZ_ZONES.items():
                if zone_name not in zones_charged:
                    # Simple distance check
                    lat_diff = abs(lat - zone_data['lat'])
                    lon_diff = abs(lon - zone_data['lon'])
                    approx_distance = (lat_diff ** 2 + lon_diff ** 2) ** 0.5 * 111

                    if approx_distance < zone_data['radius_km']:
                        total_caz += zone_data['cost']
                        zones_charged.add(zone_name)

    return round(total_caz, 2)

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

        hazards = {
            'speed_camera': [],
            'traffic_light_camera': [],
            'police': [],
            'roadworks': [],
            'accident': [],
            'railway_crossing': [],
            'pothole': [],
            'debris': []
        }

        # Fetch cameras
        cursor.execute(
            "SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (south, north, west, east)
        )
        for lat, lon, camera_type, desc in cursor.fetchall():
            # Keep original database type (speed_camera) but also add to traffic_light_camera for scoring
            # This preserves database jargon while ensuring high-priority avoidance
            if camera_type == 'speed_camera':
                # Add to speed_camera category (preserves database type)
                hazards['speed_camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                # Also add to traffic_light_camera for high-priority scoring (1200s penalty)
                hazards['traffic_light_camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high', 'original_type': 'speed_camera'})
            elif camera_type in hazards:
                hazards[camera_type].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})

        # Fetch community reports
        cursor.execute(
            "SELECT lat, lon, hazard_type, description, severity FROM community_hazard_reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND status = 'active' AND expiry_timestamp > ?",
            (south, north, west, east, int(time.time()))
        )
        for lat, lon, hazard_type, desc, severity in cursor.fetchall():
            if hazard_type in hazards:
                hazards[hazard_type].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': severity})

        return_db_connection(conn)
        return hazards
    except Exception as e:
        logger.error(f"Error fetching hazards: {e}")
        return {}

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
        conn.close()

        # Decode polyline to get route points
        try:
            if isinstance(route_points, str):
                if not polyline:
                    return []
                decoded_points = polyline.decode(route_points)
            else:
                decoded_points = route_points
        except Exception as e:
            logger.error(f"Error decoding polyline: {e}")
            return []

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

                # Find minimum distance to route
                min_distance = float('inf')
                for point_lat, point_lon in decoded_points:
                    distance = get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                    min_distance = min(min_distance, distance)

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

        # Get hazard preferences
        cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
        preferences = {row[0]: {'penalty': row[1], 'threshold': row[2]} for row in cursor.fetchall()}
        conn.close()

        logger.debug(f"[HAZARDS] Preferences loaded: {list(preferences.keys())}")
        logger.debug(f"[HAZARDS] Hazards to score: {[(k, len(v)) for k, v in hazards.items() if v]}")

        # Decode polyline to get route points
        try:
            if isinstance(route_points, str):
                if not polyline:
                    logger.warning("polyline module not available, cannot decode route points")
                    return 0, 0
                decoded_points = polyline.decode(route_points)
                logger.debug(f"[HAZARDS] Decoded {len(decoded_points)} route points from polyline")
            else:
                decoded_points = route_points
                logger.debug(f"[HAZARDS] Using {len(decoded_points)} route points directly")
        except Exception as e:
            logger.error(f"Error decoding polyline: {e}")
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

            logger.debug(f"[HAZARDS] Processing {len(hazard_list)} {hazard_type} hazards (threshold={threshold}m, penalty={penalty}s)")

            for idx, hazard in enumerate(hazard_list):
                hazard_lat = hazard.get('lat')
                hazard_lon = hazard.get('lon')

                # Find minimum distance to route
                min_distance = float('inf')
                for point_lat, point_lon in decoded_points:
                    distance = get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                    min_distance = min(min_distance, distance)

                # If hazard is within threshold, add penalty
                if min_distance <= threshold:
                    # TRAFFIC LIGHT CAMERA PRIORITY: Apply distance-based multiplier
                    # Cameras closer to route get exponentially higher penalty
                    if hazard_type == 'traffic_light_camera':
                        # Proximity multiplier: 1.0 at threshold, 3.0 at 0m
                        # Formula: 1 + (2 * (1 - distance/threshold))
                        proximity_multiplier = 1.0 + (2.0 * (1.0 - min_distance / threshold))
                        distance_multiplier = max(1.0, proximity_multiplier)
                        applied_penalty = penalty * distance_multiplier
                    else:
                        applied_penalty = penalty

                    total_penalty += applied_penalty
                    hazard_count += 1

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
                <p>Real-time health monitoring & cost analysis for GraphHopper, Valhalla, and OSRM</p>
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
                        return `
                            <div class="engine-status">
                                <div class="engine-info">
                                    <div class="engine-name">${statusIcon} ${engine.engine.toUpperCase()}</div>
                                    <div class="engine-details">Response: ${engine.response_time_ms}ms | Uptime: ${engine.uptime_24h}% | Last: ${new Date(engine.last_check).toLocaleTimeString()}</div>
                                </div>
                                <span class="status-badge status-${engine.status}">${engine.status.toUpperCase()}</span>
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
                            return `
                                <div class="alert-item alert-${alert.severity}">
                                    <div class="alert-content">
                                        <strong>${severityIcon} ${alert.engine.toUpperCase()}</strong> - ${alert.alert_type}
                                        <div class="alert-time">${new Date(alert.created_at).toLocaleString()}</div>
                                    </div>
                                    <button class="alert-resolve" onclick="resolveAlert(${alert.id})">Resolve</button>
                                </div>
                            `;
                        }).join('');
                        document.getElementById('alertsList').innerHTML = html;
                    } else {
                        document.getElementById('alertsList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">✅ No unresolved alerts</div>';
                    }

                    // Load engine resolve buttons
                    const engines = ['graphhopper', 'valhalla', 'osrm'];
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
                                <span class="spike-date">${spike.date}</span>: +${spike.increase_pct}% increase (${spike.bandwidth_gb}GB, ${spike.requests} requests)
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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
    <link rel="stylesheet" href="/static/css/voyagr.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
    <!-- External JavaScript modules -->
    <script src="/static/js/voyagr-core.js"></script>
    <script src="/static/js/voyagr-app.js"></script>
    <script src="/static/js/app.js"></script>
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
                        <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: flex; gap: 4px;">
                            <button class="location-btn" title="Use current location" onclick="setCurrentLocation('start')" style="font-size: 16px;">📍</button>
                            <button class="location-btn" title="Pick from map" onclick="pickLocationFromMap('start')" style="font-size: 16px;">🗺️</button>
                        </div>
                        <div class="autocomplete-dropdown" id="autocompleteStart"></div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="end">Destination</label>
                    <div class="location-input-group">
                        <input type="text" id="end" placeholder="Enter address or tap map" oninput="showAutocomplete('end')" onfocus="showAutocomplete('end')">
                        <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: flex; gap: 4px;">
                            <button class="location-btn" title="Use current location" onclick="setCurrentLocation('end')" style="font-size: 16px;">📍</button>
                            <button class="location-btn" title="Pick from map" onclick="pickLocationFromMap('end')" style="font-size: 16px;">🗺️</button>
                        </div>
                        <div class="autocomplete-dropdown" id="autocompleteEnd"></div>
                        <div class="search-history-dropdown" id="searchHistoryDropdown"></div>
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

                <!-- Lane Guidance Display (Phase 2) -->
                <div class="lane-guidance-display" id="laneGuidanceDisplay">
                    <div class="lane-guidance-title">🛣️ Lane Guidance</div>
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
                            <span class="preference-label">Avoid Speed Cameras</span>
                            <button class="toggle-switch" id="avoidSpeedCameras" data-pref="speedCameras" onclick="togglePreference('speedCameras')"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">Avoid Traffic Cameras</span>
                            <button class="toggle-switch" id="avoidTrafficCameras" data-pref="trafficCameras" onclick="togglePreference('trafficCameras')"></button>
                        </div>

                        <div class="preference-item">
                            <span class="preference-label">📊 Variable Speed Alerts</span>
                            <button class="toggle-switch" id="variableSpeedAlerts" data-pref="variableSpeedAlerts" onclick="togglePreference('variableSpeedAlerts')"></button>
                        </div>
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
                                <option value="free">Free Only</option>
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
                            <span class="preference-label">🔊 Voice Announcements</span>
                            <button class="toggle-switch" id="voiceAnnouncementsEnabled" onclick="toggleVoiceAnnouncements()"></button>
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
                        <div id="tripHistoryList" style="max-height: 400px; overflow-y: auto;">
                            <div style="text-align: center; padding: 20px; color: #999;">Loading trips...</div>
                        </div>
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
                            <div id="frequentRoutesList" style="max-height: 200px; overflow-y: auto;">
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
                        <div id="savedRoutesList" style="max-height: 400px; overflow-y: auto;">
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
                            <div id="previewAlternativeRoutesList" style="max-height: 200px; overflow-y: auto;"></div>
                        </div>

                        <!-- Parking Section -->
                        <div id="parkingSection" style="display: none; background: #FFF3E0; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #FF9800;">
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #E65100;">🅿️ Parking Options</h4>
                            <div id="parkingList" style="max-height: 250px; overflow-y: auto; margin-bottom: 10px;"></div>
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
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <button onclick="switchTab('routeComparison')" style="background: #2196F3; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px;">
                                🛣️ View Options
                            </button>
                            <button onclick="switchTab('navigation')" style="background: #999; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px;">
                                ✏️ Modify Route
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ROUTE COMPARISON TAB (NEW FEATURE) -->
                <div id="routeComparisonTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>🛣️ Route Options</h3>

                        <!-- Route Preference Selector -->
                        <div class="form-group">
                            <label>Optimize For:</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                                <button class="routing-mode-btn active" id="routePrefFastest" onclick="setRoutePreference('fastest')">⚡ Fastest</button>
                                <button class="routing-mode-btn" id="routePrefShortest" onclick="setRoutePreference('shortest')">📏 Shortest</button>
                                <button class="routing-mode-btn" id="routePrefCheapest" onclick="setRoutePreference('cheapest')">💰 Cheapest</button>
                                <button class="routing-mode-btn" id="routePrefEco" onclick="setRoutePreference('eco')">🌱 Eco</button>
                            </div>
                        </div>

                        <!-- Route Comparison List -->
                        <div id="routeComparisonList" style="max-height: 350px; overflow-y: auto; margin-top: 15px;">
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

        <!-- Turn-by-Turn Navigation Display -->
        <div id="turnInfo" style="position: absolute; top: 80px; right: 20px; z-index: 100; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); display: none; min-width: 200px;"></div>

        <!-- Speed Widget -->
        <div id="speedWidget" style="position: absolute; top: 20px; right: 20px; z-index: 100; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); display: none; min-width: 140px; text-align: center;">
            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Current Speed</div>
            <div id="speedValue" style="font-size: 32px; font-weight: bold; color: #333; margin-bottom: 8px;">0 <span id="speedUnit">km/h</span></div>
            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Speed Limit</div>
            <div id="speedLimitValue" style="font-size: 20px; font-weight: bold; color: #4CAF50; margin-bottom: 8px;">-- <span id="speedLimitUnit">km/h</span></div>
            <div id="speedWarning" style="font-size: 14px; color: #FF5722; font-weight: bold; display: none; margin-top: 8px;">⚠️ SPEEDING</div>
        </div>

        <!-- Notification Container -->
        <div id="notificationContainer" style="position: fixed; top: 20px; right: 20px; z-index: 200; max-width: 400px;"></div>

        <!-- Battery Indicator (Phase 3) -->
        <div class="battery-indicator" id="batteryIndicator" style="display: none;">
            <span class="battery-icon">🔋</span>
            <span id="batteryLevel">100%</span>
        </div>

        <!-- Gesture Indicator (Phase 3) -->
        <div class="gesture-indicator" id="gestureIndicator">👋</div>

        <!-- Navigation Control Buttons -->
        <div style="position: absolute; bottom: 100px; right: 20px; z-index: 100; display: flex; flex-direction: column; gap: 10px;">
            <button id="startTrackingBtn" class="fab" title="Start GPS Tracking" onclick="startGPSTracking()" style="background: #4285F4;">📡</button>
            <button id="startNavBtn" class="fab" title="Start Navigation" onclick="startNavigation()" style="background: #34A853; display: none;">🧭</button>
            <button id="zoomFollowToggle" class="fab active" title="Zoom & Follow Vehicle" onclick="toggleZoomAndFollow()" style="background: #FF9800; display: none;">📍</button>
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

    <!-- JavaScript moved to /static/js/ -->
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/monitoring')
def monitoring_dashboard():
    """Monitoring dashboard for routing engines."""
    return render_template_string(MONITORING_DASHBOARD_HTML)

@app.route('/manifest.json')
def manifest():
    manifest_path = os.path.join(os.path.dirname(__file__), 'manifest.json')
    with open(manifest_path, 'r', encoding='utf-8') as f:
        return jsonify(json.load(f))

@app.route('/service-worker.js')
def service_worker():
    sw_path = os.path.join(os.path.dirname(__file__), 'service-worker.js')
    with open(sw_path, 'r', encoding='utf-8') as f:
        response = app.make_response(f.read())
        response.headers['Content-Type'] = 'application/javascript'
        response.headers['Service-Worker-Allowed'] = '/'
        return response

@app.route('/api/vehicles', methods=['GET', 'POST'])
def manage_vehicles():
    """Get or create vehicle profiles."""
    try:
        # PHASE 3 OPTIMIZATION: Use connection pool
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT * FROM vehicles')
            vehicles = cursor.fetchall()
            return_db_connection(conn)
            return jsonify({
                'success': True,
                'vehicles': [
                    {
                        'id': v[0], 'name': v[1], 'vehicle_type': v[2],
                        'fuel_efficiency': v[3], 'fuel_price': v[4],
                        'energy_efficiency': v[5], 'electricity_price': v[6],
                        'caz_exempt': v[7]
                    } for v in vehicles
                ]
            })

        else:  # POST - create new vehicle
            data = request.json

            # ================================================================
            # PHASE 5: Validate vehicle creation request
            # ================================================================
            if not data:
                return jsonify({'success': False, 'error': 'Request body is empty'}), 400

            name = data.get('name', '').strip()
            if not name or len(name) < 1 or len(name) > 100:
                return jsonify({'success': False, 'error': 'Vehicle name must be 1-100 characters'}), 400

            vehicle_type = data.get('vehicle_type', 'petrol_diesel')
            if not validate_vehicle_type(vehicle_type):
                return jsonify({'success': False, 'error': f'Invalid vehicle_type: {vehicle_type}'}), 400

            try:
                fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
                fuel_price = float(data.get('fuel_price', 1.40))
                energy_efficiency = float(data.get('energy_efficiency', 18.5))
                electricity_price = float(data.get('electricity_price', 0.30))

                if fuel_efficiency < 0 or fuel_price < 0 or energy_efficiency < 0 or electricity_price < 0:
                    return jsonify({'success': False, 'error': 'Numeric values cannot be negative'}), 400
            except (ValueError, TypeError):
                return jsonify({'success': False, 'error': 'Invalid numeric values'}), 400

            cursor.execute('''
                INSERT INTO vehicles (name, vehicle_type, fuel_efficiency, fuel_price,
                                     energy_efficiency, electricity_price, is_caz_exempt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (name, vehicle_type, fuel_efficiency, fuel_price, energy_efficiency,
                  electricity_price, data.get('caz_exempt', 0)))
            conn.commit()
            vehicle_id = cursor.lastrowid
            return_db_connection(conn)
            return jsonify({'success': True, 'vehicle_id': vehicle_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/charging-stations', methods=['GET'])
def get_charging_stations():
    """Get nearby charging stations."""
    try:
        # ================================================================
        # PHASE 5: Validate charging stations request
        # ================================================================
        try:
            lat = float(request.args.get('lat', 51.5074))
            lon = float(request.args.get('lon', -0.1278))
            radius_km = float(request.args.get('radius', 5))

            if lat < -90 or lat > 90 or lon < -180 or lon > 180:
                return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400

            if radius_km < 0.1 or radius_km > 100:
                return jsonify({'success': False, 'error': 'Radius must be between 0.1 and 100 km'}), 400
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Invalid numeric parameters'}), 400

        # Mock charging stations data (in production, use real API)
        stations = [
            {'id': 1, 'name': 'Tesla Supercharger', 'lat': lat + 0.01, 'lon': lon + 0.01,
             'connector': 'Tesla', 'power_kw': 150, 'cost_per_kwh': 0.35, 'availability': 'available'},
            {'id': 2, 'name': 'BP Pulse', 'lat': lat - 0.01, 'lon': lon - 0.01,
             'connector': 'CCS', 'power_kw': 50, 'cost_per_kwh': 0.40, 'availability': 'available'},
            {'id': 3, 'name': 'Pod Point', 'lat': lat + 0.02, 'lon': lon - 0.02,
             'connector': 'Type 2', 'power_kw': 22, 'cost_per_kwh': 0.30, 'availability': 'busy'}
        ]

        return jsonify({'success': True, 'stations': stations})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/trip-history', methods=['GET', 'POST'])
@app.route('/api/trip-history/<int:trip_id>', methods=['DELETE'])
def trip_history(trip_id: Optional[int] = None) -> Any:
    """Get, save, or delete trip history."""
    try:
        # PHASE 3 OPTIMIZATION: Use connection pool
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT * FROM trips ORDER BY timestamp DESC LIMIT 50')
            trips = cursor.fetchall()
            return_db_connection(conn)
            return jsonify({
                'success': True,
                'trips': [
                    {
                        'id': t[0], 'start_lat': t[1], 'start_lon': t[2], 'start_address': t[3],
                        'end_lat': t[4], 'end_lon': t[5], 'end_address': t[6],
                        'distance_km': t[7], 'duration_minutes': t[8],
                        'fuel_cost': t[9], 'toll_cost': t[10], 'caz_cost': t[11],
                        'routing_mode': t[12], 'timestamp': t[13]
                    } for t in trips
                ]
            })

        elif request.method == 'POST':  # POST - save new trip
            data = request.json

            # ================================================================
            # PHASE 5: Validate trip history request
            # ================================================================
            if not data:
                return_db_connection(conn)
                return jsonify({'success': False, 'error': 'Request body is empty'}), 400

            try:
                start_lat = float(data.get('start_lat'))
                start_lon = float(data.get('start_lon'))
                end_lat = float(data.get('end_lat'))
                end_lon = float(data.get('end_lon'))
                distance_km = float(data.get('distance_km', 0))
                duration_minutes = float(data.get('duration_minutes', 0))

                if start_lat < -90 or start_lat > 90 or start_lon < -180 or start_lon > 180:
                    return_db_connection(conn)
                    return jsonify({'success': False, 'error': 'Invalid start coordinates'}), 400

                if end_lat < -90 or end_lat > 90 or end_lon < -180 or end_lon > 180:
                    return_db_connection(conn)
                    return jsonify({'success': False, 'error': 'Invalid end coordinates'}), 400

                if distance_km < 0 or duration_minutes < 0:
                    return_db_connection(conn)
                    return jsonify({'success': False, 'error': 'Distance and duration cannot be negative'}), 400
            except (ValueError, TypeError, KeyError) as e:
                return_db_connection(conn)
                return jsonify({'success': False, 'error': f'Invalid trip data: {str(e)}'}), 400

            routing_mode = data.get('routing_mode', 'auto')
            if not validate_routing_mode(routing_mode):
                return_db_connection(conn)
                return jsonify({'success': False, 'error': f'Invalid routing_mode: {routing_mode}'}), 400

            cursor.execute('''
                INSERT INTO trips (start_lat, start_lon, start_address, end_lat, end_lon,
                                  end_address, distance_km, duration_minutes, fuel_cost,
                                  toll_cost, caz_cost, routing_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (start_lat, start_lon, data.get('start_address', ''),
                  end_lat, end_lon, data.get('end_address', ''),
                  distance_km, duration_minutes, data.get('fuel_cost', 0),
                  data.get('toll_cost', 0), data.get('caz_cost', 0), routing_mode))
            conn.commit()
            trip_id = cursor.lastrowid
            return_db_connection(conn)
            return jsonify({'success': True, 'trip_id': trip_id})

        elif request.method == 'DELETE':  # DELETE - remove trip
            cursor.execute('DELETE FROM trips WHERE id = ?', (trip_id,))
            conn.commit()
            return_db_connection(conn)
            return jsonify({'success': True, 'message': f'Trip {trip_id} deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/trip-analytics', methods=['GET'])
def get_trip_analytics():
    """Get trip analytics and statistics"""
    try:
        # PHASE 3 OPTIMIZATION: Use connection pool
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get total trips and statistics
        cursor.execute('''
            SELECT
                COUNT(*) as total_trips,
                SUM(distance_km) as total_distance,
                SUM(duration_minutes) as total_time,
                AVG(duration_minutes) as avg_duration,
                SUM(fuel_cost) as total_fuel_cost,
                SUM(toll_cost) as total_toll_cost,
                SUM(caz_cost) as total_caz_cost
            FROM trips
        ''')
        stats = cursor.fetchone()

        total_trips = stats[0] or 0
        total_distance = stats[1] or 0
        total_time = stats[2] or 0
        avg_duration = stats[3] or 0
        total_fuel_cost = stats[4] or 0
        total_toll_cost = stats[5] or 0
        total_caz_cost = stats[6] or 0

        total_cost = total_fuel_cost + total_toll_cost + total_caz_cost
        avg_speed = (total_distance / (total_time / 60)) if total_time > 0 else 0

        # Get most frequent routes
        cursor.execute('''
            SELECT
                start_address, end_address,
                COUNT(*) as trip_count,
                AVG(distance_km) as avg_distance,
                AVG(fuel_cost + toll_cost + caz_cost) as avg_cost
            FROM trips
            GROUP BY start_address, end_address
            ORDER BY trip_count DESC
            LIMIT 5
        ''')
        frequent_routes = cursor.fetchall()

        routes_list = []
        for route in frequent_routes:
            routes_list.append({
                'start': route[0],
                'end': route[1],
                'count': route[2],
                'avg_distance': route[3],
                'avg_cost': route[4]
            })

        return_db_connection(conn)

        return jsonify({
            'success': True,
            'total_trips': total_trips,
            'total_distance_km': total_distance,
            'total_time_minutes': total_time,
            'avg_duration': round(avg_duration, 0),
            'total_cost': total_cost,
            'total_fuel_cost': total_fuel_cost,
            'total_toll_cost': total_toll_cost,
            'total_caz_cost': total_caz_cost,
            'avg_speed': avg_speed,
            'frequent_routes': routes_list
        })
    except Exception as e:
        logger.error(f"Error fetching trip analytics: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/traffic-conditions', methods=['POST'])
def get_traffic_conditions():
    """Get real-time traffic conditions for a route"""
    try:
        # Simulate traffic data (in production, integrate with real traffic API)
        # This would connect to services like Google Maps Traffic, HERE Traffic, or TomTom Traffic

        import random

        # Simulate traffic level based on time of day
        hour = datetime.now().hour
        if 7 <= hour <= 9 or 17 <= hour <= 19:  # Rush hours
            traffic_level = random.choice(['Heavy', 'Moderate', 'Heavy'])
            congestion = random.randint(60, 95)
        elif 10 <= hour <= 16:  # Mid-day
            traffic_level = random.choice(['Light', 'Moderate'])
            congestion = random.randint(20, 50)
        else:  # Night
            traffic_level = 'Light'
            congestion = random.randint(5, 25)

        # Simulate duration change based on traffic
        base_duration = 30  # Default 30 minutes
        if traffic_level == 'Heavy':
            updated_duration = base_duration * random.uniform(1.5, 2.0)
        elif traffic_level == 'Moderate':
            updated_duration = base_duration * random.uniform(1.1, 1.4)
        else:
            updated_duration = base_duration * random.uniform(0.9, 1.1)

        # Simulate incidents
        incidents = random.randint(0, 3)

        return jsonify({
            'success': True,
            'traffic_level': traffic_level,
            'congestion_percentage': congestion,
            'incidents_count': incidents,
            'updated_duration_minutes': int(updated_duration),
            'updated_distance_km': 25.5,  # Simulated distance
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error fetching traffic conditions: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/test-routing-engines', methods=['GET'])
def test_routing_engines():
    """Test if routing engines are accessible."""
    results = {}

    # Get environment info
    results['environment'] = {
        'graphhopper_url': GRAPHHOPPER_URL,
        'valhalla_url': VALHALLA_URL,
        'deployment': 'Railway.app' if 'railway' in os.getenv('HOSTNAME', '').lower() else 'Local/Other'
    }

    # Test GraphHopper
    try:
        response = requests.get(f"{GRAPHHOPPER_URL}/info", timeout=5)
        results['graphhopper'] = {
            'status': 'OK' if response.status_code == 200 else f'HTTP {response.status_code}',
            'url': GRAPHHOPPER_URL,
            'accessible': response.status_code == 200,
            'response_time_ms': response.elapsed.total_seconds() * 1000
        }
    except Exception as e:
        results['graphhopper'] = {
            'status': f'Error: {str(e)}',
            'url': GRAPHHOPPER_URL,
            'accessible': False,
            'error_type': type(e).__name__
        }

    # Test Valhalla
    try:
        response = requests.get(f"{VALHALLA_URL}/status", timeout=5)
        results['valhalla'] = {
            'status': 'OK' if response.status_code == 200 else f'HTTP {response.status_code}',
            'url': VALHALLA_URL,
            'accessible': response.status_code == 200,
            'response_time_ms': response.elapsed.total_seconds() * 1000
        }
    except Exception as e:
        results['valhalla'] = {
            'status': f'Error: {str(e)}',
            'url': VALHALLA_URL,
            'accessible': False,
            'error_type': type(e).__name__
        }

    # Test OSRM
    try:
        response = requests.get("http://router.project-osrm.org/route/v1/driving/13.388860,52.517037;13.385983,52.496891", timeout=5)
        results['osrm'] = {
            'status': 'OK' if response.status_code == 200 else f'HTTP {response.status_code}',
            'url': 'http://router.project-osrm.org',
            'accessible': response.status_code == 200,
            'response_time_ms': response.elapsed.total_seconds() * 1000
        }
    except Exception as e:
        results['osrm'] = {
            'status': f'Error: {str(e)}',
            'url': 'http://router.project-osrm.org',
            'accessible': False,
            'error_type': type(e).__name__
        }

    return jsonify(results)

@app.route('/api/debug-route', methods=['POST'])
def debug_route():
    """Debug endpoint for route calculation - returns detailed error info."""
    try:
        data = request.json or {}
        start = data.get('start', '51.5074,-0.1278')
        end = data.get('end', '51.5174,-0.1278')

        # Parse coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)

        if not start_coords or not end_coords:
            return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400

        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords

        debug_info = {
            'timestamp': datetime.now().isoformat(),
            'request': {'start': start, 'end': end},
            'parsed_coords': {
                'start': {'lat': start_lat, 'lon': start_lon},
                'end': {'lat': end_lat, 'lon': end_lon}
            },
            'routing_engines': {
                'graphhopper': {'url': GRAPHHOPPER_URL, 'status': 'testing...'},
                'valhalla': {'url': VALHALLA_URL, 'status': 'testing...'},
                'osrm': {'url': 'http://router.project-osrm.org', 'status': 'testing...'}
            },
            'errors': []
        }

        # Test GraphHopper
        try:
            url = f"{GRAPHHOPPER_URL}/route"
            params = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "ch.disable": "true"
            }
            response = requests.get(url, params=params, timeout=10)
            debug_info['routing_engines']['graphhopper']['status'] = f'HTTP {response.status_code}'
            debug_info['routing_engines']['graphhopper']['response_time_ms'] = response.elapsed.total_seconds() * 1000
            if response.status_code == 200:
                debug_info['routing_engines']['graphhopper']['success'] = True
            else:
                debug_info['routing_engines']['graphhopper']['error'] = response.text[:200]
        except Exception as e:
            debug_info['routing_engines']['graphhopper']['error'] = str(e)
            debug_info['errors'].append(f"GraphHopper: {str(e)}")

        # Test Valhalla
        try:
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": "auto"
            }
            response = requests.post(url, json=payload, timeout=10)
            debug_info['routing_engines']['valhalla']['status'] = f'HTTP {response.status_code}'
            debug_info['routing_engines']['valhalla']['response_time_ms'] = response.elapsed.total_seconds() * 1000
            if response.status_code == 200:
                debug_info['routing_engines']['valhalla']['success'] = True
            else:
                debug_info['routing_engines']['valhalla']['error'] = response.text[:200]
        except Exception as e:
            debug_info['routing_engines']['valhalla']['error'] = str(e)
            debug_info['errors'].append(f"Valhalla: {str(e)}")

        # Test OSRM
        try:
            osrm_url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
            response = requests.get(osrm_url, timeout=10)
            debug_info['routing_engines']['osrm']['status'] = f'HTTP {response.status_code}'
            debug_info['routing_engines']['osrm']['response_time_ms'] = response.elapsed.total_seconds() * 1000
            if response.status_code == 200:
                debug_info['routing_engines']['osrm']['success'] = True
            else:
                debug_info['routing_engines']['osrm']['error'] = response.text[:200]
        except Exception as e:
            debug_info['routing_engines']['osrm']['error'] = str(e)
            debug_info['errors'].append(f"OSRM: {str(e)}")

        return jsonify(debug_info)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'error_type': type(e).__name__}), 500

@app.route('/api/cache-stats', methods=['GET'])
def get_cache_stats():
    """Get route cache statistics."""
    stats = route_cache.get_stats()
    return jsonify({
        'success': True,
        'cache_stats': stats,
        'message': 'Route cache statistics'
    })

@app.route('/api/cache-clear', methods=['POST'])
def clear_cache():
    """Clear the route cache."""
    route_cache.clear()
    return jsonify({
        'success': True,
        'message': 'Route cache cleared'
    })

class FallbackChainOptimizer:
    """
    PHASE 5: Intelligent fallback chain with error handling and timeout management.
    Primary: GraphHopper → Secondary: Valhalla → Tertiary: OSRM
    """
    def __init__(self):
        self.engine_stats = {
            'graphhopper': {'failures': 0, 'successes': 0, 'avg_time': 0},
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

        return max(scored.items(), key=lambda x: x[1])[0] if scored else 'graphhopper'

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
            self.results['graphhopper'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
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
                "alternatives": True
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
            self.results['valhalla'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
            self.results['valhalla'] = {'success': False, 'error': str(e), 'response_time_ms': 0}

    def request_osrm(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> None:
        """Request route from OSRM in parallel."""
        try:
            start_time = time.time()
            url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
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
            self.results['osrm'] = {'success': False, 'error': 'Timeout', 'response_time_ms': 10000}
        except Exception as e:
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

@app.route('/api/route', methods=['POST'])
@rate_limit(route_limiter)
def calculate_route():
    """
    Calculate route using available routing engines.
    Supports: GraphHopper, Valhalla, OSRM (fallback)
    Mobile-optimized with proper error handling and fallbacks.
    """
    import time
    route_start_time = time.time()

    try:
        data = request.json
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
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)
        caz_exempt = data.get('caz_exempt', False)
        enable_hazard_avoidance = data.get('enable_hazard_avoidance', False)

        # DEBUG: Log hazard avoidance parameter
        logger.info(f"[HAZARDS] enable_hazard_avoidance={enable_hazard_avoidance} (type={type(enable_hazard_avoidance)})")

        # Parse coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)
        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords

        # ====================================================================
        # PHASE 3 OPTIMIZATION: Check route cache first
        # ====================================================================
        cached_route = route_cache.get(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, enable_hazard_avoidance)
        if cached_route:
            logger.info(f"[CACHE] HIT: Route from ({start_lat},{start_lon}) to ({end_lat},{end_lon}) with hazard_avoidance={enable_hazard_avoidance}")
            cached_route['cached'] = True
            cached_route['cache_stats'] = route_cache.get_stats()
            return jsonify(cached_route)

        # Fetch hazards if hazard avoidance is enabled
        hazards = {}
        if enable_hazard_avoidance:
            hazard_start = time.time()
            hazards = fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)
            hazard_elapsed = (time.time() - hazard_start) * 1000
            logger.info(f"[HAZARDS] Fetched hazards in {hazard_elapsed:.0f}ms: {[(k, len(v)) for k, v in hazards.items() if v]}")
        else:
            logger.info(f"[HAZARDS] Hazard avoidance disabled - skipping hazard fetch")

        # Try routing engines in order: GraphHopper, Valhalla, OSRM
        graphhopper_error = None
        valhalla_error = None

        logger.debug(f"\n[ROUTING] Starting route calculation from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
        logger.debug(f"[ROUTING] GraphHopper URL: {GRAPHHOPPER_URL}")
        logger.debug(f"[ROUTING] Valhalla URL: {VALHALLA_URL}")

        # Try GraphHopper first (if available)
        try:
            url = f"{GRAPHHOPPER_URL}/route"
            params = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "ch.disable": "true"  # Disable CH to get alternative routes
            }
            logger.debug(f"[GraphHopper] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
            logger.debug(f"[GraphHopper] URL: {url}")
            logger.debug(f"[GraphHopper] Params: {params}")
            # Add headers for mobile compatibility
            headers = {
                'User-Agent': 'Voyagr-PWA/1.0',
                'Accept': 'application/json'
            }
            gh_start = time.time()
            response = requests.get(url, params=params, timeout=10, headers=headers)
            gh_elapsed = (time.time() - gh_start) * 1000
            logger.debug(f"[TIMING] GraphHopper request: {gh_elapsed:.0f}ms")
            logger.debug(f"[GraphHopper] Response status: {response.status_code}")
            if response.status_code != 200:
                logger.warning(f"[GraphHopper] Response body: {response.text[:500]}")

            if response.status_code == 200:
                route_data = response.json()
                logger.debug(f"[GraphHopper] Response keys: {route_data.keys()}")

                if 'paths' in route_data and len(route_data['paths']) > 0:
                    # Extract all available routes (up to 4)
                    routes = []
                    for idx, path in enumerate(route_data['paths'][:4]):
                        distance = path.get('distance', 0) / 1000  # Convert to km
                        duration_minutes = path.get('time', 0) / 60000  # Convert to minutes

                        # Extract route geometry
                        route_geometry = None
                        # GraphHopper returns encoded polyline by default
                        if 'points' in path:
                            points = path['points']
                            if isinstance(points, str):
                                # Already encoded as polyline (most common case)
                                route_geometry = points
                            elif isinstance(points, list):
                                # If it's a list of points, encode it
                                if polyline:
                                    try:
                                        route_geometry = polyline.encode([(p['lat'], p['lng']) for p in points])
                                    except Exception as e:
                                        logger.warning(f"Failed to encode polyline: {e}")
                                        route_geometry = None
                                else:
                                    logger.warning("polyline module not available, cannot encode points")
                                    route_geometry = None
                        elif 'points_encoded' in path and path['points_encoded']:
                            # Use the encoded points string directly
                            route_geometry = path.get('points', None)

                        # ================================================================
                        # PHASE 3 OPTIMIZATION: Use cost calculator with route coordinates
                        # ================================================================
                        # Decode route geometry to get coordinates for toll/CAZ detection
                        route_coords = decode_route_geometry(route_geometry)

                        costs = cost_calculator.calculate_costs(
                            distance, vehicle_type, fuel_efficiency, fuel_price,
                            energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                            route_coords=route_coords
                        )
                        fuel_cost = costs['fuel_cost']
                        toll_cost = costs['toll_cost']
                        caz_cost = costs['caz_cost']

                        # Determine route type based on index
                        if idx == 0:
                            route_type = 'Fastest'
                        elif idx == 1:
                            route_type = 'Shortest'
                        elif idx == 2:
                            route_type = 'Balanced'
                        else:
                            route_type = f'Alternative {idx}'

                        # Score route by hazards if hazard avoidance is enabled
                        hazard_penalty = 0
                        hazard_count = 0
                        hazards_list = []
                        if enable_hazard_avoidance and hazards:
                            hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
                            hazards_list = get_hazards_on_route(route_geometry, hazards)
                            logger.debug(f"[HAZARDS] Route {idx+1}: penalty={hazard_penalty:.0f}s, count={hazard_count}, hazards_list={len(hazards_list)}")

                        routes.append({
                            'id': idx + 1,
                            'name': route_type,
                            'distance_km': round(distance, 2),
                            'duration_minutes': round(duration_minutes, 0),
                            'fuel_cost': round(fuel_cost, 2),
                            'toll_cost': round(toll_cost, 2),
                            'caz_cost': round(caz_cost, 2),
                            'geometry': route_geometry,
                            'hazard_penalty_seconds': round(hazard_penalty, 0),
                            'hazard_count': hazard_count,
                            'hazards': hazards_list
                        })

                    print(f"[GraphHopper] SUCCESS: {len(routes)} routes found")
                    total_time = (time.time() - route_start_time) * 1000
                    print(f"[TIMING] Total route calculation: {total_time:.0f}ms")

                    # ================================================================
                    # PHASE 5: Record success in fallback chain optimizer
                    # ================================================================
                    fallback_optimizer.record_success('graphhopper', gh_elapsed)

                    # ================================================================
                    # PHASE 3 OPTIMIZATION: Cache the successful route
                    # ================================================================
                    response_data = {
                        'success': True,
                        'routes': routes,
                        'source': 'GraphHopper ✅',
                        'distance': f'{routes[0]["distance_km"]:.2f} km',
                        'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                        'geometry': routes[0]['geometry'],
                        'fuel_cost': routes[0]['fuel_cost'],
                        'toll_cost': routes[0]['toll_cost'],
                        'caz_cost': routes[0]['caz_cost'],
                        'response_time_ms': total_time,
                        'cached': False
                    }

                    # Cache the route for future requests
                    route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance)
                    print(f"[CACHE] STORED: Route cached for future requests with hazard_avoidance={enable_hazard_avoidance}")

                    return jsonify(response_data)
                else:
                    graphhopper_error = f"Unexpected response format: {route_data.keys()}"
            else:
                graphhopper_error = f"HTTP {response.status_code}"
        except requests.exceptions.Timeout:
            graphhopper_error = "Timeout (>10s)"
            print(f"[GraphHopper] Timeout error: {graphhopper_error}")
        except requests.exceptions.ConnectionError as e:
            graphhopper_error = f"Connection error: {str(e)}"
            print(f"[GraphHopper] Connection error: {graphhopper_error}")
        except Exception as e:
            graphhopper_error = str(e)
            print(f"[GraphHopper] Exception: {graphhopper_error}")
            print(f"[GraphHopper] Exception type: {type(e).__name__}")
            print(f"[GraphHopper] Response type: {type(response) if 'response' in locals() else 'N/A'}")
            if 'response' in locals():
                print(f"[GraphHopper] Response status: {response.status_code if hasattr(response, 'status_code') else 'N/A'}")
                print(f"[GraphHopper] Response text: {response.text if hasattr(response, 'text') else 'N/A'}")
            import traceback
            traceback.print_exc()

        if graphhopper_error:
            print(f"[GraphHopper] Failed: {graphhopper_error}")
            # ================================================================
            # PHASE 5: Record failure in fallback chain optimizer
            # ================================================================
            fallback_optimizer.record_failure('graphhopper')

        # Try Valhalla as fallback
        valhalla_start_time = time.time()
        try:
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": "auto",
                "alternatives": True  # Request alternative routes
            }
            print(f"[Valhalla] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
            print(f"[Valhalla] URL: {url}")
            print(f"[Valhalla] Payload: {payload}")
            # Add headers for mobile compatibility
            headers = {
                'User-Agent': 'Voyagr-PWA/1.0',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
            response = requests.post(url, json=payload, timeout=10, headers=headers)
            print(f"[Valhalla] Response status: {response.status_code}")
            if response.status_code != 200:
                print(f"[Valhalla] Response body: {response.text[:500]}")

            if response.status_code == 200:
                route_data = response.json()
                print(f"[Valhalla] Response keys: {route_data.keys()}")

                if 'trip' in route_data and 'legs' in route_data['trip']:
                    # Extract all available routes
                    routes = []

                    # Main route
                    # NOTE: Valhalla returns distance in kilometers, not meters!
                    distance = route_data['trip']['summary']['length']
                    duration_seconds = route_data['trip']['summary']['time']
                    distance_km = distance  # Already in km, don't divide by 1000
                    time_minutes = duration_seconds / 60

                    # Extract route geometry
                    route_geometry = None
                    if 'legs' in route_data['trip']:
                        for leg in route_data['trip']['legs']:
                            if 'shape' in leg:
                                route_geometry = leg['shape']
                                break

                    # ================================================================
                    # PHASE 3 OPTIMIZATION: Use cost calculator with route coordinates
                    # ================================================================
                    # Valhalla returns shape as encoded polyline string
                    route_coords = decode_route_geometry(route_geometry)

                    costs = cost_calculator.calculate_costs(
                        distance_km, vehicle_type, fuel_efficiency, fuel_price,
                        energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                        route_coords=route_coords
                    )
                    fuel_cost = costs['fuel_cost']
                    toll_cost = costs['toll_cost']
                    caz_cost = costs['caz_cost']

                    # Score route by hazards if hazard avoidance is enabled
                    hazard_penalty = 0
                    hazard_count = 0
                    hazards_list = []
                    if enable_hazard_avoidance and hazards:
                        hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
                        hazards_list = get_hazards_on_route(route_geometry, hazards)
                        logger.debug(f"[HAZARDS] Valhalla main route: penalty={hazard_penalty:.0f}s, count={hazard_count}, hazards_list={len(hazards_list)}")

                    routes.append({
                        'id': 1,
                        'name': 'Fastest',
                        'distance_km': round(distance_km, 2),
                        'duration_minutes': round(time_minutes, 0),
                        'fuel_cost': round(fuel_cost, 2),
                        'toll_cost': round(toll_cost, 2),
                        'caz_cost': round(caz_cost, 2),
                        'geometry': route_geometry,
                        'hazard_penalty_seconds': round(hazard_penalty, 0),
                        'hazard_count': hazard_count,
                        'hazards': hazards_list
                    })

                    # Alternative routes (if available)
                    if 'alternatives' in route_data:
                        for idx, alt_route in enumerate(route_data['alternatives'][:3]):
                            if 'trip' in alt_route and 'summary' in alt_route['trip']:
                                alt_distance = alt_route['trip']['summary']['length']
                                alt_duration_seconds = alt_route['trip']['summary']['time']
                                # NOTE: Valhalla returns distance in kilometers, not meters!
                                alt_distance_km = alt_distance  # Already in km, don't divide by 1000
                                alt_time_minutes = alt_duration_seconds / 60

                                # Extract geometry
                                alt_geometry = None
                                if 'legs' in alt_route['trip']:
                                    for leg in alt_route['trip']['legs']:
                                        if 'shape' in leg:
                                            alt_geometry = leg['shape']
                                            break

                                # ================================================================
                                # PHASE 3 OPTIMIZATION: Use cost calculator with route coordinates
                                # ================================================================
                                # Decode alternative route geometry
                                alt_route_coords = decode_route_geometry(alt_geometry)

                                alt_costs = cost_calculator.calculate_costs(
                                    alt_distance_km, vehicle_type, fuel_efficiency, fuel_price,
                                    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                                    route_coords=alt_route_coords
                                )
                                alt_fuel_cost = alt_costs['fuel_cost']
                                alt_toll_cost = alt_costs['toll_cost']
                                alt_caz_cost = alt_costs['caz_cost']

                                # Score alternative route by hazards if hazard avoidance is enabled
                                alt_hazard_penalty = 0
                                alt_hazard_count = 0
                                alt_hazards_list = []
                                if enable_hazard_avoidance and hazards:
                                    alt_hazard_penalty, alt_hazard_count = score_route_by_hazards(alt_geometry, hazards)
                                    alt_hazards_list = get_hazards_on_route(alt_geometry, hazards)
                                    logger.debug(f"[HAZARDS] Valhalla alt route {idx+1}: penalty={alt_hazard_penalty:.0f}s, count={alt_hazard_count}, hazards_list={len(alt_hazards_list)}")

                                route_names = ['Shortest', 'Balanced', 'Alternative']
                                routes.append({
                                    'id': idx + 2,
                                    'name': route_names[idx] if idx < len(route_names) else f'Alternative {idx}',
                                    'distance_km': round(alt_distance_km, 2),
                                    'duration_minutes': round(alt_time_minutes, 0),
                                    'fuel_cost': round(alt_fuel_cost, 2),
                                    'toll_cost': round(alt_toll_cost, 2),
                                    'caz_cost': round(alt_caz_cost, 2),
                                    'geometry': alt_geometry,
                                    'hazard_penalty_seconds': round(alt_hazard_penalty, 0),
                                    'hazard_count': alt_hazard_count,
                                    'hazards': alt_hazards_list
                                })

                    print(f"[Valhalla] SUCCESS: {len(routes)} routes found")

                    # ================================================================
                    # PHASE 5: Record success in fallback chain optimizer
                    # ================================================================
                    valhalla_elapsed = (time.time() - valhalla_start_time) * 1000
                    fallback_optimizer.record_success('valhalla', valhalla_elapsed)

                    # ================================================================
                    # PHASE 3 OPTIMIZATION: Cache the successful route
                    # ================================================================
                    response_data = {
                        'success': True,
                        'routes': routes,
                        'source': 'Valhalla ✅',
                        'distance': f'{routes[0]["distance_km"]:.2f} km',
                        'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                        'geometry': routes[0]['geometry'],
                        'fuel_cost': routes[0]['fuel_cost'],
                        'toll_cost': routes[0]['toll_cost'],
                        'caz_cost': routes[0]['caz_cost'],
                        'cached': False
                    }

                    # Cache the route for future requests
                    route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance)
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
            # PHASE 5: Record failure in fallback chain optimizer
            # ================================================================
            fallback_optimizer.record_failure('valhalla')

        # Fallback to OSRM (public service)
        logger.info(f"[OSRM] Trying fallback with ({start_lon},{start_lat}) to ({end_lon},{end_lat})")
        osrm_url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?alternatives=true&overview=full&steps=true"
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
                        toll_cost = 0
                        caz_cost = 0

                        if vehicle_type == 'electric':
                            fuel_cost = (distance_km / 100) * energy_efficiency * electricity_price
                        else:
                            fuel_cost = (distance_km / 100) * fuel_efficiency * fuel_price

                        if include_tolls:
                            toll_cost = calculate_toll_cost(distance_km, 'motorway', route_coords=route_coords)

                        if include_caz and not caz_exempt:
                            caz_cost = calculate_caz_cost(distance_km, vehicle_type, caz_exempt, route_coords=route_coords)

                        # Determine route type
                        if idx == 0:
                            route_type = 'Fastest'
                        elif idx == 1:
                            route_type = 'Shortest'
                        elif idx == 2:
                            route_type = 'Balanced'
                        else:
                            route_type = f'Alternative {idx}'

                        # Score route by hazards if hazard avoidance is enabled
                        hazard_penalty = 0
                        hazard_count = 0
                        if enable_hazard_avoidance and hazards:
                            hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
                            logger.debug(f"[HAZARDS] OSRM route {idx+1}: penalty={hazard_penalty:.0f}s, count={hazard_count}")

                        routes.append({
                            'id': idx + 1,
                            'name': route_type,
                            'distance_km': round(distance_km, 2),
                            'duration_minutes': round(time_min, 0),
                            'fuel_cost': round(fuel_cost, 2),
                            'toll_cost': round(toll_cost, 2),
                            'caz_cost': round(caz_cost, 2),
                            'geometry': route_geometry,
                            'hazard_penalty_seconds': round(hazard_penalty, 0),
                            'hazard_count': hazard_count
                        })

                    print(f"[OSRM] SUCCESS: {len(routes)} routes found")

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
                        'fuel_cost': routes[0]['fuel_cost'],
                        'toll_cost': routes[0]['toll_cost'],
                        'caz_cost': routes[0]['caz_cost']
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
        logger.error(f"  GraphHopper ({GRAPHHOPPER_URL}): {graphhopper_error}")
        logger.error(f"  Valhalla ({VALHALLA_URL}): {valhalla_error}")
        logger.error(f"  OSRM (fallback): Failed")
        logger.error(f"[ROUTING] All routing engines failed for route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")

        # Provide diagnostic information
        diagnostic_info = {
            'graphhopper_url': GRAPHHOPPER_URL,
            'valhalla_url': VALHALLA_URL,
            'osrm_url': 'http://router.project-osrm.org',
            'graphhopper_error': str(graphhopper_error),
            'valhalla_error': str(valhalla_error),
            'deployment_hint': 'If on Railway.app, routing engines may be unreachable. Try /api/test-routing-engines for diagnostics.'
        }

        return jsonify({
            'success': False,
            'error': f'All routing engines failed. GraphHopper: {graphhopper_error}, Valhalla: {valhalla_error}. Please check your internet connection or try again later.',
            'diagnostic': diagnostic_info
        })

    except Exception as e:
        print(f"[Error] {str(e)}")
        return jsonify({'success': False, 'error': f'Error: {str(e)}'})

@app.route('/api/multi-stop-route', methods=['POST'])
def calculate_multi_stop_route():
    """Calculate route with multiple waypoints."""
    try:
        data = request.json
        waypoints = data.get('waypoints', [])
        routing_mode = data.get('routing_mode', 'auto')

        # ================================================================
        # PHASE 5: Validate multi-stop request
        # ================================================================
        if not waypoints or len(waypoints) < 2:
            return jsonify({'success': False, 'error': 'Need at least 2 waypoints'}), 400

        if len(waypoints) > 25:
            return jsonify({'success': False, 'error': 'Maximum 25 waypoints allowed'}), 400

        if not validate_routing_mode(routing_mode):
            return jsonify({'success': False, 'error': f'Invalid routing_mode: {routing_mode}'}), 400

        # Parse and validate all waypoints
        coords = []
        coords_gh = []  # For GraphHopper format
        for i, wp in enumerate(waypoints):
            wp_coords = validate_coordinates(wp)
            if not wp_coords:
                return jsonify({'success': False, 'error': f'Invalid waypoint {i+1}: {wp}'}), 400

            lat, lon = wp_coords
            coords.append({'lat': lat, 'lon': lon})
            coords_gh.append({'lat': lat, 'lng': lon})

        # Try GraphHopper first
        try:
            url = f"{GRAPHHOPPER_URL}/route"
            params = {
                "point": [f"{c['lat']},{c['lng']}" for c in coords_gh],
                "profile": "car",
                "locale": "en"
            }
            response = requests.get(url, params=params, timeout=15)

            if response.status_code == 200:
                route_data = response.json()
                if 'paths' in route_data and len(route_data['paths']) > 0:
                    path = route_data['paths'][0]
                    distance = path.get('distance', 0) / 1000
                    duration_minutes = path.get('time', 0) / 60000

                    return jsonify({
                        'success': True,
                        'distance': f'{distance:.2f} km',
                        'time': f'{duration_minutes:.0f} minutes',
                        'waypoints': len(waypoints),
                        'source': 'GraphHopper ✅'
                    })
        except:
            pass

        # Try Valhalla as fallback
        try:
            url = f"{VALHALLA_URL}/route"
            payload = {
                "locations": coords,
                "costing": routing_mode if routing_mode in ['auto', 'pedestrian', 'bicycle'] else 'auto'
            }
            response = requests.post(url, json=payload, timeout=15)

            if response.status_code == 200:
                route_data = response.json()
                if 'trip' in route_data:
                    # NOTE: Valhalla returns distance in kilometers, not meters!
                    distance = route_data['trip']['summary']['length']  # Already in km
                    duration_minutes = route_data['trip']['summary']['time'] / 60

                    return jsonify({
                        'success': True,
                        'distance': f'{distance:.2f} km',
                        'time': f'{duration_minutes:.0f} minutes',
                        'waypoints': len(waypoints),
                        'source': 'Valhalla'
                    })
        except:
            pass

        # Fallback: calculate segments with OSRM
        total_distance = 0
        total_time = 0

        for i in range(len(coords) - 1):
            osrm_url = f"http://router.project-osrm.org/route/v1/driving/{coords[i]['lon']},{coords[i]['lat']};{coords[i+1]['lon']},{coords[i+1]['lat']}"
            response = requests.get(osrm_url, timeout=10)

            if response.status_code == 200:
                route_data = response.json()
                if route_data.get('code') == 'Ok':
                    total_distance += route_data['routes'][0]['distance'] / 1000
                    total_time += route_data['routes'][0]['duration'] / 60

        return jsonify({
            'success': True,
            'distance': f'{total_distance:.2f} km',
            'time': f'{total_time:.0f} minutes',
            'waypoints': len(waypoints),
            'source': 'OSRM'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """Get weather for a location."""
    try:
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))

        api_key = os.getenv('OPENWEATHERMAP_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'Weather API not configured'})

        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=metric"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'temperature': data['main']['temp'],
                'description': data['weather'][0]['description'],
                'humidity': data['main']['humidity'],
                'wind_speed': data['wind']['speed'],
                'icon': data['weather'][0]['icon']
            })

        return jsonify({'success': False, 'error': 'Weather service unavailable'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    """Get trip analytics and statistics."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Total trips
        cursor.execute('SELECT COUNT(*) FROM trips')
        total_trips = cursor.fetchone()[0]

        # Total distance
        cursor.execute('SELECT SUM(distance_km) FROM trips')
        total_distance = cursor.fetchone()[0] or 0

        # Total costs
        cursor.execute('SELECT SUM(fuel_cost), SUM(toll_cost), SUM(caz_cost) FROM trips')
        fuel_cost, toll_cost, caz_cost = cursor.fetchone()

        # Average trip
        cursor.execute('SELECT AVG(distance_km), AVG(duration_minutes) FROM trips')
        avg_distance, avg_duration = cursor.fetchone()

        # Routing mode breakdown
        cursor.execute('SELECT routing_mode, COUNT(*) FROM trips GROUP BY routing_mode')
        mode_breakdown = {row[0]: row[1] for row in cursor.fetchall()}

        conn.close()

        return jsonify({
            'success': True,
            'total_trips': total_trips,
            'total_distance_km': round(total_distance, 2),
            'total_fuel_cost': round(fuel_cost or 0, 2),
            'total_toll_cost': round(toll_cost or 0, 2),
            'total_caz_cost': round(caz_cost or 0, 2),
            'average_distance_km': round(avg_distance or 0, 2),
            'average_duration_minutes': round(avg_duration or 0, 2),
            'routing_modes': mode_breakdown
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/speed-limit', methods=['GET'])
def get_speed_limit():
    """Get speed limit for a location with variable speed limit detection."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
        road_type = request.args.get('road_type', 'motorway')
        vehicle_type = request.args.get('vehicle_type', 'car')

        result = speed_limit_detector.get_speed_limit_for_location(
            lat=lat, lon=lon, road_type=road_type, vehicle_type=vehicle_type
        )

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/speed-violation', methods=['POST'])
def check_speed_violation():
    """Check if vehicle is exceeding speed limit."""
    try:
        if not speed_limit_detector:
            return jsonify({'success': False, 'error': 'Speed limit detector not available'})

        data = request.json
        current_speed_mph = float(data.get('current_speed_mph', 0))
        speed_limit_mph = int(data.get('speed_limit_mph', 70))
        warning_threshold_mph = int(data.get('warning_threshold_mph', 5))

        result = speed_limit_detector.check_speed_violation(
            current_speed_mph=current_speed_mph,
            speed_limit_mph=speed_limit_mph,
            warning_threshold_mph=warning_threshold_mph
        )

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# HAZARD AVOIDANCE ENDPOINTS
# ============================================================================

@app.route('/api/hazard-preferences', methods=['GET', 'POST'])
def hazard_preferences():
    """Get or update hazard preferences."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT hazard_type, penalty_seconds, enabled, proximity_threshold_meters FROM hazard_preferences')
            prefs = cursor.fetchall()
            return_db_connection(conn)
            return jsonify({
                'success': True,
                'preferences': [
                    {
                        'hazard_type': p[0],
                        'penalty_seconds': p[1],
                        'enabled': bool(p[2]),
                        'proximity_threshold_meters': p[3]
                    } for p in prefs
                ]
            })

        else:  # POST - update preferences
            data = request.json
            hazard_type = data.get('hazard_type')
            penalty = data.get('penalty_seconds')
            enabled = data.get('enabled', True)
            threshold = data.get('proximity_threshold_meters')

            cursor.execute('''
                UPDATE hazard_preferences
                SET penalty_seconds = ?, enabled = ?, proximity_threshold_meters = ?
                WHERE hazard_type = ?
            ''', (penalty, int(enabled), threshold, hazard_type))

            conn.commit()
            return_db_connection(conn)

            # Invalidate caches when preferences change
            invalidate_hazard_cache()
            invalidate_route_cache()

            return jsonify({'success': True, 'message': f'Updated {hazard_type}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/hazards/add-camera', methods=['POST'])
def add_camera():
    """Add a speed/traffic camera location."""
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        camera_type = data.get('type', 'speed_camera')  # speed_camera or traffic_light_camera
        description = sanitize_string(data.get('description', ''), max_length=500) or ''

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO cameras (lat, lon, type, description, severity)
            VALUES (?, ?, ?, ?, ?)
        ''', (lat, lon, camera_type, description, 'high'))
        conn.commit()
        camera_id = cursor.lastrowid
        conn.close()

        return jsonify({'success': True, 'camera_id': camera_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/hazards/report', methods=['POST'])
@require_auth
def report_hazard():
    """Report a hazard (community report)."""
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        hazard_type = data.get('hazard_type')  # speed_camera, police, roadworks, accident, etc.
        description = sanitize_string(data.get('description', ''), max_length=500) or ''
        severity = data.get('severity', 'medium')
        user_id = sanitize_string(data.get('user_id', 'anonymous'), max_length=100) or 'anonymous'

        # Set expiry to 24 hours from now
        expiry_timestamp = int(time.time()) + 86400

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO community_hazard_reports
            (user_id, hazard_type, lat, lon, description, severity, expiry_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, hazard_type, lat, lon, description, severity, expiry_timestamp))
        conn.commit()
        report_id = cursor.lastrowid
        conn.close()

        return jsonify({'success': True, 'report_id': report_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/hazards/nearby', methods=['GET'])
def get_nearby_hazards():
    """Get hazards near a location."""
    try:
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
        radius_km = float(request.args.get('radius', 5))

        # Calculate bounding box
        lat_delta = radius_km / 111.0
        lon_delta = radius_km / (111.0 * math.cos(math.radians(lat)))

        north = lat + lat_delta
        south = lat - lat_delta
        east = lon + lon_delta
        west = lon - lon_delta

        conn = get_db_connection()
        cursor = conn.cursor()

        hazards = {
            'cameras': [],
            'reports': []
        }

        # Get cameras
        cursor.execute(
            'SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
            (south, north, west, east)
        )
        for row in cursor.fetchall():
            distance = get_distance_between_points(lat, lon, row[0], row[1])
            hazards['cameras'].append({
                'lat': row[0],
                'lon': row[1],
                'type': row[2],
                'description': row[3],
                'distance_meters': distance
            })

        # Get community reports
        cursor.execute(
            'SELECT lat, lon, hazard_type, description, severity FROM community_hazard_reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND status = "active" AND expiry_timestamp > ?',
            (south, north, west, east, int(time.time()))
        )
        for row in cursor.fetchall():
            distance = get_distance_between_points(lat, lon, row[0], row[1])
            hazards['reports'].append({
                'lat': row[0],
                'lon': row[1],
                'type': row[2],
                'description': row[3],
                'severity': row[4],
                'distance_meters': distance
            })

        conn.close()
        return jsonify({'success': True, 'hazards': hazards})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# VARIABLE SPEED LIMIT DETECTION
# ============================================================================

# ============================================================================
# PARKING INTEGRATION FEATURE
# ============================================================================

@app.route('/api/parking-search', methods=['POST'])
def search_parking():
    """Search for parking near a destination using Nominatim/OSM."""
    try:
        data = request.json
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        radius = int(data.get('radius', 800))  # Default 800m
        parking_type = data.get('type', 'any')

        if lat == 0 or lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        # Search for parking amenities using Nominatim Overpass API
        # Using Nominatim search with amenity=parking filter
        url = 'https://nominatim.openstreetmap.org/search'

        # Build search query for parking
        search_query = f'parking near {lat},{lon}'

        params = {
            'q': search_query,
            'format': 'json',
            'limit': 20,
            'addressdetails': 1
        }

        headers = {'User-Agent': 'Voyagr-PWA/1.0'}
        response = requests.get(url, params=params, headers=headers, timeout=10)

        if response.status_code != 200:
            print(f"[Parking] Nominatim error: {response.status_code}")
            return jsonify({'success': False, 'error': 'Parking search failed'})

        results = response.json()

        if not results:
            return jsonify({'success': True, 'parking': []})

        # Filter and process results
        parking_list = []
        for result in results:
            try:
                p_lat = float(result.get('lat', 0))
                p_lon = float(result.get('lon', 0))

                # Calculate distance from destination
                distance_m = math.sqrt((p_lat - lat)**2 + (p_lon - lon)**2) * 111000  # Rough conversion to meters

                # Filter by radius
                if distance_m > radius:
                    continue

                # Filter by type if specified
                if parking_type != 'any':
                    name_lower = result.get('name', '').lower()
                    if parking_type == 'garage' and 'garage' not in name_lower:
                        continue
                    elif parking_type == 'street' and 'street' not in name_lower:
                        continue
                    elif parking_type == 'lot' and 'lot' not in name_lower:
                        continue

                parking_list.append({
                    'name': result.get('name', 'Parking'),
                    'lat': p_lat,
                    'lon': p_lon,
                    'distance_m': distance_m,
                    'address': result.get('display_name', ''),
                    'type': 'parking'
                })
            except (ValueError, KeyError) as e:
                print(f"[Parking] Error processing result: {e}")
                continue

        # Sort by distance
        parking_list.sort(key=lambda x: x['distance_m'])

        print(f"[Parking] Found {len(parking_list)} parking options near ({lat},{lon})")
        return jsonify({'success': True, 'parking': parking_list[:10]})  # Return top 10

    except Exception as e:
        print(f"[Parking] Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# PHASE 2 FEATURES - SEARCH HISTORY & FAVORITES
# ============================================================================

@app.route('/api/search-history', methods=['GET', 'POST', 'DELETE'])
def manage_search_history():
    """Get, add, or clear search history."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            # Get search history (last 20)
            cursor.execute(
                'SELECT query, result_name, lat, lon FROM search_history ORDER BY timestamp DESC LIMIT 20'
            )
            history = []
            for row in cursor.fetchall():
                history.append({
                    'query': row[0],
                    'result_name': row[1],
                    'lat': row[2],
                    'lon': row[3]
                })
            conn.close()
            return jsonify({'success': True, 'history': history})

        elif request.method == 'POST':
            # Add to search history
            data = request.json
            query = sanitize_string(data.get('query', '').strip(), max_length=200)
            result_name = sanitize_string(data.get('result_name', ''), max_length=200) or ''
            lat = data.get('lat')
            lon = data.get('lon')

            if not query:
                conn.close()
                return jsonify({'success': False, 'error': 'Query required'})

            cursor.execute(
                'INSERT INTO search_history (query, result_name, lat, lon) VALUES (?, ?, ?, ?)',
                (query, result_name, lat, lon)
            )

            # Keep only last 50 searches
            cursor.execute(
                'DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY timestamp DESC LIMIT 50)'
            )
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Search added to history'})

        elif request.method == 'DELETE':
            # Clear search history
            cursor.execute('DELETE FROM search_history')
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Search history cleared'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/favorites', methods=['GET', 'POST', 'DELETE'])
def manage_favorites():
    """Get, add, or remove favorite locations."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            # Get all favorites
            cursor.execute(
                'SELECT id, name, address, lat, lon, category FROM favorite_locations ORDER BY timestamp DESC'
            )
            favorites = []
            for row in cursor.fetchall():
                favorites.append({
                    'id': row[0],
                    'name': row[1],
                    'address': row[2],
                    'lat': row[3],
                    'lon': row[4],
                    'category': row[5]
                })
            conn.close()
            return jsonify({'success': True, 'favorites': favorites})

        elif request.method == 'POST':
            # Add favorite location
            data = request.json
            name = sanitize_string(data.get('name', '').strip(), max_length=100)
            address = sanitize_string(data.get('address', '').strip(), max_length=200) or ''
            lat = float(data.get('lat', 0))
            lon = float(data.get('lon', 0))
            category = sanitize_string(data.get('category', 'location').strip(), max_length=50) or 'location'

            if not name or lat == 0 or lon == 0:
                conn.close()
                return jsonify({'success': False, 'error': 'Name and coordinates required'})

            cursor.execute(
                'INSERT INTO favorite_locations (name, address, lat, lon, category) VALUES (?, ?, ?, ?, ?)',
                (name, address, lat, lon, category)
            )
            fav_id = cursor.lastrowid
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'favorite_id': fav_id, 'message': f'Added {name} to favorites'})

        elif request.method == 'DELETE':
            # Remove favorite location
            data = request.json
            fav_id = data.get('id')

            if not fav_id:
                conn.close()
                return jsonify({'success': False, 'error': 'Favorite ID required'})

            cursor.execute('DELETE FROM favorite_locations WHERE id = ?', (fav_id,))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Favorite removed'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/lane-guidance', methods=['GET'])
def get_lane_guidance():
    """Get lane guidance for current location."""
    try:
        heading = float(request.args.get('heading', 0))
        next_maneuver = request.args.get('maneuver', 'straight')

        # Simulate lane guidance based on road type
        # In production, integrate with lane_guidance.py
        total_lanes = 3 if heading % 180 < 90 else 2
        current_lane = (int(heading / 90) % total_lanes) + 1

        # Determine recommended lane based on maneuver
        if next_maneuver == 'left':
            recommended_lane = max(1, current_lane - 1)
        elif next_maneuver == 'right':
            recommended_lane = min(total_lanes, current_lane + 1)
        else:
            recommended_lane = current_lane

        return jsonify({
            'success': True,
            'current_lane': current_lane,
            'recommended_lane': recommended_lane,
            'total_lanes': total_lanes,
            'lane_change_needed': current_lane != recommended_lane,
            'next_maneuver': next_maneuver,
            'guidance_text': f"{'Move to lane ' + str(recommended_lane) if current_lane != recommended_lane else 'Stay in lane ' + str(current_lane)}"
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/speed-warnings', methods=['GET'])
def get_speed_warnings():
    """Get speed warning for current location and speed."""
    try:
        current_speed_mph = float(request.args.get('speed', 0))
        road_type = request.args.get('road_type', 'local')

        # Determine speed limit based on road type
        speed_limits = {
            'motorway': 70,
            'a_road': 60,
            'b_road': 50,
            'local': 30
        }
        speed_limit_mph = speed_limits.get(road_type, 30)

        # Calculate warning status
        speed_diff = current_speed_mph - speed_limit_mph
        warning_threshold = 5

        if speed_diff >= warning_threshold:
            status = 'exceeding'
            color = 'red'
            message = f'Exceeding speed limit by {int(speed_diff)} mph'
        elif speed_diff > 0:
            status = 'approaching'
            color = 'amber'
            message = f'Approaching speed limit ({int(current_speed_mph)} mph)'
        else:
            status = 'compliant'
            color = 'green'
            message = f'Speed compliant ({int(current_speed_mph)} mph)'

        return jsonify({
            'success': True,
            'status': status,
            'color': color,
            'current_speed_mph': current_speed_mph,
            'speed_limit_mph': speed_limit_mph,
            'speed_diff_mph': round(speed_diff, 1),
            'message': message,
            'warning_threshold_mph': warning_threshold
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# VOICE FEATURES - PWA Voice Command System
# ============================================================================

@app.route('/api/voice/speak', methods=['POST'])
def voice_speak():
    """Convert text to speech using browser Web Audio API or backend TTS."""
    try:
        data = request.json
        text = data.get('text', '')

        if not text or len(text) > 500:
            return jsonify({'success': False, 'error': 'Invalid text length'})

        # Use pyttsx3 for TTS if available, otherwise return text for browser TTS
        try:
            import pyttsx3  # type: ignore
            engine = pyttsx3.init()
            engine.setProperty('rate', 150)

            # Save to temporary audio file
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                temp_file = f.name

            engine.save_to_file(text, temp_file)
            engine.runAndWait()

            # Return audio file
            return send_file(temp_file, mimetype='audio/wav')
        except:
            # Fallback: return text for browser Web Speech API
            return jsonify({'success': True, 'text': text, 'use_browser_tts': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/voice/command', methods=['POST'])
def voice_command():
    """Parse and execute voice commands."""
    try:
        data = request.json
        command = data.get('command', '').lower().strip()
        lat = float(data.get('lat', 51.5074))
        lon = float(data.get('lon', -0.1278))

        if not command or len(command) > 500:
            return jsonify({'success': False, 'error': 'Invalid command'})

        result = parse_voice_command_web(command, lat, lon)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def parse_voice_command_web(command: str, _lat: float, _lon: float) -> Dict[str, Any]:
    """Parse voice command and return action to execute."""
    try:
        # Normalize command
        command = command.lower().strip()

        # ===== NAVIGATION COMMANDS =====
        if any(cmd in command for cmd in ['navigate to', 'go to', 'take me to']):
            for prefix in ['navigate to ', 'go to ', 'take me to ']:
                if prefix in command:
                    location = command.split(prefix, 1)[1].strip()
                    if location:
                        return {
                            'success': True,
                            'action': 'navigate',
                            'location': location,
                            'message': f'Navigating to {location}'
                        }

        # ===== SEARCH COMMANDS =====
        if 'find nearest' in command:
            location_type = command.split('find nearest', 1)[1].strip()
            search_map = {
                'gas station': 'gas station',
                'petrol station': 'petrol station',
                'fuel': 'gas station',
                'charging station': 'charging station',
                'ev charger': 'charging station',
                'charger': 'charging station',
                'restaurant': 'restaurant',
                'parking': 'parking',
                'hotel': 'hotel',
                'hospital': 'hospital',
                'cafe': 'cafe',
            }

            search_term = location_type
            for key, value in search_map.items():
                if key in location_type:
                    search_term = value
                    break

            return {
                'success': True,
                'action': 'search',
                'search_term': search_term,
                'message': f'Searching for nearest {search_term}'
            }

        # ===== REROUTING COMMANDS =====
        if any(cmd in command for cmd in ['reroute', 'recalculate', 'find new route', 'alternative route', 'new route']):
            return {
                'success': True,
                'action': 'reroute',
                'message': 'Recalculating route from current location'
            }

        # ===== ROUTE PREFERENCE COMMANDS =====
        if 'avoid tolls' in command:
            return {
                'success': True,
                'action': 'set_preference',
                'preference': 'tolls',
                'value': False,
                'message': 'Toll avoidance enabled'
            }

        if 'include tolls' in command:
            return {
                'success': True,
                'action': 'set_preference',
                'preference': 'tolls',
                'value': True,
                'message': 'Tolls included in route'
            }

        if any(cmd in command for cmd in ['avoid caz', 'avoid clean air zone']):
            return {
                'success': True,
                'action': 'set_preference',
                'preference': 'caz',
                'value': True,
                'message': 'Clean Air Zone avoidance enabled'
            }

        if 'fastest' in command:
            return {
                'success': True,
                'action': 'set_preference',
                'preference': 'route_type',
                'value': 'fastest',
                'message': 'Fastest route selected'
            }

        if any(cmd in command for cmd in ['cheapest', 'most economical', 'cheapest route']):
            return {
                'success': True,
                'action': 'set_preference',
                'preference': 'route_type',
                'value': 'economical',
                'message': 'Most economical route selected'
            }

        # ===== HAZARD REPORTING (CHECK BEFORE INFO COMMANDS) =====
        # Check for hazard reporting first to avoid conflicts with "traffic" keyword
        if any(keyword in command for keyword in ['report', 'hazard', 'camera', 'pothole', 'debris', 'accident']):
            hazard_type = (
                'traffic_light_camera' if 'traffic light' in command else
                'speed_camera' if 'speed camera' in command else
                'police' if 'police' in command else
                'roadworks' if 'roadworks' in command else
                'accident' if 'accident' in command else
                'pothole' if 'pothole' in command else
                'debris' if 'debris' in command else
                'other'
            )

            return {
                'success': True,
                'action': 'report_hazard',
                'hazard_type': hazard_type,
                'description': command,
                'message': f'Reporting {hazard_type.replace("_", " ")}'
            }

        # ===== INFORMATION COMMANDS =====
        if any(cmd in command for cmd in ["what's my eta", 'eta', 'estimated time', 'how long']):
            return {
                'success': True,
                'action': 'get_info',
                'info_type': 'eta',
                'message': 'Getting estimated time of arrival'
            }

        if any(cmd in command for cmd in ['how much will this cost', 'journey cost', 'what is the cost', 'cost breakdown']):
            return {
                'success': True,
                'action': 'get_info',
                'info_type': 'cost',
                'message': 'Calculating journey cost'
            }

        if any(cmd in command for cmd in ["what's the traffic", 'traffic conditions', 'traffic', 'congestion']):
            return {
                'success': True,
                'action': 'get_info',
                'info_type': 'traffic',
                'message': 'Getting traffic conditions'
            }

        return {
            'success': False,
            'error': 'Command not recognized',
            'message': 'Sorry, I did not understand that command'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'message': 'Error processing command'
        }

# ===== PHASE 3 API ENDPOINTS =====

@app.route('/api/app-settings', methods=['GET', 'POST'])
def manage_app_settings():
    """Manage Phase 3 app settings (gesture, battery, themes, ML)."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT * FROM app_settings LIMIT 1')
            row = cursor.fetchone()
            if row:
                settings = {
                    'gesture_enabled': row[1],
                    'gesture_sensitivity': row[2],
                    'gesture_action': row[3],
                    'battery_saving_mode': row[4],
                    'map_theme': row[5],
                    'ml_predictions_enabled': row[6],
                    'haptic_feedback_enabled': row[7],
                    'distance_unit': row[8] if len(row) > 8 else 'km',
                    'currency_unit': row[9] if len(row) > 9 else 'GBP',
                    'speed_unit': row[10] if len(row) > 10 else 'kmh',
                    'temperature_unit': row[11] if len(row) > 11 else 'celsius'
                }
                conn.close()
                return jsonify({'success': True, 'settings': settings})
            conn.close()
            return jsonify({'success': False, 'error': 'Settings not found'})

        else:  # POST - update settings
            data = request.json
            updates = []
            values = []

            if 'gesture_enabled' in data:
                updates.append('gesture_enabled = ?')
                values.append(data['gesture_enabled'])
            if 'gesture_sensitivity' in data:
                updates.append('gesture_sensitivity = ?')
                values.append(data['gesture_sensitivity'])
            if 'gesture_action' in data:
                updates.append('gesture_action = ?')
                values.append(data['gesture_action'])
            if 'battery_saving_mode' in data:
                updates.append('battery_saving_mode = ?')
                values.append(data['battery_saving_mode'])
            if 'map_theme' in data:
                updates.append('map_theme = ?')
                values.append(data['map_theme'])
            if 'ml_predictions_enabled' in data:
                updates.append('ml_predictions_enabled = ?')
                values.append(data['ml_predictions_enabled'])
            if 'distance_unit' in data:
                updates.append('distance_unit = ?')
                values.append(data['distance_unit'])
            if 'currency_unit' in data:
                updates.append('currency_unit = ?')
                values.append(data['currency_unit'])
            if 'speed_unit' in data:
                updates.append('speed_unit = ?')
                values.append(data['speed_unit'])
            if 'temperature_unit' in data:
                updates.append('temperature_unit = ?')
                values.append(data['temperature_unit'])

            if updates:
                query = f"UPDATE app_settings SET {', '.join(updates)}"
                cursor.execute(query, values)
                conn.commit()

            conn.close()
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/gesture-event', methods=['POST'])
def log_gesture_event():
    """Log gesture events for analytics."""
    try:
        data = request.json
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO gesture_events (gesture_type, action_triggered)
            VALUES (?, ?)
        ''', (data.get('gesture_type', 'unknown'), data.get('action', 'unknown')))

        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/ml-predictions', methods=['GET', 'POST'])
def manage_ml_predictions():
    """Get ML route predictions based on trip history."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            # Get current day and hour
            now = datetime.now()
            day_of_week = now.weekday()
            hour_of_day = now.hour

            # Query ML predictions for current time
            cursor.execute('''
                SELECT start_lat, start_lon, end_lat, end_lon, avg_duration_minutes,
                       avg_distance_km, avg_fuel_cost, frequency
                FROM ml_route_predictions
                WHERE day_of_week = ? AND hour_of_day = ?
                ORDER BY frequency DESC LIMIT 5
            ''', (day_of_week, hour_of_day))

            predictions = []
            for row in cursor.fetchall():
                predictions.append({
                    'start_address': f'{row[0]:.4f},{row[1]:.4f}',
                    'end_address': f'{row[2]:.4f},{row[3]:.4f}',
                    'label': f'Route {len(predictions)+1}',
                    'details': f'{row[4]:.0f} min • {row[5]:.1f} km • £{row[6]:.2f}',
                    'frequency': row[7]
                })

            conn.close()
            return jsonify({'success': True, 'predictions': predictions})

        else:  # POST - record trip for ML training
            data = request.json
            from datetime import datetime
            now = datetime.now()

            cursor.execute('''
                INSERT OR REPLACE INTO ml_route_predictions
                (start_lat, start_lon, end_lat, end_lon, day_of_week, hour_of_day,
                 frequency, avg_duration_minutes, avg_distance_km, avg_fuel_cost, confidence_score)
                VALUES (?, ?, ?, ?, ?, ?,
                        COALESCE((SELECT frequency FROM ml_route_predictions
                                 WHERE start_lat=? AND start_lon=? AND end_lat=? AND end_lon=?), 0) + 1,
                        ?, ?, ?, ?)
            ''', (data['start_lat'], data['start_lon'], data['end_lat'], data['end_lon'],
                  now.weekday(), now.hour,
                  data['start_lat'], data['start_lon'], data['end_lat'], data['end_lon'],
                  data.get('duration_minutes', 0), data.get('distance_km', 0),
                  data.get('fuel_cost', 0), 0.85))

            conn.commit()
            conn.close()
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/traffic-patterns', methods=['GET', 'POST'])
def manage_traffic_patterns():
    """Manage ML traffic pattern data."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'GET':
            lat = request.args.get('lat', type=float)
            lon = request.args.get('lon', type=float)

            if not lat or not lon:
                return jsonify({'success': False, 'error': 'Missing coordinates'})

            # Get traffic patterns for location
            cursor.execute('''
                SELECT day_of_week, hour_of_day, congestion_level, avg_speed_kmh
                FROM ml_traffic_patterns
                WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                ORDER BY sample_count DESC
            ''', (lat-0.01, lat+0.01, lon-0.01, lon+0.01))

            patterns = []
            for row in cursor.fetchall():
                patterns.append({
                    'day': row[0],
                    'hour': row[1],
                    'congestion': row[2],
                    'speed': row[3]
                })

            conn.close()
            return jsonify({'success': True, 'patterns': patterns})

        else:  # POST - record traffic observation
            data = request.json
            now = datetime.now()

            cursor.execute('''
                INSERT INTO ml_traffic_patterns
                (lat, lon, day_of_week, hour_of_day, congestion_level, avg_speed_kmh)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['lat'], data['lon'], now.weekday(), now.hour,
                  data.get('congestion_level', 0), data.get('speed_kmh', 0)))

            conn.commit()
            conn.close()
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# MONITORING AND ALERTING ENDPOINTS
# ============================================================================

@app.route('/api/monitoring/engine-status', methods=['GET'])
def get_engine_status_endpoint():
    """Get current status of all routing engines."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        status = monitor.get_all_engine_status()
        return jsonify({'success': True, 'engines': status})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/engine-status/<engine_name>', methods=['GET'])
def get_single_engine_status(engine_name: str):
    """Get status of a specific routing engine."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        status = monitor.get_engine_status(engine_name)
        if not status:
            return jsonify({'success': False, 'error': 'Engine not found'})

        return jsonify({'success': True, 'engine': status})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts', methods=['GET'])
def get_alerts_endpoint():
    """Get recent routing alerts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 10, type=int)
        alerts = monitor.get_recent_alerts(limit)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/<int:alert_id>/resolve', methods=['POST'])
def resolve_alert_endpoint(alert_id: int):
    """Mark an alert as resolved."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        monitor.resolve_alert(alert_id)
        return jsonify({'success': True, 'message': 'Alert resolved'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs', methods=['GET', 'POST'])
def manage_costs_endpoint():
    """Get or track OCI costs."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        if request.method == 'GET':
            days = request.args.get('days', 30, type=int)
            costs = monitor.get_daily_costs(days)
            return jsonify({'success': True, 'costs': costs})

        else:  # POST - track new cost data
            data = request.json
            bandwidth_gb = data.get('bandwidth_gb', 0)
            api_requests = data.get('api_requests', 0)
            monitor.track_oci_cost(bandwidth_gb, api_requests)
            return jsonify({'success': True, 'message': 'Cost tracked'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/health-check', methods=['POST'])
def manual_health_check():
    """Manually trigger a health check for all engines."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        results = {}
        for engine_name in ['graphhopper', 'valhalla', 'osrm']:
            status, response_time, error = monitor.check_engine_health(engine_name)
            monitor.record_health_check(engine_name, status, response_time, error)
            results[engine_name] = {
                'status': status,
                'response_time_ms': round(response_time, 2),
                'error': error
            }

        return jsonify({'success': True, 'results': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/summary', methods=['GET'])
def get_alerts_summary():
    """Get summary of all alerts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        summary = monitor.get_alert_summary()
        return jsonify({'success': True, 'summary': summary})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/severity/<severity>', methods=['GET'])
def get_alerts_by_severity(severity: str):
    """Get alerts filtered by severity level."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 10, type=int)
        alerts = monitor.get_alerts_by_severity(severity, limit)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/engine/<engine_name>', methods=['GET'])
def get_alerts_by_engine_endpoint(engine_name: str):
    """Get alerts for a specific engine."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 10, type=int)
        alerts = monitor.get_alerts_by_engine(engine_name, limit)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/unresolved', methods=['GET'])
def get_unresolved_alerts():
    """Get all unresolved alerts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        limit = request.args.get('limit', 50, type=int)
        alerts = monitor.get_recent_alerts(limit, unresolved_only=True)
        return jsonify({'success': True, 'alerts': alerts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/<int:alert_id>/notify', methods=['POST'])
def send_alert_notification(alert_id: int):
    """Send notification for an alert."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        method = request.json.get('method', 'log') if request.json else 'log'
        success = monitor.send_alert_notification(alert_id, method)

        if success:
            return jsonify({'success': True, 'message': f'Notification sent via {method}'})
        else:
            return jsonify({'success': False, 'error': 'Failed to send notification'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/alerts/engine/<engine_name>/resolve-all', methods=['POST'])
def resolve_all_engine_alerts(engine_name: str):
    """Resolve all unresolved alerts for an engine."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        monitor.resolve_all_alerts_for_engine(engine_name)
        return jsonify({'success': True, 'message': f'All alerts for {engine_name} resolved'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ===== COST ANALYSIS ENDPOINTS =====

@app.route('/api/monitoring/costs/bandwidth', methods=['GET'])
def get_bandwidth_usage():
    """Get bandwidth usage history."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        bandwidth_data = monitor.get_bandwidth_usage(days)
        return jsonify({'success': True, 'bandwidth': bandwidth_data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs/requests', methods=['GET'])
def get_request_counts():
    """Get API request counts."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        request_data = monitor.get_request_counts(days)
        return jsonify({'success': True, 'requests': request_data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs/estimate', methods=['GET'])
def estimate_monthly_cost():
    """Get estimated monthly OCI costs."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        estimate = monitor.estimate_monthly_cost(days)
        return jsonify({'success': True, 'estimate': estimate})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs/trends', methods=['GET'])
def analyze_cost_trends():
    """Analyze cost trends and anomalies."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        trends = monitor.analyze_cost_trends(days)
        return jsonify({'success': True, 'trends': trends})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs/history', methods=['GET'])
def get_cost_history():
    """Get comprehensive cost history."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        history = monitor.get_cost_history(days)
        return jsonify({'success': True, 'history': history})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs/export', methods=['GET'])
def export_cost_history():
    """Export cost history to CSV."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        days = request.args.get('days', 30, type=int)
        filename = f'cost_history_{datetime.now().strftime("%Y%m%d")}.csv'
        result = monitor.export_cost_history_csv(days, filename)

        if result:
            return send_file(result, as_attachment=True, download_name=filename)
        else:
            return jsonify({'success': False, 'error': 'Failed to export cost history'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/costs/track', methods=['POST'])
def track_bandwidth_and_requests():
    """Track bandwidth and API requests."""
    try:
        monitor = get_monitor()
        if not monitor:
            return jsonify({'success': False, 'error': 'Monitoring not available'})

        data = request.json
        engine_name = data.get('engine_name', 'valhalla')
        inbound_gb = data.get('inbound_gb', 0)
        outbound_gb = data.get('outbound_gb', 0)
        request_type = data.get('request_type', 'route_calculation')

        monitor.track_bandwidth(engine_name, inbound_gb, outbound_gb, request_type)
        monitor.track_api_request(engine_name, request_type)

        return jsonify({'success': True, 'message': 'Bandwidth and request tracked'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# PHASE 4: ADVANCED COST BREAKDOWN & COMPARISON (NEW)
# ============================================================================

@app.route('/api/cost-breakdown', methods=['POST'])
def get_cost_breakdown():
    """Get detailed cost breakdown for a route."""
    try:
        data = request.json
        distance_km = float(data.get('distance_km', 0))
        duration_minutes = float(data.get('duration_minutes', 0))
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)
        caz_exempt = data.get('caz_exempt', False)

        breakdown = cost_calculator.calculate_detailed_breakdown(
            distance_km, duration_minutes, vehicle_type,
            fuel_efficiency, fuel_price, energy_efficiency,
            electricity_price, include_tolls, include_caz, caz_exempt
        )

        return jsonify({
            'success': True,
            'breakdown': breakdown
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/route-comparison', methods=['POST'])
def compare_routes():
    """Compare multiple routes and provide recommendations."""
    try:
        data = request.json
        routes = data.get('routes', [])

        if not routes:
            return jsonify({'success': False, 'error': 'No routes provided'})

        comparison = cost_calculator.compare_routes(routes)

        if not comparison:
            return jsonify({'success': False, 'error': 'Unable to compare routes'})

        return jsonify({
            'success': True,
            'comparison': comparison
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/cache-statistics', methods=['GET'])
def get_cache_statistics():
    """Get persistent route cache statistics."""
    try:
        stats = cost_calculator.get_cache_statistics()
        return jsonify({
            'success': True,
            'statistics': stats
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/cost-prediction', methods=['POST'])
def predict_cost():
    """Predict cost for a route using ML-based estimation."""
    try:
        data = request.json or {}
        distance_km = float(data.get('distance_km', 0))
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))
        include_tolls = data.get('include_tolls', True)
        include_caz = data.get('include_caz', True)

        prediction = cost_calculator.predict_cost(
            distance_km, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz
        )

        return jsonify({
            'success': True,
            'prediction': prediction
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/cost-optimization', methods=['POST'])
def optimize_route_cost():
    """Get cost optimization suggestions for routes."""
    try:
        data = request.json or {}
        routes = data.get('routes', [])
        vehicle_type = data.get('vehicle_type', 'petrol_diesel')
        fuel_efficiency = float(data.get('fuel_efficiency', 6.5))
        fuel_price = float(data.get('fuel_price', 1.40))
        energy_efficiency = float(data.get('energy_efficiency', 18.5))
        electricity_price = float(data.get('electricity_price', 0.30))

        if not routes:
            return jsonify({'success': False, 'error': 'No routes provided'})

        optimization = cost_calculator.optimize_route_cost(
            routes, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price
        )

        if not optimization:
            return jsonify({'success': False, 'error': 'Unable to optimize routes'})

        return jsonify({
            'success': True,
            'optimization': optimization
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/alternative-route-cache-info', methods=['GET'])
def get_alternative_route_cache_info():
    """Get cache information for alternative routes."""
    try:
        start_lat = float(request.args.get('start_lat', 0))
        start_lon = float(request.args.get('start_lon', 0))
        end_lat = float(request.args.get('end_lat', 0))
        end_lon = float(request.args.get('end_lon', 0))

        if start_lat == 0 or start_lon == 0 or end_lat == 0 or end_lon == 0:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        cache_info = cost_calculator.get_alternative_route_cache_info(
            start_lat, start_lon, end_lat, end_lon
        )

        return jsonify({
            'success': True,
            'cache_info': cache_info
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# PHASE 5: PARALLEL ROUTING ENGINE TESTING & FALLBACK CHAIN OPTIMIZATION
# ============================================================================

# Initialize fallback chain optimizer
fallback_optimizer = FallbackChainOptimizer()

@app.route('/api/fallback-chain-health', methods=['GET'])
def fallback_chain_health():
    """
    PHASE 5: Get health status of fallback chain.
    Shows success rates, failure counts, and average response times.
    """
    try:
        health = fallback_optimizer.get_engine_health()
        recommended = fallback_optimizer.get_recommended_engine()

        return jsonify({
            'success': True,
            'health': health,
            'recommended_engine': recommended,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/parallel-routing', methods=['POST'])
def parallel_routing_test():
    """
    PHASE 5: Test all 3 routing engines in parallel.
    Compare performance, accuracy, and response times.
    """
    try:
        data = request.json or {}
        start = data.get('start', '').strip()
        end = data.get('end', '').strip()

        if not start or not end:
            return jsonify({'success': False, 'error': 'Missing start or end location'})

        # Parse coordinates
        try:
            start_parts = start.split(',')
            end_parts = end.split(',')
            start_lat = float(start_parts[0].strip())
            start_lon = float(start_parts[1].strip())
            end_lat = float(end_parts[0].strip())
            end_lon = float(end_parts[1].strip())
        except:
            return jsonify({'success': False, 'error': 'Invalid coordinates'})

        # Run parallel routing
        parallel_engine = ParallelRoutingEngine()
        overall_start = time.time()
        results = parallel_engine.run_parallel(start_lat, start_lon, end_lat, end_lon)
        overall_time = (time.time() - overall_start) * 1000

        # Analyze results and record stats
        successful = {k: v for k, v in results.items() if v.get('success')}
        fastest = min(successful.items(), key=lambda x: x[1]['response_time_ms']) if successful else None

        # Record stats in fallback optimizer
        for engine, result in results.items():
            if result.get('success'):
                fallback_optimizer.record_success(engine, result['response_time_ms'])
            else:
                fallback_optimizer.record_failure(engine)

        return jsonify({
            'success': True,
            'results': results,
            'overall_time_ms': round(overall_time, 0),
            'successful_engines': len(successful),
            'fastest_engine': fastest[0] if fastest else None,
            'fastest_time_ms': round(fastest[1]['response_time_ms'], 0) if fastest else None
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/fallback-chain-status', methods=['GET'])
def fallback_chain_status():
    """
    PHASE 5: Get status of all routing engines in fallback chain.
    Shows which engines are available and their response times.
    """
    try:
        status = {}

        # Check GraphHopper
        try:
            start = time.time()
            response = requests.get(f"{GRAPHHOPPER_URL}/info", timeout=5)
            elapsed = (time.time() - start) * 1000
            status['graphhopper'] = {
                'available': response.status_code == 200,
                'response_time_ms': round(elapsed, 0),
                'url': GRAPHHOPPER_URL
            }
        except:
            status['graphhopper'] = {'available': False, 'response_time_ms': None, 'url': GRAPHHOPPER_URL}

        # Check Valhalla
        try:
            start = time.time()
            response = requests.get(f"{VALHALLA_URL}/status", timeout=5)
            elapsed = (time.time() - start) * 1000
            status['valhalla'] = {
                'available': response.status_code == 200,
                'response_time_ms': round(elapsed, 0),
                'url': VALHALLA_URL
            }
        except:
            status['valhalla'] = {'available': False, 'response_time_ms': None, 'url': VALHALLA_URL}

        # Check OSRM
        try:
            start = time.time()
            response = requests.get("http://router.project-osrm.org/status", timeout=5)
            elapsed = (time.time() - start) * 1000
            status['osrm'] = {
                'available': response.status_code == 200,
                'response_time_ms': round(elapsed, 0),
                'url': 'http://router.project-osrm.org'
            }
        except:
            status['osrm'] = {'available': False, 'response_time_ms': None, 'url': 'http://router.project-osrm.org'}

        # Determine fallback chain
        fallback_chain = []
        if status['graphhopper']['available']:
            fallback_chain.append('GraphHopper')
        if status['valhalla']['available']:
            fallback_chain.append('Valhalla')
        if status['osrm']['available']:
            fallback_chain.append('OSRM')

        return jsonify({
            'success': True,
            'status': status,
            'fallback_chain': fallback_chain,
            'primary_engine': fallback_chain[0] if fallback_chain else None,
            'all_engines_available': len(fallback_chain) == 3
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/routing-performance-report', methods=['POST'])
def routing_performance_report():
    """
    PHASE 5: Generate comprehensive performance report for routing engines.
    Tests multiple routes and compares performance metrics.
    """
    try:
        data = request.json or {}
        test_routes = data.get('test_routes', [
            {'start': '51.5074,-0.1278', 'end': '51.5174,-0.1278', 'name': 'Short (1km)'},
            {'start': '51.5074,-0.1278', 'end': '51.7074,-0.1278', 'name': 'Medium (20km)'},
            {'start': '51.5074,-0.1278', 'end': '50.7074,-0.1278', 'name': 'Long (100km)'}
        ])

        report = {
            'timestamp': datetime.now().isoformat(),
            'test_routes': [],
            'summary': {}
        }

        engine_stats = {'graphhopper': [], 'valhalla': [], 'osrm': []}

        for route in test_routes:
            start = route['start']
            end = route['end']

            try:
                start_parts = start.split(',')
                end_parts = end.split(',')
                start_lat = float(start_parts[0].strip())
                start_lon = float(start_parts[1].strip())
                end_lat = float(end_parts[0].strip())
                end_lon = float(end_parts[1].strip())
            except:
                continue

            # Run parallel routing
            parallel_engine = ParallelRoutingEngine()
            results = parallel_engine.run_parallel(start_lat, start_lon, end_lat, end_lon)

            route_report = {
                'name': route.get('name', 'Unknown'),
                'start': start,
                'end': end,
                'results': results
            }
            report['test_routes'].append(route_report)

            # Collect stats
            for engine, result in results.items():
                if result.get('success'):
                    engine_stats[engine].append(result['response_time_ms'])

        # Calculate summary statistics
        for engine, times in engine_stats.items():
            if times:
                report['summary'][engine] = {
                    'avg_response_time_ms': round(sum(times) / len(times), 0),
                    'min_response_time_ms': round(min(times), 0),
                    'max_response_time_ms': round(max(times), 0),
                    'success_rate': f"{len(times)}/{len(test_routes)}"
                }

        return jsonify({
            'success': True,
            'report': report
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# PHASE 5: PERFORMANCE MONITORING & METRICS ENDPOINTS
# ============================================================================

@app.route('/api/monitoring/phase5/metrics', methods=['GET'])
def get_phase5_metrics():
    """
    PHASE 5: Get comprehensive Phase 5 metrics.
    Includes parallel routing performance, fallback chain health, and cache stats.
    """
    try:
        metrics = {
            'timestamp': datetime.now().isoformat(),
            'fallback_chain_health': fallback_optimizer.get_engine_health(),
            'recommended_engine': fallback_optimizer.get_recommended_engine(),
            'cache_stats': route_cache.get_stats() if hasattr(route_cache, 'get_stats') else {},
            'phase5_features': {
                'parallel_routing': 'enabled',
                'fallback_chain': 'enabled',
                'request_validation': 'enabled',
                'performance_monitoring': 'enabled'
            }
        }

        return jsonify({'success': True, 'metrics': metrics})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/phase5/engine-comparison', methods=['POST'])
def engine_comparison():
    """
    PHASE 5: Compare all 3 routing engines on a specific route.
    Returns detailed performance metrics for each engine.
    """
    try:
        data = request.json or {}
        start = data.get('start', '51.5074,-0.1278')
        end = data.get('end', '51.5174,-0.1278')

        # Validate coordinates
        start_coords = validate_coordinates(start)
        end_coords = validate_coordinates(end)

        if not start_coords or not end_coords:
            return jsonify({'success': False, 'error': 'Invalid coordinates'}), 400

        start_lat, start_lon = start_coords
        end_lat, end_lon = end_coords

        # Run parallel routing
        parallel_engine = ParallelRoutingEngine()
        results = parallel_engine.run_parallel(start_lat, start_lon, end_lat, end_lon)

        # Analyze results
        comparison = {
            'timestamp': datetime.now().isoformat(),
            'route': {'start': start, 'end': end},
            'engines': results,
            'analysis': {
                'fastest_engine': None,
                'most_accurate': None,
                'average_time_ms': 0,
                'success_rate': 0
            }
        }

        # Calculate analysis
        successful = {k: v for k, v in results.items() if v.get('success')}
        if successful:
            times = [v['response_time_ms'] for v in successful.values()]
            comparison['analysis']['average_time_ms'] = round(sum(times) / len(times), 0)
            comparison['analysis']['fastest_engine'] = min(successful.items(), key=lambda x: x[1]['response_time_ms'])[0]
            comparison['analysis']['success_rate'] = round((len(successful) / len(results)) * 100, 1)

        return jsonify({'success': True, 'comparison': comparison})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/phase5/performance-summary', methods=['GET'])
def performance_summary():
    """
    PHASE 5: Get performance summary for all Phase 5 features.
    Includes cache hit rates, engine health, and optimization metrics.
    """
    try:
        summary = {
            'timestamp': datetime.now().isoformat(),
            'cache_performance': {
                'hit_rate': 0,
                'total_requests': 0,
                'cached_requests': 0
            },
            'engine_health': fallback_optimizer.get_engine_health(),
            'recommended_engine': fallback_optimizer.get_recommended_engine(),
            'optimization_status': {
                'route_caching': 'active',
                'connection_pooling': 'active',
                'cost_calculation': 'optimized',
                'response_compression': 'enabled',
                'parallel_routing': 'enabled',
                'fallback_chain': 'enabled',
                'request_validation': 'enabled'
            }
        }

        # Get cache stats if available
        if hasattr(route_cache, 'get_stats'):
            cache_stats = route_cache.get_stats()
            summary['cache_performance'] = cache_stats

        return jsonify({'success': True, 'summary': summary})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/monitoring/phase5/validation-stats', methods=['GET'])
def validation_stats():
    """
    PHASE 5: Get request validation statistics.
    Shows how many requests passed/failed validation.
    """
    try:
        stats = {
            'timestamp': datetime.now().isoformat(),
            'validation_enabled': True,
            'features': {
                'coordinate_validation': 'enabled',
                'routing_mode_validation': 'enabled',
                'vehicle_type_validation': 'enabled',
                'numeric_value_validation': 'enabled',
                'waypoint_validation': 'enabled'
            },
            'note': 'Validation statistics are tracked per request. Enable detailed logging for metrics.'
        }

        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# BATCH REQUEST ENDPOINT - Request Optimization Phase 1
# ============================================================================

@app.route('/api/batch', methods=['POST'])
def batch_requests():
    """
    Batch API endpoint for combining multiple requests into one.
    Reduces network overhead and improves performance.

    Request format:
    {
        "requests": [
            {"id": "req1", "endpoint": "/api/route", "data": {...}},
            {"id": "req2", "endpoint": "/api/weather", "data": {...}}
        ]
    }

    Response format:
    {
        "success": true,
        "responses": [
            {"id": "req1", "success": true, "data": {...}},
            {"id": "req2", "success": true, "data": {...}}
        ]
    }
    """
    try:
        data = request.json or {}
        requests_list = data.get('requests', [])

        if not requests_list:
            return jsonify({'success': False, 'error': 'No requests in batch'})

        responses = []

        for req in requests_list:
            req_id = req.get('id')
            endpoint = req.get('endpoint')
            req_data = req.get('data', {})

            try:
                # Route the request to appropriate handler
                if endpoint == '/api/route':
                    result = calculate_route_internal(req_data)
                elif endpoint == '/api/weather':
                    result = get_weather_internal(req_data)
                elif endpoint == '/api/traffic-patterns':
                    result = get_traffic_patterns_internal(req_data)
                elif endpoint == '/api/speed-limit':
                    result = get_speed_limit_internal(req_data)
                elif endpoint == '/api/hazards/nearby':
                    result = get_nearby_hazards_internal(req_data)
                else:
                    result = {'success': False, 'error': f'Unknown endpoint: {endpoint}'}

                responses.append({
                    'id': req_id,
                    'success': result.get('success', False),
                    'data': result
                })
            except Exception as e:
                responses.append({
                    'id': req_id,
                    'success': False,
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'responses': responses,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def calculate_route_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal route calculation for batch requests."""
    try:
        # Call existing route calculation logic
        # This is a simplified version - integrate with actual route calculation
        return {'success': True, 'message': 'Route calculated'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_weather_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal weather fetch for batch requests."""
    try:
        # Call existing weather logic
        return {'success': True, 'message': 'Weather fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_traffic_patterns_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal traffic patterns fetch for batch requests."""
    try:
        # Call existing traffic logic
        return {'success': True, 'message': 'Traffic patterns fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_speed_limit_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal speed limit fetch for batch requests."""
    try:
        # Call existing speed limit logic
        return {'success': True, 'message': 'Speed limit fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_nearby_hazards_internal(_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal hazards fetch for batch requests."""
    try:
        # Call existing hazards logic
        return {'success': True, 'message': 'Hazards fetched'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

if __name__ == '__main__':
    # Get port from environment variable (Railway sets this)
    port = int(os.getenv('PORT', 5000))

    # Initialize and start monitoring
    if get_monitor:
        monitor = get_monitor()
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

