"""
Database connection pooling and initialization for Voyagr.
"""

import sqlite3
import threading
import logging
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Iterator, List, Optional

from voyagr.config import DB_FILE

logger = logging.getLogger('voyagr_web')


# Python 3.12+ deprecates the implicit date/datetime sqlite3 adapters. Register
# explicit adapters that reproduce the historical output exactly so stored values
# and string comparisons against TEXT/DATETIME columns remain unchanged.
sqlite3.register_adapter(datetime, lambda val: val.isoformat(" "))
sqlite3.register_adapter(date, lambda val: val.isoformat())


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


# Global database pool - lazily initialized on first use (or explicitly via init_db()).
db_pool: Optional[DatabasePool] = None
_pool_init_lock = threading.Lock()


def _ensure_pool() -> Optional[DatabasePool]:
    """Lazily create the shared connection pool (thread-safe).

    Blueprints import these helpers directly, so a connection can be requested
    before ``init_db()`` runs. Creating the pool on demand means callers get
    pooled connections with a consistent ``row_factory`` instead of ad-hoc
    connections (which previously disabled pooling and dropped ``sqlite3.Row``).
    """
    global db_pool
    if db_pool is None:
        with _pool_init_lock:
            if db_pool is None:
                try:
                    db_pool = DatabasePool(DB_FILE)
                except Exception as e:
                    logger.warning("[DB POOL] Lazy initialization failed: %s", e)
                    return None
    return db_pool


def get_pool() -> Optional[DatabasePool]:
    """Return the shared connection pool, creating it lazily if needed.

    Prefer this accessor over importing the module-level ``db_pool`` value:
    ``db_pool`` is bound to ``None`` at import time and only populated on first
    use, so a direct ``from voyagr.models import db_pool`` would capture a stale
    ``None``.
    """
    return _ensure_pool()


def get_db_connection() -> Any:
    """Get a database connection from the shared pool.

    Falls back to a standalone connection (still using ``sqlite3.Row``) if the
    pool cannot be created, so callers always get consistent row access.
    """
    pool = _ensure_pool()
    if pool is not None:
        return pool.get_connection()
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def return_db_connection(conn: Any) -> None:
    """Return a database connection to the pool (or close it if there is no pool)."""
    if db_pool is not None:
        db_pool.return_connection(conn)
    else:
        try:
            conn.close()
        except Exception:
            pass


@contextmanager
def db_connection() -> Iterator[Any]:
    """Yield a pooled connection and always return it, even if the caller raises.

    Prevents pool exhaustion / connection leaks::

        with db_connection() as conn:
            conn.execute(...)
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        return_db_connection(conn)


def init_db() -> None:
    """Initialize database with all tables."""
    global db_pool
    
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

    # Settings table for Phase 3 features
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

    # Initialize app settings if not exists
    cursor.execute('SELECT COUNT(*) FROM app_settings')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO app_settings
            (gesture_enabled, gesture_sensitivity, gesture_action, battery_saving_mode, map_theme, ml_predictions_enabled, haptic_feedback_enabled)
            VALUES (1, 'medium', 'recalculate', 0, 'standard', 1, 1)
        ''')

    # Insert default hazard preferences if not exists
    hazard_preferences = [
        ('camera', 800, 1, 100),
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

    conn.commit()
    conn.close()

    # Initialize connection pool (close any pool created earlier via lazy init).
    with _pool_init_lock:
        if db_pool is not None:
            db_pool.close_all()
        db_pool = DatabasePool(DB_FILE)
    logger.info(f"[DB POOL] Initialized with {db_pool.pool_size} connections")

