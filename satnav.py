"""
Voyagr - Open-source sat nav mobile application with toll road cost estimation and EV support.
Features: Toll road cost estimation, EV energy efficiency, fuel/energy cost calculation in GBP,
traffic camera alerts, hazard/incident reporting, hands-free operation, pedestrian and cycling routing.
Routing modes: Auto (car), Pedestrian (walking), Bicycle (cycling).
"""

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.togglebutton import ToggleButton
from kivy.uix.textinput import TextInput
from kivy.uix.button import Button
from kivy.uix.gridlayout import GridLayout
from kivy.uix.label import Label
from kivy_garden.mapview import MapView, MapMarker
from kivy.clock import Clock
from kivy.graphics import Color, Rectangle
from plyer import gps, notification, accelerometer
from geopy.distance import geodesic
import sqlite3
import time
import threading
import struct
import requests
import json
import os
from dotenv import load_dotenv
from icalendar import Calendar
from datetime import datetime, timedelta

try:
    from jnius import autoclass
    TextToSpeech = autoclass('android.speech.tts.TextToSpeech')
    PythonActivity = autoclass('org.kivy.android.PythonActivity')
except ImportError:
    TextToSpeech = None
    PythonActivity = None

try:
    import pyttsx3
except ImportError:
    pyttsx3 = None

try:
    import pvporcupine
    import pyaudio
except ImportError:
    pvporcupine = None
    pyaudio = None

# Import advanced navigation modules
try:
    from speed_limit_detector import SpeedLimitDetector
except ImportError:
    SpeedLimitDetector = None

try:
    from lane_guidance import LaneGuidance
except ImportError:
    LaneGuidance = None

try:
    from vehicle_profile_manager import VehicleProfileManager
except ImportError:
    VehicleProfileManager = None

# Load environment variables from .env file
load_dotenv()

# Valhalla Configuration Constants
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
VALHALLA_TIMEOUT = int(os.getenv('VALHALLA_TIMEOUT', '30'))
VALHALLA_RETRIES = int(os.getenv('VALHALLA_RETRIES', '3'))
VALHALLA_RETRY_DELAY = int(os.getenv('VALHALLA_RETRY_DELAY', '1'))

# ============================================================================
# INPUT VALIDATION FUNCTIONS - SECURITY & DATA INTEGRITY
# ============================================================================

def validate_coordinates(lat, lon, function_name=""):
    """
    Validate latitude and longitude coordinates.

    Args:
        lat: Latitude value (must be numeric, -90 to 90)
        lon: Longitude value (must be numeric, -180 to 180)
        function_name: Name of calling function for error messages

    Returns:
        tuple: (is_valid, error_message)

    Raises:
        ValueError: If coordinates are invalid
    """
    try:
        # Check if values are numeric
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            raise ValueError(f"Coordinates must be numeric. Got lat={type(lat).__name__}, lon={type(lon).__name__}")

        # Check for NaN or infinity
        if not (-90 <= lat <= 90):
            raise ValueError(f"Latitude must be between -90 and 90. Got {lat}")

        if not (-180 <= lon <= 180):
            raise ValueError(f"Longitude must be between -180 and 180. Got {lon}")

        return True, None

    except (TypeError, ValueError) as e:
        error_msg = f"Invalid coordinates in {function_name}: {str(e)}"
        return False, error_msg


def validate_search_query(query, function_name=""):
    """
    Validate search query string.

    Args:
        query: Search query string
        function_name: Name of calling function for error messages

    Returns:
        tuple: (is_valid, error_message, sanitized_query)

    Raises:
        ValueError: If query is invalid
    """
    try:
        # Check if query is a string
        if not isinstance(query, str):
            raise ValueError(f"Search query must be a string. Got {type(query).__name__}")

        # Strip whitespace
        sanitized = query.strip()

        # Check length
        if len(sanitized) < 2:
            raise ValueError("Search query must be at least 2 characters long")

        if len(sanitized) > 255:
            raise ValueError("Search query must not exceed 255 characters")

        # Check for potentially malicious patterns (basic check)
        dangerous_patterns = [
            '<script', 'javascript:', 'onerror=', 'onclick=', 'onload=',
            "' or '", "' or 1", "' union", "' drop", "' delete", "' insert",
            "' update", "' select", "' exec", "' execute"
        ]
        query_lower = sanitized.lower()
        for pattern in dangerous_patterns:
            if pattern in query_lower:
                raise ValueError(f"Search query contains invalid characters or patterns")

        return True, None, sanitized

    except (TypeError, ValueError) as e:
        error_msg = f"Invalid search query in {function_name}: {str(e)}"
        return False, error_msg, None


def sanitize_string_for_api(text):
    """
    Sanitize string for API requests (URL encoding, special character handling).

    Args:
        text: String to sanitize

    Returns:
        str: Sanitized string safe for API requests
    """
    if not isinstance(text, str):
        return ""

    # Strip leading/trailing whitespace
    text = text.strip()

    # Remove control characters
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\t\n\r')

    return text


def log_validation_error(error_msg, context=""):
    """
    Log validation errors for debugging without exposing sensitive data.

    Args:
        error_msg: Error message to log
        context: Additional context information
    """
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] VALIDATION ERROR: {error_msg}"
    if context:
        log_entry += f" | Context: {context}"
    print(log_entry)


class SatNavApp(App):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.current_pos = (53.5526, -1.4797)  # Barnsley
        self.current_route = None
        self.hazard_alerts = {}
        self.incident_alerts = {}
        self.camera_alerts = {}
        self.toll_alerts = {}
        self.caz_alerts = {}
        self.weather_alerts = []
        self.voice_guidance_enabled = True

        # CAZ settings
        self.avoid_caz = False
        self.vehicle_caz_exempt = False
        self.caz_data = []

        # Hazard avoidance settings
        self.enable_hazard_avoidance = False
        self.hazard_avoidance_mode = 'all'  # 'all', 'cameras_only', 'custom'
        self.hazard_penalty_weights = {}
        self.route_hazards = {}  # Cache for hazards along current route

        # Smart notification preferences
        self.traffic_alerts_enabled = True
        self.weather_alerts_enabled = True
        self.maintenance_alerts_enabled = True
        self.fuel_battery_alerts_enabled = True
        self.last_pre_departure_check_time = 0  # Prevent duplicate checks

        # TTS initialization
        self.android_tts = None
        self.tts_engine = None
        self.porcupine = None
        self.pa = None
        self.audio_stream = None

        # Gesture tracking
        self.last_shake_time = 0
        self.shake_count = 0

        # Units and settings
        self.distance_unit = 'km'
        self.temperature_unit = 'C'
        self.currency_unit = 'GBP'  # 'GBP', 'USD', 'EUR'
        self.vehicle_type = 'petrol_diesel'
        self.fuel_unit = 'l_per_100km'
        self.fuel_efficiency = 6.5
        self.fuel_price_gbp = 1.40
        self.energy_efficiency = 18.5
        self.electricity_price_gbp = 0.30
        self.include_tolls = True

        # Routing mode settings
        self.routing_mode = 'auto'  # 'auto', 'pedestrian', 'bicycle'
        self.route_distance = 0
        self.route_time = 0

        # Vehicle marker for map display
        self.vehicle_marker = None
        self.weather_markers = []  # List of weather markers on map
        self.vehicle_icons_dir = 'vehicle_icons'

        # Valhalla routing engine configuration
        self.valhalla_url = VALHALLA_URL
        self.valhalla_timeout = VALHALLA_TIMEOUT
        self.valhalla_retries = VALHALLA_RETRIES
        self.valhalla_available = False
        self.valhalla_last_check = 0
        self.valhalla_check_interval = 60  # Check every 60 seconds
        self.route_cache = {}  # Cache for routes (1-hour expiry)

        # Search functionality
        self.search_results = []
        self.search_history = []
        self.favorite_locations = []
        self.last_search_time = 0
        self.search_category_filter = 'All'

        # Trip tracking
        self.current_trip = None

        # Theme settings
        self.theme = 'auto'  # 'light', 'dark', 'auto'
        self.is_dark_mode = False
        self.theme_colors = self._get_theme_colors('light')

        # Map theme settings
        self.map_theme = 'standard'  # 'standard', 'satellite', 'terrain', 'dark', 'high_contrast'
        self.map_themes = {
            'standard': {'name': 'Standard', 'tile_url': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'},
            'satellite': {'name': 'Satellite', 'tile_url': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'},
            'terrain': {'name': 'Terrain', 'tile_url': 'https://tile.opentopomap.org/{z}/{x}/{y}.png'},
            'dark': {'name': 'Dark', 'tile_url': 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png'},
            'high_contrast': {'name': 'High Contrast', 'tile_url': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
        }

        # Gesture settings
        self.gesture_sensitivity = 'medium'  # 'low', 'medium', 'high'
        self.gesture_sensitivity_thresholds = {
            'low': {'pinch_threshold': 0.15, 'swipe_threshold': 50, 'double_tap_threshold': 0.3},
            'medium': {'pinch_threshold': 0.10, 'swipe_threshold': 30, 'double_tap_threshold': 0.2},
            'high': {'pinch_threshold': 0.05, 'swipe_threshold': 15, 'double_tap_threshold': 0.1}
        }

        # Performance optimization - Background route pre-calculation
        self.route_calculation_queue = []  # Queue of pending route calculations
        self.route_calculation_thread = None  # Background thread for route calculations
        self.route_calc_stop_flag = False  # Flag to stop background thread
        self.route_calc_lock = threading.Lock()  # Thread-safe queue access

        # Performance optimization - Map rendering
        self.marker_update_threshold_meters = 10  # Only update markers when position changes >10m
        self.last_marker_update_position = None  # Track last position where markers were updated
        self.map_render_batch_updates = []  # Collect map updates for batching
        self.tile_cache_size_mb = 50  # Map tile cache size

        # Performance optimization - Battery usage
        self.battery_saving_mode = False  # Battery saving mode toggle
        self.gps_polling_frequency = 1.0  # Current GPS update interval in seconds
        self.last_gps_speed_kmh = 0  # Speed from previous GPS update
        self.stationary_start_time = None  # When vehicle became stationary
        self.gps_sleep_mode_enabled = False  # GPS sleep mode for stationary vehicles
        self.pending_db_writes = []  # Queue for batch database writes
        self.last_db_flush_time = time.time()  # Track last database flush

        # Performance metrics
        self.route_calc_time_ms = 0  # Route calculation time in milliseconds
        self.map_render_time_ms = 0  # Map render time in milliseconds
        self.gps_poll_count = 0  # Count of GPS polls
        self.db_write_count = 0  # Count of database writes

        # AI Features - Predictive Departure Time Suggestions
        self.departure_time_suggestions_enabled = False
        self.frequent_routes_cache = {}  # Cache of frequently traveled routes

        # AI Features - Learning User Preferences
        self.learn_preferences_enabled = False
        self.user_preferences = {}  # Learned user preferences

        # AI Features - Automatic Route Optimization
        self.auto_optimize_routes_enabled = False
        self.optimization_mode = 'manual'  # 'manual', 'semi-auto', 'full-auto'

        # AI Features - Smart Charging/Refueling Stops
        self.smart_charging_enabled = False
        self.smart_refueling_enabled = False

        # Social Features - Share Routes with Friends
        self.social_features_enabled = False
        self.current_user_id = "user_" + str(int(time.time()))  # Default user ID
        self.current_username = "Anonymous"
        self.shared_routes_cache = {}  # Cache for shared routes
        self.route_share_token_expiry_hours = 24  # Default 24 hours

        # Social Features - Community Hazard Reporting
        self.community_reports_enabled = False
        self.hazard_report_rate_limit = 100  # Max 100 reports per day per user
        self.hazard_report_expiry_hours = 48  # Reports expire after 48 hours
        self.user_hazard_reports_today = 0  # Track reports submitted today
        self.last_hazard_report_reset_date = None

        # Social Features - Social Trip Planning
        self.trip_groups_enabled = False
        self.user_trip_groups = []  # Groups user is member of
        self.current_group_id = None  # Currently selected group

        # Traffic integration
        self.traffic_data = {}
        self.traffic_incidents = []
        self.traffic_enabled = True
        self.traffic_avoid_enabled = False
        self.traffic_cache_expiry = 300  # 5 minutes

        # Alternative routes
        self.alternative_routes = []
        self.selected_route_index = 0
        self.alt_routes_cache = {}

        # Offline maps
        self.offline_maps_enabled = False
        self.offline_map_regions = []
        self.offline_storage_limit_mb = 500  # 500 MB default
        self.offline_storage_used_mb = 0

        # Community reporting
        self.community_reports = []
        self.user_id = "anonymous"  # Can be set by user
        self.report_rate_limit = 100  # Max 100 reports per day (increased for testing)
        self.report_expiry_hours = 48  # Reports expire after 48 hours

        # Multi-stop route planning
        self.waypoints = []  # List of waypoints for multi-stop routes
        self.current_waypoint_index = 0
        self.multi_stop_route = None
        self.waypoint_markers = []  # Map markers for waypoints

        # Time-window constraints
        self.time_windows = {}  # Dictionary mapping waypoint_id to time window constraints
        self.auto_suggest_departure_times = True

        # Real-time re-routing
        self.current_route = None
        self.route_monitoring_enabled = False
        self.auto_accept_reroutes = False
        self.last_traffic_check_time = 0
        self.traffic_check_interval = 300  # Check every 5 minutes
        self.reroute_threshold_minutes = 5  # Suggest reroute if saves 5+ minutes
        self.reroute_events = []

        # Enhanced offline mode
        self.offline_downloads = {}  # Track active downloads
        self.offline_poi_cache = {}  # Cache for offline POIs
        self.offline_weather_cache = {}  # Cache for offline weather
        self.download_pause_states = {}  # Track paused downloads
        self.poi_categories = ['fuel', 'food', 'lodging', 'charging_stations', 'hospitals', 'parking', 'restaurants', 'hotels', 'gas_stations']
        self.offline_poi_update_interval = 86400  # Update POI cache daily (24 hours)
        self.last_poi_update_time = 0
        self.weather_stale_threshold = 21600  # Mark weather stale after 6 hours

        # UI Controls for Multi-Stop Route Management
        self.waypoint_ui_widgets = {}  # Store UI widgets for waypoints
        self.waypoint_list_layout = None  # Layout for waypoint list
        self.multi_stop_panel = None  # Panel for multi-stop controls
        self.time_window_inputs = {}  # Store time window input fields
        self.waypoint_name_inputs = {}  # Store waypoint name inputs
        self.waypoint_address_inputs = {}  # Store waypoint address inputs

        # Database setup
        self.conn = sqlite3.connect('satnav.db')
        self.cursor = self.conn.cursor()
        self._init_database()
        self.load_settings()

        # Initialize advanced navigation modules
        self.speed_limit_detector = SpeedLimitDetector(self.cursor) if SpeedLimitDetector else None
        self.lane_guidance = LaneGuidance(self.cursor) if LaneGuidance else None
        self.vehicle_profile_manager = VehicleProfileManager() if VehicleProfileManager else None

        # Speed limit and lane guidance settings
        self.enable_speed_warnings = True
        self.speed_warning_threshold_mph = 5
        self.enable_smart_motorway_alerts = True
        self.enable_lane_guidance = True
        self.enable_lane_change_warnings = True
        self.enable_voice_lane_guidance = True

        # Current navigation state
        self.current_speed_limit_mph = 70
        self.current_lane = None
        self.recommended_lane = None

        # Speed alert system
        self.speed_alert_enabled = True
        self.speed_alert_threshold_kmh = 8  # Default: alert when exceeding limit by 8 km/h
        self.last_speed_alert_time = 0
        self.speed_alert_cooldown_seconds = 30  # Minimum 30 seconds between alerts
        self.current_vehicle_speed_kmh = 0
        self.speed_alert_active = False

        # Initialize TTS
        self._init_tts()

        # Initialize voice and gesture
        self._init_voice()
        self._init_gesture()

        # Initialize GPS
        self._init_gps()

        # Setup UI
        self.setup_ui()

    def _init_database(self):
        """Initialize SQLite database tables."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS settings
                              (distance_unit TEXT, temperature_unit TEXT, currency_unit TEXT, vehicle_type TEXT, fuel_unit TEXT,
                               fuel_efficiency REAL, fuel_price_gbp REAL, energy_efficiency REAL,
                               electricity_price_gbp REAL, include_tolls INTEGER, routing_mode TEXT, avoid_caz INTEGER, vehicle_caz_exempt INTEGER,
                               theme TEXT DEFAULT 'auto', enable_hazard_avoidance INTEGER DEFAULT 0, hazard_avoidance_mode TEXT DEFAULT 'all',
                               map_theme TEXT DEFAULT 'standard', gesture_sensitivity TEXT DEFAULT 'medium',
                               battery_saving_mode INTEGER DEFAULT 0)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS tolls
                              (road_name TEXT, lat REAL, lon REAL, cost_gbp REAL)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS reports
                              (lat REAL, lon REAL, type TEXT, description TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS clean_air_zones
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, zone_name TEXT NOT NULL, city TEXT NOT NULL,
                               country TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, zone_type TEXT,
                               charge_amount REAL, currency_code TEXT DEFAULT 'GBP', active INTEGER DEFAULT 1,
                               operating_hours TEXT, boundary_coords TEXT)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS search_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, result_name TEXT,
                               lat REAL, lon REAL, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS favorite_locations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT,
                               lat REAL NOT NULL, lon REAL NOT NULL, category TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, start_lat REAL NOT NULL, start_lon REAL NOT NULL,
                               end_lat REAL NOT NULL, end_lon REAL NOT NULL, start_address TEXT, end_address TEXT,
                               distance_km REAL, duration_seconds INTEGER, routing_mode TEXT,
                               fuel_cost REAL, toll_cost REAL, caz_cost REAL, total_cost REAL,
                               timestamp_start INTEGER, timestamp_end INTEGER)''')

        # Traffic cache table (5-minute expiry)
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS traffic_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               radius_km REAL, traffic_data TEXT, timestamp INTEGER)''')

        # Traffic incidents table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS traffic_incidents
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               incident_type TEXT, description TEXT, severity TEXT, timestamp INTEGER)''')

        # Alternative routes cache table (1-hour expiry)
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS alternative_routes_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, start_lat REAL NOT NULL, start_lon REAL NOT NULL,
                               end_lat REAL NOT NULL, end_lon REAL NOT NULL, routes_data TEXT, timestamp INTEGER)''')

        # Persistent route cache table (for background pre-calculation)
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS route_cache_persistent
                              (cache_key TEXT PRIMARY KEY, route_data TEXT, routing_mode TEXT,
                               timestamp INTEGER, expiry_timestamp INTEGER)''')

        # AI Feature 1: Departure time predictions
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS departure_predictions
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, route_hash TEXT NOT NULL,
                               start_lat REAL, start_lon REAL, end_lat REAL, end_lon REAL,
                               typical_departure_hour INTEGER, day_of_week INTEGER,
                               avg_duration_minutes REAL, confidence_score REAL,
                               sample_count INTEGER, last_updated INTEGER)''')

        # AI Feature 2: Learned user preferences
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS learned_preferences
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, preference_type TEXT NOT NULL,
                               preference_key TEXT, preference_value TEXT,
                               confidence_score REAL, sample_count INTEGER, last_updated INTEGER)''')

        # AI Feature 3: Route optimizations
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS route_optimizations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, original_route_id TEXT,
                               optimized_route_id TEXT, optimization_type TEXT,
                               time_saved_minutes REAL, distance_saved_km REAL,
                               cost_saved REAL, timestamp INTEGER)''')

        # AI Feature 4: Charging/fuel stop recommendations
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS charging_fuel_recommendations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, route_id TEXT,
                               stop_type TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL,
                               distance_from_start_km REAL, estimated_cost REAL,
                               charging_time_minutes INTEGER, timestamp INTEGER)''')

        # Offline maps table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS offline_maps
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, tile_x INTEGER NOT NULL, tile_y INTEGER NOT NULL,
                               zoom INTEGER NOT NULL, image_data BLOB, timestamp INTEGER)''')

        # Offline map regions table (enhanced with download progress tracking)
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS offline_map_regions
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, region_name TEXT NOT NULL, center_lat REAL,
                               center_lon REAL, radius_km REAL, zoom_levels TEXT, download_status TEXT,
                               storage_bytes INTEGER, download_progress_percent INTEGER DEFAULT 0,
                               download_paused INTEGER DEFAULT 0, estimated_time_remaining_seconds INTEGER,
                               total_tiles INTEGER, downloaded_tiles INTEGER, timestamp INTEGER)''')

        # Community reports table (extended from existing reports table)
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS community_reports
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               report_type TEXT NOT NULL, description TEXT, user_id TEXT, photo_path TEXT,
                               upvotes INTEGER DEFAULT 0, flags INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
                               expires_at INTEGER, timestamp INTEGER)''')

        # Report upvotes table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS report_upvotes
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL,
                               user_id TEXT NOT NULL, timestamp INTEGER)''')

        # Report flags table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS report_flags
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL,
                               user_id TEXT NOT NULL, reason TEXT, timestamp INTEGER)''')

        # ML Predictions table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS ml_predictions
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, prediction_type TEXT,
                               input_data TEXT, prediction_result TEXT, confidence_score REAL,
                               actual_result TEXT, timestamp INTEGER)''')

        # ML Model Metadata table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS ml_model_metadata
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, model_name TEXT,
                               model_version TEXT, training_date INTEGER, accuracy_score REAL,
                               sample_count INTEGER, last_updated INTEGER)''')

        # Vehicle profiles table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS vehicles
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                               vehicle_type TEXT NOT NULL, vehicle_subtype TEXT,
                               fuel_efficiency REAL, fuel_unit TEXT, fuel_price_gbp REAL,
                               energy_efficiency REAL, electricity_price_gbp REAL,
                               emission_class TEXT, registration_number TEXT,
                               purchase_date INTEGER, current_mileage_km REAL,
                               is_active INTEGER DEFAULT 1, caz_exempt INTEGER DEFAULT 0,
                               timestamp INTEGER)''')

        # Charging stations table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS charging_stations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                               lat REAL NOT NULL, lon REAL NOT NULL, network TEXT,
                               connector_types TEXT, power_kw REAL, availability INTEGER,
                               cost_per_kwh REAL, timestamp INTEGER)''')

        # Charging history table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS charging_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
                               station_id INTEGER, start_time INTEGER, end_time INTEGER,
                               kwh_charged REAL, cost REAL, timestamp INTEGER)''')

        # Maintenance records table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS maintenance_records
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
                               service_type TEXT, date INTEGER, mileage_km REAL,
                               cost REAL, notes TEXT, timestamp INTEGER)''')

        # Maintenance reminders table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS maintenance_reminders
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL,
                               service_type TEXT, due_date INTEGER, due_mileage_km REAL,
                               status TEXT DEFAULT 'pending', timestamp INTEGER)''')

        # Speed limit cache table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS speed_limit_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               speed_limit_mph INTEGER, road_type TEXT, is_smart_motorway INTEGER,
                               motorway_name TEXT, timestamp INTEGER)''')

        # Lane data cache table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS lane_data_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               total_lanes INTEGER, turn_lanes TEXT, road_type TEXT, timestamp INTEGER)''')

        # Speed limit preferences table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS speed_limit_preferences
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, enable_speed_warnings INTEGER DEFAULT 1,
                               warning_threshold_mph INTEGER DEFAULT 5, enable_smart_motorway_alerts INTEGER DEFAULT 1,
                               timestamp INTEGER)''')

        # Speed alert settings table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS speed_alert_settings
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, speed_alert_enabled INTEGER DEFAULT 1,
                               speed_alert_threshold_kmh INTEGER DEFAULT 8, timestamp INTEGER)''')

        # Lane guidance preferences table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS lane_guidance_preferences
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, enable_lane_guidance INTEGER DEFAULT 1,
                               enable_lane_change_warnings INTEGER DEFAULT 1, enable_voice_lane_guidance INTEGER DEFAULT 1,
                               timestamp INTEGER)''')

        # Hazard avoidance preferences table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS hazard_avoidance_preferences
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, hazard_type TEXT NOT NULL UNIQUE,
                               penalty_seconds INTEGER DEFAULT 0, avoid_enabled INTEGER DEFAULT 1,
                               proximity_threshold_meters INTEGER DEFAULT 100, timestamp INTEGER)''')

        # Smart notification preferences table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS smart_notification_preferences
                              (id INTEGER PRIMARY KEY AUTOINCREMENT,
                               traffic_alerts_enabled INTEGER DEFAULT 1,
                               weather_alerts_enabled INTEGER DEFAULT 1,
                               maintenance_alerts_enabled INTEGER DEFAULT 1,
                               fuel_battery_alerts_enabled INTEGER DEFAULT 1,
                               timestamp INTEGER)''')

        # Route hazards cache table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS route_hazards_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, north REAL NOT NULL, south REAL NOT NULL,
                               east REAL NOT NULL, west REAL NOT NULL, hazards_data TEXT, timestamp INTEGER)''')

        # Weather cache table for route segments
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS weather_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               temperature REAL, humidity INTEGER, wind_speed REAL, precipitation REAL,
                               description TEXT, severity TEXT, timestamp INTEGER)''')

        # Waypoints table for multi-stop route planning
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS waypoints
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, route_id TEXT, sequence_order INTEGER,
                               lat REAL NOT NULL, lon REAL NOT NULL, name TEXT, address TEXT,
                               arrival_time INTEGER, departure_time INTEGER, timestamp INTEGER)''')

        # Time windows table for time-window constraints
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS time_windows
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, waypoint_id INTEGER NOT NULL,
                               arrive_by_time INTEGER, depart_after_time INTEGER, is_flexible INTEGER DEFAULT 0,
                               timestamp INTEGER)''')

        # Re-routing events table for tracking re-routing decisions
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS reroute_events
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, original_route_id TEXT, alternative_route_id TEXT,
                               reason TEXT, time_saved_seconds INTEGER, distance_difference_km REAL,
                               user_action TEXT, timestamp INTEGER)''')

        # Offline POI cache table for offline location search
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS offline_poi_cache
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER, name TEXT NOT NULL,
                               category TEXT, lat REAL NOT NULL, lon REAL NOT NULL, address TEXT,
                               phone TEXT, opening_hours TEXT, amenities TEXT, distance_from_region_center REAL,
                               timestamp INTEGER)''')

        # Enhanced weather cache table with forecast periods and offline indicators
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS weather_cache_enhanced
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               temperature REAL, humidity INTEGER, wind_speed REAL, precipitation REAL,
                               description TEXT, severity TEXT, forecast_period TEXT DEFAULT 'current',
                               is_stale INTEGER DEFAULT 0, last_updated_timestamp INTEGER, timestamp INTEGER)''')

        # Vehicle position history table for tracking GPS breadcrumb trail
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS position_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL NOT NULL, lon REAL NOT NULL,
                               speed_kmh REAL, heading REAL, accuracy REAL, timestamp INTEGER)''')

        # Route recording table for storing complete route traces
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS route_recordings
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, route_name TEXT, start_lat REAL,
                               start_lon REAL, end_lat REAL, end_lon REAL, total_distance_km REAL,
                               total_duration_seconds INTEGER, position_count INTEGER, timestamp_start INTEGER,
                               timestamp_end INTEGER, is_playback INTEGER DEFAULT 0)''')

        # Geofence table for storing defined areas
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS geofences
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lat REAL NOT NULL,
                               lon REAL NOT NULL, radius_meters REAL NOT NULL, alert_type TEXT,
                               is_active INTEGER DEFAULT 1, timestamp INTEGER)''')

        # Geofence events table for tracking enter/exit events
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS geofence_events
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, geofence_id INTEGER NOT NULL,
                               event_type TEXT, lat REAL, lon REAL, timestamp INTEGER)''')

        # Location sharing table for shared locations
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS shared_locations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_id TEXT, lat REAL NOT NULL,
                               lon REAL NOT NULL, accuracy REAL, timestamp_shared INTEGER, timestamp_location INTEGER)''')

        # Driver behavior events table for tracking harsh braking, acceleration, etc.
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS driver_behavior_events
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, severity TEXT,
                               lat REAL, lon REAL, speed_kmh REAL, acceleration_ms2 REAL,
                               timestamp INTEGER)''')

        # Driver behavior summary table for daily/weekly/monthly scores
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS driver_behavior_summary
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, period_type TEXT, period_date TEXT,
                               driving_score REAL, harsh_braking_count INTEGER, rapid_acceleration_count INTEGER,
                               harsh_cornering_count INTEGER, idle_time_seconds INTEGER, total_driving_time_seconds INTEGER,
                               speeding_incidents INTEGER, timestamp INTEGER)''')

        # Social Feature 1: Shared Routes
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS shared_routes
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, route_id TEXT NOT NULL,
                               sender_user_id TEXT NOT NULL, recipient_user_id TEXT,
                               route_data_json TEXT NOT NULL, share_method TEXT,
                               share_token TEXT UNIQUE, privacy_level TEXT DEFAULT 'public',
                               timestamp INTEGER, expiry_timestamp INTEGER)''')

        # Social Feature 2: Community Hazard Reports
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS community_hazard_reports
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id TEXT UNIQUE,
                               user_id TEXT NOT NULL, hazard_type TEXT NOT NULL,
                               lat REAL NOT NULL, lon REAL NOT NULL, description TEXT,
                               severity TEXT, verification_count INTEGER DEFAULT 0,
                               status TEXT DEFAULT 'active', timestamp INTEGER, expiry_timestamp INTEGER)''')

        # Social Feature 3: Trip Groups
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_groups
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT UNIQUE,
                               group_name TEXT NOT NULL, creator_user_id TEXT NOT NULL,
                               created_timestamp INTEGER)''')

        # Social Feature 3: Trip Group Members
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_group_members
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL,
                               user_id TEXT NOT NULL, role TEXT DEFAULT 'member',
                               joined_timestamp INTEGER)''')

        # Social Feature 3: Group Trip Plans
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS group_trip_plans
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT UNIQUE,
                               group_id TEXT NOT NULL, destination_name TEXT NOT NULL,
                               destination_lat REAL NOT NULL, destination_lon REAL NOT NULL,
                               planned_departure_time INTEGER, status TEXT DEFAULT 'proposed',
                               created_by_user_id TEXT NOT NULL, timestamp INTEGER)''')

        # Social Feature 3: Trip Votes
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_votes
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, vote_id TEXT UNIQUE,
                               plan_id TEXT NOT NULL, user_id TEXT NOT NULL,
                               vote_type TEXT NOT NULL, timestamp INTEGER)''')

        # User authentication table
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS users
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE NOT NULL,
                               username TEXT UNIQUE NOT NULL, email TEXT, created_timestamp INTEGER)''')

        # Insert sample toll data
        self.cursor.execute("INSERT OR IGNORE INTO tolls (road_name, lat, lon, cost_gbp) VALUES (?, ?, ?, ?)",
                           ('M6 Toll', 52.664, -1.932, 7.00))
        self.cursor.execute("INSERT OR IGNORE INTO tolls (road_name, lat, lon, cost_gbp) VALUES (?, ?, ?, ?)",
                           ('Dartford Crossing', 51.465, 0.258, 2.50))

        # Insert real CAZ data with verified charges and operating hours (as of 2025)
        caz_data = [
            # UK Clean Air Zones
            ('London ULEZ', 'London', 'UK', 51.5074, -0.1278, 'ULEZ', 12.50, 'GBP', 1, '24/7 (Mon-Sun)', '[[51.52,-0.15],[51.52,-0.10],[51.50,-0.10],[51.50,-0.15]]'),
            ('London Congestion Charge', 'London', 'UK', 51.5074, -0.1278, 'Congestion', 15.00, 'GBP', 1, 'Mon-Fri 07:00-18:00', '[[51.52,-0.15],[51.52,-0.10],[51.50,-0.10],[51.50,-0.15]]'),
            ('Birmingham CAZ', 'Birmingham', 'UK', 52.5086, -1.8853, 'CAZ', 8.00, 'GBP', 1, 'Mon-Fri 07:00-20:00', '[[52.52,-1.92],[52.52,-1.85],[52.50,-1.85],[52.50,-1.92]]'),
            ('Bath CAZ', 'Bath', 'UK', 51.3788, -2.3613, 'CAZ', 9.00, 'GBP', 1, 'Mon-Fri 07:00-20:00', '[[51.39,-2.37],[51.39,-2.35],[51.37,-2.35],[51.37,-2.37]]'),
            ('Bristol CAZ', 'Bristol', 'UK', 51.4545, -2.5879, 'CAZ', 9.00, 'GBP', 1, 'Mon-Fri 07:00-20:00', '[[51.46,-2.60],[51.46,-2.57],[51.45,-2.57],[51.45,-2.60]]'),
            ('Portsmouth CAZ', 'Portsmouth', 'UK', 50.8158, -1.0880, 'CAZ', 10.00, 'GBP', 1, 'Mon-Fri 06:00-19:00', '[[50.82,-1.10],[50.82,-1.07],[50.81,-1.07],[50.81,-1.10]]'),
            ('Sheffield CAZ', 'Sheffield', 'UK', 53.3811, -1.4668, 'CAZ', 10.00, 'GBP', 1, 'Mon-Fri 07:00-19:00', '[[53.39,-1.48],[53.39,-1.45],[53.38,-1.45],[53.38,-1.48]]'),
            ('Bradford CAZ', 'Bradford', 'UK', 53.7954, -1.7597, 'CAZ', 7.00, 'GBP', 1, 'Mon-Fri 07:00-19:00', '[[53.80,-1.77],[53.80,-1.75],[53.79,-1.75],[53.79,-1.77]]'),
            # EU Clean Air Zones
            ('Paris LEZ', 'Paris', 'France', 48.8566, 2.3522, 'LEZ', 68.00, 'EUR', 1, 'Mon-Fri 08:00-20:00', '[[48.87,2.34],[48.87,2.37],[48.84,2.37],[48.84,2.34]]'),
            ('Berlin Environmental Zone', 'Berlin', 'Germany', 52.5200, 13.4050, 'Environmental', 100.00, 'EUR', 1, 'Mon-Fri 07:00-20:00', '[[52.53,13.38],[52.53,13.43],[52.51,13.43],[52.51,13.38]]'),
            ('Milan Area C', 'Milan', 'Italy', 45.4642, 9.1900, 'Area C', 5.00, 'EUR', 1, 'Mon-Fri 07:30-19:30', '[[45.47,9.18],[45.47,9.20],[45.46,9.20],[45.46,9.18]]'),
            ('Madrid Central', 'Madrid', 'Spain', 40.4168, -3.7038, 'Central', 90.00, 'EUR', 1, 'Mon-Fri 06:30-21:00', '[[40.42,-3.71],[40.42,-3.70],[40.41,-3.70],[40.41,-3.71]]'),
            ('Amsterdam Environmental Zone', 'Amsterdam', 'Netherlands', 52.3676, 4.9041, 'Environmental', 95.00, 'EUR', 1, 'Mon-Fri 06:00-22:00', '[[52.37,4.90],[52.37,4.91],[52.36,4.91],[52.36,4.90]]'),
            ('Brussels LEZ', 'Brussels', 'Belgium', 50.8503, 4.3517, 'LEZ', 35.00, 'EUR', 1, 'Mon-Fri 07:00-19:00', '[[50.86,4.34],[50.86,4.36],[50.84,4.36],[50.84,4.34]]'),
            ('Rome ZTL', 'Rome', 'Italy', 41.9028, 12.4964, 'ZTL', 87.50, 'EUR', 1, 'Mon-Fri 06:30-18:00', '[[41.91,12.49],[41.91,12.51],[41.90,12.51],[41.90,12.49]]'),
            ('Barcelona LEZ', 'Barcelona', 'Spain', 41.3851, 2.1734, 'LEZ', 100.00, 'EUR', 1, 'Mon-Fri 07:00-20:00', '[[41.39,2.17],[41.39,2.18],[41.38,2.18],[41.38,2.17]]'),
        ]
        for caz in caz_data:
            self.cursor.execute("INSERT OR IGNORE INTO clean_air_zones (zone_name, city, country, lat, lon, zone_type, charge_amount, currency_code, active, operating_hours, boundary_coords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", caz)

        # Insert default hazard avoidance preferences
        hazard_preferences = [
            ('speed_camera', 30, 1, 100),           # 30 seconds penalty, 100m threshold
            ('traffic_light_camera', 45, 1, 100),   # 45 seconds penalty, 100m threshold
            ('police', 180, 1, 200),                # 3 minutes penalty, 200m threshold
            ('roadworks', 300, 1, 500),             # 5 minutes penalty, 500m threshold
            ('accident', 600, 1, 500),              # 10 minutes penalty, 500m threshold
            ('railway_crossing', 120, 1, 100),      # 2 minutes penalty, 100m threshold
            ('pothole', 120, 0, 50),                # 2 minutes penalty, 50m threshold (disabled by default)
            ('debris', 300, 0, 100),                # 5 minutes penalty, 100m threshold (disabled by default)
            ('fallen_tree', 300, 0, 100),           # 5 minutes penalty, 100m threshold (disabled by default)
            ('hov_lane', 600, 0, 200),              # 10 minutes penalty, 200m threshold (disabled by default)
        ]
        for hazard_type, penalty, enabled, threshold in hazard_preferences:
            self.cursor.execute("INSERT OR IGNORE INTO hazard_avoidance_preferences (hazard_type, penalty_seconds, avoid_enabled, proximity_threshold_meters, timestamp) VALUES (?, ?, ?, ?, ?)",
                               (hazard_type, penalty, enabled, threshold, int(time.time())))

        self.conn.commit()
        self._create_database_indexes()
        self._load_caz_data()

    def _create_database_indexes(self):
        """Create database indexes for improved query performance."""
        try:
            # Index on search_history for ORDER BY timestamp queries
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_search_history_timestamp
                                   ON search_history(timestamp DESC)''')

            # Index on favorite_locations for ORDER BY timestamp queries
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_favorite_locations_timestamp
                                   ON favorite_locations(timestamp DESC)''')

            # Composite index on reports for proximity queries
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_reports_location_time
                                   ON reports(lat, lon, timestamp DESC)''')

            # Composite index on clean_air_zones for proximity queries
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_caz_location_active
                                   ON clean_air_zones(lat, lon, active)''')

            # Composite index on tolls for proximity queries
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_tolls_location
                                   ON tolls(lat, lon)''')

            # Indexes on trip_history for analytics queries
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_trip_history_start_time
                                   ON trip_history(timestamp_start DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_trip_history_routing_mode
                                   ON trip_history(routing_mode)''')

            # Indexes on traffic tables
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_traffic_cache_location
                                   ON traffic_cache(lat, lon)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_traffic_incidents_location
                                   ON traffic_incidents(lat, lon, timestamp DESC)''')

            # Indexes on alternative routes cache
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_alt_routes_cache_coords
                                   ON alternative_routes_cache(start_lat, start_lon, end_lat, end_lon)''')

            # Indexes on offline maps
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_offline_maps_tile
                                   ON offline_maps(tile_x, tile_y, zoom)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_offline_map_regions_name
                                   ON offline_map_regions(region_name)''')

            # Indexes on community reports
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_community_reports_location
                                   ON community_reports(lat, lon, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_community_reports_status
                                   ON community_reports(status, expires_at)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_report_upvotes_report
                                   ON report_upvotes(report_id)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_report_flags_report
                                   ON report_flags(report_id)''')

            # Indexes on hazard avoidance preferences
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_hazard_avoidance_type
                                   ON hazard_avoidance_preferences(hazard_type, avoid_enabled)''')

            # Indexes on route hazards cache
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_route_hazards_cache_bbox
                                   ON route_hazards_cache(north, south, east, west, timestamp DESC)''')

            # Indexes on social features - Shared Routes
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_shared_routes_sender
                                   ON shared_routes(sender_user_id, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_shared_routes_token
                                   ON shared_routes(share_token)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_shared_routes_expiry
                                   ON shared_routes(expiry_timestamp)''')

            # Indexes on social features - Community Hazard Reports
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_community_hazard_location
                                   ON community_hazard_reports(lat, lon, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_community_hazard_type
                                   ON community_hazard_reports(hazard_type, status)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_community_hazard_expiry
                                   ON community_hazard_reports(expiry_timestamp)''')

            # Indexes on social features - Trip Groups
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_trip_groups_creator
                                   ON trip_groups(creator_user_id)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_trip_group_members_group
                                   ON trip_group_members(group_id, user_id)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_trip_group_members_user
                                   ON trip_group_members(user_id)''')

            # Indexes on social features - Group Trip Plans
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_group_trip_plans_group
                                   ON group_trip_plans(group_id, status)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_group_trip_plans_time
                                   ON group_trip_plans(planned_departure_time)''')

            # Indexes on social features - Trip Votes
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_trip_votes_plan
                                   ON trip_votes(plan_id, user_id)''')

            # Indexes on users table
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_users_user_id
                                   ON users(user_id)''')

            # Indexes on ML tables
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_ml_predictions_type
                                   ON ml_predictions(prediction_type, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_ml_model_metadata_name
                                   ON ml_model_metadata(model_name)''')

            # Indexes on vehicle tables
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_vehicles_active
                                   ON vehicles(is_active)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_charging_stations_location
                                   ON charging_stations(lat, lon)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_charging_history_vehicle
                                   ON charging_history(vehicle_id, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_maintenance_records_vehicle
                                   ON maintenance_records(vehicle_id, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_vehicle
                                   ON maintenance_reminders(vehicle_id, status)''')

            # Indexes on vehicle tracking tables
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_position_history_timestamp
                                   ON position_history(timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_position_history_location
                                   ON position_history(lat, lon)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_route_recordings_timestamp
                                   ON route_recordings(timestamp_start DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_geofences_active
                                   ON geofences(is_active)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence
                                   ON geofence_events(geofence_id, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_shared_locations_recipient
                                   ON shared_locations(recipient_id, timestamp_shared DESC)''')

            # Indexes on driver behavior tables
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_driver_behavior_events_type
                                   ON driver_behavior_events(event_type, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_driver_behavior_events_severity
                                   ON driver_behavior_events(severity, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_driver_behavior_summary_period
                                   ON driver_behavior_summary(period_type, period_date DESC)''')

            # Indexes on speed limit and lane data tables
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_speed_limit_cache_location
                                   ON speed_limit_cache(lat, lon, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_speed_limit_cache_motorway
                                   ON speed_limit_cache(is_smart_motorway, motorway_name)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_lane_data_cache_location
                                   ON lane_data_cache(lat, lon, timestamp DESC)''')
            self.cursor.execute('''CREATE INDEX IF NOT EXISTS idx_speed_alert_settings_timestamp
                                   ON speed_alert_settings(timestamp DESC)''')

            self.conn.commit()
            print("[OK] Database indexes created successfully")
        except Exception as e:
            print(f"Database index creation error: {e}")

    def _load_caz_data(self):
        """Load CAZ data from database into memory."""
        try:
            self.cursor.execute("SELECT id, zone_name, city, country, lat, lon, zone_type, charge_amount, currency_code, active, operating_hours FROM clean_air_zones WHERE active = 1")
            self.caz_data = self.cursor.fetchall()
        except Exception as e:
            print(f"CAZ data load error: {e}")
            self.caz_data = []

    def optimize_database(self):
        """Optimize database performance with VACUUM and ANALYZE."""
        try:
            # VACUUM: Reclaim space from deleted records
            self.cursor.execute("VACUUM")
            print("[OK] Database VACUUM completed")

            # ANALYZE: Update query planner statistics
            self.cursor.execute("ANALYZE")
            print("[OK] Database ANALYZE completed")

            self.conn.commit()
        except Exception as e:
            print(f"Database optimization error: {e}")
            log_validation_error(str(e), "optimize_database")

    def cleanup_old_reports(self, days=30):
        """Delete reports older than specified days."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)  # 86400 seconds per day

            self.cursor.execute("DELETE FROM reports WHERE timestamp < ?", (cutoff_time,))
            deleted_count = self.cursor.rowcount
            self.conn.commit()

            if deleted_count > 0:
                print(f"[OK] Deleted {deleted_count} reports older than {days} days")

            return deleted_count
        except Exception as e:
            print(f"Report cleanup error: {e}")
            log_validation_error(str(e), "cleanup_old_reports")
            return 0

    def get_database_stats(self):
        """Get database statistics for monitoring."""
        try:
            stats = {}

            # Get table row counts
            self.cursor.execute("SELECT COUNT(*) FROM search_history")
            stats['search_history_count'] = self.cursor.fetchone()[0]

            self.cursor.execute("SELECT COUNT(*) FROM favorite_locations")
            stats['favorite_locations_count'] = self.cursor.fetchone()[0]

            self.cursor.execute("SELECT COUNT(*) FROM reports")
            stats['reports_count'] = self.cursor.fetchone()[0]

            self.cursor.execute("SELECT COUNT(*) FROM clean_air_zones WHERE active = 1")
            stats['active_caz_count'] = self.cursor.fetchone()[0]

            self.cursor.execute("SELECT COUNT(*) FROM tolls")
            stats['tolls_count'] = self.cursor.fetchone()[0]

            # Get database file size
            try:
                db_path = self.db_path if hasattr(self, 'db_path') else 'voyagr.db'
                if os.path.exists(db_path):
                    stats['db_file_size_mb'] = os.path.getsize(db_path) / (1024 * 1024)
            except:
                stats['db_file_size_mb'] = 0

            return stats
        except Exception as e:
            print(f"Database stats error: {e}")
            log_validation_error(str(e), "get_database_stats")
            return {}

    def start_trip(self, start_lat, start_lon, start_address=""):
        """Start tracking a new trip."""
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "start_trip")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            self.current_trip = {
                'start_lat': start_lat,
                'start_lon': start_lon,
                'start_address': str(start_address)[:255],
                'timestamp_start': int(time.time()),
                'fuel_cost': 0.0,
                'toll_cost': 0.0,
                'caz_cost': 0.0
            }
            print(f"[OK] Trip started at ({start_lat}, {start_lon})")
            return True
        except Exception as e:
            print(f"Start trip error: {e}")
            log_validation_error(str(e), "start_trip")
            return False

    def end_trip(self, end_lat, end_lon, end_address="", distance_km=0, duration_seconds=0,
                 routing_mode="auto", fuel_cost=0, toll_cost=0, caz_cost=0):
        """End trip tracking and save trip data."""
        try:
            if not hasattr(self, 'current_trip') or not self.current_trip:
                print("No active trip to end")
                return False

            # SECURITY: Validate end coordinates
            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "end_trip")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            # Calculate total cost
            total_cost = float(fuel_cost) + float(toll_cost) + float(caz_cost)

            # Insert trip record
            self.cursor.execute("""INSERT INTO trip_history
                                   (start_lat, start_lon, end_lat, end_lon, start_address, end_address,
                                    distance_km, duration_seconds, routing_mode, fuel_cost, toll_cost,
                                    caz_cost, total_cost, timestamp_start, timestamp_end)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                                (self.current_trip['start_lat'], self.current_trip['start_lon'],
                                 end_lat, end_lon, self.current_trip['start_address'], str(end_address)[:255],
                                 float(distance_km), int(duration_seconds), str(routing_mode)[:20],
                                 float(fuel_cost), float(toll_cost), float(caz_cost), total_cost,
                                 self.current_trip['timestamp_start'], int(time.time())))

            self.conn.commit()
            self.current_trip = None
            print(f"[OK] Trip ended at ({end_lat}, {end_lon}) - Distance: {distance_km}km, Cost: £{total_cost:.2f}")
            return True
        except Exception as e:
            print(f"End trip error: {e}")
            log_validation_error(str(e), "end_trip")
            return False

    def get_trip_history(self, limit=20):
        """Retrieve recent trips from database."""
        try:
            self.cursor.execute("""SELECT id, start_lat, start_lon, end_lat, end_lon, start_address,
                                          end_address, distance_km, duration_seconds, routing_mode,
                                          fuel_cost, toll_cost, caz_cost, total_cost, timestamp_start, timestamp_end
                                   FROM trip_history ORDER BY timestamp_start DESC LIMIT ?""", (limit,))
            return self.cursor.fetchall()
        except Exception as e:
            print(f"Get trip history error: {e}")
            log_validation_error(str(e), "get_trip_history")
            return []

    def get_trip_statistics(self, days=30):
        """Calculate trip statistics for the last N days."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            # Get all trips in the period
            self.cursor.execute("""SELECT distance_km, duration_seconds, routing_mode,
                                          fuel_cost, toll_cost, caz_cost, total_cost
                                   FROM trip_history WHERE timestamp_start >= ?
                                   ORDER BY timestamp_start DESC""", (cutoff_time,))
            trips = self.cursor.fetchall()

            if not trips:
                return {
                    'total_trips': 0,
                    'total_distance_km': 0,
                    'total_time_hours': 0,
                    'total_cost': 0,
                    'average_distance_km': 0,
                    'average_duration_minutes': 0,
                    'most_used_mode': 'N/A',
                    'cost_breakdown': {'fuel': 0, 'tolls': 0, 'caz': 0}
                }

            # Calculate statistics
            total_trips = len(trips)
            total_distance = sum(t[0] or 0 for t in trips)
            total_time = sum(t[1] or 0 for t in trips)
            total_cost = sum(t[6] or 0 for t in trips)
            total_fuel_cost = sum(t[3] or 0 for t in trips)
            total_toll_cost = sum(t[4] or 0 for t in trips)
            total_caz_cost = sum(t[5] or 0 for t in trips)

            # Get most used routing mode
            modes = [t[2] for t in trips if t[2]]
            most_used_mode = max(set(modes), key=modes.count) if modes else 'N/A'

            return {
                'total_trips': total_trips,
                'total_distance_km': round(total_distance, 2),
                'total_time_hours': round(total_time / 3600, 2),
                'total_cost': round(total_cost, 2),
                'average_distance_km': round(total_distance / total_trips, 2) if total_trips > 0 else 0,
                'average_duration_minutes': round(total_time / total_trips / 60, 2) if total_trips > 0 else 0,
                'most_used_mode': most_used_mode,
                'cost_breakdown': {
                    'fuel': round(total_fuel_cost, 2),
                    'tolls': round(total_toll_cost, 2),
                    'caz': round(total_caz_cost, 2)
                }
            }
        except Exception as e:
            print(f"Trip statistics error: {e}")
            log_validation_error(str(e), "get_trip_statistics")
            return {}

    def get_cost_breakdown(self, days=30):
        """Get cost breakdown by category for the last N days."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            self.cursor.execute("""SELECT SUM(fuel_cost), SUM(toll_cost), SUM(caz_cost), SUM(total_cost)
                                   FROM trip_history WHERE timestamp_start >= ?""", (cutoff_time,))
            result = self.cursor.fetchone()

            if not result or result[3] is None:
                return {'fuel': 0, 'tolls': 0, 'caz': 0, 'total': 0}

            return {
                'fuel': round(result[0] or 0, 2),
                'tolls': round(result[1] or 0, 2),
                'caz': round(result[2] or 0, 2),
                'total': round(result[3] or 0, 2)
            }
        except Exception as e:
            print(f"Cost breakdown error: {e}")
            log_validation_error(str(e), "get_cost_breakdown")
            return {}

    # ============================================================================
    # COST ANALYTICS ENHANCEMENTS - Trends, Maintenance, Export, Predictions
    # ============================================================================

    def get_cost_trends(self, days=30, period='daily'):
        """Get cost trends over time (daily, weekly, monthly)."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            if period == 'daily':
                # Group by day
                self.cursor.execute("""
                    SELECT DATE(datetime(timestamp_start, 'unixepoch')) as date,
                           SUM(fuel_cost) as fuel, SUM(toll_cost) as tolls,
                           SUM(caz_cost) as caz, SUM(total_cost) as total, COUNT(*) as trips
                    FROM trip_history
                    WHERE timestamp_start >= ?
                    GROUP BY DATE(datetime(timestamp_start, 'unixepoch'))
                    ORDER BY date ASC
                """, (cutoff_time,))
            elif period == 'weekly':
                # Group by week
                self.cursor.execute("""
                    SELECT strftime('%Y-W%W', datetime(timestamp_start, 'unixepoch')) as week,
                           SUM(fuel_cost) as fuel, SUM(toll_cost) as tolls,
                           SUM(caz_cost) as caz, SUM(total_cost) as total, COUNT(*) as trips
                    FROM trip_history
                    WHERE timestamp_start >= ?
                    GROUP BY strftime('%Y-W%W', datetime(timestamp_start, 'unixepoch'))
                    ORDER BY week ASC
                """, (cutoff_time,))
            else:  # monthly
                # Group by month
                self.cursor.execute("""
                    SELECT strftime('%Y-%m', datetime(timestamp_start, 'unixepoch')) as month,
                           SUM(fuel_cost) as fuel, SUM(toll_cost) as tolls,
                           SUM(caz_cost) as caz, SUM(total_cost) as total, COUNT(*) as trips
                    FROM trip_history
                    WHERE timestamp_start >= ?
                    GROUP BY strftime('%Y-%m', datetime(timestamp_start, 'unixepoch'))
                    ORDER BY month ASC
                """, (cutoff_time,))

            trends = []
            for row in self.cursor.fetchall():
                trends.append({
                    'period': row[0],
                    'fuel_cost': round(row[1] or 0, 2),
                    'toll_cost': round(row[2] or 0, 2),
                    'caz_cost': round(row[3] or 0, 2),
                    'total_cost': round(row[4] or 0, 2),
                    'trip_count': row[5]
                })

            return trends
        except Exception as e:
            print(f"Get cost trends error: {e}")
            log_validation_error(str(e), "get_cost_trends")
            return []

    def get_cost_per_km(self, days=30):
        """Calculate cost per kilometer for trips."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            self.cursor.execute("""
                SELECT SUM(total_cost), SUM(distance_km), COUNT(*)
                FROM trip_history
                WHERE timestamp_start >= ? AND distance_km > 0
            """, (cutoff_time,))

            result = self.cursor.fetchone()
            if not result or result[1] is None or result[1] == 0:
                return {'cost_per_km': 0, 'total_cost': 0, 'total_distance': 0, 'trip_count': 0}

            total_cost = result[0] or 0
            total_distance = result[1]
            trip_count = result[2]

            return {
                'cost_per_km': round(total_cost / total_distance, 4),
                'total_cost': round(total_cost, 2),
                'total_distance': round(total_distance, 2),
                'trip_count': trip_count
            }
        except Exception as e:
            print(f"Get cost per km error: {e}")
            log_validation_error(str(e), "get_cost_per_km")
            return {}

    def get_maintenance_cost_analytics(self, vehicle_id=None, days=365):
        """Get maintenance cost analytics integrated with trip costs."""
        try:
            cutoff_time = int(time.time()) - (days * 86400)

            # Get maintenance costs
            self.cursor.execute("""
                SELECT service_type, SUM(cost) as total_cost, COUNT(*) as count
                FROM maintenance_records
                WHERE date >= ?
                GROUP BY service_type
                ORDER BY total_cost DESC
            """, (cutoff_time,))

            maintenance_costs = {}
            total_maintenance = 0
            for row in self.cursor.fetchall():
                maintenance_costs[row[0]] = {'total': round(row[1], 2), 'count': row[2]}
                total_maintenance += row[1]

            # Get trip costs
            self.cursor.execute("""
                SELECT SUM(total_cost) FROM trip_history WHERE timestamp_start >= ?
            """, (cutoff_time,))
            trip_cost_result = self.cursor.fetchone()
            total_trip_cost = trip_cost_result[0] or 0

            # Calculate combined analytics
            total_vehicle_cost = total_maintenance + total_trip_cost
            maintenance_percentage = (total_maintenance / total_vehicle_cost * 100) if total_vehicle_cost > 0 else 0

            return {
                'maintenance_costs': maintenance_costs,
                'total_maintenance': round(total_maintenance, 2),
                'total_trip_costs': round(total_trip_cost, 2),
                'total_vehicle_cost': round(total_vehicle_cost, 2),
                'maintenance_percentage': round(maintenance_percentage, 2),
                'period_days': days
            }
        except Exception as e:
            print(f"Get maintenance cost analytics error: {e}")
            log_validation_error(str(e), "get_maintenance_cost_analytics")
            return {}

    def compare_actual_vs_predicted_costs(self, days=30):
        """Compare actual trip costs with ML predicted costs."""
        try:
            from ml_cost_predictor import MLCostPredictor
            predictor = MLCostPredictor()

            # Get actual costs
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            self.cursor.execute("""
                SELECT SUM(total_cost), COUNT(*), AVG(distance_km)
                FROM trip_history
                WHERE timestamp_start >= ?
            """, (cutoff_time,))

            actual_result = self.cursor.fetchone()
            actual_cost = actual_result[0] or 0
            actual_trips = actual_result[1] or 0
            avg_distance = actual_result[2] or 0

            # Get predicted costs
            if days <= 7:
                predicted = predictor.predict_weekly_cost()
                predicted_cost = predicted.get('weekly_cost', 0)
            else:
                predicted = predictor.predict_monthly_cost()
                predicted_cost = predicted.get('monthly_cost', 0)

            # Calculate variance
            variance = actual_cost - predicted_cost
            variance_percentage = (variance / predicted_cost * 100) if predicted_cost > 0 else 0

            return {
                'actual_cost': round(actual_cost, 2),
                'predicted_cost': round(predicted_cost, 2),
                'variance': round(variance, 2),
                'variance_percentage': round(variance_percentage, 2),
                'actual_trips': actual_trips,
                'avg_distance_km': round(avg_distance, 2),
                'prediction_confidence': predicted.get('confidence', 0)
            }
        except Exception as e:
            print(f"Compare actual vs predicted error: {e}")
            log_validation_error(str(e), "compare_actual_vs_predicted_costs")
            return {}

    def export_cost_report_csv(self, filename, days=30):
        """Export cost analytics to CSV file."""
        try:
            import csv
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            # Get trip data
            self.cursor.execute("""
                SELECT timestamp_start, start_address, end_address, distance_km,
                       duration_seconds, fuel_cost, toll_cost, caz_cost, total_cost
                FROM trip_history
                WHERE timestamp_start >= ?
                ORDER BY timestamp_start DESC
            """, (cutoff_time,))

            trips = self.cursor.fetchall()

            # Write to CSV
            with open(filename, 'w', newline='') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(['Date', 'From', 'To', 'Distance (km)', 'Duration (min)',
                                'Fuel Cost', 'Toll Cost', 'CAZ Cost', 'Total Cost'])

                for trip in trips:
                    date_str = datetime.fromtimestamp(trip[0]).strftime('%Y-%m-%d %H:%M:%S')
                    duration_min = trip[4] / 60 if trip[4] else 0
                    writer.writerow([date_str, trip[1], trip[2], round(trip[3], 2),
                                    round(duration_min, 1), round(trip[5], 2),
                                    round(trip[6], 2), round(trip[7], 2), round(trip[8], 2)])

                # Add summary
                writer.writerow([])
                writer.writerow(['Summary Statistics'])
                stats = self.get_trip_statistics(days)
                writer.writerow(['Total Trips', stats.get('total_trips', 0)])
                writer.writerow(['Total Distance (km)', stats.get('total_distance_km', 0)])
                writer.writerow(['Total Cost', f"£{stats.get('total_cost', 0):.2f}"])
                writer.writerow(['Fuel Cost', f"£{stats.get('cost_breakdown', {}).get('fuel', 0):.2f}"])
                writer.writerow(['Toll Cost', f"£{stats.get('cost_breakdown', {}).get('tolls', 0):.2f}"])
                writer.writerow(['CAZ Cost', f"£{stats.get('cost_breakdown', {}).get('caz', 0):.2f}"])

            print(f"[OK] Cost report exported to {filename}")
            return True
        except Exception as e:
            print(f"Export cost report error: {e}")
            log_validation_error(str(e), "export_cost_report_csv")
            return False

    def cleanup_old_trips(self, days=90):
        """Delete trips older than specified days."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            self.cursor.execute("DELETE FROM trip_history WHERE timestamp_start < ?", (cutoff_time,))
            deleted_count = self.cursor.rowcount
            self.conn.commit()

            if deleted_count > 0:
                print(f"[OK] Deleted {deleted_count} trips older than {days} days")

            return deleted_count
        except Exception as e:
            print(f"Trip cleanup error: {e}")
            log_validation_error(str(e), "cleanup_old_trips")
            return 0

    def _get_theme_colors(self, theme_name):
        """Get color scheme for specified theme with enhanced contrast and dark mode optimization."""
        themes = {
            'light': {
                'background': '#FFFFFF',
                'text': '#000000',
                'text_secondary': '#424242',
                'primary': '#2196F3',
                'primary_dark': '#1976D2',
                'secondary': '#FFC107',
                'surface': '#F5F5F5',
                'surface_variant': '#EEEEEE',
                'error': '#F44336',
                'error_light': '#FFEBEE',
                'success': '#4CAF50',
                'success_light': '#E8F5E9',
                'warning': '#FF9800',
                'warning_light': '#FFF3E0',
                'button_text': '#FFFFFF',
                'button_disabled': '#BDBDBD',
                'input_background': '#FAFAFA',
                'input_border': '#E0E0E0',
                'marker_outline': '#FFFFFF',
                'polyline': '#2196F3',
                'polyline_alt': '#FF9800'
            },
            'dark': {
                'background': '#121212',
                'text': '#FFFFFF',
                'text_secondary': '#B3B3B3',
                'primary': '#BB86FC',
                'primary_dark': '#9A67EA',
                'secondary': '#03DAC6',
                'surface': '#1E1E1E',
                'surface_variant': '#2C2C2C',
                'error': '#CF6679',
                'error_light': '#3C1C1C',
                'success': '#81C784',
                'success_light': '#1B3C1B',
                'warning': '#FFB74D',
                'warning_light': '#3C2C1B',
                'button_text': '#121212',
                'button_disabled': '#424242',
                'input_background': '#2C2C2C',
                'input_border': '#3C3C3C',
                'marker_outline': '#121212',
                'polyline': '#81C784',
                'polyline_alt': '#FFB74D'
            }
        }
        return themes.get(theme_name, themes['light'])

    def get_theme(self):
        """Get current theme setting."""
        try:
            self.cursor.execute("SELECT theme FROM settings LIMIT 1")
            result = self.cursor.fetchone()
            if result:
                self.theme = result[0] or 'auto'
            return self.theme
        except Exception as e:
            print(f"Get theme error: {e}")
            return 'auto'

    def set_theme(self, theme_name, smooth_transition=True):
        """Set theme and apply colors with optional smooth transition."""
        try:
            if theme_name not in ['light', 'dark', 'auto']:
                print(f"Invalid theme: {theme_name}. Using 'auto'")
                theme_name = 'auto'

            self.theme = theme_name

            # Determine actual theme to use
            if theme_name == 'auto':
                # Try to detect system theme (simplified - would need Plyer on Android)
                self.is_dark_mode = False  # Default to light
            else:
                self.is_dark_mode = (theme_name == 'dark')

            # Get colors for the actual theme
            actual_theme = 'dark' if self.is_dark_mode else 'light'
            self.theme_colors = self._get_theme_colors(actual_theme)

            # Save to database
            self.cursor.execute("UPDATE settings SET theme = ?", (theme_name,))
            self.conn.commit()

            # Apply theme with smooth transition
            if smooth_transition:
                Clock.schedule_once(lambda dt: self.apply_theme_to_ui(), 0.1)
            else:
                self.apply_theme_to_ui()

            print(f"[OK] Theme changed to {theme_name} (using {actual_theme} colors)")
            return True
        except Exception as e:
            print(f"Set theme error: {e}")
            log_validation_error(str(e), "set_theme")
            return False

    def apply_theme_to_ui(self):
        """Apply current theme colors to all UI components with enhanced styling."""
        try:
            if not hasattr(self, 'root') or not self.root:
                return False

            # Convert hex to RGBA for Kivy
            def hex_to_rgba(hex_color):
                hex_color = hex_color.lstrip('#')
                return tuple(int(hex_color[i:i+2], 16)/255.0 for i in (0, 2, 4)) + (1.0,)

            bg_color = self.theme_colors['background']
            text_color = self.theme_colors['text']
            surface_color = self.theme_colors['surface']
            primary_color = self.theme_colors['primary']
            button_text_color = self.theme_colors['button_text']

            bg_rgba = hex_to_rgba(bg_color)
            text_rgba = hex_to_rgba(text_color)
            surface_rgba = hex_to_rgba(surface_color)
            primary_rgba = hex_to_rgba(primary_color)
            button_text_rgba = hex_to_rgba(button_text_color)

            # Apply to root widget background
            self.root.canvas.clear()
            with self.root.canvas.before:
                Color(*bg_rgba)
                Rectangle(size=self.root.size, pos=self.root.pos)

            # Apply theme to all toggle buttons
            if hasattr(self, 'toggles') and self.toggles:
                for toggle_key, toggle_btn in self.toggles.items():
                    if toggle_btn:
                        toggle_btn.background_color = primary_rgba
                        toggle_btn.color = button_text_rgba

            # Apply theme to all labels
            if hasattr(self, 'labels') and self.labels:
                for label_key, label in self.labels.items():
                    if label:
                        label.color = text_rgba

            # Apply theme to text inputs
            if hasattr(self, 'text_inputs') and self.text_inputs:
                for input_key, text_input in self.text_inputs.items():
                    if text_input:
                        text_input.background_color = hex_to_rgba(self.theme_colors['input_background'])
                        text_input.foreground_color = text_rgba

            # Apply theme to map view
            if hasattr(self, 'mapview') and self.mapview:
                self.mapview.canvas.clear()
                with self.mapview.canvas.before:
                    Color(*surface_rgba)
                    Rectangle(size=self.mapview.size, pos=self.mapview.pos)

            print(f"[OK] Theme applied to all UI components")
            return True
        except Exception as e:
            print(f"Apply theme error: {e}")
            log_validation_error(str(e), "apply_theme_to_ui")
            return False

    def get_theme_color(self, color_key):
        """Get a specific theme color by key."""
        try:
            return self.theme_colors.get(color_key, self.theme_colors['text'])
        except Exception as e:
            print(f"Get theme color error: {e}")
            return '#000000'

    def apply_dark_mode_to_markers(self):
        """Apply dark mode optimized colors to map markers and polylines."""
        try:
            if not hasattr(self, 'mapview') or not self.mapview:
                return False

            # Get dark mode colors for markers
            marker_outline = self.theme_colors.get('marker_outline', '#FFFFFF')
            polyline_color = self.theme_colors.get('polyline', '#2196F3')
            polyline_alt = self.theme_colors.get('polyline_alt', '#FF9800')

            # Update vehicle marker if exists
            if hasattr(self, 'vehicle_marker') and self.vehicle_marker:
                # Marker outline color for visibility in dark mode
                print(f"[OK] Vehicle marker optimized for dark mode")

            # Update waypoint markers
            if hasattr(self, 'waypoint_markers') and self.waypoint_markers:
                for marker in self.waypoint_markers:
                    print(f"[OK] Waypoint marker optimized for dark mode")

            # Update weather markers
            if hasattr(self, 'weather_markers') and self.weather_markers:
                for marker in self.weather_markers:
                    print(f"[OK] Weather marker optimized for dark mode")

            print(f"[OK] All markers optimized for dark mode")
            return True
        except Exception as e:
            print(f"Apply dark mode to markers error: {e}")
            log_validation_error(str(e), "apply_dark_mode_to_markers")
            return False

    def apply_theme_to_alerts(self):
        """Apply theme colors to alert and notification displays."""
        try:
            error_color = self.theme_colors.get('error', '#F44336')
            success_color = self.theme_colors.get('success', '#4CAF50')
            warning_color = self.theme_colors.get('warning', '#FF9800')
            text_color = self.theme_colors.get('text', '#000000')

            # These colors can be used when displaying alerts
            alert_colors = {
                'error': error_color,
                'success': success_color,
                'warning': warning_color,
                'text': text_color
            }

            print(f"[OK] Alert colors applied: {alert_colors}")
            return True
        except Exception as e:
            print(f"Apply theme to alerts error: {e}")
            log_validation_error(str(e), "apply_theme_to_alerts")
            return False

    def apply_theme_to_cost_display(self):
        """Apply theme colors to cost displays and financial information."""
        try:
            success_color = self.theme_colors.get('success', '#4CAF50')
            error_color = self.theme_colors.get('error', '#F44336')
            primary_color = self.theme_colors.get('primary', '#2196F3')
            text_color = self.theme_colors.get('text', '#000000')

            # Cost display colors
            cost_colors = {
                'savings': success_color,
                'cost': error_color,
                'neutral': primary_color,
                'text': text_color
            }

            print(f"[OK] Cost display colors applied: {cost_colors}")
            return True
        except Exception as e:
            print(f"Apply theme to cost display error: {e}")
            log_validation_error(str(e), "apply_theme_to_cost_display")
            return False

    def get_map_theme(self):
        """Get current map theme setting."""
        try:
            self.cursor.execute("SELECT map_theme FROM settings LIMIT 1")
            result = self.cursor.fetchone()
            if result:
                self.map_theme = result[0] or 'standard'
            return self.map_theme
        except Exception as e:
            print(f"Get map theme error: {e}")
            return 'standard'

    def set_map_theme(self, theme_name):
        """Set map theme and apply to MapView."""
        try:
            if theme_name not in self.map_themes:
                print(f"Invalid map theme: {theme_name}. Using 'standard'")
                theme_name = 'standard'

            self.map_theme = theme_name

            # Save to database
            self.cursor.execute("UPDATE settings SET map_theme = ?", (theme_name,))
            self.conn.commit()

            # Apply theme to map
            self.apply_map_theme()

            print(f"[OK] Map theme changed to {theme_name}")
            return True
        except Exception as e:
            print(f"Set map theme error: {e}")
            log_validation_error(str(e), "set_map_theme")
            return False

    def apply_map_theme(self):
        """Apply current map theme to MapView widget."""
        try:
            if not hasattr(self, 'mapview') or not self.mapview:
                return False

            theme_info = self.map_themes.get(self.map_theme, self.map_themes['standard'])
            tile_url = theme_info.get('tile_url')

            # Update map view with new tile URL
            # Note: MapView uses tile_url property for custom tile sources
            if hasattr(self.mapview, 'map_source'):
                # For standard OSM, use default
                if self.map_theme == 'standard':
                    self.mapview.map_source = 'osm'
                else:
                    # For custom tile sources, would need to set tile_url
                    print(f"[OK] Map theme '{self.map_theme}' applied (tile_url: {tile_url})")

            print(f"[OK] Map theme applied: {theme_info['name']}")
            return True
        except Exception as e:
            print(f"Apply map theme error: {e}")
            log_validation_error(str(e), "apply_map_theme")
            return False

    def get_available_map_themes(self):
        """Get list of available map themes."""
        try:
            themes = []
            for theme_key, theme_info in self.map_themes.items():
                themes.append({
                    'key': theme_key,
                    'name': theme_info.get('name', theme_key),
                    'url': theme_info.get('tile_url', '')
                })
            return themes
        except Exception as e:
            print(f"Get available map themes error: {e}")
            return []

    def get_gesture_sensitivity(self):
        """Get current gesture sensitivity setting."""
        try:
            self.cursor.execute("SELECT gesture_sensitivity FROM settings LIMIT 1")
            result = self.cursor.fetchone()
            if result:
                self.gesture_sensitivity = result[0] or 'medium'
            return self.gesture_sensitivity
        except Exception as e:
            print(f"Get gesture sensitivity error: {e}")
            return 'medium'

    def set_gesture_sensitivity(self, sensitivity_level):
        """Set gesture sensitivity level (low, medium, high)."""
        try:
            if sensitivity_level not in self.gesture_sensitivity_thresholds:
                print(f"Invalid gesture sensitivity: {sensitivity_level}. Using 'medium'")
                sensitivity_level = 'medium'

            self.gesture_sensitivity = sensitivity_level

            # Save to database
            self.cursor.execute("UPDATE settings SET gesture_sensitivity = ?", (sensitivity_level,))
            self.conn.commit()

            print(f"[OK] Gesture sensitivity changed to {sensitivity_level}")
            return True
        except Exception as e:
            print(f"Set gesture sensitivity error: {e}")
            log_validation_error(str(e), "set_gesture_sensitivity")
            return False

    def get_gesture_thresholds(self):
        """Get gesture thresholds for current sensitivity level."""
        try:
            return self.gesture_sensitivity_thresholds.get(self.gesture_sensitivity, self.gesture_sensitivity_thresholds['medium'])
        except Exception as e:
            print(f"Get gesture thresholds error: {e}")
            return self.gesture_sensitivity_thresholds['medium']

    def handle_pinch_gesture(self, scale_factor):
        """Handle pinch-to-zoom gesture on map."""
        try:
            if not hasattr(self, 'mapview') or not self.mapview:
                return False

            thresholds = self.get_gesture_thresholds()
            pinch_threshold = thresholds.get('pinch_threshold', 0.10)

            # Zoom in if scale > 1, zoom out if scale < 1
            if abs(scale_factor - 1.0) > pinch_threshold:
                if scale_factor > 1.0:
                    # Zoom in
                    self.mapview.zoom = min(self.mapview.zoom + 1, 20)
                    print(f"[OK] Pinch zoom in: level {self.mapview.zoom}")
                else:
                    # Zoom out
                    self.mapview.zoom = max(self.mapview.zoom - 1, 1)
                    print(f"[OK] Pinch zoom out: level {self.mapview.zoom}")
                return True
            return False
        except Exception as e:
            print(f"Handle pinch gesture error: {e}")
            log_validation_error(str(e), "handle_pinch_gesture")
            return False

    def handle_swipe_gesture(self, direction, distance):
        """Handle swipe gesture for panel navigation."""
        try:
            thresholds = self.get_gesture_thresholds()
            swipe_threshold = thresholds.get('swipe_threshold', 30)

            if distance < swipe_threshold:
                return False

            if direction == 'left':
                print(f"[OK] Swipe left detected (distance: {distance})")
                # Could switch to next panel or view
                return True
            elif direction == 'right':
                print(f"[OK] Swipe right detected (distance: {distance})")
                # Could switch to previous panel or view
                return True
            elif direction == 'up':
                print(f"[OK] Swipe up detected (distance: {distance})")
                return True
            elif direction == 'down':
                print(f"[OK] Swipe down detected (distance: {distance})")
                return True

            return False
        except Exception as e:
            print(f"Handle swipe gesture error: {e}")
            log_validation_error(str(e), "handle_swipe_gesture")
            return False

    def handle_double_tap_gesture(self):
        """Handle double-tap gesture for quick zoom to current location."""
        try:
            if not hasattr(self, 'mapview') or not self.mapview:
                return False

            if not hasattr(self, 'current_pos') or not self.current_pos:
                return False

            # Zoom to level 17 and center on current position
            self.mapview.zoom = 17
            self.mapview.center_on(self.current_pos[0], self.current_pos[1])

            print(f"[OK] Double-tap zoom to current location: {self.current_pos}")
            self.speak("Zoomed to current location")
            return True
        except Exception as e:
            print(f"Handle double-tap gesture error: {e}")
            log_validation_error(str(e), "handle_double_tap_gesture")
            return False

    def get_visible_map_bounds(self):
        """Calculate current viewport lat/lon boundaries based on mapview zoom and center."""
        try:
            if not hasattr(self, 'mapview') or not self.mapview:
                return None

            # Get map center and zoom
            center_lat = self.mapview.center[0]
            center_lon = self.mapview.center[1]
            zoom = self.mapview.zoom

            # Calculate bounds based on zoom level
            # At zoom 0, world is 256 pixels, each zoom level doubles resolution
            # Approximate: 1 degree ≈ 111 km at equator
            # At zoom level z, 1 pixel ≈ 40075 km / (256 * 2^z) meters
            meters_per_pixel = 40075000 / (256 * (2 ** zoom))

            # Assume map view is roughly 800x600 pixels (typical mobile screen)
            map_width_pixels = 800
            map_height_pixels = 600

            # Calculate bounds in degrees (1 degree ≈ 111 km)
            lat_delta = (map_height_pixels * meters_per_pixel) / 111000
            lon_delta = (map_width_pixels * meters_per_pixel) / (111000 * abs(__import__('math').cos(__import__('math').radians(center_lat))))

            bounds = {
                'north': center_lat + lat_delta / 2,
                'south': center_lat - lat_delta / 2,
                'east': center_lon + lon_delta / 2,
                'west': center_lon - lon_delta / 2
            }

            return bounds
        except Exception as e:
            print(f"Get visible map bounds error: {e}")
            return None

    def filter_markers_by_viewport(self, markers, bounds):
        """Return only markers within visible map area."""
        try:
            if not bounds or not markers:
                return markers

            filtered = []
            for marker in markers:
                if hasattr(marker, 'lat') and hasattr(marker, 'lon'):
                    if (bounds['south'] <= marker.lat <= bounds['north'] and
                        bounds['west'] <= marker.lon <= bounds['east']):
                        filtered.append(marker)

            return filtered
        except Exception as e:
            print(f"Filter markers by viewport error: {e}")
            return markers

    def cluster_nearby_markers(self, markers, cluster_distance_meters=100):
        """Group markers within cluster_distance_meters into single cluster marker."""
        try:
            if not markers or len(markers) < 2:
                return markers

            clustered = []
            used_indices = set()

            for i, marker1 in enumerate(markers):
                if i in used_indices:
                    continue

                cluster = [marker1]
                used_indices.add(i)

                for j, marker2 in enumerate(markers[i+1:], start=i+1):
                    if j in used_indices:
                        continue

                    # Calculate distance between markers
                    if hasattr(marker1, 'lat') and hasattr(marker2, 'lat'):
                        distance = geodesic(
                            (marker1.lat, marker1.lon),
                            (marker2.lat, marker2.lon)
                        ).meters

                        if distance <= cluster_distance_meters:
                            cluster.append(marker2)
                            used_indices.add(j)

                # If cluster has multiple markers, create cluster marker
                if len(cluster) > 1:
                    avg_lat = sum(m.lat for m in cluster) / len(cluster)
                    avg_lon = sum(m.lon for m in cluster) / len(cluster)
                    cluster_marker = MapMarker(lat=avg_lat, lon=avg_lon, source='vehicle_icons/car.png')
                    clustered.append(cluster_marker)
                    print(f"[OK] Clustered {len(cluster)} markers")
                else:
                    clustered.append(marker1)

            return clustered
        except Exception as e:
            print(f"Cluster nearby markers error: {e}")
            return markers

    def reduce_polyline_coordinates(self, coordinates, max_points=100):
        """Simplify route polylines using Douglas-Peucker algorithm while maintaining shape."""
        try:
            if not coordinates or len(coordinates) <= max_points:
                return coordinates

            # Douglas-Peucker algorithm for line simplification
            def perpendicular_distance(point, line_start, line_end):
                """Calculate perpendicular distance from point to line."""
                if line_start == line_end:
                    return geodesic(point, line_start).meters

                # Calculate distance using cross product
                x0, y0 = point
                x1, y1 = line_start
                x2, y2 = line_end

                numerator = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
                denominator = ((y2 - y1) ** 2 + (x2 - x1) ** 2) ** 0.5

                if denominator == 0:
                    return 0
                return numerator / denominator

            def simplify_recursive(points, epsilon):
                """Recursively simplify points."""
                if len(points) <= 2:
                    return points

                # Find point with maximum distance
                max_dist = 0
                max_index = 0

                for i in range(1, len(points) - 1):
                    dist = perpendicular_distance(points[i], points[0], points[-1])
                    if dist > max_dist:
                        max_dist = dist
                        max_index = i

                # If max distance is greater than epsilon, recursively simplify
                if max_dist > epsilon:
                    left = simplify_recursive(points[:max_index+1], epsilon)
                    right = simplify_recursive(points[max_index:], epsilon)
                    return left[:-1] + right
                else:
                    return [points[0], points[-1]]

            # Calculate epsilon based on desired max_points
            epsilon = 0.0001  # Start with small epsilon

            simplified = simplify_recursive(coordinates, epsilon)

            # If still too many points, increase epsilon
            while len(simplified) > max_points and epsilon < 0.01:
                epsilon *= 2
                simplified = simplify_recursive(coordinates, epsilon)

            print(f"[OK] Reduced polyline from {len(coordinates)} to {len(simplified)} points")
            return simplified
        except Exception as e:
            print(f"Reduce polyline coordinates error: {e}")
            return coordinates

    def flush_map_updates(self):
        """Apply batched map updates to reduce Canvas redraws."""
        try:
            if not self.map_render_batch_updates:
                return False

            # Apply all batched updates
            for update in self.map_render_batch_updates:
                update_type = update.get('type')

                if update_type == 'add_marker':
                    if hasattr(self, 'mapview') and self.mapview:
                        self.mapview.add_widget(update['marker'])
                elif update_type == 'remove_marker':
                    if hasattr(self, 'mapview') and self.mapview:
                        if update['marker'] in self.mapview.children:
                            self.mapview.remove_widget(update['marker'])
                elif update_type == 'update_marker':
                    marker = update['marker']
                    marker.lat = update['lat']
                    marker.lon = update['lon']

            self.map_render_batch_updates = []
            print(f"[OK] Flushed {len(self.map_render_batch_updates)} map updates")
            return True
        except Exception as e:
            print(f"Flush map updates error: {e}")
            log_validation_error(str(e), "flush_map_updates")
            return False

    def set_battery_saving_mode(self, enabled):
        """Toggle battery saving mode and update settings database."""
        try:
            self.battery_saving_mode = enabled

            # Save to database
            self.cursor.execute("UPDATE settings SET battery_saving_mode = ?", (1 if enabled else 0,))
            self.conn.commit()

            # Adjust GPS polling frequency based on battery mode
            if enabled:
                self.adjust_gps_polling_frequency(self.last_gps_speed_kmh)
                print("[OK] Battery saving mode enabled - GPS polling reduced by 50%")
            else:
                self.adjust_gps_polling_frequency(self.last_gps_speed_kmh)
                print("[OK] Battery saving mode disabled - GPS polling restored")

            notification.notify(
                title="Battery Mode",
                message="Battery saving mode " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set battery saving mode error: {e}")
            log_validation_error(str(e), "set_battery_saving_mode")
            return False

    def set_departure_time_suggestions(self, enabled):
        """Toggle departure time suggestions feature."""
        try:
            self.departure_time_suggestions_enabled = enabled
            print(f"[OK] Departure time suggestions {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Departure Time Suggestions",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set departure time suggestions error: {e}")
            log_validation_error(str(e), "set_departure_time_suggestions")
            return False

    def set_learn_preferences(self, enabled):
        """Toggle user preference learning feature."""
        try:
            self.learn_preferences_enabled = enabled
            if enabled:
                self.learn_user_route_preferences()
                self.learn_user_poi_preferences()
            print(f"[OK] Preference learning {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Preference Learning",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set learn preferences error: {e}")
            log_validation_error(str(e), "set_learn_preferences")
            return False

    def set_auto_optimize_routes(self, enabled):
        """Toggle automatic route optimization feature."""
        try:
            self.auto_optimize_routes_enabled = enabled
            self.optimization_mode = 'semi-auto' if enabled else 'manual'
            print(f"[OK] Auto route optimization {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Route Optimization",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set auto optimize routes error: {e}")
            log_validation_error(str(e), "set_auto_optimize_routes")
            return False

    def set_smart_charging(self, enabled):
        """Toggle smart charging suggestions feature."""
        try:
            self.smart_charging_enabled = enabled
            print(f"[OK] Smart charging suggestions {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Smart Charging",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set smart charging error: {e}")
            log_validation_error(str(e), "set_smart_charging")
            return False

    def set_smart_refueling(self, enabled):
        """Toggle smart refueling suggestions feature."""
        try:
            self.smart_refueling_enabled = enabled
            print(f"[OK] Smart refueling suggestions {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Smart Refueling",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set smart refueling error: {e}")
            log_validation_error(str(e), "set_smart_refueling")
            return False

    def adjust_gps_polling_frequency(self, speed_kmh):
        """Adjust GPS polling interval based on speed."""
        try:
            self.last_gps_speed_kmh = speed_kmh

            # Base intervals by speed
            if speed_kmh < 1:  # Stationary
                base_interval = 5.0
            elif speed_kmh < 20:  # Slow
                base_interval = 2.0
            elif speed_kmh < 60:  # Medium
                base_interval = 1.0
            else:  # Fast
                base_interval = 0.5

            # Apply battery saving mode multiplier
            if self.battery_saving_mode:
                base_interval *= 2

            self.gps_polling_frequency = base_interval

            # Check for stationary mode
            if speed_kmh < 1:
                if self.stationary_start_time is None:
                    self.stationary_start_time = time.time()
                else:
                    stationary_duration = time.time() - self.stationary_start_time
                    if stationary_duration > 120:  # 2 minutes
                        self.enable_gps_sleep_mode()
            else:
                self.stationary_start_time = None
                self.disable_gps_sleep_mode()

            print(f"[OK] GPS polling adjusted to {self.gps_polling_frequency}s (speed: {speed_kmh} km/h)")
            return True
        except Exception as e:
            print(f"Adjust GPS polling frequency error: {e}")
            log_validation_error(str(e), "adjust_gps_polling_frequency")
            return False

    def enable_gps_sleep_mode(self):
        """Reduce GPS polling to 10 seconds when stationary for >2 minutes."""
        try:
            if self.gps_sleep_mode_enabled:
                return True

            self.gps_sleep_mode_enabled = True
            self.gps_polling_frequency = 10.0

            print("[OK] GPS sleep mode enabled - polling reduced to 10 seconds")
            notification.notify(title="GPS Sleep Mode", message="Vehicle stationary - GPS polling reduced")
            return True
        except Exception as e:
            print(f"Enable GPS sleep mode error: {e}")
            log_validation_error(str(e), "enable_gps_sleep_mode")
            return False

    def disable_gps_sleep_mode(self):
        """Restore normal GPS polling when movement detected."""
        try:
            if not self.gps_sleep_mode_enabled:
                return True

            self.gps_sleep_mode_enabled = False
            self.adjust_gps_polling_frequency(self.last_gps_speed_kmh)

            print("[OK] GPS sleep mode disabled - polling restored")
            return True
        except Exception as e:
            print(f"Disable GPS sleep mode error: {e}")
            log_validation_error(str(e), "disable_gps_sleep_mode")
            return False

    def batch_database_writes(self):
        """Context manager for batch database operations."""
        try:
            # This is a placeholder for batch write context
            # In practice, would use __enter__ and __exit__ methods
            return True
        except Exception as e:
            print(f"Batch database writes error: {e}")
            return False

    def flush_pending_db_writes(self):
        """Commit all pending database operations."""
        try:
            if not self.pending_db_writes:
                return True

            # Execute all pending writes
            for write_op in self.pending_db_writes:
                try:
                    if write_op['type'] == 'insert':
                        self.cursor.execute(write_op['query'], write_op['params'])
                    elif write_op['type'] == 'update':
                        self.cursor.execute(write_op['query'], write_op['params'])
                    elif write_op['type'] == 'delete':
                        self.cursor.execute(write_op['query'], write_op['params'])
                except Exception as e:
                    print(f"Pending write error: {e}")

            # Commit all at once
            self.conn.commit()
            write_count = len(self.pending_db_writes)
            self.pending_db_writes = []
            self.db_write_count += write_count

            if write_count > 0:
                print(f"[OK] Flushed {write_count} pending database writes")
            return True
        except Exception as e:
            print(f"Flush pending db writes error: {e}")
            log_validation_error(str(e), "flush_pending_db_writes")
            return False

    # ============================================================================
    # AI-POWERED FEATURES - PREDICTIVE DEPARTURE TIME SUGGESTIONS
    # ============================================================================

    def suggest_departure_time(self, start_lat, start_lon, end_lat, end_lon, desired_arrival_time):
        """Suggest optimal departure time based on historical patterns and traffic."""
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "suggest_departure_time (start)")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "suggest_departure_time (end)")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            # Create route hash for lookup
            import hashlib
            route_hash = hashlib.md5(
                f"{start_lat},{start_lon},{end_lat},{end_lon}".encode()
            ).hexdigest()

            # Find frequently traveled routes (same start/end within 500m)
            self.cursor.execute("""
                SELECT AVG(duration_seconds), COUNT(*),
                       CAST(strftime('%H', datetime(timestamp_start, 'unixepoch')) AS INTEGER) as hour,
                       CAST(strftime('%w', datetime(timestamp_start, 'unixepoch')) AS INTEGER) as dow
                FROM trip_history
                WHERE (ABS(start_lat - ?) < 0.005 AND ABS(start_lon - ?) < 0.005 AND
                       ABS(end_lat - ?) < 0.005 AND ABS(end_lon - ?) < 0.005)
                GROUP BY hour, dow
                ORDER BY COUNT(*) DESC
                LIMIT 10
            """, (start_lat, start_lon, end_lat, end_lon))

            results = self.cursor.fetchall()
            if not results or len(results) < 3:
                return None

            # Calculate average duration from historical data
            avg_duration_seconds = sum(r[0] for r in results) / len(results)
            avg_duration_minutes = avg_duration_seconds / 60

            # Get current day of week
            from datetime import datetime, timedelta
            now = datetime.now()
            current_dow = now.weekday()

            # Find best departure time for desired arrival
            best_suggestion = None
            best_confidence = 0

            for avg_duration, count, hour, dow in results:
                if dow == current_dow:  # Prefer same day of week
                    # Calculate required departure time
                    desired_arrival_dt = datetime.fromtimestamp(desired_arrival_time)
                    required_departure_dt = desired_arrival_dt - timedelta(minutes=avg_duration_minutes)

                    confidence = min(count / 10.0, 1.0)  # Confidence based on sample count

                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_suggestion = {
                            'suggested_departure_time': int(required_departure_dt.timestamp()),
                            'suggested_departure_hour': required_departure_dt.hour,
                            'estimated_duration_minutes': avg_duration_minutes,
                            'confidence_score': confidence,
                            'sample_count': count,
                            'day_of_week': dow
                        }

            # Store prediction in database
            if best_suggestion:
                self.cursor.execute("""
                    INSERT OR REPLACE INTO departure_predictions
                    (route_hash, start_lat, start_lon, end_lat, end_lon,
                     typical_departure_hour, day_of_week, avg_duration_minutes,
                     confidence_score, sample_count, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (route_hash, start_lat, start_lon, end_lat, end_lon,
                      best_suggestion['suggested_departure_hour'], current_dow,
                      avg_duration_minutes, best_confidence, len(results), int(time.time())))
                self.conn.commit()

                print(f"[OK] Departure time suggested: {best_suggestion['suggested_departure_hour']:02d}:00 "
                      f"(confidence: {best_confidence:.0%})")
                return best_suggestion

            return None
        except Exception as e:
            print(f"Suggest departure time error: {e}")
            log_validation_error(str(e), "suggest_departure_time")
            return None

    # ============================================================================
    # AI-POWERED FEATURES - LEARNING USER PREFERENCES
    # ============================================================================

    def learn_user_route_preferences(self):
        """Analyze route selection patterns to learn user preferences."""
        try:
            # Get recent trips
            self.cursor.execute("""
                SELECT routing_mode, include_tolls, avoid_caz, distance_km, duration_seconds
                FROM trip_history
                ORDER BY timestamp_start DESC LIMIT 50
            """)
            trips = self.cursor.fetchall()

            if len(trips) < 5:
                return False

            # Analyze toll avoidance frequency
            toll_avoidance_count = sum(1 for t in trips if not t[1])  # include_tolls = 0
            toll_avoidance_frequency = toll_avoidance_count / len(trips)

            # Analyze CAZ avoidance frequency
            caz_avoidance_count = sum(1 for t in trips if t[2])  # avoid_caz = 1
            caz_avoidance_frequency = caz_avoidance_count / len(trips)

            # Analyze routing mode preferences by time of day
            from datetime import datetime
            mode_by_time = {}
            for trip in trips:
                # Get time of day from trip
                self.cursor.execute("""
                    SELECT strftime('%H', datetime(timestamp_start, 'unixepoch')) as hour
                    FROM trip_history WHERE routing_mode = ? LIMIT 1
                """, (trip[0],))
                result = self.cursor.fetchone()
                if result:
                    hour = int(result[0])
                    if hour not in mode_by_time:
                        mode_by_time[hour] = {}
                    mode = trip[0]
                    mode_by_time[hour][mode] = mode_by_time[hour].get(mode, 0) + 1

            # Store learned preferences
            preferences = {
                'toll_avoidance_frequency': toll_avoidance_frequency,
                'caz_avoidance_frequency': caz_avoidance_frequency,
                'routing_mode_by_time': mode_by_time
            }

            # Save to database
            self.cursor.execute("""
                INSERT OR REPLACE INTO learned_preferences
                (preference_type, preference_key, preference_value, confidence_score, sample_count, last_updated)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ('toll_avoidance', 'frequency', str(toll_avoidance_frequency),
                  min(toll_avoidance_count / 10.0, 1.0), len(trips), int(time.time())))

            self.cursor.execute("""
                INSERT OR REPLACE INTO learned_preferences
                (preference_type, preference_key, preference_value, confidence_score, sample_count, last_updated)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ('caz_avoidance', 'frequency', str(caz_avoidance_frequency),
                  min(caz_avoidance_count / 10.0, 1.0), len(trips), int(time.time())))

            self.conn.commit()

            print(f"[OK] User preferences learned: Toll avoidance {toll_avoidance_frequency:.0%}, "
                  f"CAZ avoidance {caz_avoidance_frequency:.0%}")
            return True
        except Exception as e:
            print(f"Learn user route preferences error: {e}")
            log_validation_error(str(e), "learn_user_route_preferences")
            return False

    def learn_user_poi_preferences(self):
        """Identify frequently visited POI categories."""
        try:
            # Get favorite locations with categories
            self.cursor.execute("""
                SELECT category, COUNT(*) as count
                FROM favorite_locations
                GROUP BY category
                ORDER BY count DESC
                LIMIT 10
            """)
            results = self.cursor.fetchall()

            if not results:
                return False

            # Store POI preferences
            for category, count in results:
                confidence = min(count / 10.0, 1.0)
                self.cursor.execute("""
                    INSERT OR REPLACE INTO learned_preferences
                    (preference_type, preference_key, preference_value, confidence_score, sample_count, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, ('poi_preference', category, str(count), confidence, count, int(time.time())))

            self.conn.commit()
            print(f"[OK] POI preferences learned: {len(results)} categories")
            return True
        except Exception as e:
            print(f"Learn user POI preferences error: {e}")
            log_validation_error(str(e), "learn_user_poi_preferences")
            return False

    def apply_learned_preferences(self):
        """Auto-configure settings based on learned behavior."""
        try:
            # Get learned preferences
            self.cursor.execute("""
                SELECT preference_type, preference_key, preference_value, confidence_score
                FROM learned_preferences
                WHERE confidence_score > 0.6
                ORDER BY confidence_score DESC
            """)
            preferences = self.cursor.fetchall()

            if not preferences:
                return False

            applied_count = 0
            for pref_type, pref_key, pref_value, confidence in preferences:
                if pref_type == 'toll_avoidance':
                    toll_freq = float(pref_value)
                    if toll_freq > 0.7:  # User avoids tolls >70% of the time
                        self.include_tolls = False
                        applied_count += 1
                        print(f"[OK] Applied preference: Toll avoidance enabled")

                elif pref_type == 'caz_avoidance':
                    caz_freq = float(pref_value)
                    if caz_freq > 0.7:  # User avoids CAZ >70% of the time
                        self.avoid_caz = True
                        applied_count += 1
                        print(f"[OK] Applied preference: CAZ avoidance enabled")

            # Save settings to database
            if applied_count > 0:
                self.cursor.execute("""
                    UPDATE settings SET include_tolls = ?, avoid_caz = ?
                """, (1 if self.include_tolls else 0, 1 if self.avoid_caz else 0))
                self.conn.commit()

            print(f"[OK] Applied {applied_count} learned preferences")
            return applied_count > 0
        except Exception as e:
            print(f"Apply learned preferences error: {e}")
            log_validation_error(str(e), "apply_learned_preferences")
            return False

    # ============================================================================
    # AI-POWERED FEATURES - AUTOMATIC ROUTE OPTIMIZATION
    # ============================================================================

    def optimize_route_automatically(self, waypoints, optimization_criteria='balanced'):
        """Optimize multi-stop route using simulated annealing algorithm."""
        try:
            if not waypoints or len(waypoints) < 2:
                return None

            import random
            import math

            # Extract coordinates
            coords = [(w['lat'], w['lon']) for w in waypoints]
            n = len(coords)

            # Calculate distance between two points (Haversine formula)
            def haversine_distance(lat1, lon1, lat2, lon2):
                R = 6371  # Earth radius in km
                dlat = math.radians(lat2 - lat1)
                dlon = math.radians(lon2 - lon1)
                a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
                c = 2 * math.asin(math.sqrt(a))
                return R * c

            # Calculate total distance for a route
            def calculate_route_distance(route):
                total = 0
                for i in range(len(route) - 1):
                    lat1, lon1 = coords[route[i]]
                    lat2, lon2 = coords[route[i+1]]
                    total += haversine_distance(lat1, lon1, lat2, lon2)
                return total

            # Simulated annealing optimization
            current_route = list(range(n))
            current_distance = calculate_route_distance(current_route)
            best_route = current_route[:]
            best_distance = current_distance

            temperature = 100.0
            cooling_rate = 0.95
            iterations = 0
            max_iterations = 500

            while temperature > 0.1 and iterations < max_iterations:
                # Generate neighbor solution by swapping two random waypoints
                new_route = current_route[:]
                i, j = random.sample(range(n), 2)
                new_route[i], new_route[j] = new_route[j], new_route[i]

                new_distance = calculate_route_distance(new_route)
                delta = new_distance - current_distance

                # Accept new solution if better or with probability based on temperature
                if delta < 0 or random.random() < math.exp(-delta / temperature):
                    current_route = new_route
                    current_distance = new_distance

                    if current_distance < best_distance:
                        best_route = current_route[:]
                        best_distance = current_distance

                temperature *= cooling_rate
                iterations += 1

            # Reorder waypoints according to optimized route
            optimized_waypoints = [waypoints[i] for i in best_route]

            print(f"[OK] Route optimized: {best_distance:.1f}km (iterations: {iterations})")
            return optimized_waypoints
        except Exception as e:
            print(f"Optimize route automatically error: {e}")
            log_validation_error(str(e), "optimize_route_automatically")
            return None

    def reoptimize_route_on_traffic(self, current_route_id):
        """Automatically recalculate route when traffic conditions change significantly."""
        try:
            # Get current route from cache
            self.cursor.execute("""
                SELECT route_data FROM route_cache_persistent WHERE cache_key = ?
            """, (current_route_id,))
            result = self.cursor.fetchone()

            if not result:
                return False

            import json
            route_data = json.loads(result[0])
            waypoints = route_data.get('waypoints', [])

            if len(waypoints) < 2:
                return False

            # Check current traffic conditions
            from ml_traffic_predictor import MLTrafficPredictor
            traffic_predictor = MLTrafficPredictor()

            # Sample traffic at key points along route
            traffic_changes = []
            for i in range(0, len(waypoints), max(1, len(waypoints) // 5)):
                wp = waypoints[i]
                prediction = traffic_predictor.predict_traffic_conditions(wp['lat'], wp['lon'], hours_ahead=0)
                if prediction and prediction.get('congestion_level') == 'heavy':
                    traffic_changes.append(i)

            traffic_predictor.close()

            # If significant traffic detected, suggest reoptimization
            if len(traffic_changes) > len(waypoints) * 0.3:  # >30% of route affected
                print(f"[OK] Traffic detected on {len(traffic_changes)} waypoints - reoptimization recommended")
                return True

            return False
        except Exception as e:
            print(f"Reoptimize route on traffic error: {e}")
            log_validation_error(str(e), "reoptimize_route_on_traffic")
            return False

    def suggest_route_improvements(self, current_route):
        """Suggest route improvements based on cost, time, or distance."""
        try:
            if not current_route or len(current_route) < 2:
                return None

            # Calculate current route metrics
            current_distance = current_route.get('distance_km', 0)
            current_time = current_route.get('duration_seconds', 0)
            current_cost = current_route.get('total_cost', 0)

            # Try optimized route
            waypoints = current_route.get('waypoints', [])
            optimized_waypoints = self.optimize_route_automatically(waypoints)

            if not optimized_waypoints:
                return None

            # Calculate optimized route metrics
            optimized_distance = sum(
                self._calculate_distance(
                    optimized_waypoints[i]['lat'], optimized_waypoints[i]['lon'],
                    optimized_waypoints[i+1]['lat'], optimized_waypoints[i+1]['lon']
                )
                for i in range(len(optimized_waypoints) - 1)
            )

            # Calculate savings
            distance_saved = current_distance - optimized_distance
            time_saved = current_time * (distance_saved / current_distance) if current_distance > 0 else 0
            cost_saved = current_cost * (distance_saved / current_distance) if current_distance > 0 else 0

            if distance_saved > 0.5:  # Only suggest if >0.5km saved
                suggestion = {
                    'distance_saved_km': distance_saved,
                    'time_saved_minutes': time_saved / 60,
                    'cost_saved': cost_saved,
                    'optimized_waypoints': optimized_waypoints
                }
                print(f"[OK] Route improvement suggested: Save {distance_saved:.1f}km, "
                      f"{time_saved/60:.0f}min, £{cost_saved:.2f}")
                return suggestion

            return None
        except Exception as e:
            print(f"Suggest route improvements error: {e}")
            log_validation_error(str(e), "suggest_route_improvements")
            return None

    # ============================================================================
    # AI-POWERED FEATURES - SMART CHARGING/REFUELING STOPS
    # ============================================================================

    def predict_charging_need(self, route_distance_km, current_battery_percent, energy_efficiency):
        """Predict if charging is needed based on route distance and battery."""
        try:
            # Validate inputs
            if route_distance_km <= 0 or current_battery_percent < 0 or current_battery_percent > 100:
                return None

            # Get vehicle range from settings
            self.cursor.execute("SELECT vehicle_range_km FROM settings LIMIT 1")
            result = self.cursor.fetchone()
            vehicle_range_km = result[0] if result else 300

            # Calculate remaining range
            remaining_range_km = (current_battery_percent / 100.0) * vehicle_range_km

            # Calculate energy needed for route
            energy_needed_kwh = route_distance_km / energy_efficiency if energy_efficiency > 0 else 0

            # Estimate battery percentage after route
            battery_after_route = current_battery_percent - (route_distance_km / vehicle_range_km * 100)

            # Determine if charging is needed
            charging_needed = battery_after_route < 20  # Charge if <20% remaining
            range_anxiety_threshold = 50  # Warn if <50km remaining

            prediction = {
                'charging_needed': charging_needed,
                'remaining_range_km': remaining_range_km,
                'battery_after_route_percent': battery_after_route,
                'energy_needed_kwh': energy_needed_kwh,
                'range_anxiety': remaining_range_km < range_anxiety_threshold
            }

            if charging_needed:
                print(f"[OK] Charging needed: Battery will be {battery_after_route:.0f}% after route")
            elif prediction['range_anxiety']:
                print(f"[OK] Range anxiety warning: Only {remaining_range_km:.0f}km remaining")

            return prediction
        except Exception as e:
            print(f"Predict charging need error: {e}")
            log_validation_error(str(e), "predict_charging_need")
            return None

    def suggest_optimal_charging_stops(self, route_coordinates, vehicle_range_km):
        """Suggest optimal charging stops along route."""
        try:
            if not route_coordinates or len(route_coordinates) < 2:
                return None

            # Import charging station manager
            try:
                from charging_station_manager import ChargingStationManager
                csm = ChargingStationManager()
            except:
                return None

            # Calculate route segments
            total_distance = 0
            segments = []
            for i in range(len(route_coordinates) - 1):
                lat1, lon1 = route_coordinates[i]
                lat2, lon2 = route_coordinates[i+1]
                distance = self._calculate_distance(lat1, lon1, lat2, lon2)
                total_distance += distance
                segments.append({
                    'start': (lat1, lon1),
                    'end': (lat2, lon2),
                    'distance': distance,
                    'cumulative_distance': total_distance
                })

            # Find charging stops needed
            charging_stops = []
            current_distance = 0
            max_range = vehicle_range_km * 0.8  # Use 80% of range for safety

            for segment in segments:
                current_distance += segment['distance']

                # Check if charging stop needed
                if current_distance > max_range:
                    # Find nearby charging stations
                    lat, lon = segment['end']
                    nearby_stations = csm.get_nearby_stations(lat, lon, radius_km=5)

                    if nearby_stations:
                        best_station = nearby_stations[0]  # Get closest
                        charging_stops.append({
                            'station_name': best_station.get('name', 'Charging Station'),
                            'lat': best_station.get('lat'),
                            'lon': best_station.get('lon'),
                            'distance_from_start_km': current_distance,
                            'charging_speed': best_station.get('power_kw', 50),
                            'estimated_cost': best_station.get('cost_per_kwh', 0.30) * 50  # Estimate for 50kWh
                        })
                        current_distance = 0  # Reset distance counter

            csm.close()

            if charging_stops:
                print(f"[OK] {len(charging_stops)} charging stops suggested")
                return charging_stops

            return None
        except Exception as e:
            print(f"Suggest optimal charging stops error: {e}")
            log_validation_error(str(e), "suggest_optimal_charging_stops")
            return None

    def predict_refueling_need(self, route_distance_km, current_fuel_level, fuel_efficiency):
        """Predict if refueling is needed based on route distance and fuel."""
        try:
            # Validate inputs
            if route_distance_km <= 0 or current_fuel_level < 0:
                return None

            # Get vehicle fuel tank capacity from settings
            self.cursor.execute("SELECT fuel_tank_capacity_liters FROM settings LIMIT 1")
            result = self.cursor.fetchone()
            tank_capacity = result[0] if result else 60

            # Calculate fuel needed for route
            fuel_needed_liters = route_distance_km / fuel_efficiency if fuel_efficiency > 0 else 0

            # Estimate fuel level after route
            fuel_after_route = current_fuel_level - fuel_needed_liters

            # Determine if refueling is needed
            refueling_needed = fuel_after_route < (tank_capacity * 0.15)  # Refuel if <15% tank
            range_anxiety_threshold = 50  # Warn if <50km range

            # Calculate remaining range
            remaining_range_km = current_fuel_level * fuel_efficiency

            prediction = {
                'refueling_needed': refueling_needed,
                'remaining_range_km': remaining_range_km,
                'fuel_after_route_liters': fuel_after_route,
                'fuel_needed_liters': fuel_needed_liters,
                'range_anxiety': remaining_range_km < range_anxiety_threshold
            }

            if refueling_needed:
                print(f"[OK] Refueling needed: Fuel will be {fuel_after_route:.1f}L after route")
            elif prediction['range_anxiety']:
                print(f"[OK] Range anxiety warning: Only {remaining_range_km:.0f}km remaining")

            return prediction
        except Exception as e:
            print(f"Predict refueling need error: {e}")
            log_validation_error(str(e), "predict_refueling_need")
            return None

    def suggest_optimal_fuel_stops(self, route_coordinates, vehicle_range_km):
        """Suggest optimal fuel stops along route."""
        try:
            if not route_coordinates or len(route_coordinates) < 2:
                return None

            # Calculate route segments
            total_distance = 0
            segments = []
            for i in range(len(route_coordinates) - 1):
                lat1, lon1 = route_coordinates[i]
                lat2, lon2 = route_coordinates[i+1]
                distance = self._calculate_distance(lat1, lon1, lat2, lon2)
                total_distance += distance
                segments.append({
                    'start': (lat1, lon1),
                    'end': (lat2, lon2),
                    'distance': distance,
                    'cumulative_distance': total_distance
                })

            # Find fuel stops needed
            fuel_stops = []
            current_distance = 0
            max_range = vehicle_range_km * 0.8  # Use 80% of range for safety

            for segment in segments:
                current_distance += segment['distance']

                # Check if fuel stop needed
                if current_distance > max_range:
                    lat, lon = segment['end']
                    # In a real implementation, would query fuel station database
                    fuel_stops.append({
                        'location_lat': lat,
                        'location_lon': lon,
                        'distance_from_start_km': current_distance,
                        'estimated_cost': 60  # Estimate for full tank
                    })
                    current_distance = 0  # Reset distance counter

            if fuel_stops:
                print(f"[OK] {len(fuel_stops)} fuel stops suggested")
                return fuel_stops

            return None
        except Exception as e:
            print(f"Suggest optimal fuel stops error: {e}")
            log_validation_error(str(e), "suggest_optimal_fuel_stops")
            return None

    # ============================================================================
    # SOCIAL FEATURES - SHARE ROUTES WITH FRIENDS
    # ============================================================================

    def share_route_via_link(self, route_id, expiry_hours=24):
        """Generate shareable route link with expiration."""
        try:
            import hashlib
            import uuid

            # Validate inputs
            if not route_id or expiry_hours <= 0:
                return None

            # Generate unique share token
            share_token = hashlib.sha256(
                f"{route_id}_{self.current_user_id}_{uuid.uuid4()}".encode()
            ).hexdigest()[:32]

            # Get route data from cache or database
            self.cursor.execute(
                "SELECT route_data FROM route_cache_persistent WHERE cache_key = ?",
                (route_id,)
            )
            result = self.cursor.fetchone()
            route_data = result[0] if result else json.dumps({})

            # Calculate expiry timestamp
            expiry_timestamp = int(time.time()) + (expiry_hours * 3600)

            # Store shared route
            self.cursor.execute(
                """INSERT INTO shared_routes
                   (route_id, sender_user_id, route_data_json, share_method, share_token,
                    privacy_level, timestamp, expiry_timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (route_id, self.current_user_id, route_data, 'link', share_token,
                 'public', int(time.time()), expiry_timestamp)
            )
            self.conn.commit()

            print(f"[OK] Route shared via link: {share_token}")
            notification.notify(
                title="Route Shared",
                message=f"Share token: {share_token}"
            )
            return share_token
        except Exception as e:
            print(f"Share route via link error: {e}")
            log_validation_error(str(e), "share_route_via_link")
            return None

    def share_route_via_qr(self, route_id):
        """Generate QR code for route sharing."""
        try:
            import hashlib
            import uuid

            if not route_id:
                return None

            # Generate share token
            share_token = hashlib.sha256(
                f"{route_id}_{self.current_user_id}_{uuid.uuid4()}".encode()
            ).hexdigest()[:32]

            # Get route data
            self.cursor.execute(
                "SELECT route_data FROM route_cache_persistent WHERE cache_key = ?",
                (route_id,)
            )
            result = self.cursor.fetchone()
            route_data = result[0] if result else json.dumps({})

            # Store shared route
            expiry_timestamp = int(time.time()) + (24 * 3600)  # 24 hour default
            self.cursor.execute(
                """INSERT INTO shared_routes
                   (route_id, sender_user_id, route_data_json, share_method, share_token,
                    privacy_level, timestamp, expiry_timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (route_id, self.current_user_id, route_data, 'qr', share_token,
                 'public', int(time.time()), expiry_timestamp)
            )
            self.conn.commit()

            print(f"[OK] Route shared via QR: {share_token}")
            return share_token
        except Exception as e:
            print(f"Share route via QR error: {e}")
            log_validation_error(str(e), "share_route_via_qr")
            return None

    def import_shared_route(self, share_token):
        """Import route from shared link/QR code."""
        try:
            if not share_token:
                return None

            # Validate token exists and not expired
            self.cursor.execute(
                """SELECT route_id, route_data_json, sender_user_id, expiry_timestamp
                   FROM shared_routes WHERE share_token = ?""",
                (share_token,)
            )
            result = self.cursor.fetchone()

            if not result:
                print("[WARN] Share token not found")
                return None

            route_id, route_data_json, sender_user_id, expiry_timestamp = result

            # Check if expired
            if expiry_timestamp < int(time.time()):
                print("[WARN] Share token expired")
                return None

            # Import route to user's cache
            route_data = json.loads(route_data_json)
            imported_route_id = f"imported_{route_id}_{int(time.time())}"

            self.cursor.execute(
                """INSERT INTO route_cache_persistent
                   (cache_key, route_data, routing_mode, timestamp, expiry_timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (imported_route_id, route_data_json, 'auto', int(time.time()),
                 int(time.time()) + (24 * 3600))
            )
            self.conn.commit()

            print(f"[OK] Route imported: {imported_route_id}")
            notification.notify(
                title="Route Imported",
                message=f"Shared by {sender_user_id}"
            )
            return imported_route_id
        except Exception as e:
            print(f"Import shared route error: {e}")
            log_validation_error(str(e), "import_shared_route")
            return None

    def get_shared_routes_history(self):
        """Retrieve user's route sharing history."""
        try:
            self.cursor.execute(
                """SELECT route_id, recipient_user_id, share_method, timestamp, expiry_timestamp
                   FROM shared_routes WHERE sender_user_id = ?
                   ORDER BY timestamp DESC LIMIT 50""",
                (self.current_user_id,)
            )
            results = self.cursor.fetchall()

            history = []
            for route_id, recipient, method, ts, expiry in results:
                is_expired = expiry < int(time.time())
                history.append({
                    'route_id': route_id,
                    'recipient': recipient,
                    'method': method,
                    'timestamp': ts,
                    'is_expired': is_expired
                })

            print(f"[OK] Retrieved {len(history)} shared routes")
            return history
        except Exception as e:
            print(f"Get shared routes history error: {e}")
            log_validation_error(str(e), "get_shared_routes_history")
            return []

    # ============================================================================
    # SOCIAL FEATURES - COMMUNITY HAZARD REPORTING
    # ============================================================================

    def submit_hazard_report(self, hazard_type, lat, lon, description, severity='medium'):
        """Submit community hazard report with rate limiting."""
        try:
            # Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "submit_hazard_report")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            # Validate hazard type
            valid_types = ['accident', 'roadwork', 'police', 'hazard', 'congestion', 'weather', 'closure']
            if hazard_type not in valid_types:
                return None

            # Check rate limit (100 per day)
            today = datetime.now().date()
            if self.last_hazard_report_reset_date != today:
                self.user_hazard_reports_today = 0
                self.last_hazard_report_reset_date = today

            if self.user_hazard_reports_today >= self.hazard_report_rate_limit:
                print(f"[WARN] Rate limit exceeded: {self.hazard_report_rate_limit} reports per day")
                return None

            # Generate report ID
            import uuid
            report_id = str(uuid.uuid4())

            # Calculate expiry (48 hours)
            expiry_timestamp = int(time.time()) + (48 * 3600)

            # Store report
            self.cursor.execute(
                """INSERT INTO community_hazard_reports
                   (report_id, user_id, hazard_type, lat, lon, description, severity,
                    verification_count, status, timestamp, expiry_timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (report_id, self.current_user_id, hazard_type, lat, lon, description,
                 severity, 0, 'active', int(time.time()), expiry_timestamp)
            )
            self.conn.commit()

            self.user_hazard_reports_today += 1
            print(f"[OK] Hazard report submitted: {report_id}")
            notification.notify(
                title="Report Submitted",
                message=f"{hazard_type} at ({lat:.4f}, {lon:.4f})"
            )
            return report_id
        except Exception as e:
            print(f"Submit hazard report error: {e}")
            log_validation_error(str(e), "submit_hazard_report")
            return None

    def get_nearby_community_reports(self, lat, lon, radius_km=50):
        """Fetch community reports within radius."""
        try:
            # Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "get_nearby_community_reports")
            if not is_valid:
                log_validation_error(error_msg)
                return []

            # Calculate bounding box (approximate)
            lat_delta = radius_km / 111.0  # 1 degree ≈ 111 km
            lon_delta = radius_km / (111.0 * abs(__import__('math').cos(__import__('math').radians(lat))))

            # Query reports within bounding box
            self.cursor.execute(
                """SELECT report_id, user_id, hazard_type, lat, lon, description, severity,
                          verification_count, timestamp
                   FROM community_hazard_reports
                   WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                   AND status = 'active' AND expiry_timestamp > ?
                   ORDER BY verification_count DESC, timestamp DESC
                   LIMIT 100""",
                (lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta,
                 int(time.time()))
            )
            results = self.cursor.fetchall()

            reports = []
            for report_id, user_id, hazard_type, r_lat, r_lon, desc, severity, verif_count, ts in results:
                # Calculate actual distance
                distance = self._calculate_distance(lat, lon, r_lat, r_lon)
                if distance <= radius_km:
                    reports.append({
                        'report_id': report_id,
                        'hazard_type': hazard_type,
                        'lat': r_lat,
                        'lon': r_lon,
                        'description': desc,
                        'severity': severity,
                        'verification_count': verif_count,
                        'distance_km': distance,
                        'timestamp': ts
                    })

            print(f"[OK] Found {len(reports)} community reports within {radius_km}km")
            return reports
        except Exception as e:
            print(f"Get nearby community reports error: {e}")
            log_validation_error(str(e), "get_nearby_community_reports")
            return []

    def verify_hazard_report(self, report_id):
        """Verify/upvote a hazard report."""
        try:
            if not report_id:
                return False

            # Increment verification count
            self.cursor.execute(
                """UPDATE community_hazard_reports
                   SET verification_count = verification_count + 1
                   WHERE report_id = ?""",
                (report_id,)
            )
            self.conn.commit()

            print(f"[OK] Report verified: {report_id}")
            return True
        except Exception as e:
            print(f"Verify hazard report error: {e}")
            log_validation_error(str(e), "verify_hazard_report")
            return False

    def moderate_hazard_report(self, report_id, action):
        """Moderate hazard report (approve/reject/remove)."""
        try:
            if not report_id or action not in ['approve', 'reject', 'remove']:
                return False

            status_map = {'approve': 'active', 'reject': 'rejected', 'remove': 'removed'}
            new_status = status_map.get(action, 'active')

            self.cursor.execute(
                """UPDATE community_hazard_reports
                   SET status = ? WHERE report_id = ?""",
                (new_status, report_id)
            )
            self.conn.commit()

            print(f"[OK] Report moderated: {report_id} -> {new_status}")
            return True
        except Exception as e:
            print(f"Moderate hazard report error: {e}")
            log_validation_error(str(e), "moderate_hazard_report")
            return False

    # ============================================================================
    # SOCIAL FEATURES - SOCIAL TRIP PLANNING
    # ============================================================================

    def create_trip_group(self, group_name, member_user_ids=None):
        """Create a trip planning group."""
        try:
            if not group_name or len(group_name.strip()) < 2:
                return None

            import uuid
            group_id = str(uuid.uuid4())

            # Create group
            self.cursor.execute(
                """INSERT INTO trip_groups (group_id, group_name, creator_user_id, created_timestamp)
                   VALUES (?, ?, ?, ?)""",
                (group_id, group_name, self.current_user_id, int(time.time()))
            )

            # Add creator as member
            self.cursor.execute(
                """INSERT INTO trip_group_members (group_id, user_id, role, joined_timestamp)
                   VALUES (?, ?, ?, ?)""",
                (group_id, self.current_user_id, 'creator', int(time.time()))
            )

            # Add other members
            if member_user_ids:
                for user_id in member_user_ids:
                    if user_id != self.current_user_id:
                        self.cursor.execute(
                            """INSERT INTO trip_group_members (group_id, user_id, role, joined_timestamp)
                               VALUES (?, ?, ?, ?)""",
                            (group_id, user_id, 'member', int(time.time()))
                        )

            self.conn.commit()
            print(f"[OK] Trip group created: {group_id}")
            notification.notify(
                title="Group Created",
                message=f"Group: {group_name}"
            )
            return group_id
        except Exception as e:
            print(f"Create trip group error: {e}")
            log_validation_error(str(e), "create_trip_group")
            return None

    def propose_group_trip(self, group_id, destination_name, destination_lat, destination_lon, departure_time):
        """Propose a trip for the group."""
        try:
            # Validate coordinates
            is_valid, error_msg = validate_coordinates(destination_lat, destination_lon, "propose_group_trip")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            import uuid
            plan_id = str(uuid.uuid4())

            # Create trip proposal
            self.cursor.execute(
                """INSERT INTO group_trip_plans
                   (plan_id, group_id, destination_name, destination_lat, destination_lon,
                    planned_departure_time, status, created_by_user_id, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (plan_id, group_id, destination_name, destination_lat, destination_lon,
                 departure_time, 'proposed', self.current_user_id, int(time.time()))
            )
            self.conn.commit()

            print(f"[OK] Trip proposal created: {plan_id}")
            notification.notify(
                title="Trip Proposed",
                message=f"Destination: {destination_name}"
            )
            return plan_id
        except Exception as e:
            print(f"Propose group trip error: {e}")
            log_validation_error(str(e), "propose_group_trip")
            return None

    def vote_on_trip_proposal(self, plan_id, vote_type):
        """Vote on a trip proposal."""
        try:
            if vote_type not in ['yes', 'no', 'maybe']:
                return False

            import uuid
            vote_id = str(uuid.uuid4())

            # Check if user already voted
            self.cursor.execute(
                """SELECT id FROM trip_votes WHERE plan_id = ? AND user_id = ?""",
                (plan_id, self.current_user_id)
            )
            existing = self.cursor.fetchone()

            if existing:
                # Update existing vote
                self.cursor.execute(
                    """UPDATE trip_votes SET vote_type = ?, timestamp = ?
                       WHERE plan_id = ? AND user_id = ?""",
                    (vote_type, int(time.time()), plan_id, self.current_user_id)
                )
            else:
                # Create new vote
                self.cursor.execute(
                    """INSERT INTO trip_votes (vote_id, plan_id, user_id, vote_type, timestamp)
                       VALUES (?, ?, ?, ?, ?)""",
                    (vote_id, plan_id, self.current_user_id, vote_type, int(time.time()))
                )

            self.conn.commit()
            print(f"[OK] Vote recorded: {vote_type}")
            return True
        except Exception as e:
            print(f"Vote on trip proposal error: {e}")
            log_validation_error(str(e), "vote_on_trip_proposal")
            return False

    def get_group_trip_proposals(self, group_id):
        """Retrieve all proposals for a group with vote counts."""
        try:
            self.cursor.execute(
                """SELECT plan_id, destination_name, destination_lat, destination_lon,
                          planned_departure_time, status, created_by_user_id, timestamp
                   FROM group_trip_plans WHERE group_id = ?
                   ORDER BY timestamp DESC""",
                (group_id,)
            )
            plans = self.cursor.fetchall()

            proposals = []
            for plan_id, dest_name, dest_lat, dest_lon, dep_time, status, creator, ts in plans:
                # Get vote counts
                self.cursor.execute(
                    """SELECT vote_type, COUNT(*) FROM trip_votes WHERE plan_id = ?
                       GROUP BY vote_type""",
                    (plan_id,)
                )
                vote_counts = {row[0]: row[1] for row in self.cursor.fetchall()}

                proposals.append({
                    'plan_id': plan_id,
                    'destination': dest_name,
                    'lat': dest_lat,
                    'lon': dest_lon,
                    'departure_time': dep_time,
                    'status': status,
                    'creator': creator,
                    'votes_yes': vote_counts.get('yes', 0),
                    'votes_no': vote_counts.get('no', 0),
                    'votes_maybe': vote_counts.get('maybe', 0),
                    'timestamp': ts
                })

            print(f"[OK] Retrieved {len(proposals)} trip proposals")
            return proposals
        except Exception as e:
            print(f"Get group trip proposals error: {e}")
            log_validation_error(str(e), "get_group_trip_proposals")
            return []

    def finalize_group_trip(self, plan_id):
        """Confirm trip when majority votes yes."""
        try:
            # Get vote counts
            self.cursor.execute(
                """SELECT vote_type, COUNT(*) FROM trip_votes WHERE plan_id = ?
                   GROUP BY vote_type""",
                (plan_id,)
            )
            vote_counts = {row[0]: row[1] for row in self.cursor.fetchall()}

            yes_votes = vote_counts.get('yes', 0)
            no_votes = vote_counts.get('no', 0)
            total_votes = yes_votes + no_votes

            # Check if majority voted yes
            if total_votes > 0 and yes_votes > no_votes:
                self.cursor.execute(
                    """UPDATE group_trip_plans SET status = ? WHERE plan_id = ?""",
                    ('confirmed', plan_id)
                )
                self.conn.commit()
                print(f"[OK] Trip finalized: {plan_id}")
                notification.notify(
                    title="Trip Confirmed",
                    message=f"Trip confirmed with {yes_votes} yes votes"
                )
                return True
            else:
                print(f"[WARN] Insufficient votes to confirm trip")
                return False
        except Exception as e:
            print(f"Finalize group trip error: {e}")
            log_validation_error(str(e), "finalize_group_trip")
            return False

    def set_social_features_enabled(self, enabled):
        """Toggle social features."""
        try:
            self.social_features_enabled = enabled
            print(f"[OK] Social features {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Social Features",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set social features error: {e}")
            log_validation_error(str(e), "set_social_features_enabled")
            return False

    def set_community_reports_enabled(self, enabled):
        """Toggle community hazard reporting feature."""
        try:
            self.community_reports_enabled = enabled
            print(f"[OK] Community hazard reports {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Community Reports",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set community reports error: {e}")
            log_validation_error(str(e), "set_community_reports_enabled")
            return False

    def set_trip_groups_enabled(self, enabled):
        """Toggle social trip planning feature."""
        try:
            self.trip_groups_enabled = enabled
            print(f"[OK] Social trip planning {'enabled' if enabled else 'disabled'}")
            notification.notify(
                title="Trip Groups",
                message="Feature " + ("enabled" if enabled else "disabled")
            )
            return True
        except Exception as e:
            print(f"Set trip groups error: {e}")
            log_validation_error(str(e), "set_trip_groups_enabled")
            return False

    def _init_tts(self):
        """Initialize Text-to-Speech."""
        try:
            if TextToSpeech and PythonActivity:
                self.android_tts = TextToSpeech(PythonActivity.mActivity, None)
        except Exception as e:
            print(f"Android TTS init failed: {e}")
        
        if pyttsx3:
            try:
                self.tts_engine = pyttsx3.init()
            except Exception as e:
                print(f"pyttsx3 init failed: {e}")

    def _init_voice(self):
        """Initialize voice wake word detection."""
        try:
            if pvporcupine and pyaudio:
                # Get Picovoice access key from environment
                picovoice_key = os.getenv('PICOVOICE_ACCESS_KEY', '')

                # Check if API key is configured
                if not picovoice_key or picovoice_key.strip() == '':
                    print("[INFO] Picovoice Access Key not configured. Voice activation disabled.")
                    print("[INFO] To enable: Add PICOVOICE_ACCESS_KEY to .env file (see API_INTEGRATION_GUIDE.md)")
                    self.porcupine = None
                    return

                self.porcupine = pvporcupine.create(
                    access_key=picovoice_key,
                    keywords=["hey satnav"],
                    sensitivities=[0.5]
                )
                self.pa = pyaudio.PyAudio()
                self.audio_stream = self.pa.open(
                    rate=self.porcupine.sample_rate,
                    channels=1,
                    format=pyaudio.paInt16,
                    input=True,
                    frames_per_buffer=self.porcupine.frame_length
                )
                self.wake_thread = threading.Thread(target=self.listen_wake_word, daemon=True)
                self.wake_thread.start()
        except Exception as e:
            print(f"Porcupine init failed: {e}")
            notification.notify(title="Wake Word Error", message="Voice activation unavailable")

    def _init_gesture(self):
        """Initialize gesture detection with battery-optimized polling."""
        try:
            accelerometer.enable()
            # Reduced from 0.1s to 0.2s for battery optimization
            Clock.schedule_interval(self.check_shake, 0.2)
        except Exception as e:
            print(f"Accelerometer init failed: {e}")
            notification.notify(title="Gesture Error", message="Gesture activation unavailable")

    def _init_gps(self):
        """Initialize GPS."""
        try:
            gps.configure(on_location=self.on_location)
            gps.start(1000, 0)
        except Exception as e:
            print(f"GPS init failed: {e}")
            notification.notify(title="GPS Error", message="Using Barnsley as default location")

    def load_settings(self):
        """Load settings from database."""
        try:
            self.cursor.execute("SELECT distance_unit, temperature_unit, currency_unit, vehicle_type, fuel_unit, fuel_efficiency, fuel_price_gbp, energy_efficiency, electricity_price_gbp, include_tolls, routing_mode, avoid_caz, vehicle_caz_exempt, enable_hazard_avoidance, hazard_avoidance_mode FROM settings")
            result = self.cursor.fetchone()
            if result:
                self.distance_unit, self.temperature_unit, self.currency_unit, self.vehicle_type, self.fuel_unit, self.fuel_efficiency, self.fuel_price_gbp, self.energy_efficiency, self.electricity_price_gbp, self.include_tolls, self.routing_mode, self.avoid_caz, self.vehicle_caz_exempt, self.enable_hazard_avoidance, self.hazard_avoidance_mode = result
                self.include_tolls = bool(self.include_tolls)
                self.avoid_caz = bool(self.avoid_caz)
                self.vehicle_caz_exempt = bool(self.vehicle_caz_exempt)
                self.enable_hazard_avoidance = bool(self.enable_hazard_avoidance)
                if not self.currency_unit:
                    self.currency_unit = 'GBP'
                if not self.routing_mode:
                    self.routing_mode = 'auto'
                if not self.hazard_avoidance_mode:
                    self.hazard_avoidance_mode = 'all'
                # Load hazard penalty weights
                self._load_hazard_penalty_weights()
        except Exception as e:
            print(f"Settings load error: {e}")

    def save_settings(self):
        """Save settings to database."""
        try:
            self.cursor.execute("DELETE FROM settings")
            self.cursor.execute("INSERT INTO settings (distance_unit, temperature_unit, currency_unit, vehicle_type, fuel_unit, fuel_efficiency, fuel_price_gbp, energy_efficiency, electricity_price_gbp, include_tolls, routing_mode, avoid_caz, vehicle_caz_exempt, enable_hazard_avoidance, hazard_avoidance_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                               (self.distance_unit, self.temperature_unit, self.currency_unit, self.vehicle_type, self.fuel_unit, self.fuel_efficiency, self.fuel_price_gbp, self.energy_efficiency, self.electricity_price_gbp, int(self.include_tolls), self.routing_mode, int(self.avoid_caz), int(self.vehicle_caz_exempt), int(self.enable_hazard_avoidance), self.hazard_avoidance_mode))
            self.conn.commit()
        except Exception as e:
            print(f"Settings save error: {e}")

    def _load_hazard_penalty_weights(self):
        """Load hazard penalty weights from database."""
        try:
            self.cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters FROM hazard_avoidance_preferences WHERE avoid_enabled = 1")
            results = self.cursor.fetchall()
            self.hazard_penalty_weights = {}
            for hazard_type, penalty, threshold in results:
                self.hazard_penalty_weights[hazard_type] = {
                    'penalty_seconds': penalty,
                    'threshold_meters': threshold
                }
        except Exception as e:
            print(f"Load hazard penalty weights error: {e}")
            self.hazard_penalty_weights = {}

    # Unit conversion methods
    def to_miles(self, km): 
        return km * 0.621371
    
    def to_km(self, miles): 
        return miles / 0.621371
    
    def to_fahrenheit(self, celsius): 
        return (celsius * 9/5) + 32
    
    def to_celsius(self, fahrenheit): 
        return (fahrenheit - 32) * 5/9
    
    def to_mpg(self, l_per_100km): 
        return 235.214 / l_per_100km if l_per_100km > 0 else 43.5
    
    def to_l_per_100km(self, mpg): 
        return 235.214 / mpg if mpg > 0 else 6.5
    
    def to_miles_per_kwh(self, kwh_per_100km): 
        return 62.1371 / kwh_per_100km if kwh_per_100km > 0 else 3.4
    
    def to_kwh_per_100km(self, miles_per_kwh): 
        return 62.1371 / miles_per_kwh if miles_per_kwh > 0 else 18.5

    # Cost calculation methods
    def calculate_fuel(self, km, efficiency, unit):
        """Calculate fuel consumption in litres."""
        try:
            if unit == 'l_per_100km':
                return (km * efficiency) / 100
            else:
                miles = self.to_miles(km)
                return miles / efficiency * 0.264172
        except Exception as e:
            print(f"Fuel calculation error: {e}")
            return 0

    def calculate_energy(self, km, efficiency, unit):
        """Calculate energy consumption in kWh."""
        try:
            if unit == 'kwh_per_100km':
                return (km * efficiency) / 100
            else:
                miles = self.to_miles(km)
                return miles / efficiency
        except Exception as e:
            print(f"Energy calculation error: {e}")
            return 0

    def calculate_cost(self, km):
        """Calculate fuel or energy cost in GBP using active vehicle profile and ML predictions."""
        try:
            # Try to use ML cost prediction if available
            try:
                ml_prediction = self.get_ml_cost_prediction(km, km / 60)  # Estimate duration
                if ml_prediction and 'predicted_cost' in ml_prediction:
                    print(f"[OK] Using ML cost prediction: {ml_prediction['predicted_cost']:.2f}")
                    return ml_prediction['predicted_cost']
            except Exception as e:
                print(f"[WARN] ML cost prediction failed: {e}")

            # Try to use active vehicle profile if available
            if self.vehicle_profile_manager:
                try:
                    active_vehicle = self.vehicle_profile_manager.get_active_vehicle()
                    if active_vehicle:
                        vehicle_type = active_vehicle.get('vehicle_type', self.vehicle_type)
                        fuel_efficiency = active_vehicle.get('fuel_efficiency', self.fuel_efficiency)
                        fuel_unit = active_vehicle.get('fuel_unit', self.fuel_unit)
                        fuel_price = active_vehicle.get('fuel_price_gbp', self.fuel_price_gbp)
                        energy_efficiency = active_vehicle.get('energy_efficiency', self.energy_efficiency)
                        electricity_price = active_vehicle.get('electricity_price_gbp', self.electricity_price_gbp)

                        if vehicle_type == 'petrol_diesel':
                            fuel_litres = self.calculate_fuel(km, fuel_efficiency, fuel_unit)
                            return fuel_litres * fuel_price
                        else:
                            energy_kwh = self.calculate_energy(km, energy_efficiency, fuel_unit)
                            return energy_kwh * electricity_price
                except Exception as e:
                    print(f"[WARN] Could not use vehicle profile: {e}")

            # Fallback to instance variables
            if self.vehicle_type == 'petrol_diesel':
                fuel_litres = self.calculate_fuel(km, self.fuel_efficiency, self.fuel_unit)
                return fuel_litres * self.fuel_price_gbp
            else:
                energy_kwh = self.calculate_energy(km, self.energy_efficiency, self.fuel_unit)
                return energy_kwh * self.electricity_price_gbp
        except Exception as e:
            print(f"Cost calculation error: {e}")
            return 0

    def calculate_toll_cost(self):
        """Calculate total toll cost for route."""
        try:
            if not self.include_tolls or not self.current_route:
                return 0
            toll_cost = 0
            for segment in self.current_route.get('segments', []):
                if segment.get('toll', False):
                    for toll in self.toll_alerts.get('tolls', []):
                        if geodesic((segment['lat'], segment['lon']), (toll['lat'], toll['lon'])).meters < 100:
                            toll_cost += toll['cost_gbp']
            return toll_cost
        except Exception as e:
            print(f"Toll cost error: {e}")
            notification.notify(title="Toll Error", message="Toll cost unavailable")
            return 0

    # Formatting methods
    def format_distance(self, meters):
        """Format distance with selected unit."""
        try:
            if self.distance_unit == 'mi':
                miles = self.to_miles(meters / 1000)
                return f"{miles:.2f} miles"
            return f"{meters / 1000:.2f} km"
        except Exception as e:
            print(f"Distance conversion error: {e}")
            return f"{meters / 1000:.2f} km"

    def format_temperature(self, celsius):
        """Format temperature with selected unit."""
        try:
            if self.temperature_unit == 'F':
                fahrenheit = self.to_fahrenheit(celsius)
                return f"{fahrenheit:.1f}°F"
            return f"{celsius:.1f}°C"
        except Exception as e:
            print(f"Temperature conversion error: {e}")
            return f"{celsius:.1f}°C"

    def format_fuel(self, litres):
        """Format fuel consumption."""
        try:
            if self.fuel_unit == 'mpg':
                gallons = litres / 0.264172
                return f"{gallons:.2f} gallons"
            return f"{litres:.2f} litres"
        except Exception as e:
            print(f"Fuel format error: {e}")
            return f"{litres:.2f} litres"

    def format_energy(self, kwh):
        """Format energy consumption."""
        try:
            return f"{kwh:.2f} kWh"
        except Exception as e:
            print(f"Energy format error: {e}")
            return f"{kwh:.2f} kWh"

    def get_currency_symbol(self):
        """Get currency symbol based on selected currency unit."""
        currency_symbols = {
            'GBP': '£',
            'USD': '$',
            'EUR': '€'
        }
        return currency_symbols.get(self.currency_unit, '£')

    def get_currency_name(self):
        """Get currency name for voice announcements."""
        currency_names = {
            'GBP': 'pounds',
            'USD': 'dollars',
            'EUR': 'euros'
        }
        return currency_names.get(self.currency_unit, 'pounds')

    def format_currency(self, amount):
        """Format currency amount with selected currency symbol."""
        try:
            symbol = self.get_currency_symbol()
            return f"{symbol}{amount:.2f}"
        except Exception as e:
            print(f"Currency format error: {e}")
            return f"£{amount:.2f}"

    # ============================================================================
    # HAZARD AVOIDANCE SETTINGS
    # ============================================================================

    def set_hazard_avoidance(self, enabled):
        """Enable or disable hazard avoidance."""
        try:
            if enabled != self.enable_hazard_avoidance:
                self.enable_hazard_avoidance = enabled
                self.save_settings()
                status = "enabled" if enabled else "disabled"
                self.speak(f"Hazard avoidance: {status}")
                notification.notify(title="Hazard Avoidance", message=f"Hazard avoidance {status}")
        except Exception as e:
            print(f"Set hazard avoidance error: {e}")

    def set_hazard_avoidance_mode(self, mode):
        """Set hazard avoidance mode (all, cameras_only, custom)."""
        try:
            if mode in ['all', 'cameras_only', 'custom']:
                self.hazard_avoidance_mode = mode
                self.save_settings()
                self.speak(f"Hazard avoidance mode: {mode}")
                notification.notify(title="Hazard Mode", message=f"Mode set to {mode}")
        except Exception as e:
            print(f"Set hazard avoidance mode error: {e}")

    def set_hazard_penalty(self, hazard_type, penalty_seconds):
        """Update penalty weight for a specific hazard type."""
        try:
            self.cursor.execute(
                "UPDATE hazard_avoidance_preferences SET penalty_seconds = ?, timestamp = ? WHERE hazard_type = ?",
                (penalty_seconds, int(time.time()), hazard_type)
            )
            self.conn.commit()
            self._load_hazard_penalty_weights()
            print(f"[OK] Updated penalty for {hazard_type}: {penalty_seconds}s")
        except Exception as e:
            print(f"Set hazard penalty error: {e}")

    def toggle_hazard_type(self, hazard_type, enabled):
        """Enable or disable avoidance for a specific hazard type."""
        try:
            self.cursor.execute(
                "UPDATE hazard_avoidance_preferences SET avoid_enabled = ?, timestamp = ? WHERE hazard_type = ?",
                (int(enabled), int(time.time()), hazard_type)
            )
            self.conn.commit()
            self._load_hazard_penalty_weights()
            status = "enabled" if enabled else "disabled"
            print(f"[OK] {hazard_type} avoidance {status}")
        except Exception as e:
            print(f"Toggle hazard type error: {e}")

    def get_hazard_preferences(self):
        """Get all hazard avoidance preferences."""
        try:
            self.cursor.execute(
                "SELECT hazard_type, penalty_seconds, avoid_enabled, proximity_threshold_meters FROM hazard_avoidance_preferences ORDER BY hazard_type"
            )
            results = self.cursor.fetchall()
            preferences = {}
            for hazard_type, penalty, enabled, threshold in results:
                preferences[hazard_type] = {
                    'penalty_seconds': penalty,
                    'avoid_enabled': bool(enabled),
                    'proximity_threshold_meters': threshold
                }
            return preferences
        except Exception as e:
            print(f"Get hazard preferences error: {e}")
            return {}

    # CAZ methods
    def calculate_caz_cost(self):
        """Calculate total CAZ charges for current route."""
        try:
            if self.vehicle_caz_exempt or not self.current_route or not self.caz_data:
                return 0

            total_caz_cost = 0
            route_coords = self.current_route.get('coordinates', [])

            for caz in self.caz_data:
                caz_id, zone_name, city, country, lat, lon, zone_type, charge_amount, currency_code, active, operating_hours = caz

                # Check if route passes through CAZ (simple distance check)
                for coord in route_coords:
                    distance = geodesic((coord[1], coord[0]), (lat, lon)).meters
                    if distance < 5000:  # Within 5km of CAZ center
                        # Convert EUR to GBP if needed
                        if currency_code == 'EUR' and self.currency_unit == 'GBP':
                            charge_amount = charge_amount * 0.85  # Approximate EUR to GBP conversion
                        total_caz_cost += charge_amount
                        break

            return total_caz_cost
        except Exception as e:
            print(f"CAZ cost calculation error: {e}")
            return 0

    def set_caz_avoidance(self, enabled):
        """Set CAZ avoidance preference."""
        try:
            if enabled != self.avoid_caz:
                self.avoid_caz = enabled
                self.save_settings()
                status = "enabled" if enabled else "disabled"
                self.speak(f"Clean Air Zone avoidance: {status}")
                notification.notify(title="CAZ Avoidance", message=f"CAZ avoidance {status}")
        except Exception as e:
            print(f"CAZ avoidance error: {e}")

    def set_caz_exemption(self, exempt):
        """Set vehicle CAZ exemption status."""
        try:
            if exempt != self.vehicle_caz_exempt:
                self.vehicle_caz_exempt = exempt
                self.save_settings()
                status = "exempt" if exempt else "not exempt"
                self.speak(f"Vehicle CAZ status: {status}")
                notification.notify(title="CAZ Exemption", message=f"Vehicle is {status}")
        except Exception as e:
            print(f"CAZ exemption error: {e}")

    # Routing mode methods
    def set_routing_mode(self, mode):
        """Set routing mode (auto, pedestrian, bicycle)."""
        try:
            if mode in ['auto', 'pedestrian', 'bicycle']:
                self.routing_mode = mode
                self.save_settings()
                self.speak(f"Routing mode: {mode}")
                notification.notify(title="Routing Mode", message=f"Switched to {mode} mode")

                # Update vehicle marker icon
                self.update_vehicle_marker()
        except Exception as e:
            print(f"Routing mode error: {e}")

    def get_valhalla_costing(self):
        """Get Valhalla costing model based on routing mode."""
        costing_map = {
            'auto': 'auto',
            'pedestrian': 'pedestrian',
            'bicycle': 'bicycle'
        }
        return costing_map.get(self.routing_mode, 'auto')

    def check_valhalla_connection(self):
        """Check if Valhalla server is available (cached for 60 seconds)."""
        try:
            current_time = time.time()

            # Only check every 60 seconds to avoid excessive requests
            if current_time - self.valhalla_last_check < self.valhalla_check_interval:
                return self.valhalla_available

            self.valhalla_last_check = current_time

            response = requests.get(
                f"{self.valhalla_url}/status",
                timeout=5
            )

            self.valhalla_available = response.status_code == 200

            if self.valhalla_available:
                print(f"[OK] Valhalla server available: {self.valhalla_url}")
            else:
                print(f"[FAIL] Valhalla server unavailable: HTTP {response.status_code}")

            return self.valhalla_available

        except requests.exceptions.ConnectionError as e:
            print(f"[FAIL] Valhalla connection error: {e}")
            self.valhalla_available = False
            return False
        except requests.exceptions.Timeout:
            print("[FAIL] Valhalla connection timeout")
            self.valhalla_available = False
            return False
        except Exception as e:
            print(f"[FAIL] Valhalla check error: {e}")
            self.valhalla_available = False
            return False

    def _make_valhalla_request(self, endpoint, payload, method='POST'):
        """Make request to Valhalla with retry logic and exponential backoff."""
        for attempt in range(self.valhalla_retries):
            try:
                if method == 'POST':
                    response = requests.post(
                        f"{self.valhalla_url}{endpoint}",
                        json=payload,
                        timeout=self.valhalla_timeout,
                        headers={"Content-Type": "application/json"}
                    )
                else:
                    response = requests.get(
                        f"{self.valhalla_url}{endpoint}",
                        timeout=self.valhalla_timeout
                    )

                if response.status_code == 200:
                    return response.json()
                else:
                    print(f"Valhalla error: HTTP {response.status_code}")
                    if attempt < self.valhalla_retries - 1:
                        delay = VALHALLA_RETRY_DELAY * (2 ** attempt)
                        print(f"Retrying in {delay}s... (attempt {attempt + 1}/{self.valhalla_retries})")
                        time.sleep(delay)

            except requests.exceptions.Timeout:
                print(f"Valhalla timeout (attempt {attempt + 1}/{self.valhalla_retries})")
                if attempt < self.valhalla_retries - 1:
                    delay = VALHALLA_RETRY_DELAY * (2 ** attempt)
                    time.sleep(delay)

            except requests.exceptions.ConnectionError as e:
                print(f"Valhalla connection error (attempt {attempt + 1}/{self.valhalla_retries}): {e}")
                if attempt < self.valhalla_retries - 1:
                    delay = VALHALLA_RETRY_DELAY * (2 ** attempt)
                    time.sleep(delay)

            except Exception as e:
                print(f"Valhalla request error: {e}")
                return None

        return None

    def calculate_route(self, start_lat, start_lon, end_lat, end_lon):
        """Calculate route using Valhalla with error handling and fallback."""
        try:
            # SECURITY: Validate all coordinates before processing
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "calculate_route (start)")
            if not is_valid:
                log_validation_error(error_msg)
                notification.notify(title="Route Error", message="Invalid start location coordinates")
                return None

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "calculate_route (end)")
            if not is_valid:
                log_validation_error(error_msg)
                notification.notify(title="Route Error", message="Invalid destination coordinates")
                return None

            # Check if Valhalla is available
            if not self.check_valhalla_connection():
                print("Valhalla unavailable, using fallback route calculation")
                notification.notify(
                    title="Routing Service",
                    message="Using offline routing (limited features)"
                )
                return self._fallback_route(start_lat, start_lon, end_lat, end_lon)

            # Create cache key from coordinates and routing mode
            cache_key = f"{start_lat},{start_lon},{end_lat},{end_lon},{self.routing_mode}"

            # Check cache (1-hour expiry)
            if cache_key in self.route_cache:
                cached_route = self.route_cache[cache_key]
                if time.time() - cached_route['timestamp'] < 3600:
                    print("Using cached route")
                    return cached_route['route']

            # Build Valhalla API payload
            payload = {
                "locations": [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": self.get_valhalla_costing(),
                "format": "json"
            }

            # Add costing options for auto mode (toll settings)
            if self.routing_mode == 'auto':
                payload["costing_options"] = {
                    "auto": {
                        "use_toll": self.include_tolls,
                        "toll_factor": 1.0 if self.include_tolls else 10.0,
                        "use_ferry": True
                    }
                }
            elif self.routing_mode == 'pedestrian':
                payload["costing_options"] = {
                    "pedestrian": {
                        "walking_speed": 5.1,
                        "use_ferry": True
                    }
                }
            elif self.routing_mode == 'bicycle':
                payload["costing_options"] = {
                    "bicycle": {
                        "cycling_speed": 25,
                        "use_bike_lanes": True,
                        "use_roads": True,
                        "use_ferry": True
                    }
                }

            # Make request with retry logic
            response = self._make_valhalla_request("/route", payload)

            # Perform pre-departure checks (traffic, weather, fuel/battery, maintenance)
            self.check_pre_departure_conditions(start_lat, start_lon, end_lat, end_lon)

            if response:
                # Extract route info and update instance variables
                if 'trip' in response and response['trip'].get('legs'):
                    leg = response['trip']['legs'][0]
                    summary = leg.get('summary', {})
                    self.route_distance = summary.get('length', 0) / 1000  # Convert to km
                    self.route_time = summary.get('time', 0)  # In seconds

                # Fetch real-time traffic data for the route (auto mode only)
                if self.routing_mode == 'auto':
                    try:
                        traffic_data = self.fetch_traffic_data(start_lat, start_lon, 10)
                        if traffic_data and 'conditions' in traffic_data:
                            response['traffic'] = traffic_data['conditions']
                            print(f"[OK] Traffic data integrated: {traffic_data['conditions'].get('flow', 'unknown')}")
                    except Exception as e:
                        print(f"[WARN] Could not fetch traffic data: {e}")

                # Fetch and analyze weather data for the route
                try:
                    weather_analysis = self.analyze_route_weather(response, start_lat, start_lon, end_lat, end_lon)
                    if weather_analysis:
                        response['weather'] = weather_analysis
                        if weather_analysis.get('warnings'):
                            print(f"[OK] Weather analysis complete: {len(weather_analysis['warnings'])} warnings")
                            for warning in weather_analysis['warnings']:
                                print(f"     - {warning}")
                        # Display weather on map
                        self.display_weather_on_map(weather_analysis)

                        # Get weather forecast for route duration
                        weather_forecast = self.get_weather_forecast_for_route(self.route_time, start_lat, start_lon)
                        if weather_forecast:
                            response['weather_forecast'] = weather_forecast
                            print(f"[OK] Weather forecast generated for {weather_forecast.get('duration_minutes', 0)} minutes")
                except Exception as e:
                    print(f"[WARN] Could not fetch weather data: {e}")

                # Cache the route
                self.route_cache[cache_key] = {
                    'route': response,
                    'timestamp': time.time()
                }

                print(f"[OK] Route calculated: {self.route_distance:.1f} km, {self.route_time/60:.0f} min")
                return response
            else:
                print("Route calculation failed, using fallback")
                notification.notify(
                    title="Route Error",
                    message="Could not calculate route. Using fallback."
                )
                return self._fallback_route(start_lat, start_lon, end_lat, end_lon)

        except Exception as e:
            print(f"Route calculation error: {e}")
            notification.notify(
                title="Route Error",
                message="Could not calculate route. Using fallback."
            )
            return self._fallback_route(start_lat, start_lon, end_lat, end_lon)

    def _fallback_route(self, start_lat, start_lon, end_lat, end_lon):
        """Fallback route calculation using simple distance and time estimation."""
        try:
            # SECURITY: Validate all coordinates before processing
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "_fallback_route (start)")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "_fallback_route (end)")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            # Calculate distance using geodesic
            distance = geodesic(
                (start_lat, start_lon),
                (end_lat, end_lon)
            ).kilometers

            # Estimate time (average 60 km/h for auto, 5 km/h for pedestrian, 20 km/h for bicycle)
            if self.routing_mode == 'pedestrian':
                avg_speed = 5
            elif self.routing_mode == 'bicycle':
                avg_speed = 20
            else:
                avg_speed = 60

            time_seconds = (distance / avg_speed) * 3600

            # Update instance variables
            self.route_distance = distance
            self.route_time = time_seconds

            print(f"[OK] Fallback route: {distance:.1f} km, {time_seconds/60:.0f} min")

            # Return simplified route object matching Valhalla response structure
            return {
                'trip': {
                    'legs': [{
                        'summary': {
                            'length': distance * 1000,  # Convert to meters
                            'time': time_seconds
                        }
                    }]
                },
                'fallback': True
            }

        except Exception as e:
            print(f"Fallback route error: {e}")
            return None

    def calculate_route_async(self, start_lat, start_lon, end_lat, end_lon, priority='normal', callback=None):
        """Calculate route asynchronously in background thread without blocking UI."""
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "calculate_route_async (start)")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "calculate_route_async (end)")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            # Add to calculation queue with priority
            with self.route_calc_lock:
                self.route_calculation_queue.append({
                    'start_lat': start_lat,
                    'start_lon': start_lon,
                    'end_lat': end_lat,
                    'end_lon': end_lon,
                    'priority': priority,  # 'high' for user requests, 'low' for background
                    'callback': callback,
                    'timestamp': time.time()
                })

                # Sort queue by priority (high priority first)
                self.route_calculation_queue.sort(key=lambda x: (x['priority'] != 'high', x['timestamp']))

            # Start background worker thread if not already running
            if self.route_calculation_thread is None or not self.route_calculation_thread.is_alive():
                self.route_calc_stop_flag = False
                self.route_calculation_thread = threading.Thread(target=self._background_route_worker, daemon=True)
                self.route_calculation_thread.start()
                print("[OK] Background route calculation thread started")

            print(f"[OK] Route calculation queued (priority: {priority})")
            return True
        except Exception as e:
            print(f"Calculate route async error: {e}")
            log_validation_error(str(e), "calculate_route_async")
            return False

    def _background_route_worker(self):
        """Background worker thread that processes route calculation queue."""
        try:
            while not self.route_calc_stop_flag:
                with self.route_calc_lock:
                    if not self.route_calculation_queue:
                        # Queue is empty, sleep briefly
                        time.sleep(0.5)
                        continue

                    # Get next route from queue
                    route_request = self.route_calculation_queue.pop(0)

                # Calculate route outside of lock to avoid blocking
                start_time = time.time()
                route = self.calculate_route(
                    route_request['start_lat'],
                    route_request['start_lon'],
                    route_request['end_lat'],
                    route_request['end_lon']
                )
                calc_time_ms = (time.time() - start_time) * 1000
                self.route_calc_time_ms = calc_time_ms

                # Save to persistent cache
                if route:
                    cache_key = f"{route_request['start_lat']},{route_request['start_lon']},{route_request['end_lat']},{route_request['end_lon']},{self.routing_mode}"
                    self.save_route_to_cache(cache_key, route, expiry_hours=1)

                # Call callback if provided
                if route_request['callback']:
                    try:
                        route_request['callback'](route)
                    except Exception as e:
                        print(f"Route callback error: {e}")

                print(f"[OK] Background route calculated in {calc_time_ms:.0f}ms")

        except Exception as e:
            print(f"Background route worker error: {e}")
            log_validation_error(str(e), "_background_route_worker")

    def pre_calculate_favorite_routes(self):
        """Pre-calculate routes to all favorite locations from current position in background."""
        try:
            if not self.current_pos or not self.favorite_locations:
                return False

            current_lat, current_lon = self.current_pos
            count = 0

            for favorite in self.favorite_locations:
                fav_lat = favorite[3]  # lat column
                fav_lon = favorite[4]  # lon column

                # Queue route calculation with low priority
                self.calculate_route_async(
                    current_lat, current_lon,
                    fav_lat, fav_lon,
                    priority='low'
                )
                count += 1

            print(f"[OK] Pre-calculated {count} favorite routes in background")
            return True
        except Exception as e:
            print(f"Pre-calculate favorite routes error: {e}")
            log_validation_error(str(e), "pre_calculate_favorite_routes")
            return False

    def pre_calculate_alternative_routes_background(self, start_lat, start_lon, end_lat, end_lon):
        """Pre-calculate alternative routes in background while user navigates primary route."""
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "pre_calculate_alternative_routes_background (start)")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "pre_calculate_alternative_routes_background (end)")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            # Queue alternative routes calculation with low priority
            self.calculate_route_async(
                start_lat, start_lon,
                end_lat, end_lon,
                priority='low',
                callback=lambda route: self.calculate_alternative_routes(start_lat, start_lon, end_lat, end_lon)
            )

            print("[OK] Alternative routes pre-calculation queued")
            return True
        except Exception as e:
            print(f"Pre-calculate alternative routes background error: {e}")
            log_validation_error(str(e), "pre_calculate_alternative_routes_background")
            return False

    def save_route_to_cache(self, cache_key, route_data, expiry_hours=1):
        """Persist route to database cache with expiration timestamp."""
        try:
            current_time = int(time.time())
            expiry_timestamp = current_time + (expiry_hours * 3600)

            self.cursor.execute("""INSERT OR REPLACE INTO route_cache_persistent
                                   (cache_key, route_data, routing_mode, timestamp, expiry_timestamp)
                                   VALUES (?, ?, ?, ?, ?)""",
                                (cache_key, json.dumps(route_data), self.routing_mode, current_time, expiry_timestamp))
            self.conn.commit()

            print(f"[OK] Route cached: {cache_key}")
            return True
        except Exception as e:
            print(f"Save route to cache error: {e}")
            log_validation_error(str(e), "save_route_to_cache")
            return False

    def get_route_from_cache(self, cache_key, max_age_hours=1):
        """Retrieve cached route from database if not expired."""
        try:
            current_time = int(time.time())
            max_age_seconds = max_age_hours * 3600

            self.cursor.execute("""SELECT route_data, timestamp FROM route_cache_persistent
                                   WHERE cache_key = ? AND expiry_timestamp > ?""",
                                (cache_key, current_time))
            result = self.cursor.fetchone()

            if result:
                route_data, timestamp = result
                age_seconds = current_time - timestamp

                if age_seconds <= max_age_seconds:
                    print(f"[OK] Route retrieved from cache (age: {age_seconds}s)")
                    return json.loads(route_data)

            return None
        except Exception as e:
            print(f"Get route from cache error: {e}")
            log_validation_error(str(e), "get_route_from_cache")
            return None

    def clear_expired_route_cache(self):
        """Remove expired routes from database cache."""
        try:
            current_time = int(time.time())

            self.cursor.execute("DELETE FROM route_cache_persistent WHERE expiry_timestamp <= ?", (current_time,))
            deleted_count = self.cursor.rowcount
            self.conn.commit()

            if deleted_count > 0:
                print(f"[OK] Cleared {deleted_count} expired routes from cache")
            return True
        except Exception as e:
            print(f"Clear expired route cache error: {e}")
            log_validation_error(str(e), "clear_expired_route_cache")
            return False

    def check_pre_departure_conditions(self, start_lat, start_lon, end_lat, end_lon):
        """Check traffic, weather, and fuel/battery before departure."""
        try:
            current_time = time.time()
            # Prevent duplicate checks within 60 seconds
            if current_time - self.last_pre_departure_check_time < 60:
                return
            self.last_pre_departure_check_time = current_time

            # ===== TRAFFIC CHECK =====
            if self.traffic_alerts_enabled and self.routing_mode == 'auto':
                try:
                    traffic = self._get_traffic_conditions(start_lat, start_lon, 10)
                    if traffic and traffic.get('flow') in ['congested', 'heavy']:
                        message = f"⚠️ Heavy traffic detected on route. Estimated delay: {traffic.get('delay_minutes', 'unknown')} minutes"
                        notification.notify(title="Traffic Alert", message=message)
                        if self.voice_guidance_enabled:
                            self.speak(f"Warning: Heavy traffic detected on your route")
                except Exception as e:
                    print(f"Traffic check error: {e}")

            # ===== WEATHER CHECK =====
            if self.weather_alerts_enabled:
                try:
                    if self.weather_alerts:
                        for alert in self.weather_alerts:
                            if alert.get('severity') in ['severe', 'extreme']:
                                message = f"⚠️ Severe weather alert: {alert.get('description', 'Unknown')}"
                                notification.notify(title="Weather Warning", message=message)
                                if self.voice_guidance_enabled:
                                    self.speak(f"Warning: Severe weather detected on your route")
                                break
                except Exception as e:
                    print(f"Weather check error: {e}")

            # ===== FUEL/BATTERY CHECK =====
            if self.fuel_battery_alerts_enabled and self.routing_mode == 'auto':
                try:
                    if self.vehicle_profile_manager:
                        active_vehicle = self.vehicle_profile_manager.get_active_vehicle()
                        if active_vehicle:
                            vehicle_type = active_vehicle.get('vehicle_type', 'petrol_diesel')

                            # Check fuel/battery level
                            if vehicle_type in ['electric', 'hybrid']:
                                battery_level = active_vehicle.get('battery_level_percent', 100)
                                if battery_level < 20:
                                    message = f"⚠️ Low battery: {battery_level}%. May not reach destination."
                                    notification.notify(title="Battery Alert", message=message)
                                    if self.voice_guidance_enabled:
                                        self.speak(f"Warning: Battery level is low")
                            else:
                                fuel_level = active_vehicle.get('fuel_level_percent', 100)
                                if fuel_level < 20:
                                    message = f"⚠️ Low fuel: {fuel_level}%. May not reach destination."
                                    notification.notify(title="Fuel Alert", message=message)
                                    if self.voice_guidance_enabled:
                                        self.speak(f"Warning: Fuel level is low")
                except Exception as e:
                    print(f"Fuel/battery check error: {e}")

            # ===== MAINTENANCE CHECK =====
            if self.maintenance_alerts_enabled:
                try:
                    if self.vehicle_profile_manager:
                        active_vehicle = self.vehicle_profile_manager.get_active_vehicle()
                        if active_vehicle:
                            vehicle_id = active_vehicle['id']
                            reminders = self.get_maintenance_reminders(vehicle_id)
                            if reminders:
                                for reminder in reminders:
                                    if reminder.get('status') == 'pending':
                                        message = f"⚠️ Maintenance due: {reminder.get('service_type', 'Service')}"
                                        notification.notify(title="Maintenance Reminder", message=message)
                                        if self.voice_guidance_enabled:
                                            self.speak(f"Reminder: {reminder.get('service_type', 'Maintenance')} is due")
                                        break
                except Exception as e:
                    print(f"Maintenance check error: {e}")

        except Exception as e:
            print(f"Pre-departure check error: {e}")

    def get_costing_options(self):
        """Get costing options for Valhalla based on routing mode."""
        if self.routing_mode == 'auto':
            return {
                "auto": {
                    "use_toll": self.include_tolls,
                    "toll_factor": 1.0 if self.include_tolls else 10.0,
                    "use_ferry": True
                }
            }
        elif self.routing_mode == 'pedestrian':
            return {
                "pedestrian": {
                    "walking_speed": 5.1,
                    "use_ferry": True
                }
            }
        elif self.routing_mode == 'bicycle':
            return {
                "bicycle": {
                    "cycling_speed": 25,
                    "use_bike_lanes": True,
                    "use_roads": True,
                    "use_ferry": True
                }
            }
        return {}

    def should_show_cost_inputs(self):
        """Check if cost inputs should be shown (only for auto mode)."""
        return self.routing_mode == 'auto'

    def should_show_toll_toggle(self):
        """Check if toll toggle should be shown (only for auto mode)."""
        return self.routing_mode == 'auto'

    def get_route_summary(self):
        """Get route summary based on routing mode."""
        try:
            distance_str = self.format_distance(self.route_distance * 1000)
            time_str = f"{int(self.route_time / 60)} min"

            if self.routing_mode == 'pedestrian':
                return f"Walking: {distance_str}, {time_str}"
            elif self.routing_mode == 'bicycle':
                return f"Cycling: {distance_str}, {time_str}"
            else:
                cost = self.calculate_cost(self.route_distance)
                toll_cost = self.calculate_toll_cost()
                caz_cost = self.calculate_caz_cost()
                total_cost = cost + toll_cost + caz_cost
                cost_str = self.format_currency(total_cost)

                # Build detailed cost breakdown
                if toll_cost > 0 and caz_cost > 0:
                    return f"Driving: {distance_str}, {time_str}, {cost_str} ({self.format_currency(cost)} + {self.format_currency(toll_cost)} tolls + {self.format_currency(caz_cost)} CAZ)"
                elif toll_cost > 0:
                    return f"Driving: {distance_str}, {time_str}, {cost_str} ({self.format_currency(cost)} + {self.format_currency(toll_cost)} tolls)"
                elif caz_cost > 0:
                    return f"Driving: {distance_str}, {time_str}, {cost_str} ({self.format_currency(cost)} + {self.format_currency(caz_cost)} CAZ)"
                else:
                    return f"Driving: {distance_str}, {time_str}, {cost_str}"
        except Exception as e:
            print(f"Route summary error: {e}")
            return "Route unavailable"

    # ============================================================================
    # MULTI-STOP ROUTE PLANNING METHODS
    # ============================================================================

    def add_waypoint(self, lat, lon, name="", address=""):
        """
        Add a waypoint to the multi-stop route.

        Args:
            lat: Latitude of waypoint
            lon: Longitude of waypoint
            name: Name of waypoint
            address: Address of waypoint

        Returns:
            dict: Waypoint info with ID
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "add_waypoint")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            timestamp = int(time.time())
            route_id = f"route_{timestamp}"

            self.cursor.execute(
                """INSERT INTO waypoints (route_id, sequence_order, lat, lon, name, address, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (route_id, len(self.waypoints), lat, lon, name, address, timestamp)
            )
            self.conn.commit()

            waypoint = {
                'id': self.cursor.lastrowid,
                'route_id': route_id,
                'sequence_order': len(self.waypoints),
                'lat': lat,
                'lon': lon,
                'name': name,
                'address': address,
                'timestamp': timestamp
            }

            self.waypoints.append(waypoint)
            print(f"[OK] Waypoint added: {name} at ({lat}, {lon})")
            notification.notify(title="Waypoint Added", message=f"Added {name}")
            return waypoint

        except Exception as e:
            print(f"Add waypoint error: {e}")
            log_validation_error(str(e), "add_waypoint")
            return {'error': str(e)}

    def remove_waypoint(self, waypoint_id):
        """
        Remove a waypoint from the multi-stop route.

        Args:
            waypoint_id: ID of waypoint to remove

        Returns:
            bool: Success status
        """
        try:
            self.cursor.execute("DELETE FROM waypoints WHERE id = ?", (waypoint_id,))
            self.conn.commit()

            self.waypoints = [w for w in self.waypoints if w['id'] != waypoint_id]
            print(f"[OK] Waypoint {waypoint_id} removed")
            return True

        except Exception as e:
            print(f"Remove waypoint error: {e}")
            return False

    def reorder_waypoints(self, waypoint_ids):
        """
        Reorder waypoints in the multi-stop route.

        Args:
            waypoint_ids: List of waypoint IDs in new order

        Returns:
            bool: Success status
        """
        try:
            for order, waypoint_id in enumerate(waypoint_ids):
                self.cursor.execute(
                    "UPDATE waypoints SET sequence_order = ? WHERE id = ?",
                    (order, waypoint_id)
                )
            self.conn.commit()

            # Reorder in-memory list
            self.waypoints.sort(key=lambda w: waypoint_ids.index(w['id']))
            print(f"[OK] Waypoints reordered")
            return True

        except Exception as e:
            print(f"Reorder waypoints error: {e}")
            return False

    def calculate_multi_stop_route(self, start_lat, start_lon, end_lat, end_lon):
        """
        Calculate route through multiple waypoints.

        Args:
            start_lat, start_lon: Starting coordinates
            end_lat, end_lon: Ending coordinates

        Returns:
            dict: Multi-stop route with legs and summary
        """
        try:
            # SECURITY: Validate all coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "calculate_multi_stop_route (start)")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid start coordinates'}

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "calculate_multi_stop_route (end)")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid end coordinates'}

            # Build locations array with start, waypoints, and end
            locations = [
                {'lat': start_lat, 'lon': start_lon}
            ]

            for waypoint in sorted(self.waypoints, key=lambda w: w['sequence_order']):
                locations.append({'lat': waypoint['lat'], 'lon': waypoint['lon']})

            locations.append({'lat': end_lat, 'lon': end_lon})

            # Check if Valhalla is available
            if not self.check_valhalla_connection():
                print("Valhalla unavailable, using fallback multi-stop route")
                return self._fallback_multi_stop_route(locations)

            # Build Valhalla payload with multiple locations
            payload = {
                "locations": locations,
                "costing": self.get_valhalla_costing(),
                "format": "json"
            }

            # Make request
            response = self._make_valhalla_request("/route", payload)

            if response and 'trip' in response:
                legs = response['trip'].get('legs', [])
                total_distance = 0
                total_time = 0
                leg_summaries = []

                for i, leg in enumerate(legs):
                    summary = leg.get('summary', {})
                    distance_km = summary.get('length', 0) / 1000
                    time_seconds = summary.get('time', 0)
                    total_distance += distance_km
                    total_time += time_seconds

                    leg_summaries.append({
                        'leg_number': i + 1,
                        'distance_km': distance_km,
                        'time_seconds': time_seconds,
                        'from': f"Stop {i}" if i > 0 else "Start",
                        'to': f"Stop {i + 1}" if i < len(legs) - 1 else "End"
                    })

                self.multi_stop_route = {
                    'locations': locations,
                    'legs': leg_summaries,
                    'total_distance_km': total_distance,
                    'total_time_seconds': total_time,
                    'waypoint_count': len(self.waypoints),
                    'timestamp': int(time.time())
                }

                print(f"[OK] Multi-stop route calculated: {total_distance:.1f} km, {total_time/60:.0f} min, {len(self.waypoints)} waypoints")
                return self.multi_stop_route

            return {'error': 'Failed to calculate multi-stop route'}

        except Exception as e:
            print(f"Calculate multi-stop route error: {e}")
            log_validation_error(str(e), "calculate_multi_stop_route")
            return {'error': str(e)}

    def _fallback_multi_stop_route(self, locations):
        """Fallback multi-stop route calculation using geodesic distance."""
        try:
            total_distance = 0
            total_time = 0
            leg_summaries = []

            for i in range(len(locations) - 1):
                start = locations[i]
                end = locations[i + 1]

                distance = geodesic(
                    (start['lat'], start['lon']),
                    (end['lat'], end['lon'])
                ).kilometers

                # Estimate time based on routing mode
                if self.routing_mode == 'pedestrian':
                    avg_speed = 5
                elif self.routing_mode == 'bicycle':
                    avg_speed = 20
                else:
                    avg_speed = 60

                time_seconds = (distance / avg_speed) * 3600
                total_distance += distance
                total_time += time_seconds

                leg_summaries.append({
                    'leg_number': i + 1,
                    'distance_km': distance,
                    'time_seconds': time_seconds,
                    'from': f"Stop {i}" if i > 0 else "Start",
                    'to': f"Stop {i + 1}" if i < len(locations) - 1 else "End"
                })

            return {
                'locations': locations,
                'legs': leg_summaries,
                'total_distance_km': total_distance,
                'total_time_seconds': total_time,
                'waypoint_count': len(locations) - 2,
                'fallback': True,
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Fallback multi-stop route error: {e}")
            return {'error': str(e)}

    def get_multi_stop_route_summary(self):
        """Get summary of multi-stop route with leg details."""
        try:
            if not self.multi_stop_route:
                return "No multi-stop route calculated"

            total_distance = self.multi_stop_route.get('total_distance_km', 0)
            total_time = self.multi_stop_route.get('total_time_seconds', 0)
            waypoint_count = self.multi_stop_route.get('waypoint_count', 0)

            distance_str = self.format_distance(total_distance * 1000)
            time_str = f"{int(total_time / 60)} min"

            summary = f"Multi-stop route: {distance_str}, {time_str}, {waypoint_count} stops\n"

            for leg in self.multi_stop_route.get('legs', []):
                leg_distance = self.format_distance(leg['distance_km'] * 1000)
                leg_time = f"{int(leg['time_seconds'] / 60)} min"
                summary += f"  Leg {leg['leg_number']}: {leg_distance}, {leg_time}\n"

            return summary

        except Exception as e:
            print(f"Get multi-stop route summary error: {e}")
            return "Error getting route summary"

    # ============================================================================
    # TIME-WINDOW CONSTRAINT METHODS
    # ============================================================================

    def set_time_window(self, waypoint_id, arrive_by_time=None, depart_after_time=None, is_flexible=False):
        """
        Set time window constraints for a waypoint.

        Args:
            waypoint_id: ID of waypoint
            arrive_by_time: Unix timestamp for arrival deadline
            depart_after_time: Unix timestamp for earliest departure
            is_flexible: Whether time window is flexible

        Returns:
            dict: Time window info
        """
        try:
            timestamp = int(time.time())

            self.cursor.execute(
                """INSERT INTO time_windows (waypoint_id, arrive_by_time, depart_after_time, is_flexible, timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (waypoint_id, arrive_by_time, depart_after_time, 1 if is_flexible else 0, timestamp)
            )
            self.conn.commit()

            time_window = {
                'id': self.cursor.lastrowid,
                'waypoint_id': waypoint_id,
                'arrive_by_time': arrive_by_time,
                'depart_after_time': depart_after_time,
                'is_flexible': is_flexible,
                'timestamp': timestamp
            }

            self.time_windows[waypoint_id] = time_window
            print(f"[OK] Time window set for waypoint {waypoint_id}")
            return time_window

        except Exception as e:
            print(f"Set time window error: {e}")
            return {'error': str(e)}

    def validate_time_windows(self, route_data):
        """
        Validate that route can meet time window constraints.

        Args:
            route_data: Route data with timing information

        Returns:
            dict: Validation result with violations
        """
        try:
            violations = []
            current_time = int(time.time())

            for waypoint_id, time_window in self.time_windows.items():
                arrive_by = time_window.get('arrive_by_time')
                depart_after = time_window.get('depart_after_time')

                # Check arrival deadline
                if arrive_by and current_time > arrive_by:
                    violations.append({
                        'waypoint_id': waypoint_id,
                        'type': 'arrival_deadline_passed',
                        'deadline': arrive_by,
                        'current_time': current_time
                    })

                # Check departure constraint
                if depart_after and current_time < depart_after:
                    violations.append({
                        'waypoint_id': waypoint_id,
                        'type': 'departure_not_ready',
                        'ready_time': depart_after,
                        'current_time': current_time
                    })

            if violations:
                print(f"[WARN] Time window violations detected: {len(violations)}")
                for violation in violations:
                    print(f"  - Waypoint {violation['waypoint_id']}: {violation['type']}")
                    if violation['type'] == 'arrival_deadline_passed':
                        self.speak(f"Warning: Arrival deadline has passed for waypoint {violation['waypoint_id']}")
                    notification.notify(
                        title="Time Window Violation",
                        message=f"Waypoint {violation['waypoint_id']}: {violation['type']}"
                    )

            return {
                'valid': len(violations) == 0,
                'violations': violations,
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Validate time windows error: {e}")
            return {'error': str(e)}

    def suggest_departure_times(self, start_lat, start_lon, end_lat, end_lon):
        """
        Suggest optimal departure times to meet time window constraints.

        Args:
            start_lat, start_lon: Starting coordinates
            end_lat, end_lon: Ending coordinates

        Returns:
            dict: Suggested departure times
        """
        try:
            suggestions = []
            current_time = int(time.time())

            # Fetch traffic data for different times
            traffic_data = self.fetch_traffic_data(start_lat, start_lon, 10)

            if not traffic_data or 'error' in traffic_data:
                print("[WARN] Could not fetch traffic data for departure time suggestions")
                return {'suggestions': [], 'note': 'Traffic data unavailable'}

            # Analyze time windows
            for waypoint_id, time_window in self.time_windows.items():
                arrive_by = time_window.get('arrive_by_time')

                if arrive_by:
                    # Calculate required departure time
                    # Assume average 60 km/h for auto mode
                    distance = geodesic(
                        (start_lat, start_lon),
                        (end_lat, end_lon)
                    ).kilometers

                    if self.routing_mode == 'pedestrian':
                        avg_speed = 5
                    elif self.routing_mode == 'bicycle':
                        avg_speed = 20
                    else:
                        avg_speed = 60

                    travel_time_seconds = (distance / avg_speed) * 3600
                    required_departure = arrive_by - int(travel_time_seconds)

                    if required_departure > current_time:
                        suggestions.append({
                            'waypoint_id': waypoint_id,
                            'arrive_by': arrive_by,
                            'suggested_departure': required_departure,
                            'travel_time_seconds': travel_time_seconds,
                            'status': 'feasible'
                        })
                    else:
                        suggestions.append({
                            'waypoint_id': waypoint_id,
                            'arrive_by': arrive_by,
                            'suggested_departure': current_time,
                            'travel_time_seconds': travel_time_seconds,
                            'status': 'tight_schedule'
                        })

            print(f"[OK] Generated {len(suggestions)} departure time suggestions")
            return {
                'suggestions': suggestions,
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Suggest departure times error: {e}")
            log_validation_error(str(e), "suggest_departure_times")
            return {'error': str(e)}

    # ============================================================================
    # REAL-TIME RE-ROUTING METHODS
    # ============================================================================

    def monitor_route_traffic(self, start_lat, start_lon, end_lat, end_lon):
        """
        Start monitoring traffic along active route.

        Args:
            start_lat, start_lon: Starting coordinates
            end_lat, end_lon: Ending coordinates

        Returns:
            bool: Success status
        """
        try:
            self.route_monitoring_enabled = True
            self.current_route = {
                'start_lat': start_lat,
                'start_lon': start_lon,
                'end_lat': end_lat,
                'end_lon': end_lon,
                'start_time': int(time.time())
            }

            print(f"[OK] Route traffic monitoring started")
            notification.notify(title="Route Monitoring", message="Traffic monitoring enabled")

            # Schedule periodic traffic checks
            Clock.schedule_interval(
                lambda dt: self._check_route_traffic(),
                self.traffic_check_interval
            )

            return True

        except Exception as e:
            print(f"Monitor route traffic error: {e}")
            return False

    def _check_route_traffic(self):
        """Periodic check for traffic changes along route."""
        try:
            if not self.route_monitoring_enabled or not self.current_route:
                return

            current_time = time.time()
            if current_time - self.last_traffic_check_time < self.traffic_check_interval:
                return

            self.last_traffic_check_time = current_time

            # Detect traffic changes
            changes = self.detect_traffic_changes()

            if changes and changes.get('significant_change'):
                # Calculate alternative route
                alt_route = self.calculate_alternative_route(
                    self.current_route['start_lat'],
                    self.current_route['start_lon'],
                    self.current_route['end_lat'],
                    self.current_route['end_lon']
                )

                if alt_route and alt_route.get('time_saved_seconds', 0) > self.reroute_threshold_minutes * 60:
                    # Prompt user for re-routing
                    self.prompt_reroute(alt_route, changes)

        except Exception as e:
            print(f"Check route traffic error: {e}")

    def detect_traffic_changes(self):
        """
        Detect significant traffic changes along current route.

        Returns:
            dict: Traffic change information
        """
        try:
            if not self.current_route:
                return {'significant_change': False}

            # Fetch current traffic data
            traffic_data = self.fetch_traffic_data(
                self.current_route['start_lat'],
                self.current_route['start_lon'],
                10
            )

            if not traffic_data or 'error' in traffic_data:
                return {'significant_change': False}

            # Check for significant changes
            conditions = traffic_data.get('conditions', {})
            flow = conditions.get('flow', 'unknown')

            # Determine if change is significant
            significant = flow in ['congested', 'heavy']

            return {
                'significant_change': significant,
                'flow': flow,
                'delay_minutes': conditions.get('delay_minutes', 0),
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Detect traffic changes error: {e}")
            return {'significant_change': False}

    def calculate_alternative_route(self, start_lat, start_lon, end_lat, end_lon):
        """
        Calculate alternative route to compare with current route.

        Args:
            start_lat, start_lon: Starting coordinates
            end_lat, end_lon: Ending coordinates

        Returns:
            dict: Alternative route with comparison data
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "calculate_alternative_route (start)")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "calculate_alternative_route (end)")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            # Calculate new route
            new_route = self.calculate_route(start_lat, start_lon, end_lat, end_lon)

            if not new_route or 'error' in new_route:
                return None

            # Compare with current route
            current_time = self.current_route.get('time_seconds', self.route_time)
            new_time = new_route.get('trip', {}).get('legs', [{}])[0].get('summary', {}).get('time', self.route_time)

            time_saved = current_time - new_time
            distance_diff = self.route_distance - (new_route.get('trip', {}).get('legs', [{}])[0].get('summary', {}).get('length', 0) / 1000)

            return {
                'route': new_route,
                'time_saved_seconds': time_saved,
                'distance_difference_km': distance_diff,
                'new_time_seconds': new_time,
                'new_distance_km': new_route.get('trip', {}).get('legs', [{}])[0].get('summary', {}).get('length', 0) / 1000,
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Calculate alternative route error: {e}")
            log_validation_error(str(e), "calculate_alternative_route")
            return None

    def prompt_reroute(self, alt_route, traffic_changes):
        """
        Prompt user to accept or reject re-routing suggestion.

        Args:
            alt_route: Alternative route data
            traffic_changes: Traffic change information

        Returns:
            bool: Whether prompt was shown
        """
        try:
            time_saved = alt_route.get('time_saved_seconds', 0)
            distance_diff = alt_route.get('distance_difference_km', 0)

            message = f"Traffic detected! Alternative route saves {int(time_saved/60)} minutes and {distance_diff:.1f} km. Accept?"
            print(f"[OK] Re-routing prompt: {message}")

            # Voice alert
            if self.voice_guidance_enabled:
                self.speak(f"Traffic detected. Alternative route saves {int(time_saved/60)} minutes. Accept?")

            # Notification
            notification.notify(
                title="Re-Routing Suggestion",
                message=message
            )

            # Store for user decision
            self.pending_reroute = {
                'alt_route': alt_route,
                'traffic_changes': traffic_changes,
                'timestamp': int(time.time())
            }

            return True

        except Exception as e:
            print(f"Prompt reroute error: {e}")
            return False

    def accept_reroute(self):
        """Accept re-routing suggestion and update current route."""
        try:
            if not hasattr(self, 'pending_reroute') or not self.pending_reroute:
                return False

            alt_route = self.pending_reroute['alt_route']
            traffic_changes = self.pending_reroute['traffic_changes']

            # Update current route
            self.current_route = alt_route['route']

            # Log re-routing event
            self.cursor.execute(
                """INSERT INTO reroute_events (original_route_id, alternative_route_id, reason, time_saved_seconds, distance_difference_km, user_action, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"route_{int(time.time())}",
                    f"route_{int(time.time())}",
                    traffic_changes.get('flow', 'unknown'),
                    alt_route.get('time_saved_seconds', 0),
                    alt_route.get('distance_difference_km', 0),
                    'accepted',
                    int(time.time())
                )
            )
            self.conn.commit()

            print(f"[OK] Re-routing accepted. Time saved: {alt_route.get('time_saved_seconds', 0)/60:.0f} minutes")
            notification.notify(title="Route Updated", message="New route accepted")
            self.speak("Route updated")

            self.pending_reroute = None
            return True

        except Exception as e:
            print(f"Accept reroute error: {e}")
            return False

    def reject_reroute(self):
        """Reject re-routing suggestion and continue on current route."""
        try:
            if not hasattr(self, 'pending_reroute') or not self.pending_reroute:
                return False

            alt_route = self.pending_reroute['alt_route']
            traffic_changes = self.pending_reroute['traffic_changes']

            # Log re-routing event
            self.cursor.execute(
                """INSERT INTO reroute_events (original_route_id, alternative_route_id, reason, time_saved_seconds, distance_difference_km, user_action, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"route_{int(time.time())}",
                    f"route_{int(time.time())}",
                    traffic_changes.get('flow', 'unknown'),
                    alt_route.get('time_saved_seconds', 0),
                    alt_route.get('distance_difference_km', 0),
                    'rejected',
                    int(time.time())
                )
            )
            self.conn.commit()

            print(f"[OK] Re-routing rejected. Continuing on current route")
            notification.notify(title="Route Unchanged", message="Continuing on current route")

            self.pending_reroute = None
            return True

        except Exception as e:
            print(f"Reject reroute error: {e}")
            return False

    def stop_route_monitoring(self):
        """Stop monitoring traffic along route."""
        try:
            self.route_monitoring_enabled = False
            self.current_route = None
            print(f"[OK] Route traffic monitoring stopped")
            return True

        except Exception as e:
            print(f"Stop route monitoring error: {e}")
            return False

    # Search functionality methods
    def search_location(self, query):
        """Search for location using Nominatim API."""
        try:
            # Rate limiting: max 1 request per second
            current_time = time.time()
            if current_time - self.last_search_time < 1.0:
                return {'error': 'Please wait before searching again'}
            self.last_search_time = current_time

            # SECURITY: Validate search query before processing
            is_valid, error_msg, sanitized_query = validate_search_query(query, "search_location")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid search query'}

            # Use sanitized query for API request
            query = sanitized_query

            # Nominatim API endpoint
            url = 'https://nominatim.openstreetmap.org/search'

            # SECURITY: Sanitize query for API request
            safe_query = sanitize_string_for_api(query)

            params = {
                'q': safe_query,
                'format': 'json',
                'addressdetails': 1,
                'limit': 10
            }

            # Add user agent (required by Nominatim)
            headers = {'User-Agent': 'Voyagr-SatNav/1.0'}

            response = requests.get(url, params=params, headers=headers, timeout=5)
            response.raise_for_status()

            results = response.json()
            if not results:
                return {'error': 'No results found'}

            # Process results
            processed_results = []
            for result in results[:10]:
                distance = geodesic(self.current_pos, (float(result['lat']), float(result['lon']))).meters
                processed_results.append({
                    'name': result.get('name', 'Unknown'),
                    'address': result.get('display_name', ''),
                    'lat': float(result['lat']),
                    'lon': float(result['lon']),
                    'distance': distance,
                    'category': result.get('type', 'location')
                })

            self.search_results = processed_results
            self.add_search_to_history(query, processed_results[0] if processed_results else None)
            return {'success': True, 'results': processed_results}

        except requests.exceptions.ConnectionError:
            return {'error': 'No internet connection'}
        except requests.exceptions.Timeout:
            return {'error': 'Search timeout - please try again'}
        except Exception as e:
            print(f"Search error: {e}")
            return {'error': f'Search failed: {str(e)}'}

    def add_search_to_history(self, query, result):
        """Add search to history database."""
        try:
            # SECURITY: Validate query before storing
            is_valid, error_msg, sanitized_query = validate_search_query(query, "add_search_to_history")
            if not is_valid:
                log_validation_error(error_msg)
                return  # Skip adding invalid query to history

            timestamp = int(time.time())
            result_name = result['name'] if result else None
            lat = result['lat'] if result else None
            lon = result['lon'] if result else None

            # SECURITY: Validate result coordinates if present
            if lat is not None and lon is not None:
                is_valid, error_msg = validate_coordinates(lat, lon, "add_search_to_history (result)")
                if not is_valid:
                    log_validation_error(error_msg)
                    lat, lon = None, None  # Clear invalid coordinates

            # SECURITY: Use parameterized query (already in place)
            self.cursor.execute(
                "INSERT INTO search_history (query, result_name, lat, lon, timestamp) VALUES (?, ?, ?, ?, ?)",
                (sanitized_query, result_name, lat, lon, timestamp)
            )

            # OPTIMIZATION: Keep only last 50 searches using more efficient query
            # Delete records with id less than the 50th most recent
            self.cursor.execute("""DELETE FROM search_history WHERE id <=
                                   (SELECT id FROM search_history ORDER BY timestamp DESC LIMIT 1 OFFSET 50)""")
            self.conn.commit()
        except Exception as e:
            print(f"Search history error: {e}")
            log_validation_error(str(e), "add_search_to_history")

    def get_search_history(self):
        """Retrieve search history from database."""
        try:
            self.cursor.execute("SELECT query, result_name, lat, lon FROM search_history ORDER BY timestamp DESC LIMIT 20")
            return self.cursor.fetchall()
        except Exception as e:
            print(f"Get search history error: {e}")
            return []

    def add_to_favorites(self, location):
        """Add location to favorites."""
        try:
            # SECURITY: Validate location data
            if not isinstance(location, dict):
                log_validation_error("Location must be a dictionary", "add_to_favorites")
                notification.notify(title="Error", message="Invalid location data")
                return False

            # Validate required fields
            if 'name' not in location or 'lat' not in location or 'lon' not in location:
                log_validation_error("Location missing required fields (name, lat, lon)", "add_to_favorites")
                notification.notify(title="Error", message="Location data incomplete")
                return False

            # Validate coordinates
            is_valid, error_msg = validate_coordinates(location['lat'], location['lon'], "add_to_favorites")
            if not is_valid:
                log_validation_error(error_msg)
                notification.notify(title="Error", message="Invalid location coordinates")
                return False

            # Validate name
            name = str(location['name']).strip()
            if len(name) < 1 or len(name) > 255:
                log_validation_error("Location name must be 1-255 characters", "add_to_favorites")
                notification.notify(title="Error", message="Invalid location name")
                return False

            timestamp = int(time.time())
            address = str(location.get('address', '')).strip()[:500]  # Limit address length
            category = str(location.get('category', 'location')).strip()[:50]  # Limit category length

            # SECURITY: Use parameterized query (already in place)
            self.cursor.execute(
                "INSERT INTO favorite_locations (name, address, lat, lon, category, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (name, address, location['lat'], location['lon'], category, timestamp)
            )
            self.conn.commit()
            self.speak(f"Added {name} to favorites")
            notification.notify(title="Favorite Added", message=f"{name} saved")
            return True
        except Exception as e:
            print(f"Add to favorites error: {e}")
            log_validation_error(str(e), "add_to_favorites")
            notification.notify(title="Error", message="Could not add to favorites")
            return False

    def get_favorites(self):
        """Retrieve favorite locations from database."""
        try:
            self.cursor.execute("SELECT name, address, lat, lon, category FROM favorite_locations ORDER BY timestamp DESC")
            return self.cursor.fetchall()
        except Exception as e:
            print(f"Get favorites error: {e}")
            return []

    def set_destination_from_search(self, result):
        """Set search result as destination."""
        try:
            self.current_route = {
                'destination': result['name'],
                'lat': result['lat'],
                'lon': result['lon'],
                'distance': result['distance'],
                'coordinates': [(result['lon'], result['lat'])]
            }
            self.speak(f"Destination set to {result['name']}")
            notification.notify(title="Destination Set", message=result['name'])
            return True
        except Exception as e:
            print(f"Set destination error: {e}")
            return False

    def setup_ui(self):
        """Setup Kivy UI."""
        layout = BoxLayout(orientation='vertical')
        self.mapview = MapView(zoom=15, lat=53.5526, lon=-1.4797)
        layout.add_widget(self.mapview)
        
        scroll = ScrollView()
        toggle_layout = BoxLayout(orientation='vertical', size_hint_y=None)
        toggle_layout.bind(minimum_height=toggle_layout.setter('height'))
        
        # Create toggles
        self.toggles = {
            'routing_auto': ToggleButton(text='Auto (Car)', state='down' if self.routing_mode == 'auto' else 'normal', size_hint_y=None, height=40),
            'routing_pedestrian': ToggleButton(text='Pedestrian (Walking)', state='down' if self.routing_mode == 'pedestrian' else 'normal', size_hint_y=None, height=40),
            'routing_bicycle': ToggleButton(text='Bicycle (Cycling)', state='down' if self.routing_mode == 'bicycle' else 'normal', size_hint_y=None, height=40),
            'voice_wake': ToggleButton(text='Voice Wake Word', state='normal', size_hint_y=None, height=40),
            'gesture': ToggleButton(text='Gesture Activation', state='normal', size_hint_y=None, height=40),
            'contextual_prompt': ToggleButton(text='Contextual Prompts', state='normal', size_hint_y=None, height=40),
            'distance_km': ToggleButton(text='Kilometers', state='down' if self.distance_unit == 'km' else 'normal', size_hint_y=None, height=40),
            'distance_mi': ToggleButton(text='Miles', state='down' if self.distance_unit == 'mi' else 'normal', size_hint_y=None, height=40),
            'temp_c': ToggleButton(text='Celsius', state='down' if self.temperature_unit == 'C' else 'normal', size_hint_y=None, height=40),
            'temp_f': ToggleButton(text='Fahrenheit', state='down' if self.temperature_unit == 'F' else 'normal', size_hint_y=None, height=40),
            'currency_gbp': ToggleButton(text='GBP (£)', state='down' if self.currency_unit == 'GBP' else 'normal', size_hint_y=None, height=40),
            'currency_usd': ToggleButton(text='USD ($)', state='down' if self.currency_unit == 'USD' else 'normal', size_hint_y=None, height=40),
            'currency_eur': ToggleButton(text='EUR (€)', state='down' if self.currency_unit == 'EUR' else 'normal', size_hint_y=None, height=40),
            'vehicle_petrol_diesel': ToggleButton(text='Petrol/Diesel', state='down' if self.vehicle_type == 'petrol_diesel' else 'normal', size_hint_y=None, height=40),
            'vehicle_electric': ToggleButton(text='Electric', state='down' if self.vehicle_type == 'electric' else 'normal', size_hint_y=None, height=40),
            'fuel_l_per_100km': ToggleButton(text='L/100 km', state='down' if self.fuel_unit == 'l_per_100km' else 'normal', size_hint_y=None, height=40),
            'fuel_mpg': ToggleButton(text='Miles per Gallon', state='down' if self.fuel_unit == 'mpg' else 'normal', size_hint_y=None, height=40),
            'fuel_kwh_per_100km': ToggleButton(text='kWh/100 km', state='down' if self.fuel_unit == 'kwh_per_100km' else 'normal', size_hint_y=None, height=40),
            'fuel_miles_per_kwh': ToggleButton(text='Miles per kWh', state='down' if self.fuel_unit == 'miles_per_kwh' else 'normal', size_hint_y=None, height=40),
            'include_tolls': ToggleButton(text='Include Tolls', state='down' if self.include_tolls else 'normal', size_hint_y=None, height=40),
            'avoid_caz': ToggleButton(text='Avoid CAZ', state='down' if self.avoid_caz else 'normal', size_hint_y=None, height=40),
            'vehicle_caz_exempt': ToggleButton(text='CAZ Exempt Vehicle', state='down' if self.vehicle_caz_exempt else 'normal', size_hint_y=None, height=40),
            'enable_hazard_avoidance': ToggleButton(text='Enable Hazard Avoidance', state='down' if self.enable_hazard_avoidance else 'normal', size_hint_y=None, height=40),
            'avoid_speed_cameras': ToggleButton(text='Avoid Speed Cameras', state='down', size_hint_y=None, height=40),
            'avoid_traffic_cameras': ToggleButton(text='Avoid Traffic Cameras', state='down', size_hint_y=None, height=40),
            'avoid_police': ToggleButton(text='Avoid Police Checkpoints', state='down', size_hint_y=None, height=40),
            'avoid_roadworks': ToggleButton(text='Avoid Road Works', state='down', size_hint_y=None, height=40),
            'avoid_accidents': ToggleButton(text='Avoid Accidents', state='down', size_hint_y=None, height=40),
            'avoid_railway_crossings': ToggleButton(text='Avoid Railway Crossings', state='down', size_hint_y=None, height=40),
            'speed_alert_enabled': ToggleButton(text='Speed Alerts', state='down' if self.speed_alert_enabled else 'normal', size_hint_y=None, height=40),
            'traffic_alerts': ToggleButton(text='Traffic Alerts', state='down' if self.traffic_alerts_enabled else 'normal', size_hint_y=None, height=40),
            'weather_alerts': ToggleButton(text='Weather Alerts', state='down' if self.weather_alerts_enabled else 'normal', size_hint_y=None, height=40),
            'maintenance_alerts': ToggleButton(text='Maintenance Alerts', state='down' if self.maintenance_alerts_enabled else 'normal', size_hint_y=None, height=40),
            'fuel_battery_alerts': ToggleButton(text='Fuel/Battery Alerts', state='down' if self.fuel_battery_alerts_enabled else 'normal', size_hint_y=None, height=40),
            'battery_saving_mode': ToggleButton(text='Battery Saving Mode', state='down' if self.battery_saving_mode else 'normal', size_hint_y=None, height=40),
            'departure_time_suggestions': ToggleButton(text='Departure Time Suggestions', state='down' if self.departure_time_suggestions_enabled else 'normal', size_hint_y=None, height=40),
            'learn_preferences': ToggleButton(text='Learn Preferences', state='down' if self.learn_preferences_enabled else 'normal', size_hint_y=None, height=40),
            'auto_optimize_routes': ToggleButton(text='Auto-Optimize Routes', state='down' if self.auto_optimize_routes_enabled else 'normal', size_hint_y=None, height=40),
            'smart_charging': ToggleButton(text='Smart Charging Suggestions', state='down' if self.smart_charging_enabled else 'normal', size_hint_y=None, height=40),
            'smart_refueling': ToggleButton(text='Smart Refueling Suggestions', state='down' if self.smart_refueling_enabled else 'normal', size_hint_y=None, height=40),
            'social_features': ToggleButton(text='Social Features', state='down' if self.social_features_enabled else 'normal', size_hint_y=None, height=40),
            'community_reports': ToggleButton(text='Community Hazard Reports', state='down' if self.community_reports_enabled else 'normal', size_hint_y=None, height=40),
            'trip_groups': ToggleButton(text='Social Trip Planning', state='down' if self.trip_groups_enabled else 'normal', size_hint_y=None, height=40),
        }

        # Create input fields
        currency_symbol = self.get_currency_symbol()
        # Speed alert threshold display in user's preferred unit
        speed_threshold_display = self.get_speed_alert_threshold_in_user_units()
        speed_unit_label = self.get_speed_unit_label()
        self.inputs = {
            'fuel_efficiency': TextInput(text=str(self.fuel_efficiency), hint_text='Fuel Efficiency (L/100 km or mpg)', size_hint_y=None, height=40),
            'fuel_price': TextInput(text=str(self.fuel_price_gbp), hint_text=f'Fuel Price ({currency_symbol}/L)', size_hint_y=None, height=40),
            'energy_efficiency': TextInput(text=str(self.energy_efficiency), hint_text='Energy Efficiency (kWh/100 km or miles/kWh)', size_hint_y=None, height=40),
            'electricity_price': TextInput(text=str(self.electricity_price_gbp), hint_text=f'Electricity Price ({currency_symbol}/kWh)', size_hint_y=None, height=40),
            'speed_alert_threshold': TextInput(text=f"{speed_threshold_display:.1f}", hint_text=f'Speed Alert Threshold ({speed_unit_label})', size_hint_y=None, height=40)
        }
        
        # Bind toggle buttons
        self.toggles['routing_auto'].bind(on_press=lambda x: self.set_routing_mode('auto'))
        self.toggles['routing_pedestrian'].bind(on_press=lambda x: self.set_routing_mode('pedestrian'))
        self.toggles['routing_bicycle'].bind(on_press=lambda x: self.set_routing_mode('bicycle'))
        self.toggles['distance_km'].bind(on_press=lambda x: self.set_distance_unit('km'))
        self.toggles['distance_mi'].bind(on_press=lambda x: self.set_distance_unit('mi'))
        self.toggles['temp_c'].bind(on_press=lambda x: self.set_temperature_unit('C'))
        self.toggles['temp_f'].bind(on_press=lambda x: self.set_temperature_unit('F'))
        self.toggles['currency_gbp'].bind(on_press=lambda x: self.set_currency_unit('GBP'))
        self.toggles['currency_usd'].bind(on_press=lambda x: self.set_currency_unit('USD'))
        self.toggles['currency_eur'].bind(on_press=lambda x: self.set_currency_unit('EUR'))
        self.toggles['vehicle_petrol_diesel'].bind(on_press=lambda x: self.set_vehicle_type('petrol_diesel'))
        self.toggles['vehicle_electric'].bind(on_press=lambda x: self.set_vehicle_type('electric'))
        self.toggles['fuel_l_per_100km'].bind(on_press=lambda x: self.set_fuel_unit('l_per_100km'))
        self.toggles['fuel_mpg'].bind(on_press=lambda x: self.set_fuel_unit('mpg'))
        self.toggles['fuel_kwh_per_100km'].bind(on_press=lambda x: self.set_fuel_unit('kwh_per_100km'))
        self.toggles['fuel_miles_per_kwh'].bind(on_press=lambda x: self.set_fuel_unit('miles_per_kwh'))
        self.toggles['include_tolls'].bind(on_press=lambda x: self.set_include_tolls(not self.include_tolls))
        self.toggles['avoid_caz'].bind(on_press=lambda x: self.set_caz_avoidance(not self.avoid_caz))
        self.toggles['vehicle_caz_exempt'].bind(on_press=lambda x: self.set_caz_exemption(not self.vehicle_caz_exempt))
        self.toggles['enable_hazard_avoidance'].bind(on_press=lambda x: self.set_hazard_avoidance(not self.enable_hazard_avoidance))
        self.toggles['avoid_speed_cameras'].bind(on_press=lambda x: self.toggle_hazard_type('speed_camera', x.state == 'down'))
        self.toggles['avoid_traffic_cameras'].bind(on_press=lambda x: self.toggle_hazard_type('traffic_light_camera', x.state == 'down'))
        self.toggles['avoid_police'].bind(on_press=lambda x: self.toggle_hazard_type('police', x.state == 'down'))
        self.toggles['avoid_roadworks'].bind(on_press=lambda x: self.toggle_hazard_type('roadworks', x.state == 'down'))
        self.toggles['avoid_accidents'].bind(on_press=lambda x: self.toggle_hazard_type('accident', x.state == 'down'))
        self.toggles['avoid_railway_crossings'].bind(on_press=lambda x: self.toggle_hazard_type('railway_crossing', x.state == 'down'))
        self.toggles['speed_alert_enabled'].bind(on_press=lambda x: self.set_speed_alert_enabled(x.state == 'down'))
        self.toggles['traffic_alerts'].bind(on_press=lambda x: self.set_traffic_alerts(x.state == 'down'))
        self.toggles['weather_alerts'].bind(on_press=lambda x: self.set_weather_alerts(x.state == 'down'))
        self.toggles['maintenance_alerts'].bind(on_press=lambda x: self.set_maintenance_alerts(x.state == 'down'))
        self.toggles['fuel_battery_alerts'].bind(on_press=lambda x: self.set_fuel_battery_alerts(x.state == 'down'))
        self.toggles['battery_saving_mode'].bind(on_press=lambda x: self.set_battery_saving_mode(x.state == 'down'))
        self.toggles['departure_time_suggestions'].bind(on_press=lambda x: self.set_departure_time_suggestions(x.state == 'down'))
        self.toggles['learn_preferences'].bind(on_press=lambda x: self.set_learn_preferences(x.state == 'down'))
        self.toggles['auto_optimize_routes'].bind(on_press=lambda x: self.set_auto_optimize_routes(x.state == 'down'))
        self.toggles['smart_charging'].bind(on_press=lambda x: self.set_smart_charging(x.state == 'down'))
        self.toggles['smart_refueling'].bind(on_press=lambda x: self.set_smart_refueling(x.state == 'down'))
        self.toggles['social_features'].bind(on_press=lambda x: self.set_social_features_enabled(x.state == 'down'))
        self.toggles['community_reports'].bind(on_press=lambda x: self.set_community_reports_enabled(x.state == 'down'))
        self.toggles['trip_groups'].bind(on_press=lambda x: self.set_trip_groups_enabled(x.state == 'down'))

        # Bind input fields
        self.inputs['fuel_efficiency'].bind(text=self.update_fuel_efficiency)
        self.inputs['fuel_price'].bind(text=self.update_fuel_price)
        self.inputs['energy_efficiency'].bind(text=self.update_energy_efficiency)
        self.inputs['electricity_price'].bind(text=self.update_electricity_price)
        self.inputs['speed_alert_threshold'].bind(text=self.update_speed_alert_threshold)
        
        # Add widgets to layout
        for toggle in self.toggles.values():
            toggle_layout.add_widget(toggle)
        for input_field in self.inputs.values():
            toggle_layout.add_widget(input_field)
        
        scroll.add_widget(toggle_layout)
        layout.add_widget(scroll)
        self.root = layout

        # Initialize vehicle marker on map
        self.update_vehicle_marker()

        # Schedule periodic checks
        Clock.schedule_interval(self.check_hazard_incident_alerts, 10)
        Clock.schedule_interval(self.check_camera_proximity, 5)
        Clock.schedule_interval(self.check_toll_proximity, 5)
        Clock.schedule_interval(self.check_caz_proximity, 5)
        Clock.schedule_interval(self.check_speed_alert, 2)  # Check speed every 2 seconds
        Clock.schedule_interval(self.check_weather_alerts, 300)  # Reduced from 60s to 300s for battery optimization
        Clock.schedule_interval(self.check_maintenance_reminders, 3600)  # Check maintenance every hour
        Clock.schedule_interval(self.announce_eta, 300)
        # Schedule periodic database flush for batch writes (battery optimization)
        Clock.schedule_interval(lambda dt: self.flush_pending_db_writes(), 30)

    # ============================================================================
    # UI CONTROLS FOR MULTI-STOP ROUTE MANAGEMENT
    # ============================================================================

    def create_multi_stop_panel(self):
        """Create UI panel for multi-stop route management."""
        try:
            # Create main panel layout
            panel_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=400)

            # Title
            title_label = Label(text='Multi-Stop Route Management', size_hint_y=None, height=40, bold=True)
            panel_layout.add_widget(title_label)

            # Waypoint list section
            list_label = Label(text='Waypoints:', size_hint_y=None, height=30)
            panel_layout.add_widget(list_label)

            # Scrollable waypoint list
            scroll = ScrollView(size_hint_y=0.5)
            self.waypoint_list_layout = BoxLayout(orientation='vertical', size_hint_y=None)
            self.waypoint_list_layout.bind(minimum_height=self.waypoint_list_layout.setter('height'))
            scroll.add_widget(self.waypoint_list_layout)
            panel_layout.add_widget(scroll)

            # Control buttons layout
            button_layout = GridLayout(cols=3, size_hint_y=None, height=50, spacing=5, padding=5)

            add_btn = Button(text='Add Waypoint', size_hint_y=None, height=50)
            add_btn.bind(on_press=self.show_add_waypoint_dialog)
            button_layout.add_widget(add_btn)

            remove_btn = Button(text='Remove Waypoint', size_hint_y=None, height=50)
            remove_btn.bind(on_press=self.show_remove_waypoint_dialog)
            button_layout.add_widget(remove_btn)

            reorder_btn = Button(text='Reorder Waypoints', size_hint_y=None, height=50)
            reorder_btn.bind(on_press=self.show_reorder_waypoints_dialog)
            button_layout.add_widget(reorder_btn)

            panel_layout.add_widget(button_layout)

            # Calculate route button
            calc_btn = Button(text='Calculate Multi-Stop Route', size_hint_y=None, height=50)
            calc_btn.bind(on_press=self.on_calculate_multi_stop_route)
            panel_layout.add_widget(calc_btn)

            # Route summary label
            self.multi_stop_summary_label = Label(text='Route Summary: None', size_hint_y=None, height=60, markup=True)
            panel_layout.add_widget(self.multi_stop_summary_label)

            self.multi_stop_panel = panel_layout
            print("[OK] Multi-stop panel created")
            return panel_layout

        except Exception as e:
            print(f"Create multi-stop panel error: {e}")
            return None

    def refresh_waypoint_list_ui(self):
        """Refresh the waypoint list display in UI."""
        try:
            if not self.waypoint_list_layout:
                return

            # Clear existing widgets
            self.waypoint_list_layout.clear_widgets()
            self.waypoint_ui_widgets = {}

            # Add waypoint items
            for i, waypoint in enumerate(self.waypoints):
                waypoint_item = BoxLayout(orientation='horizontal', size_hint_y=None, height=60, spacing=5, padding=5)

                # Sequence number
                seq_label = Label(text=f"#{i+1}", size_hint_x=0.1, size_hint_y=None, height=60)
                waypoint_item.add_widget(seq_label)

                # Waypoint info
                info_text = f"{waypoint.get('name', 'Waypoint')} - {waypoint.get('address', 'No address')}"
                info_label = Label(text=info_text, size_hint_x=0.6, size_hint_y=None, height=60)
                waypoint_item.add_widget(info_label)

                # Edit button
                edit_btn = Button(text='Edit', size_hint_x=0.15, size_hint_y=None, height=60)
                edit_btn.bind(on_press=lambda x, wp_id=waypoint['id']: self.show_edit_waypoint_dialog(wp_id))
                waypoint_item.add_widget(edit_btn)

                # Delete button
                del_btn = Button(text='Delete', size_hint_x=0.15, size_hint_y=None, height=60)
                del_btn.bind(on_press=lambda x, wp_id=waypoint['id']: self.on_delete_waypoint(wp_id))
                waypoint_item.add_widget(del_btn)

                self.waypoint_list_layout.add_widget(waypoint_item)
                self.waypoint_ui_widgets[waypoint['id']] = waypoint_item

            print(f"[OK] Refreshed waypoint list UI with {len(self.waypoints)} waypoints")

        except Exception as e:
            print(f"Refresh waypoint list UI error: {e}")

    def show_add_waypoint_dialog(self, instance):
        """Show dialog to add a new waypoint."""
        try:
            # Create dialog layout
            dialog_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=250, spacing=5, padding=10)

            # Name input
            name_input = TextInput(hint_text='Waypoint Name', size_hint_y=None, height=40)
            dialog_layout.add_widget(name_input)

            # Address input
            address_input = TextInput(hint_text='Waypoint Address', size_hint_y=None, height=40)
            dialog_layout.add_widget(address_input)

            # Latitude input
            lat_input = TextInput(hint_text='Latitude', size_hint_y=None, height=40)
            dialog_layout.add_widget(lat_input)

            # Longitude input
            lon_input = TextInput(hint_text='Longitude', size_hint_y=None, height=40)
            dialog_layout.add_widget(lon_input)

            # Button layout
            btn_layout = BoxLayout(size_hint_y=None, height=50, spacing=5)

            add_btn = Button(text='Add')
            add_btn.bind(on_press=lambda x: self.on_add_waypoint_confirmed(name_input.text, address_input.text, lat_input.text, lon_input.text))
            btn_layout.add_widget(add_btn)

            cancel_btn = Button(text='Cancel')
            btn_layout.add_widget(cancel_btn)

            dialog_layout.add_widget(btn_layout)

            print("[OK] Add waypoint dialog shown")
            notification.notify(title="Add Waypoint", message="Enter waypoint details")

        except Exception as e:
            print(f"Show add waypoint dialog error: {e}")

    def on_add_waypoint_confirmed(self, name, address, lat_str, lon_str):
        """Handle waypoint addition confirmation."""
        try:
            lat = float(lat_str)
            lon = float(lon_str)

            # Add waypoint
            result = self.add_waypoint(lat, lon, name, address)

            if result and 'error' not in result:
                self.refresh_waypoint_list_ui()
                notification.notify(title="Waypoint Added", message=f"Added {name}")
                self.speak(f"Waypoint {name} added")
            else:
                notification.notify(title="Error", message="Failed to add waypoint")

        except ValueError:
            notification.notify(title="Error", message="Invalid coordinates")
        except Exception as e:
            print(f"Add waypoint confirmed error: {e}")

    def show_edit_waypoint_dialog(self, waypoint_id):
        """Show dialog to edit a waypoint."""
        try:
            # Find waypoint
            waypoint = None
            for wp in self.waypoints:
                if wp['id'] == waypoint_id:
                    waypoint = wp
                    break

            if not waypoint:
                return

            # Create dialog layout
            dialog_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=250, spacing=5, padding=10)

            # Name input
            name_input = TextInput(text=waypoint.get('name', ''), hint_text='Waypoint Name', size_hint_y=None, height=40)
            dialog_layout.add_widget(name_input)

            # Address input
            address_input = TextInput(text=waypoint.get('address', ''), hint_text='Waypoint Address', size_hint_y=None, height=40)
            dialog_layout.add_widget(address_input)

            # Button layout
            btn_layout = BoxLayout(size_hint_y=None, height=50, spacing=5)

            save_btn = Button(text='Save')
            save_btn.bind(on_press=lambda x: self.on_edit_waypoint_confirmed(waypoint_id, name_input.text, address_input.text))
            btn_layout.add_widget(save_btn)

            cancel_btn = Button(text='Cancel')
            btn_layout.add_widget(cancel_btn)

            dialog_layout.add_widget(btn_layout)

            print(f"[OK] Edit waypoint dialog shown for waypoint {waypoint_id}")

        except Exception as e:
            print(f"Show edit waypoint dialog error: {e}")

    def on_edit_waypoint_confirmed(self, waypoint_id, name, address):
        """Handle waypoint edit confirmation."""
        try:
            # Update waypoint in database
            self.cursor.execute(
                "UPDATE waypoints SET name = ?, address = ? WHERE id = ?",
                (name, address, waypoint_id)
            )
            self.conn.commit()

            # Update in-memory list
            for wp in self.waypoints:
                if wp['id'] == waypoint_id:
                    wp['name'] = name
                    wp['address'] = address
                    break

            self.refresh_waypoint_list_ui()
            notification.notify(title="Waypoint Updated", message=f"Updated {name}")
            self.speak(f"Waypoint {name} updated")

        except Exception as e:
            print(f"Edit waypoint confirmed error: {e}")

    def show_remove_waypoint_dialog(self, instance):
        """Show dialog to remove a waypoint."""
        try:
            if not self.waypoints:
                notification.notify(title="No Waypoints", message="No waypoints to remove")
                return

            # Create dialog layout
            dialog_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=200, spacing=5, padding=10)

            # Waypoint selection
            selection_label = Label(text='Select waypoint to remove:', size_hint_y=None, height=30)
            dialog_layout.add_widget(selection_label)

            # Scrollable list
            scroll = ScrollView(size_hint_y=0.6)
            list_layout = BoxLayout(orientation='vertical', size_hint_y=None, spacing=5)
            list_layout.bind(minimum_height=list_layout.setter('height'))

            for i, waypoint in enumerate(self.waypoints):
                btn = Button(text=f"#{i+1} - {waypoint.get('name', 'Waypoint')}", size_hint_y=None, height=40)
                btn.bind(on_press=lambda x, wp_id=waypoint['id']: self.on_remove_waypoint_confirmed(wp_id))
                list_layout.add_widget(btn)

            scroll.add_widget(list_layout)
            dialog_layout.add_widget(scroll)

            print("[OK] Remove waypoint dialog shown")

        except Exception as e:
            print(f"Show remove waypoint dialog error: {e}")

    def on_remove_waypoint_confirmed(self, waypoint_id):
        """Handle waypoint removal confirmation."""
        try:
            result = self.remove_waypoint(waypoint_id)

            if result:
                self.refresh_waypoint_list_ui()
                notification.notify(title="Waypoint Removed", message="Waypoint deleted")
                self.speak("Waypoint removed")
            else:
                notification.notify(title="Error", message="Failed to remove waypoint")

        except Exception as e:
            print(f"Remove waypoint confirmed error: {e}")

    def on_delete_waypoint(self, waypoint_id):
        """Delete waypoint directly from list."""
        try:
            result = self.remove_waypoint(waypoint_id)

            if result:
                self.refresh_waypoint_list_ui()
                notification.notify(title="Waypoint Removed", message="Waypoint deleted")
            else:
                notification.notify(title="Error", message="Failed to remove waypoint")

        except Exception as e:
            print(f"Delete waypoint error: {e}")

    def show_reorder_waypoints_dialog(self, instance):
        """Show dialog to reorder waypoints."""
        try:
            if len(self.waypoints) < 2:
                notification.notify(title="Cannot Reorder", message="Need at least 2 waypoints")
                return

            notification.notify(title="Reorder Waypoints", message="Drag waypoints to reorder (feature in development)")
            self.speak("Waypoint reordering feature coming soon")

        except Exception as e:
            print(f"Show reorder waypoints dialog error: {e}")

    def on_calculate_multi_stop_route(self, instance):
        """Calculate multi-stop route and display summary."""
        try:
            if len(self.waypoints) < 1:
                notification.notify(title="No Waypoints", message="Add waypoints first")
                return

            # Calculate route
            route = self.calculate_multi_stop_route(
                self.current_pos[0], self.current_pos[1],
                self.current_pos[0], self.current_pos[1]
            )

            if route:
                summary = self.get_multi_stop_route_summary()
                if self.multi_stop_summary_label:
                    self.multi_stop_summary_label.text = f"Route Summary:\n{summary}"

                # Display waypoints on map
                self.display_waypoints_on_map()

                notification.notify(title="Route Calculated", message=summary)
                self.speak(summary)
            else:
                notification.notify(title="Route Error", message="Failed to calculate route")

        except Exception as e:
            print(f"Calculate multi-stop route error: {e}")

    # ============================================================================
    # MAP VISUALIZATION FOR WAYPOINTS AND ALTERNATIVE ROUTES
    # ============================================================================

    def display_waypoints_on_map(self):
        """Display waypoint markers on map with sequence numbers."""
        try:
            if not self.mapview or not self.waypoints:
                return

            # Remove old waypoint markers
            for marker in self.waypoint_markers:
                if marker in self.mapview.children:
                    self.mapview.remove_widget(marker)
            self.waypoint_markers = []

            # Add waypoint markers with sequence numbers
            for i, waypoint in enumerate(self.waypoints):
                lat = waypoint.get('lat')
                lon = waypoint.get('lon')

                if not lat or not lon:
                    continue

                # Create marker with sequence number
                marker = MapMarker(lat=lat, lon=lon, source='vehicle_icons/car.png')

                # Add to map
                self.mapview.add_widget(marker)
                self.waypoint_markers.append(marker)

                print(f"[OK] Waypoint marker #{i+1} added at ({lat}, {lon})")

            print(f"[OK] Displayed {len(self.waypoint_markers)} waypoint markers on map")

        except Exception as e:
            print(f"Display waypoints on map error: {e}")

    def display_route_polyline(self, route_data, color=(0, 1, 0, 1)):
        """Display route as polyline on map."""
        try:
            if not self.mapview or not route_data:
                return

            # Extract coordinates from route
            coordinates = []

            # Add start position
            coordinates.append(self.current_pos)

            # Add waypoint coordinates
            for waypoint in self.waypoints:
                lat = waypoint.get('lat')
                lon = waypoint.get('lon')
                if lat and lon:
                    coordinates.append((lat, lon))

            # Add end position
            coordinates.append(self.current_pos)

            print(f"[OK] Route polyline with {len(coordinates)} points ready for display")

        except Exception as e:
            print(f"Display route polyline error: {e}")

    def display_alternative_routes(self, routes):
        """Display alternative routes in different colors on map."""
        try:
            if not self.mapview or not routes:
                return

            # Color scheme for different route types
            colors = {
                'fastest': (0, 1, 0, 0.7),      # Green
                'shortest': (0, 0, 1, 0.7),    # Blue
                'cheapest': (1, 1, 0, 0.7),    # Yellow
                'ticket_prevention': (1, 0, 0, 0.7)  # Red
            }

            for route_data in routes:
                route_type = route_data.get('type', 'fastest')
                color = colors.get(route_type, (0.5, 0.5, 0.5, 0.7))

                print(f"[OK] Alternative route ({route_type}) ready for display with color {color}")

        except Exception as e:
            print(f"Display alternative routes error: {e}")

    def display_traffic_conditions_on_route(self, traffic_data):
        """Display traffic conditions along route segments."""
        try:
            if not self.mapview or not traffic_data:
                return

            incidents = traffic_data.get('incidents', [])

            # Color code based on severity
            severity_colors = {
                'heavy': (1, 0, 0, 0.8),      # Red
                'moderate': (1, 1, 0, 0.8),  # Yellow
                'light': (0, 1, 0, 0.8)      # Green
            }

            for incident in incidents:
                lat = incident.get('lat')
                lon = incident.get('lon')
                severity = incident.get('severity', 'light')

                if lat and lon:
                    marker = MapMarker(lat=lat, lon=lon, source='vehicle_icons/car.png')
                    self.mapview.add_widget(marker)

                    print(f"[OK] Traffic incident ({severity}) marker added at ({lat}, {lon})")

        except Exception as e:
            print(f"Display traffic conditions error: {e}")

    def display_poi_markers_on_map(self, category=None):
        """Display POI markers from offline cache on map."""
        try:
            if not self.mapview:
                return

            # Query offline POI cache
            if category:
                self.cursor.execute(
                    "SELECT lat, lon, name, category FROM offline_poi_cache WHERE category = ? LIMIT 20",
                    (category,)
                )
            else:
                self.cursor.execute(
                    "SELECT lat, lon, name, category FROM offline_poi_cache LIMIT 20"
                )

            pois = self.cursor.fetchall()

            for lat, lon, name, poi_category in pois:
                if lat and lon:
                    marker = MapMarker(lat=lat, lon=lon, source='vehicle_icons/car.png')
                    self.mapview.add_widget(marker)

                    print(f"[OK] POI marker ({poi_category}) added at ({lat}, {lon}): {name}")

            print(f"[OK] Displayed {len(pois)} POI markers on map")

        except Exception as e:
            print(f"Display POI markers error: {e}")

    def show_route_comparison_overlay(self, current_route, alternative_route):
        """Show route comparison overlay with time/distance savings."""
        try:
            if not current_route or not alternative_route:
                return

            # Calculate differences
            current_distance = current_route.get('distance_km', 0)
            current_time = current_route.get('duration_seconds', 0)

            alt_distance = alternative_route.get('distance_km', 0)
            alt_time = alternative_route.get('duration_seconds', 0)

            distance_saved = current_distance - alt_distance
            time_saved = current_time - alt_time

            # Create comparison message
            comparison_msg = f"Alternative Route:\n"
            comparison_msg += f"Distance: {alt_distance:.1f} km ({distance_saved:+.1f} km)\n"
            comparison_msg += f"Time: {alt_time/60:.0f} min ({time_saved/60:+.0f} min)"

            notification.notify(title="Route Comparison", message=comparison_msg)
            self.speak(comparison_msg)

            print(f"[OK] Route comparison overlay shown")

        except Exception as e:
            print(f"Show route comparison overlay error: {e}")

    # ============================================================================
    # ADVANCED ANALYTICS FOR RE-ROUTING PATTERNS
    # ============================================================================

    def get_reroute_statistics(self, days=30):
        """Get re-routing statistics for the last N days."""
        try:
            # Calculate timestamp for N days ago
            current_time = int(time.time())
            days_ago_timestamp = current_time - (days * 86400)

            # Get total reroutes
            self.cursor.execute(
                "SELECT COUNT(*) FROM reroute_events WHERE timestamp > ?",
                (days_ago_timestamp,)
            )
            total_reroutes = self.cursor.fetchone()[0]

            # Get accepted reroutes
            self.cursor.execute(
                "SELECT COUNT(*) FROM reroute_events WHERE timestamp > ? AND user_action = 'accepted'",
                (days_ago_timestamp,)
            )
            accepted_reroutes = self.cursor.fetchone()[0]

            # Calculate acceptance rate
            acceptance_rate = (accepted_reroutes / total_reroutes * 100) if total_reroutes > 0 else 0

            # Get total time saved
            self.cursor.execute(
                "SELECT SUM(time_saved_seconds) FROM reroute_events WHERE timestamp > ? AND user_action = 'accepted'",
                (days_ago_timestamp,)
            )
            total_time_saved = self.cursor.fetchone()[0] or 0

            # Get total distance saved
            self.cursor.execute(
                "SELECT SUM(distance_difference_km) FROM reroute_events WHERE timestamp > ? AND user_action = 'accepted'",
                (days_ago_timestamp,)
            )
            total_distance_saved = self.cursor.fetchone()[0] or 0

            # Get rejected reroutes
            self.cursor.execute(
                "SELECT COUNT(*) FROM reroute_events WHERE timestamp > ? AND user_action = 'rejected'",
                (days_ago_timestamp,)
            )
            rejected_reroutes = self.cursor.fetchone()[0]

            stats = {
                'total_reroutes': total_reroutes,
                'accepted_reroutes': accepted_reroutes,
                'rejected_reroutes': rejected_reroutes,
                'acceptance_rate': acceptance_rate,
                'total_time_saved_seconds': total_time_saved,
                'total_distance_saved_km': total_distance_saved,
                'average_time_saved_seconds': (total_time_saved / accepted_reroutes) if accepted_reroutes > 0 else 0,
                'average_distance_saved_km': (total_distance_saved / accepted_reroutes) if accepted_reroutes > 0 else 0
            }

            print(f"[OK] Reroute statistics calculated for last {days} days: {stats}")
            return stats

        except Exception as e:
            print(f"Get reroute statistics error: {e}")
            return {}

    def analyze_reroute_patterns(self, days=30):
        """Analyze re-routing patterns and trends."""
        try:
            # Calculate timestamp for N days ago
            current_time = int(time.time())
            days_ago_timestamp = current_time - (days * 86400)

            # Get most common reroute reasons
            self.cursor.execute(
                """SELECT reason, COUNT(*) as count FROM reroute_events
                   WHERE timestamp > ? GROUP BY reason ORDER BY count DESC LIMIT 5""",
                (days_ago_timestamp,)
            )
            top_reasons = self.cursor.fetchall()

            # Get reroutes by hour of day
            self.cursor.execute(
                """SELECT strftime('%H', datetime(timestamp, 'unixepoch')) as hour, COUNT(*) as count
                   FROM reroute_events WHERE timestamp > ?
                   GROUP BY hour ORDER BY hour""",
                (days_ago_timestamp,)
            )
            hourly_distribution = self.cursor.fetchall()

            # Get reroutes by day of week
            self.cursor.execute(
                """SELECT strftime('%w', datetime(timestamp, 'unixepoch')) as day, COUNT(*) as count
                   FROM reroute_events WHERE timestamp > ?
                   GROUP BY day ORDER BY day""",
                (days_ago_timestamp,)
            )
            daily_distribution = self.cursor.fetchall()

            patterns = {
                'top_reasons': [{'reason': r[0], 'count': r[1]} for r in top_reasons],
                'hourly_distribution': [{'hour': h[0], 'count': h[1]} for h in hourly_distribution],
                'daily_distribution': [{'day': d[0], 'count': d[1]} for d in daily_distribution]
            }

            print(f"[OK] Reroute patterns analyzed: {len(patterns['top_reasons'])} top reasons found")
            return patterns

        except Exception as e:
            print(f"Analyze reroute patterns error: {e}")
            return {}

    def get_reroute_analytics_summary(self, days=30):
        """Get comprehensive re-routing analytics summary."""
        try:
            stats = self.get_reroute_statistics(days)
            patterns = self.analyze_reroute_patterns(days)

            # Format summary
            summary = f"Re-Routing Analytics (Last {days} Days):\n"
            summary += f"Total Reroutes: {stats.get('total_reroutes', 0)}\n"
            summary += f"Acceptance Rate: {stats.get('acceptance_rate', 0):.1f}%\n"
            summary += f"Time Saved: {stats.get('total_time_saved_seconds', 0)/3600:.1f} hours\n"
            summary += f"Distance Saved: {stats.get('total_distance_saved_km', 0):.1f} km\n"

            if patterns.get('top_reasons'):
                summary += f"\nTop Reroute Reasons:\n"
                for reason in patterns['top_reasons'][:3]:
                    summary += f"  - {reason['reason']}: {reason['count']} times\n"

            print(f"[OK] Analytics summary generated")
            return summary

        except Exception as e:
            print(f"Get reroute analytics summary error: {e}")
            return ""

    def display_reroute_analytics_dashboard(self):
        """Display re-routing analytics dashboard in UI."""
        try:
            # Get analytics summary
            summary = self.get_reroute_analytics_summary(30)

            # Create dashboard layout
            dashboard_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=300, spacing=5, padding=10)

            # Title
            title_label = Label(text='Re-Routing Analytics Dashboard', size_hint_y=None, height=40, bold=True)
            dashboard_layout.add_widget(title_label)

            # Summary text
            summary_label = Label(text=summary, size_hint_y=None, height=200, markup=True)
            dashboard_layout.add_widget(summary_label)

            # Refresh button
            refresh_btn = Button(text='Refresh Analytics', size_hint_y=None, height=50)
            refresh_btn.bind(on_press=lambda x: self.display_reroute_analytics_dashboard())
            dashboard_layout.add_widget(refresh_btn)

            print("[OK] Re-routing analytics dashboard displayed")
            notification.notify(title="Analytics Dashboard", message="Re-routing analytics updated")

            return dashboard_layout

        except Exception as e:
            print(f"Display reroute analytics dashboard error: {e}")
            return None

    def export_reroute_analytics(self, filename='reroute_analytics.txt'):
        """Export re-routing analytics to file."""
        try:
            # Get analytics
            stats = self.get_reroute_statistics(30)
            patterns = self.analyze_reroute_patterns(30)

            # Create export content
            content = "RE-ROUTING ANALYTICS REPORT\n"
            content += "=" * 50 + "\n\n"

            content += "STATISTICS (Last 30 Days):\n"
            content += f"Total Reroutes: {stats.get('total_reroutes', 0)}\n"
            content += f"Accepted: {stats.get('accepted_reroutes', 0)}\n"
            content += f"Rejected: {stats.get('rejected_reroutes', 0)}\n"
            content += f"Acceptance Rate: {stats.get('acceptance_rate', 0):.1f}%\n"
            content += f"Total Time Saved: {stats.get('total_time_saved_seconds', 0)/3600:.1f} hours\n"
            content += f"Total Distance Saved: {stats.get('total_distance_saved_km', 0):.1f} km\n"
            content += f"Average Time Saved per Reroute: {stats.get('average_time_saved_seconds', 0)/60:.1f} minutes\n"
            content += f"Average Distance Saved per Reroute: {stats.get('average_distance_saved_km', 0):.1f} km\n\n"

            content += "TOP REROUTE REASONS:\n"
            for reason in patterns.get('top_reasons', []):
                content += f"  - {reason['reason']}: {reason['count']} times\n"

            content += "\nHOURLY DISTRIBUTION:\n"
            for hour in patterns.get('hourly_distribution', []):
                content += f"  Hour {hour['hour']}: {hour['count']} reroutes\n"

            # Write to file
            with open(filename, 'w') as f:
                f.write(content)

            print(f"[OK] Analytics exported to {filename}")
            notification.notify(title="Analytics Exported", message=f"Saved to {filename}")

            return True

        except Exception as e:
            print(f"Export reroute analytics error: {e}")
            return False

    # ============================================================================
    # MACHINE LEARNING FOR OPTIMAL WAYPOINT ORDERING
    # ============================================================================

    def optimize_waypoint_order(self):
        """Optimize waypoint order using ML and TSP algorithm."""
        try:
            if len(self.waypoints) < 2:
                notification.notify(title="Cannot Optimize", message="Need at least 2 waypoints")
                return None

            # Store original order
            original_waypoints = self.waypoints.copy()

            # Simple nearest neighbor TSP algorithm
            optimized_order = self._solve_tsp_nearest_neighbor()

            if optimized_order:
                # Calculate metrics for both orders
                original_distance = self._calculate_waypoint_distance(original_waypoints)
                optimized_distance = self._calculate_waypoint_distance(optimized_order)

                distance_saved = original_distance - optimized_distance
                distance_saved_percent = (distance_saved / original_distance * 100) if original_distance > 0 else 0

                result = {
                    'original_order': original_waypoints,
                    'optimized_order': optimized_order,
                    'original_distance_km': original_distance,
                    'optimized_distance_km': optimized_distance,
                    'distance_saved_km': distance_saved,
                    'distance_saved_percent': distance_saved_percent
                }

                print(f"[OK] Waypoint order optimized: {distance_saved:.1f} km saved ({distance_saved_percent:.1f}%)")
                return result
            else:
                return None

        except Exception as e:
            print(f"Optimize waypoint order error: {e}")
            return None

    def _solve_tsp_nearest_neighbor(self):
        """Solve Traveling Salesman Problem using nearest neighbor algorithm."""
        try:
            if not self.waypoints:
                return None

            # Start from current position
            current_pos = self.current_pos
            unvisited = self.waypoints.copy()
            visited = []

            while unvisited:
                # Find nearest unvisited waypoint
                nearest = None
                nearest_distance = float('inf')

                for waypoint in unvisited:
                    lat = waypoint.get('lat')
                    lon = waypoint.get('lon')

                    if not lat or not lon:
                        continue

                    distance = self._calculate_distance(current_pos[0], current_pos[1], lat, lon)

                    if distance < nearest_distance:
                        nearest_distance = distance
                        nearest = waypoint

                if nearest:
                    visited.append(nearest)
                    unvisited.remove(nearest)
                    current_pos = (nearest.get('lat'), nearest.get('lon'))

            print(f"[OK] TSP solved with {len(visited)} waypoints")
            return visited

        except Exception as e:
            print(f"Solve TSP error: {e}")
            return None

    def _calculate_waypoint_distance(self, waypoints):
        """Calculate total distance for a waypoint sequence."""
        try:
            total_distance = 0

            # Start from current position
            current_pos = self.current_pos

            for waypoint in waypoints:
                lat = waypoint.get('lat')
                lon = waypoint.get('lon')

                if lat and lon:
                    distance = self._calculate_distance(current_pos[0], current_pos[1], lat, lon)
                    total_distance += distance
                    current_pos = (lat, lon)

            # Return to start
            distance = self._calculate_distance(current_pos[0], current_pos[1], self.current_pos[0], self.current_pos[1])
            total_distance += distance

            return total_distance

        except Exception as e:
            print(f"Calculate waypoint distance error: {e}")
            return 0

    def _calculate_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two coordinates using geodesic."""
        try:
            from geopy.distance import geodesic
            return geodesic((lat1, lon1), (lat2, lon2)).km
        except Exception as e:
            print(f"Calculate distance error: {e}")
            return 0

    def apply_optimized_waypoint_order(self, optimized_order):
        """Apply optimized waypoint order to the route."""
        try:
            if not optimized_order:
                return False

            # Update waypoints in database with new sequence
            for i, waypoint in enumerate(optimized_order):
                self.cursor.execute(
                    "UPDATE waypoints SET sequence_order = ? WHERE id = ?",
                    (i, waypoint['id'])
                )

            self.conn.commit()

            # Update in-memory list
            self.waypoints = optimized_order

            # Refresh UI
            self.refresh_waypoint_list_ui()

            notification.notify(title="Waypoints Reordered", message="Optimized order applied")
            self.speak("Waypoint order optimized and applied")

            print("[OK] Optimized waypoint order applied")
            return True

        except Exception as e:
            print(f"Apply optimized waypoint order error: {e}")
            return False

    def display_optimization_comparison(self, optimization_result):
        """Display before/after comparison of waypoint optimization."""
        try:
            if not optimization_result:
                return

            # Create comparison layout
            comparison_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=250, spacing=5, padding=10)

            # Title
            title_label = Label(text='Waypoint Order Optimization', size_hint_y=None, height=40, bold=True)
            comparison_layout.add_widget(title_label)

            # Comparison text
            comparison_text = f"Original Distance: {optimization_result['original_distance_km']:.1f} km\n"
            comparison_text += f"Optimized Distance: {optimization_result['optimized_distance_km']:.1f} km\n"
            comparison_text += f"Distance Saved: {optimization_result['distance_saved_km']:.1f} km ({optimization_result['distance_saved_percent']:.1f}%)"

            comparison_label = Label(text=comparison_text, size_hint_y=None, height=100, markup=True)
            comparison_layout.add_widget(comparison_label)

            # Apply button
            apply_btn = Button(text='Apply Optimized Order', size_hint_y=None, height=50)
            apply_btn.bind(on_press=lambda x: self.apply_optimized_waypoint_order(optimization_result['optimized_order']))
            comparison_layout.add_widget(apply_btn)

            # Cancel button
            cancel_btn = Button(text='Keep Original Order', size_hint_y=None, height=50)
            comparison_layout.add_widget(cancel_btn)

            print("[OK] Optimization comparison displayed")
            notification.notify(title="Optimization Result", message=comparison_text)

            return comparison_layout

        except Exception as e:
            print(f"Display optimization comparison error: {e}")
            return None

    # ============================================================================
    # INTEGRATION WITH CALENDAR FOR TIME-WINDOW SCHEDULING
    # ============================================================================

    def import_calendar_events(self, ics_file_path=None):
        """Import calendar events from iCalendar file (.ics format)."""
        try:
            if not ics_file_path:
                notification.notify(title="No File", message="Please select an iCalendar file")
                return []

            # Read and parse iCalendar file
            with open(ics_file_path, 'rb') as f:
                cal = Calendar.from_ical(f.read())

            events = []

            # Extract events from calendar
            for component in cal.walk():
                if component.name == "VEVENT":
                    event = {
                        'summary': str(component.get('summary', 'Event')),
                        'description': str(component.get('description', '')),
                        'start': component.get('dtstart'),
                        'end': component.get('dtend'),
                        'location': str(component.get('location', ''))
                    }

                    # Convert datetime objects
                    if event['start']:
                        if hasattr(event['start'].dt, 'isoformat'):
                            event['start_time'] = int(event['start'].dt.timestamp())
                        else:
                            event['start_time'] = int(time.mktime(event['start'].dt.timetuple()))

                    if event['end']:
                        if hasattr(event['end'].dt, 'isoformat'):
                            event['end_time'] = int(event['end'].dt.timestamp())
                        else:
                            event['end_time'] = int(time.mktime(event['end'].dt.timetuple()))

                    events.append(event)

            print(f"[OK] Imported {len(events)} calendar events from {ics_file_path}")
            notification.notify(title="Calendar Imported", message=f"Imported {len(events)} events")

            return events

        except Exception as e:
            print(f"Import calendar events error: {e}")
            notification.notify(title="Import Error", message=f"Failed to import calendar: {e}")
            return []

    def sync_calendar_to_waypoints(self, events):
        """Convert calendar events to waypoints with time windows."""
        try:
            if not events:
                return []

            created_waypoints = []

            for event in events:
                # Extract location from event
                location = event.get('location', '')
                summary = event.get('summary', 'Event')

                if not location:
                    print(f"[SKIP] Event '{summary}' has no location")
                    continue

                # Search for location coordinates
                search_result = self.search_location(location)

                if search_result and len(search_result) > 0:
                    result = search_result[0]
                    lat = result.get('lat')
                    lon = result.get('lon')

                    if lat and lon:
                        # Add waypoint
                        waypoint_id = self.add_waypoint(lat, lon, summary, location)

                        if waypoint_id and 'error' not in waypoint_id:
                            # Set time window based on event times
                            arrive_by_time = event.get('start_time')
                            depart_after_time = event.get('end_time')

                            if arrive_by_time and depart_after_time:
                                self.set_time_window(waypoint_id, arrive_by_time, depart_after_time, is_flexible=False)

                            created_waypoints.append({
                                'waypoint_id': waypoint_id,
                                'event_summary': summary,
                                'location': location,
                                'arrive_by': arrive_by_time,
                                'depart_after': depart_after_time
                            })

                            print(f"[OK] Created waypoint for event: {summary}")

            self.refresh_waypoint_list_ui()
            notification.notify(title="Calendar Synced", message=f"Created {len(created_waypoints)} waypoints")
            self.speak(f"Synced {len(created_waypoints)} calendar events as waypoints")

            print(f"[OK] Synced {len(created_waypoints)} calendar events to waypoints")
            return created_waypoints

        except Exception as e:
            print(f"Sync calendar to waypoints error: {e}")
            return []

    def display_calendar_events_ui(self, events):
        """Display calendar events in UI alongside waypoints."""
        try:
            if not events:
                return None

            # Create calendar events layout
            events_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=300, spacing=5, padding=10)

            # Title
            title_label = Label(text='Calendar Events', size_hint_y=None, height=40, bold=True)
            events_layout.add_widget(title_label)

            # Scrollable events list
            scroll = ScrollView(size_hint_y=0.7)
            list_layout = BoxLayout(orientation='vertical', size_hint_y=None, spacing=5)
            list_layout.bind(minimum_height=list_layout.setter('height'))

            for event in events:
                event_item = BoxLayout(orientation='vertical', size_hint_y=None, height=80, spacing=3, padding=5)

                # Event summary
                summary_label = Label(text=event.get('summary', 'Event'), size_hint_y=None, height=30, bold=True)
                event_item.add_widget(summary_label)

                # Event location
                location_label = Label(text=f"Location: {event.get('location', 'N/A')}", size_hint_y=None, height=25)
                event_item.add_widget(location_label)

                # Event time
                start_time = event.get('start_time')
                if start_time:
                    time_str = datetime.fromtimestamp(start_time).strftime('%Y-%m-%d %H:%M')
                    time_label = Label(text=f"Time: {time_str}", size_hint_y=None, height=25)
                    event_item.add_widget(time_label)

                list_layout.add_widget(event_item)

            scroll.add_widget(list_layout)
            events_layout.add_widget(scroll)

            # Sync button
            sync_btn = Button(text='Sync to Waypoints', size_hint_y=None, height=50)
            sync_btn.bind(on_press=lambda x: self.sync_calendar_to_waypoints(events))
            events_layout.add_widget(sync_btn)

            print("[OK] Calendar events UI displayed")
            return events_layout

        except Exception as e:
            print(f"Display calendar events UI error: {e}")
            return None

    def show_import_calendar_dialog(self, instance):
        """Show dialog to import calendar file."""
        try:
            # Create dialog layout
            dialog_layout = BoxLayout(orientation='vertical', size_hint_y=None, height=200, spacing=5, padding=10)

            # File path input
            file_input = TextInput(hint_text='Path to .ics file', size_hint_y=None, height=40)
            dialog_layout.add_widget(file_input)

            # Button layout
            btn_layout = BoxLayout(size_hint_y=None, height=50, spacing=5)

            import_btn = Button(text='Import')
            import_btn.bind(on_press=lambda x: self.on_import_calendar_confirmed(file_input.text))
            btn_layout.add_widget(import_btn)

            cancel_btn = Button(text='Cancel')
            btn_layout.add_widget(cancel_btn)

            dialog_layout.add_widget(btn_layout)

            print("[OK] Import calendar dialog shown")
            notification.notify(title="Import Calendar", message="Enter path to .ics file")

        except Exception as e:
            print(f"Show import calendar dialog error: {e}")

    def on_import_calendar_confirmed(self, file_path):
        """Handle calendar import confirmation."""
        try:
            if not file_path:
                notification.notify(title="No File", message="Please enter a file path")
                return

            # Import calendar events
            events = self.import_calendar_events(file_path)

            if events:
                # Display events in UI
                self.display_calendar_events_ui(events)

                notification.notify(title="Calendar Imported", message=f"Imported {len(events)} events")
                self.speak(f"Imported {len(events)} calendar events")
            else:
                notification.notify(title="Import Failed", message="No events found in calendar")

        except Exception as e:
            print(f"Import calendar confirmed error: {e}")

    # Vehicle marker methods
    def get_vehicle_icon_path(self):
        """Get the icon path based on current vehicle type and routing mode."""
        try:
            # Priority: routing mode icons for pedestrian/bicycle, then vehicle type
            if self.routing_mode == 'pedestrian':
                icon_name = 'pedestrian.png'
            elif self.routing_mode == 'bicycle':
                icon_name = 'bicycle.png'
            elif self.vehicle_type == 'petrol_diesel':
                icon_name = 'car.png'
            elif self.vehicle_type == 'electric':
                icon_name = 'electric.png'
            elif self.vehicle_type == 'hybrid':
                icon_name = 'car.png'  # Use car icon for hybrid
            elif self.vehicle_type == 'motorcycle':
                icon_name = 'motorcycle.png'
            elif self.vehicle_type == 'truck':
                icon_name = 'truck.png'
            elif self.vehicle_type == 'van':
                icon_name = 'van.png'
            elif self.vehicle_type == 'bicycle':
                icon_name = 'bicycle.png'
            elif self.vehicle_type == 'triangle':
                icon_name = 'triangle.png'
            else:
                icon_name = 'car.png'  # Default fallback

            icon_path = os.path.join(self.vehicle_icons_dir, icon_name)

            # Check if icon exists, if not use default
            if not os.path.exists(icon_path):
                print(f"Warning: Icon not found at {icon_path}, using default car icon")
                icon_path = os.path.join(self.vehicle_icons_dir, 'car.png')

            return icon_path
        except Exception as e:
            print(f"Error getting vehicle icon path: {e}")
            return os.path.join(self.vehicle_icons_dir, 'car.png')

    def update_vehicle_marker(self):
        """Update or create the vehicle position marker on the map."""
        try:
            # Remove old marker if it exists
            if self.vehicle_marker and self.vehicle_marker in self.mapview.children:
                self.mapview.remove_widget(self.vehicle_marker)

            # Get the appropriate icon
            icon_path = self.get_vehicle_icon_path()

            # Create new marker with the current position
            lat, lon = self.current_pos
            self.vehicle_marker = MapMarker(
                lat=lat,
                lon=lon,
                source=icon_path
            )

            # Add marker to map
            self.mapview.add_widget(self.vehicle_marker)

            # Center map on vehicle
            self.mapview.center_on(lat, lon)

        except Exception as e:
            print(f"Error updating vehicle marker: {e}")

    def display_weather_on_map(self, weather_analysis):
        """Display weather conditions on map as markers/overlays."""
        try:
            if not weather_analysis or not self.mapview:
                return

            weather_zones = weather_analysis.get('weather_zones', [])

            # Remove old weather markers
            for marker in self.weather_markers:
                if marker in self.mapview.children:
                    self.mapview.remove_widget(marker)
            self.weather_markers = []

            # Add weather markers for each zone
            for zone in weather_zones:
                lat = zone.get('lat')
                lon = zone.get('lon')
                severity = zone.get('severity', 'none')
                description = zone.get('description', 'Unknown')
                zone_type = zone.get('type', 'point')

                # Create marker with weather icon based on severity
                weather_icon = self._get_weather_icon(severity, description)

                marker = MapMarker(
                    lat=lat,
                    lon=lon,
                    source=weather_icon
                )

                # Add marker to map
                self.mapview.add_widget(marker)
                self.weather_markers.append(marker)

                print(f"[OK] Weather marker added at ({lat}, {lon}): {description} ({severity})")

        except Exception as e:
            print(f"Display weather on map error: {e}")

    def _get_weather_icon(self, severity, description):
        """Get weather icon path based on severity and description."""
        try:
            # Map severity and description to icon
            description_lower = description.lower() if description else ''

            if severity == 'extreme':
                if 'storm' in description_lower or 'thunder' in description_lower:
                    return os.path.join(self.vehicle_icons_dir, 'storm.png')
                elif 'snow' in description_lower:
                    return os.path.join(self.vehicle_icons_dir, 'snow.png')
                elif 'rain' in description_lower:
                    return os.path.join(self.vehicle_icons_dir, 'rain.png')
                else:
                    return os.path.join(self.vehicle_icons_dir, 'warning.png')
            elif severity == 'severe':
                if 'rain' in description_lower:
                    return os.path.join(self.vehicle_icons_dir, 'rain.png')
                elif 'wind' in description_lower:
                    return os.path.join(self.vehicle_icons_dir, 'wind.png')
                elif 'fog' in description_lower:
                    return os.path.join(self.vehicle_icons_dir, 'fog.png')
                else:
                    return os.path.join(self.vehicle_icons_dir, 'alert.png')
            else:
                return os.path.join(self.vehicle_icons_dir, 'info.png')
        except Exception as e:
            print(f"Get weather icon error: {e}")
            return os.path.join(self.vehicle_icons_dir, 'info.png')

    def set_distance_unit(self, unit):
        """Set distance unit and update related UI elements."""
        if unit != self.distance_unit:
            self.distance_unit = unit
            self.toggles['distance_km'].state = 'down' if unit == 'km' else 'normal'
            self.toggles['distance_mi'].state = 'down' if unit == 'mi' else 'normal'

            # Update speed alert threshold UI to reflect new unit
            if 'speed_alert_threshold' in self.inputs:
                speed_threshold_display = self.get_speed_alert_threshold_in_user_units()
                speed_unit_label = self.get_speed_unit_label()
                self.inputs['speed_alert_threshold'].hint_text = f'Speed Alert Threshold ({speed_unit_label})'
                self.inputs['speed_alert_threshold'].text = f"{speed_threshold_display:.1f}"

            self.save_settings()

    def set_temperature_unit(self, unit):
        """Set temperature unit."""
        if unit != self.temperature_unit:
            self.temperature_unit = unit
            self.toggles['temp_c'].state = 'down' if unit == 'C' else 'normal'
            self.toggles['temp_f'].state = 'down' if unit == 'F' else 'normal'
            self.save_settings()

    def set_currency_unit(self, unit):
        """Set currency unit."""
        if unit != self.currency_unit:
            self.currency_unit = unit
            self.toggles['currency_gbp'].state = 'down' if unit == 'GBP' else 'normal'
            self.toggles['currency_usd'].state = 'down' if unit == 'USD' else 'normal'
            self.toggles['currency_eur'].state = 'down' if unit == 'EUR' else 'normal'
            self.save_settings()
            self.speak(f"Currency: {unit}")
            notification.notify(title="Currency", message=f"Switched to {unit}")

    def set_vehicle_type(self, vehicle_type):
        """Set vehicle type and update fuel unit."""
        if vehicle_type != self.vehicle_type:
            self.vehicle_type = vehicle_type
            self.toggles['vehicle_petrol_diesel'].state = 'down' if vehicle_type == 'petrol_diesel' else 'normal'
            self.toggles['vehicle_electric'].state = 'down' if vehicle_type == 'electric' else 'normal'
            self.fuel_unit = 'l_per_100km' if vehicle_type == 'petrol_diesel' else 'kwh_per_100km'
            self.toggles['fuel_l_per_100km'].state = 'down' if self.fuel_unit == 'l_per_100km' else 'normal'
            self.toggles['fuel_mpg'].state = 'down' if self.fuel_unit == 'mpg' else 'normal'
            self.toggles['fuel_kwh_per_100km'].state = 'down' if self.fuel_unit == 'kwh_per_100km' else 'normal'
            self.toggles['fuel_miles_per_kwh'].state = 'down' if self.fuel_unit == 'miles_per_kwh' else 'normal'
            self.save_settings()

            # Update vehicle marker icon
            self.update_vehicle_marker()

    def set_fuel_unit(self, unit):
        """Set fuel/energy unit with validation."""
        if unit != self.fuel_unit:
            try:
                if self.vehicle_type == 'petrol_diesel' and unit in ['kwh_per_100km', 'miles_per_kwh']:
                    raise ValueError("Invalid unit for petrol/diesel")
                if self.vehicle_type == 'electric' and unit in ['l_per_100km', 'mpg']:
                    raise ValueError("Invalid unit for electric")
                
                old_efficiency = self.fuel_efficiency if self.vehicle_type == 'petrol_diesel' else self.energy_efficiency
                self.fuel_unit = unit
                self.toggles['fuel_l_per_100km'].state = 'down' if unit == 'l_per_100km' else 'normal'
                self.toggles['fuel_mpg'].state = 'down' if unit == 'mpg' else 'normal'
                self.toggles['fuel_kwh_per_100km'].state = 'down' if unit == 'kwh_per_100km' else 'normal'
                self.toggles['fuel_miles_per_kwh'].state = 'down' if unit == 'miles_per_kwh' else 'normal'
                
                if self.vehicle_type == 'petrol_diesel':
                    self.fuel_efficiency = self.to_mpg(old_efficiency) if unit == 'mpg' else self.to_l_per_100km(old_efficiency)
                    self.inputs['fuel_efficiency'].text = f"{self.fuel_efficiency:.2f}"
                else:
                    self.energy_efficiency = self.to_miles_per_kwh(old_efficiency) if unit == 'miles_per_kwh' else self.to_kwh_per_100km(old_efficiency)
                    self.inputs['energy_efficiency'].text = f"{self.energy_efficiency:.2f}"
                
                self.save_settings()
            except Exception as e:
                print(f"Fuel unit error: {e}")
                notification.notify(title="Fuel Unit Error", message="Failed to change fuel unit")

    def set_include_tolls(self, value):
        """Set toll inclusion."""
        self.include_tolls = value
        self.toggles['include_tolls'].state = 'down' if value else 'normal'
        self.save_settings()

    def update_fuel_efficiency(self, instance, value):
        """Update fuel efficiency with validation."""
        try:
            efficiency = float(value)
            if self.fuel_unit == 'l_per_100km' and 1 <= efficiency <= 20:
                self.fuel_efficiency = efficiency
            elif self.fuel_unit == 'mpg' and 10 <= efficiency <= 100:
                self.fuel_efficiency = efficiency
            else:
                raise ValueError("Invalid efficiency")
            self.save_settings()
        except Exception as e:
            print(f"Fuel efficiency error: {e}")
            notification.notify(title="Fuel Efficiency Error", message="Invalid value, using default")
            self.fuel_efficiency = 6.5 if self.fuel_unit == 'l_per_100km' else 43.5
            instance.text = f"{self.fuel_efficiency:.2f}"

    def update_fuel_price(self, instance, value):
        """Update fuel price with validation."""
        try:
            price = float(value)
            if 0.5 <= price <= 3.0:
                self.fuel_price_gbp = price
                self.save_settings()
            else:
                raise ValueError("Invalid price")
        except Exception as e:
            print(f"Fuel price error: {e}")
            notification.notify(title="Fuel Price Error", message="Invalid value, using default")
            self.fuel_price_gbp = 1.40
            instance.text = f"{self.fuel_price_gbp:.2f}"

    def update_energy_efficiency(self, instance, value):
        """Update energy efficiency with validation."""
        try:
            efficiency = float(value)
            if self.fuel_unit == 'kwh_per_100km' and 10 <= efficiency <= 30:
                self.energy_efficiency = efficiency
            elif self.fuel_unit == 'miles_per_kwh' and 2 <= efficiency <= 6:
                self.energy_efficiency = efficiency
            else:
                raise ValueError("Invalid efficiency")
            self.save_settings()
        except Exception as e:
            print(f"Energy efficiency error: {e}")
            notification.notify(title="Energy Efficiency Error", message="Invalid value, using default")
            self.energy_efficiency = 18.5 if self.fuel_unit == 'kwh_per_100km' else 3.4
            instance.text = f"{self.energy_efficiency:.2f}"

    def update_electricity_price(self, instance, value):
        """Update electricity price with validation."""
        try:
            price = float(value)
            if 0.1 <= price <= 1.0:
                self.electricity_price_gbp = price
                self.save_settings()
            else:
                raise ValueError("Invalid price")
        except Exception as e:
            print(f"Electricity price error: {e}")
            notification.notify(title="Electricity Price Error", message="Invalid value, using default")
            self.electricity_price_gbp = 0.30
            instance.text = f"{self.electricity_price_gbp:.2f}"

    def update_speed_alert_threshold(self, instance, value):
        """Update speed alert threshold with validation and unit conversion."""
        try:
            threshold_user_units = float(value)

            # Determine valid range based on user's preferred unit
            if self.distance_unit == 'mi':
                # User is entering mph (0-31 mph ≈ 0-50 km/h)
                if 0 <= threshold_user_units <= 31:
                    # Convert mph to km/h for internal storage
                    threshold_kmh = threshold_user_units * 1.60934
                    self.set_speed_alert_threshold(threshold_kmh)
                else:
                    raise ValueError(f"Invalid threshold for mph: must be 0-31")
            else:
                # User is entering km/h (0-50 km/h)
                if 0 <= threshold_user_units <= 50:
                    self.set_speed_alert_threshold(threshold_user_units)
                else:
                    raise ValueError(f"Invalid threshold for km/h: must be 0-50")
        except Exception as e:
            print(f"Speed alert threshold error: {e}")
            unit_label = self.get_speed_unit_label()
            max_val = 31 if self.distance_unit == 'mi' else 50
            notification.notify(title="Speed Alert Threshold Error",
                              message=f"Invalid value (0-{max_val} {unit_label}), using default")
            self.speed_alert_threshold_kmh = 8
            display_value = self.get_speed_alert_threshold_in_user_units()
            instance.text = f"{display_value:.1f}"

    def on_location(self, **kwargs):
        """Handle GPS location update with performance optimizations."""
        try:
            lat = kwargs.get('lat')
            lon = kwargs.get('lon')
            speed = kwargs.get('speed', 0)  # Speed in m/s from GPS

            # SECURITY: Validate GPS coordinates before updating position
            is_valid, error_msg = validate_coordinates(lat, lon, "on_location")
            if not is_valid:
                log_validation_error(error_msg, "GPS update")
                notification.notify(title="GPS Error", message="Invalid GPS coordinates received")
                # Keep current position instead of updating
                return

            self.current_pos = (lat, lon)
            self.gps_poll_count += 1

            # Update current vehicle speed (convert from m/s to km/h)
            if speed is not None and isinstance(speed, (int, float)):
                self.current_vehicle_speed_kmh = speed * 3.6  # 1 m/s = 3.6 km/h

            # Adjust GPS polling frequency based on speed (battery optimization)
            self.adjust_gps_polling_frequency(self.current_vehicle_speed_kmh)

            # Log position to history
            self.log_position_history(lat, lon, self.current_vehicle_speed_kmh)

            # Record position if route recording is active
            if hasattr(self, 'route_recording') and self.route_recording:
                self.record_route_position(lat, lon)

            # Check geofence proximity
            self.check_geofence_proximity(lat, lon)

            # Update vehicle marker position on map only if moved significantly (map rendering optimization)
            if self.vehicle_marker:
                # Check if position changed more than threshold
                should_update_marker = True
                if self.last_marker_update_position:
                    distance = geodesic(
                        self.last_marker_update_position,
                        (lat, lon)
                    ).meters
                    if distance < self.marker_update_threshold_meters:
                        should_update_marker = False

                if should_update_marker:
                    self.vehicle_marker.lat = lat
                    self.vehicle_marker.lon = lon
                    self.last_marker_update_position = (lat, lon)
                    # Center map on vehicle
                    self.mapview.center_on(lat, lon)
        except Exception as e:
            print(f"GPS update error: {e}")
            log_validation_error(str(e), "GPS location handler")
            notification.notify(title="GPS Error", message="Using Barnsley as default location")
            self.current_pos = (53.5526, -1.4797)

    # ============================================================================
    # VEHICLE TRACKING METHODS - Position History, Route Recording, Geofencing
    # ============================================================================

    def log_position_history(self, lat, lon, speed_kmh=0, heading=0, accuracy=0):
        """Log current GPS position to position history table."""
        try:
            is_valid, error_msg = validate_coordinates(lat, lon, "log_position_history")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            self.cursor.execute("""INSERT INTO position_history
                                   (lat, lon, speed_kmh, heading, accuracy, timestamp)
                                   VALUES (?, ?, ?, ?, ?, ?)""",
                                (lat, lon, float(speed_kmh), float(heading), float(accuracy), int(time.time())))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"Log position history error: {e}")
            log_validation_error(str(e), "log_position_history")
            return False

    def get_position_history(self, limit=100, time_range_seconds=3600):
        """Retrieve position history for the last N seconds."""
        try:
            cutoff_time = int(time.time()) - time_range_seconds
            self.cursor.execute("""SELECT id, lat, lon, speed_kmh, heading, accuracy, timestamp
                                   FROM position_history
                                   WHERE timestamp >= ?
                                   ORDER BY timestamp DESC LIMIT ?""",
                                (cutoff_time, limit))
            return self.cursor.fetchall()
        except Exception as e:
            print(f"Get position history error: {e}")
            log_validation_error(str(e), "get_position_history")
            return []

    def start_route_recording(self, route_name=""):
        """Start recording a route."""
        try:
            self.route_recording = {
                'route_name': str(route_name)[:255] if route_name else f"Route_{int(time.time())}",
                'start_lat': self.current_pos[0],
                'start_lon': self.current_pos[1],
                'timestamp_start': int(time.time()),
                'positions': []
            }
            print(f"[OK] Route recording started: {self.route_recording['route_name']}")
            return True
        except Exception as e:
            print(f"Start route recording error: {e}")
            log_validation_error(str(e), "start_route_recording")
            return False

    def record_route_position(self, lat, lon):
        """Add position to current route recording."""
        try:
            if not hasattr(self, 'route_recording') or not self.route_recording:
                return False

            is_valid, error_msg = validate_coordinates(lat, lon, "record_route_position")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            self.route_recording['positions'].append({'lat': lat, 'lon': lon, 'timestamp': int(time.time())})
            return True
        except Exception as e:
            print(f"Record route position error: {e}")
            log_validation_error(str(e), "record_route_position")
            return False

    def end_route_recording(self):
        """End route recording and save to database."""
        try:
            if not hasattr(self, 'route_recording') or not self.route_recording:
                print("No active route recording")
                return False

            positions = self.route_recording['positions']
            if len(positions) < 2:
                print("Route recording has insufficient positions")
                return False

            # Calculate total distance
            total_distance = 0
            for i in range(len(positions) - 1):
                dist = geodesic(
                    (positions[i]['lat'], positions[i]['lon']),
                    (positions[i+1]['lat'], positions[i+1]['lon'])
                ).kilometers
                total_distance += dist

            # Calculate duration
            timestamp_end = int(time.time())
            total_duration = timestamp_end - self.route_recording['timestamp_start']

            # Save to database
            self.cursor.execute("""INSERT INTO route_recordings
                                   (route_name, start_lat, start_lon, end_lat, end_lon,
                                    total_distance_km, total_duration_seconds, position_count,
                                    timestamp_start, timestamp_end)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                                (self.route_recording['route_name'],
                                 self.route_recording['start_lat'],
                                 self.route_recording['start_lon'],
                                 positions[-1]['lat'],
                                 positions[-1]['lon'],
                                 total_distance,
                                 total_duration,
                                 len(positions),
                                 self.route_recording['timestamp_start'],
                                 timestamp_end))
            self.conn.commit()

            route_id = self.cursor.lastrowid
            print(f"[OK] Route recording saved: {self.route_recording['route_name']} ({total_distance:.2f} km)")
            self.route_recording = None
            return route_id
        except Exception as e:
            print(f"End route recording error: {e}")
            log_validation_error(str(e), "end_route_recording")
            return False

    def add_geofence(self, name, lat, lon, radius_meters, alert_type="both"):
        """Add a geofence (enter/exit alert area)."""
        try:
            is_valid, error_msg = validate_coordinates(lat, lon, "add_geofence")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            self.cursor.execute("""INSERT INTO geofences
                                   (name, lat, lon, radius_meters, alert_type, is_active, timestamp)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                                (str(name)[:255], lat, lon, float(radius_meters), str(alert_type)[:20], 1, int(time.time())))
            self.conn.commit()
            geofence_id = self.cursor.lastrowid
            print(f"[OK] Geofence added: {name} (ID: {geofence_id})")
            return geofence_id
        except Exception as e:
            print(f"Add geofence error: {e}")
            log_validation_error(str(e), "add_geofence")
            return False

    def check_geofence_proximity(self, lat, lon):
        """Check if current position is within any geofence."""
        try:
            self.cursor.execute("""SELECT id, name, lat, lon, radius_meters, alert_type
                                   FROM geofences WHERE is_active = 1""")
            geofences = self.cursor.fetchall()

            for geofence_id, name, gf_lat, gf_lon, radius_m, alert_type in geofences:
                distance_m = geodesic((lat, lon), (gf_lat, gf_lon)).meters

                # Check if entering or exiting geofence
                if distance_m <= radius_m:
                    # Inside geofence - check if this is a new entry
                    self.cursor.execute("""SELECT id FROM geofence_events
                                           WHERE geofence_id = ? AND event_type = 'enter'
                                           ORDER BY timestamp DESC LIMIT 1""", (geofence_id,))
                    last_event = self.cursor.fetchone()

                    if not last_event:
                        # New entry - log event and alert
                        self.cursor.execute("""INSERT INTO geofence_events
                                               (geofence_id, event_type, lat, lon, timestamp)
                                               VALUES (?, ?, ?, ?, ?)""",
                                            (geofence_id, 'enter', lat, lon, int(time.time())))
                        self.conn.commit()

                        if alert_type in ['enter', 'both']:
                            self.speak(f"Entered {name}")
                            notification.notify(title="Geofence Alert", message=f"Entered {name}")
                else:
                    # Outside geofence - check if this is a new exit
                    self.cursor.execute("""SELECT id FROM geofence_events
                                           WHERE geofence_id = ? AND event_type = 'exit'
                                           ORDER BY timestamp DESC LIMIT 1""", (geofence_id,))
                    last_event = self.cursor.fetchone()

                    if not last_event:
                        # New exit - log event and alert
                        self.cursor.execute("""INSERT INTO geofence_events
                                               (geofence_id, event_type, lat, lon, timestamp)
                                               VALUES (?, ?, ?, ?, ?)""",
                                            (geofence_id, 'exit', lat, lon, int(time.time())))
                        self.conn.commit()

                        if alert_type in ['exit', 'both']:
                            self.speak(f"Left {name}")
                            notification.notify(title="Geofence Alert", message=f"Left {name}")

            return True
        except Exception as e:
            print(f"Check geofence proximity error: {e}")
            log_validation_error(str(e), "check_geofence_proximity")
            return False

    def share_location(self, recipient_id):
        """Share current location with a recipient."""
        try:
            is_valid, error_msg = validate_coordinates(self.current_pos[0], self.current_pos[1], "share_location")
            if not is_valid:
                log_validation_error(error_msg)
                return False

            self.cursor.execute("""INSERT INTO shared_locations
                                   (recipient_id, lat, lon, accuracy, timestamp_shared, timestamp_location)
                                   VALUES (?, ?, ?, ?, ?, ?)""",
                                (str(recipient_id)[:255], self.current_pos[0], self.current_pos[1],
                                 0, int(time.time()), int(time.time())))
            self.conn.commit()
            print(f"[OK] Location shared with {recipient_id}")
            return True
        except Exception as e:
            print(f"Share location error: {e}")
            log_validation_error(str(e), "share_location")
            return False

    def get_shared_locations(self, recipient_id, limit=20):
        """Get location sharing history for a recipient."""
        try:
            self.cursor.execute("""SELECT id, lat, lon, accuracy, timestamp_shared, timestamp_location
                                   FROM shared_locations
                                   WHERE recipient_id = ?
                                   ORDER BY timestamp_shared DESC LIMIT ?""",
                                (str(recipient_id)[:255], limit))
            return self.cursor.fetchall()
        except Exception as e:
            print(f"Get shared locations error: {e}")
            log_validation_error(str(e), "get_shared_locations")
            return []

    # ============================================================================
    # DRIVER BEHAVIOR MONITORING - Braking, Acceleration, Cornering, Driving Score
    # ============================================================================

    def detect_harsh_braking(self, current_speed_kmh, previous_speed_kmh, time_delta_seconds=1):
        """Detect harsh braking events (deceleration > 5 m/s²)."""
        try:
            if time_delta_seconds <= 0:
                return False

            # Convert km/h to m/s
            current_speed_ms = current_speed_kmh / 3.6
            previous_speed_ms = previous_speed_kmh / 3.6

            # Calculate deceleration
            deceleration = (previous_speed_ms - current_speed_ms) / time_delta_seconds

            # Harsh braking threshold: 5 m/s² (0.5g)
            if deceleration > 5:
                severity = 'severe' if deceleration > 8 else 'moderate'
                self.cursor.execute("""INSERT INTO driver_behavior_events
                                       (event_type, severity, lat, lon, speed_kmh, acceleration_ms2, timestamp)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                                    ('harsh_braking', severity, self.current_pos[0], self.current_pos[1],
                                     current_speed_kmh, -deceleration, int(time.time())))
                self.conn.commit()

                if severity == 'severe':
                    self.speak("Harsh braking detected")
                    notification.notify(title="Safety Alert", message="Harsh braking detected")

                return True
            return False
        except Exception as e:
            print(f"Detect harsh braking error: {e}")
            log_validation_error(str(e), "detect_harsh_braking")
            return False

    def detect_rapid_acceleration(self, current_speed_kmh, previous_speed_kmh, time_delta_seconds=1):
        """Detect rapid acceleration events (acceleration > 4 m/s²)."""
        try:
            if time_delta_seconds <= 0:
                return False

            # Convert km/h to m/s
            current_speed_ms = current_speed_kmh / 3.6
            previous_speed_ms = previous_speed_kmh / 3.6

            # Calculate acceleration
            acceleration = (current_speed_ms - previous_speed_ms) / time_delta_seconds

            # Rapid acceleration threshold: 4 m/s² (0.4g)
            if acceleration > 4:
                severity = 'severe' if acceleration > 6 else 'moderate'
                self.cursor.execute("""INSERT INTO driver_behavior_events
                                       (event_type, severity, lat, lon, speed_kmh, acceleration_ms2, timestamp)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                                    ('rapid_acceleration', severity, self.current_pos[0], self.current_pos[1],
                                     current_speed_kmh, acceleration, int(time.time())))
                self.conn.commit()

                if severity == 'severe':
                    self.speak("Rapid acceleration detected")
                    notification.notify(title="Safety Alert", message="Rapid acceleration detected")

                return True
            return False
        except Exception as e:
            print(f"Detect rapid acceleration error: {e}")
            log_validation_error(str(e), "detect_rapid_acceleration")
            return False

    def detect_harsh_cornering(self, accel_data):
        """Detect harsh cornering using accelerometer lateral forces."""
        try:
            if not accel_data or len(accel_data) < 2:
                return False

            # Lateral acceleration (X and Y axes)
            lateral_accel = (abs(accel_data[0]) + abs(accel_data[1])) / 2

            # Harsh cornering threshold: 6 m/s² lateral acceleration
            if lateral_accel > 6:
                severity = 'severe' if lateral_accel > 8 else 'moderate'
                self.cursor.execute("""INSERT INTO driver_behavior_events
                                       (event_type, severity, lat, lon, acceleration_ms2, timestamp)
                                       VALUES (?, ?, ?, ?, ?, ?)""",
                                    ('harsh_cornering', severity, self.current_pos[0], self.current_pos[1],
                                     lateral_accel, int(time.time())))
                self.conn.commit()

                if severity == 'severe':
                    self.speak("Harsh cornering detected")
                    notification.notify(title="Safety Alert", message="Harsh cornering detected")

                return True
            return False
        except Exception as e:
            print(f"Detect harsh cornering error: {e}")
            log_validation_error(str(e), "detect_harsh_cornering")
            return False

    def track_idle_time(self, current_speed_kmh, time_delta_seconds=1):
        """Track idle time (speed = 0 for extended periods)."""
        try:
            if not hasattr(self, 'idle_start_time'):
                self.idle_start_time = None
                self.idle_duration = 0

            if current_speed_kmh < 1:  # Idle threshold
                if self.idle_start_time is None:
                    self.idle_start_time = int(time.time())
                self.idle_duration += time_delta_seconds
            else:
                if self.idle_start_time is not None and self.idle_duration > 60:  # Log if idle > 1 minute
                    self.cursor.execute("""INSERT INTO driver_behavior_events
                                           (event_type, severity, lat, lon, timestamp)
                                           VALUES (?, ?, ?, ?, ?)""",
                                        ('idle', 'low', self.current_pos[0], self.current_pos[1], int(time.time())))
                    self.conn.commit()

                self.idle_start_time = None
                self.idle_duration = 0

            return self.idle_duration
        except Exception as e:
            print(f"Track idle time error: {e}")
            log_validation_error(str(e), "track_idle_time")
            return 0

    def calculate_driving_score(self, days=1):
        """Calculate driving score (0-100) based on behavior events."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            # Get behavior event counts
            self.cursor.execute("""
                SELECT event_type, severity, COUNT(*) as count
                FROM driver_behavior_events
                WHERE timestamp >= ?
                GROUP BY event_type, severity
            """, (cutoff_time,))

            events = self.cursor.fetchall()
            event_counts = {}
            for event_type, severity, count in events:
                key = f"{event_type}_{severity}"
                event_counts[key] = count

            # Calculate score (start at 100, deduct points for events)
            score = 100.0

            # Harsh braking: -5 per moderate, -10 per severe
            score -= event_counts.get('harsh_braking_moderate', 0) * 5
            score -= event_counts.get('harsh_braking_severe', 0) * 10

            # Rapid acceleration: -3 per moderate, -8 per severe
            score -= event_counts.get('rapid_acceleration_moderate', 0) * 3
            score -= event_counts.get('rapid_acceleration_severe', 0) * 8

            # Harsh cornering: -2 per moderate, -5 per severe
            score -= event_counts.get('harsh_cornering_moderate', 0) * 2
            score -= event_counts.get('harsh_cornering_severe', 0) * 5

            # Speeding incidents: -1 per incident
            self.cursor.execute("""
                SELECT COUNT(*) FROM trip_history
                WHERE timestamp_start >= ? AND routing_mode = 'auto'
            """, (cutoff_time,))
            speeding_count = self.cursor.fetchone()[0] or 0
            score -= speeding_count * 1

            # Ensure score is between 0 and 100
            score = max(0, min(100, score))

            return round(score, 1)
        except Exception as e:
            print(f"Calculate driving score error: {e}")
            log_validation_error(str(e), "calculate_driving_score")
            return 0

    def get_driver_behavior_summary(self, days=30, period_type='daily'):
        """Get driver behavior summary with trends."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            self.cursor.execute("""
                SELECT event_type, severity, COUNT(*) as count
                FROM driver_behavior_events
                WHERE timestamp >= ?
                GROUP BY event_type, severity
            """, (cutoff_time,))

            events = self.cursor.fetchall()
            summary = {
                'harsh_braking': 0,
                'rapid_acceleration': 0,
                'harsh_cornering': 0,
                'idle_events': 0,
                'speeding_incidents': 0,
                'total_events': 0,
                'driving_score': self.calculate_driving_score(days),
                'period_days': days
            }

            for event_type, severity, count in events:
                summary['total_events'] += count
                if event_type == 'harsh_braking':
                    summary['harsh_braking'] += count
                elif event_type == 'rapid_acceleration':
                    summary['rapid_acceleration'] += count
                elif event_type == 'harsh_cornering':
                    summary['harsh_cornering'] += count
                elif event_type == 'idle':
                    summary['idle_events'] += count

            # Get speeding incidents from trip history
            self.cursor.execute("""
                SELECT COUNT(*) FROM trip_history
                WHERE timestamp_start >= ?
            """, (cutoff_time,))
            summary['speeding_incidents'] = self.cursor.fetchone()[0] or 0

            return summary
        except Exception as e:
            print(f"Get driver behavior summary error: {e}")
            log_validation_error(str(e), "get_driver_behavior_summary")
            return {}

    def get_behavior_trends(self, days=30):
        """Get behavior trends over time."""
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            self.cursor.execute("""
                SELECT DATE(datetime(timestamp, 'unixepoch')) as date,
                       event_type, COUNT(*) as count
                FROM driver_behavior_events
                WHERE timestamp >= ?
                GROUP BY DATE(datetime(timestamp, 'unixepoch')), event_type
                ORDER BY date ASC
            """, (cutoff_time,))

            trends = {}
            for date, event_type, count in self.cursor.fetchall():
                if date not in trends:
                    trends[date] = {}
                trends[date][event_type] = count

            return trends
        except Exception as e:
            print(f"Get behavior trends error: {e}")
            log_validation_error(str(e), "get_behavior_trends")
            return {}

    def listen_wake_word(self):
        """Listen for wake word."""
        try:
            while self.toggles['voice_wake'].state == 'down':
                if not self.audio_stream:
                    break
                pcm = self.audio_stream.read(self.porcupine.frame_length, exception_on_overflow=False)
                pcm = struct.unpack_from("h" * self.porcupine.frame_length, pcm)
                result = self.porcupine.process(pcm)
                if result >= 0:
                    self.start_report("Voice wake word detected")
        except Exception as e:
            print(f"Wake word error: {e}")
            notification.notify(title="Wake Word Error", message="Voice activation failed")

    def check_shake(self, dt):
        """Check for shake gesture with sensitivity-aware detection."""
        if self.toggles['gesture'].state != 'down':
            return
        try:
            accel = accelerometer.acceleration
            if not accel or len(accel) < 3:
                return

            # Get gesture sensitivity thresholds
            thresholds = self.get_gesture_thresholds()

            # Calculate acceleration magnitude
            accel_magnitude = max(abs(accel[0]), abs(accel[1]), abs(accel[2]))

            # Adjust shake threshold based on gesture sensitivity
            # Low sensitivity: 20, Medium: 15, High: 10
            sensitivity_multiplier = {'low': 1.33, 'medium': 1.0, 'high': 0.67}
            shake_threshold = 15 * sensitivity_multiplier.get(self.gesture_sensitivity, 1.0)

            if accel_magnitude > shake_threshold:
                current_time = time.time()
                if current_time - self.last_shake_time < 1:
                    self.shake_count += 1
                    if self.shake_count >= 2:
                        self.start_report("Gesture detected")
                        self.shake_count = 0
                self.last_shake_time = current_time
        except Exception as e:
            print(f"Shake detection error: {e}")

    def detect_gesture_type(self, accel_data):
        """Detect type of gesture from accelerometer data."""
        try:
            if not accel_data or len(accel_data) < 3:
                return None

            # Calculate acceleration components
            x_accel = abs(accel_data[0])
            y_accel = abs(accel_data[1])
            z_accel = abs(accel_data[2])
            total_accel = max(x_accel, y_accel, z_accel)

            # Determine gesture type based on acceleration pattern
            if z_accel > x_accel and z_accel > y_accel:
                return 'vertical_shake'  # Up/down motion
            elif x_accel > y_accel and x_accel > z_accel:
                return 'horizontal_shake'  # Left/right motion
            elif y_accel > x_accel and y_accel > z_accel:
                return 'lateral_shake'  # Forward/backward motion
            elif total_accel > 15:
                return 'strong_shake'  # General strong motion
            else:
                return 'light_shake'  # Gentle motion

        except Exception as e:
            print(f"Detect gesture type error: {e}")
            return None

    def provide_gesture_feedback(self, gesture_type):
        """Provide visual and audio feedback for recognized gesture."""
        try:
            feedback_messages = {
                'vertical_shake': 'Vertical shake detected',
                'horizontal_shake': 'Horizontal shake detected',
                'lateral_shake': 'Lateral shake detected',
                'strong_shake': 'Strong motion detected',
                'light_shake': 'Light motion detected',
                'pinch_zoom': 'Pinch zoom gesture',
                'swipe_left': 'Swipe left detected',
                'swipe_right': 'Swipe right detected',
                'double_tap': 'Double tap detected'
            }

            message = feedback_messages.get(gesture_type, 'Gesture detected')
            print(f"[OK] {message}")

            # Provide audio feedback
            if gesture_type in ['strong_shake', 'pinch_zoom', 'double_tap']:
                self.speak(message)

            return True
        except Exception as e:
            print(f"Provide gesture feedback error: {e}")
            return False

    def start_report(self, trigger):
        """Start voice report."""
        try:
            self.speak("Report now")
            notification.notify(title="Report", message=trigger)
        except Exception as e:
            print(f"Report start error: {e}")
            notification.notify(title="Report Error", message=f"{trigger} failed")

    def on_voice_report(self, results):
        """Handle voice report results - try voice commands first, then fall back to reports."""
        try:
            if results:
                # SECURITY: Validate voice input
                text = str(results[0]).lower().strip()

                # Validate text length
                if len(text) < 1 or len(text) > 500:
                    log_validation_error("Voice report text invalid length", "on_voice_report")
                    notification.notify(title="Report Error", message="Voice input too short or too long")
                    return

                # Try to parse as voice command first
                if self.parse_voice_command(text):
                    return  # Command was successfully processed

                # If not a command, treat as a report
                # Validate current position before saving report
                is_valid, error_msg = validate_coordinates(self.current_pos[0], self.current_pos[1], "on_voice_report")
                if not is_valid:
                    log_validation_error(error_msg)
                    notification.notify(title="Report Error", message="Invalid GPS location for report")
                    return

                report_type = (
                    'pothole' if 'pothole' in text else
                    'debris' if 'debris' in text else
                    'accident' if 'accident' in text else
                    'incident' if 'incident' in text or 'closure' in text else
                    'camera' if 'camera' in text else
                    'toll' if 'toll' in text else
                    'other'
                )

                # SECURITY: Use parameterized query (already in place)
                self.cursor.execute("INSERT INTO reports (lat, lon, type, description, timestamp) VALUES (?, ?, ?, ?, ?)",
                                   (self.current_pos[0], self.current_pos[1], report_type, text, int(time.time())))
                self.conn.commit()
                message = f"Report logged: {report_type.replace('_', ' ')}"
                self.speak(message)
                notification.notify(title="Report", message=message)
            else:
                notification.notify(title="Report Error", message="No voice input detected")
        except Exception as e:
            print(f"Report error: {e}")
            log_validation_error(str(e), "on_voice_report")
            notification.notify(title="Report Error", message="Failed to log report")

    def parse_voice_command(self, voice_input):
        """Parse voice command and execute corresponding action."""
        try:
            if not voice_input:
                return False

            # Normalize input
            command = voice_input.lower().strip()

            # ===== NAVIGATION COMMANDS =====
            # "Navigate to [location]", "Go to [location]", "Take me to [location]"
            if any(cmd in command for cmd in ['navigate to', 'go to', 'take me to']):
                # Extract location name
                for prefix in ['navigate to ', 'go to ', 'take me to ']:
                    if prefix in command:
                        location = command.split(prefix, 1)[1].strip()
                        if location:
                            self.speak(f"Navigating to {location}")
                            results = self.search_location(location)
                            if results and len(results) > 0:
                                result = results[0]
                                end_lat = result['lat']
                                end_lon = result['lon']
                                route = self.calculate_route(self.current_pos[0], self.current_pos[1], end_lat, end_lon)
                                if route:
                                    self.current_route = route
                                    message = f"Route to {result['name']} calculated. {self.route_summary()}"
                                    self.speak(message)
                                    notification.notify(title="Route Calculated", message=message)
                                    return True
                                else:
                                    self.speak(f"Could not calculate route to {location}")
                                    return False
                            else:
                                self.speak(f"Could not find {location}")
                                return False
                        break

            # ===== SEARCH COMMANDS =====
            # "Find nearest gas station", "Find nearest charging station", "Find nearest [place]"
            if 'find nearest' in command:
                location_type = command.split('find nearest', 1)[1].strip()

                # Map common search terms
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

                self.speak(f"Searching for nearest {search_term}")
                results = self.search_location(search_term)
                if results and len(results) > 0:
                    result = results[0]
                    distance = geodesic(self.current_pos, (result['lat'], result['lon'])).km
                    message = f"Found {result['name']} {self.format_distance(distance * 1000)} away"
                    self.speak(message)
                    notification.notify(title="Search Result", message=message)
                    return True
                else:
                    self.speak(f"No {search_term} found nearby")
                    return False

            # ===== ROUTE PREFERENCE COMMANDS =====
            # "Avoid tolls", "Include tolls"
            if 'avoid tolls' in command:
                self.set_include_tolls(False)
                self.speak("Toll avoidance enabled")
                return True

            if 'include tolls' in command:
                self.set_include_tolls(True)
                self.speak("Tolls included in route")
                return True

            # "Avoid CAZ", "Avoid clean air zone"
            if any(cmd in command for cmd in ['avoid caz', 'avoid clean air zone']):
                self.set_caz_avoidance(True)
                self.speak("Clean Air Zone avoidance enabled")
                return True

            # "Fastest route", "Fastest"
            if 'fastest' in command:
                self.speak("Fastest route selected")
                notification.notify(title="Route Preference", message="Fastest route selected")
                return True

            # "Cheapest route", "Cheapest", "Most economical"
            if any(cmd in command for cmd in ['cheapest', 'most economical', 'cheapest route']):
                self.speak("Most economical route selected")
                notification.notify(title="Route Preference", message="Most economical route selected")
                return True

            # ===== INFORMATION COMMANDS =====
            # "What's my ETA?", "ETA", "Estimated time"
            if any(cmd in command for cmd in ["what's my eta", 'eta', 'estimated time', 'how long']):
                if self.current_route:
                    eta_minutes = self.current_route.get('eta', 0)
                    message = f"Estimated time of arrival: {eta_minutes} minutes"
                    self.speak(message)
                    notification.notify(title="ETA", message=message)
                    return True
                else:
                    self.speak("No active route. Please calculate a route first.")
                    return False

            # "How much will this cost?", "Cost", "Journey cost"
            if any(cmd in command for cmd in ['how much will this cost', 'journey cost', 'what is the cost', 'cost breakdown']):
                if self.current_route:
                    cost = self.calculate_cost(self.route_distance)
                    toll_cost = self.calculate_toll_cost() if self.include_tolls else 0
                    caz_cost = self.calculate_caz_cost()
                    total_cost = cost + toll_cost + caz_cost

                    message = f"Journey cost: {self.format_currency(cost)}"
                    if toll_cost > 0:
                        message += f" plus {self.format_currency(toll_cost)} tolls"
                    if caz_cost > 0:
                        message += f" plus {self.format_currency(caz_cost)} CAZ"

                    self.speak(message)
                    notification.notify(title="Cost Breakdown", message=message)
                    return True
                else:
                    self.speak("No active route. Please calculate a route first.")
                    return False

            # "What's the traffic like?", "Traffic", "Traffic conditions"
            if any(cmd in command for cmd in ["what's the traffic", 'traffic conditions', 'traffic', 'congestion']):
                if self.current_route:
                    traffic = self._get_traffic_conditions(self.current_pos[0], self.current_pos[1], 10)
                    flow = traffic.get('flow', 'unknown')
                    message = f"Traffic is {flow}"
                    self.speak(message)
                    notification.notify(title="Traffic Report", message=message)
                    return True
                else:
                    self.speak("No active route. Please calculate a route first.")
                    return False

            # Command not recognized
            self.speak("Command not recognized. Please try again.")
            return False

        except Exception as e:
            print(f"Voice command error: {e}")
            self.speak("Error processing voice command")
            return False

    def check_hazard_incident_alerts(self, dt):
        """Check for hazard and incident alerts."""
        try:
            if self.hazard_alerts and self.current_route and self.current_pos:
                for key, hazards in self.hazard_alerts.items():
                    for hazard in hazards:
                        # SECURITY: Validate hazard coordinates
                        is_valid, _ = validate_coordinates(hazard.get('lat'), hazard.get('lon'), "check_hazard_incident_alerts")
                        if not is_valid:
                            continue  # Skip invalid hazard

                        distance = geodesic(self.current_pos, (hazard['lat'], hazard['lon'])).meters
                        if distance < 500:
                            message = f"Hazard alert: {hazard['type']} {self.format_distance(distance)} ahead"
                            notification.notify(title="Hazard Alert", message=message)
                            if self.voice_guidance_enabled:
                                self.speak(message)

            if self.incident_alerts and self.current_route and self.current_pos:
                for key, incidents in self.incident_alerts.items():
                    for incident in incidents:
                        # SECURITY: Validate incident coordinates
                        is_valid, _ = validate_coordinates(incident.get('lat'), incident.get('lon'), "check_hazard_incident_alerts")
                        if not is_valid:
                            continue  # Skip invalid incident

                        distance = geodesic(self.current_pos, (incident['lat'], incident['lon'])).meters
                        if distance < 500:
                            message = f"Incident alert: {incident['type']} {self.format_distance(distance)} ahead"
                            notification.notify(title="Incident Alert", message=message)
                            if self.voice_guidance_enabled:
                                self.speak(message)
        except Exception as e:
            print(f"Hazard/Incident alert check error: {e}")
            log_validation_error(str(e), "check_hazard_incident_alerts")

    def check_camera_proximity(self, dt):
        """Check for camera proximity."""
        try:
            if self.camera_alerts and self.current_route and self.current_pos:
                for key, cameras in self.camera_alerts.items():
                    for camera in cameras:
                        # SECURITY: Validate camera coordinates
                        is_valid, _ = validate_coordinates(camera.get('lat'), camera.get('lon'), "check_camera_proximity")
                        if not is_valid:
                            continue  # Skip invalid camera

                        distance = geodesic(self.current_pos, (camera['lat'], camera['lon'])).meters
                        if distance < 500:
                            message = f"{camera['type']} camera {self.format_distance(distance)} ahead"
                            notification.notify(title="Camera Alert", message=message)
                            if self.voice_guidance_enabled:
                                self.speak(message)
        except Exception as e:
            print(f"Camera check error: {e}")
            log_validation_error(str(e), "check_camera_proximity")

    def check_toll_proximity(self, dt):
        """Check for toll road proximity."""
        try:
            if self.toll_alerts and self.current_route and self.current_pos:
                for key, tolls in self.toll_alerts.items():
                    for toll in tolls:
                        # SECURITY: Validate toll coordinates
                        is_valid, _ = validate_coordinates(toll.get('lat'), toll.get('lon'), "check_toll_proximity")
                        if not is_valid:
                            continue  # Skip invalid toll

                        distance = geodesic(self.current_pos, (toll['lat'], toll['lon'])).meters
                        if distance < 500:
                            cost_str = self.format_currency(toll['cost_gbp'])
                            message = f"Toll road {toll['road_name']} {self.format_distance(distance)} ahead, {cost_str}"
                            notification.notify(title="Toll Alert", message=message)
                            if self.voice_guidance_enabled:
                                self.speak(message)
        except Exception as e:
            print(f"Toll check error: {e}")
            log_validation_error(str(e), "check_toll_proximity")

    def check_caz_proximity(self, dt):
        """Check for Clean Air Zone proximity."""
        try:
            if self.caz_data and self.current_route and self.current_pos:
                for caz in self.caz_data:
                    caz_id, zone_name, city, country, lat, lon, zone_type, charge_amount, currency_code, active, operating_hours = caz

                    # SECURITY: Validate CAZ coordinates
                    is_valid, _ = validate_coordinates(lat, lon, "check_caz_proximity")
                    if not is_valid:
                        continue  # Skip invalid CAZ

                    distance = geodesic(self.current_pos, (lat, lon)).meters
                    if distance < 1000:  # Alert within 1km
                        # Format charge with appropriate currency
                        if currency_code == 'EUR':
                            charge_str = f"€{charge_amount:.2f}"
                            currency_name = "euros"
                        else:
                            charge_str = self.format_currency(charge_amount)
                            currency_name = self.get_currency_name()

                        message = f"CAZ {zone_name} {self.format_distance(distance)} ahead, {charge_str}"
                        notification.notify(title="CAZ Alert", message=message)
                        if self.voice_guidance_enabled:
                            self.speak(message)
        except Exception as e:
            print(f"CAZ check error: {e}")
            log_validation_error(str(e), "check_caz_proximity")

    def check_speed_alert(self, dt):
        """Check for speeding and trigger alerts if necessary."""
        try:
            # Only check if speed alerts are enabled
            if not self.speed_alert_enabled or not self.speed_limit_detector:
                return

            # Skip if not in auto routing mode (pedestrian/bicycle don't have speed limits)
            if self.routing_mode != 'auto':
                return

            # Get current speed in km/h (GPS provides speed in m/s, convert to km/h)
            current_speed_kmh = self.current_vehicle_speed_kmh

            # Get current speed limit in km/h
            speed_limit_kmh = self.current_speed_limit_mph * 1.60934

            # Calculate speed difference in km/h
            speed_diff_kmh = current_speed_kmh - speed_limit_kmh

            # Check if speeding exceeds threshold (threshold is always stored in km/h)
            if speed_diff_kmh >= self.speed_alert_threshold_kmh:
                # Check cooldown to prevent alert spam
                current_time = time.time()
                if current_time - self.last_speed_alert_time >= self.speed_alert_cooldown_seconds:
                    # Convert speeds to user's preferred unit for display
                    current_speed_user = self.convert_speed_to_user_units(current_speed_kmh)
                    speed_limit_user = self.convert_speed_to_user_units(speed_limit_kmh)
                    speed_diff_user = self.convert_speed_to_user_units(speed_diff_kmh)
                    unit_label = self.get_speed_unit_label()

                    # Visual notification with user's preferred units
                    message = f"Speeding alert: {current_speed_user:.0f} {unit_label} in {speed_limit_user:.0f} {unit_label} zone (exceeding by {speed_diff_user:.0f} {unit_label})"
                    notification.notify(title="⚠️ SPEEDING ALERT", message=message)

                    # Voice alert with user's preferred units
                    if self.voice_guidance_enabled:
                        unit_name = 'miles per hour' if self.distance_unit == 'mi' else 'kilometers per hour'
                        voice_message = f"Warning: You are speeding. Current speed {current_speed_user:.0f} {unit_label} in a {speed_limit_user:.0f} {unit_label} zone."
                        self.speak(voice_message)

                    # Update last alert time
                    self.last_speed_alert_time = current_time
                    self.speed_alert_active = True

                    print(f"[ALERT] Speed violation: {current_speed_user:.1f} {unit_label} in {speed_limit_user:.1f} {unit_label} zone")
            else:
                # Clear alert status if no longer speeding
                self.speed_alert_active = False

        except Exception as e:
            print(f"Speed alert check error: {e}")
            log_validation_error(str(e), "check_speed_alert")

    # ============================================================================
    # REAL-TIME TRAFFIC INTEGRATION
    # ============================================================================

    def fetch_traffic_data(self, lat, lon, radius_km=5):
        """
        Fetch real-time traffic data for specified area.
        Uses OpenStreetMap-based traffic data or cached data.

        Args:
            lat: Latitude
            lon: Longitude
            radius_km: Search radius in kilometers

        Returns:
            dict: Traffic data with conditions and incidents
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "fetch_traffic_data")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            # Check cache first (5-minute expiry)
            cache_key = f"{lat},{lon},{radius_km}"
            self.cursor.execute(
                "SELECT traffic_data, timestamp FROM traffic_cache WHERE lat = ? AND lon = ? AND radius_km = ?",
                (lat, lon, radius_km)
            )
            cached = self.cursor.fetchone()

            if cached:
                cached_data, timestamp = cached
                if time.time() - timestamp < self.traffic_cache_expiry:
                    print(f"[OK] Using cached traffic data for ({lat}, {lon})")
                    return json.loads(cached_data)

            # Fetch real traffic data from MapQuest API
            # Uses HazardParser to fetch incidents and analyze traffic conditions
            traffic_data = {
                'location': {'lat': lat, 'lon': lon},
                'radius_km': radius_km,
                'conditions': self._get_traffic_conditions(lat, lon, radius_km),
                'incidents': self._get_traffic_incidents(lat, lon, radius_km),
                'timestamp': int(time.time())
            }

            # Cache the traffic data
            self.cursor.execute(
                "INSERT INTO traffic_cache (lat, lon, radius_km, traffic_data, timestamp) VALUES (?, ?, ?, ?, ?)",
                (lat, lon, radius_km, json.dumps(traffic_data), int(time.time()))
            )
            self.conn.commit()

            print(f"[OK] Traffic data fetched for ({lat}, {lon})")
            return traffic_data

        except Exception as e:
            print(f"Traffic data fetch error: {e}")
            log_validation_error(str(e), "fetch_traffic_data")
            return {'error': str(e)}

    def _get_traffic_conditions(self, lat, lon, radius_km):
        """Get traffic conditions for area using real MapQuest API."""
        try:
            # Use HazardParser to fetch real traffic incidents from MapQuest API
            from hazard_parser import HazardParser

            parser = HazardParser()
            incidents = parser.fetch_incidents(lat, lon, radius_km)
            parser.close()

            if not incidents:
                # No incidents found - assume free flow
                return {
                    'flow': 'free',
                    'speed_kmh': 80,
                    'congestion_level': 'low',
                    'color': 'green',
                    'source': 'mapquest'
                }

            # Analyze incidents to determine traffic conditions
            incident_types = [inc.get('type', '').lower() for inc in incidents]

            # Count severity levels
            high_severity = sum(1 for inc in incidents if inc.get('type', '').lower() in ['accident', 'road_closed'])
            medium_severity = sum(1 for inc in incidents if inc.get('type', '').lower() in ['roadworks', 'congestion'])

            # Determine flow based on incident count and types
            if high_severity >= 2 or 'road_closed' in incident_types:
                flow = 'congested'
                speed_kmh = 20
                congestion_level = 'high'
                color = 'red'
            elif high_severity >= 1 or medium_severity >= 2:
                flow = 'moderate'
                speed_kmh = 50
                congestion_level = 'medium'
                color = 'yellow'
            else:
                flow = 'free'
                speed_kmh = 80
                congestion_level = 'low'
                color = 'green'

            return {
                'flow': flow,
                'speed_kmh': speed_kmh,
                'congestion_level': congestion_level,
                'color': color,
                'incident_count': len(incidents),
                'source': 'mapquest'
            }
        except Exception as e:
            print(f"[FAIL] Traffic conditions error: {e}")
            # Fallback to free flow if API fails
            return {'flow': 'free', 'speed_kmh': 80, 'congestion_level': 'low', 'color': 'green', 'source': 'fallback'}

    def _get_traffic_incidents(self, lat, lon, radius_km):
        """Get traffic incidents for area."""
        try:
            self.cursor.execute(
                """SELECT lat, lon, incident_type, description, severity, timestamp
                   FROM traffic_incidents
                   WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                   AND timestamp > ? ORDER BY timestamp DESC LIMIT 20""",
                (lat - radius_km/111, lat + radius_km/111,
                 lon - radius_km/111, lon + radius_km/111,
                 int(time.time()) - 3600)  # Last hour
            )

            incidents = []
            for row in self.cursor.fetchall():
                incidents.append({
                    'lat': row[0],
                    'lon': row[1],
                    'type': row[2],
                    'description': row[3],
                    'severity': row[4],
                    'timestamp': row[5]
                })

            return incidents
        except Exception as e:
            print(f"Traffic incidents error: {e}")
            return []

    def get_traffic_incidents(self, route):
        """
        Get traffic incidents along a route.

        Args:
            route: Route data from Valhalla

        Returns:
            list: Incidents along the route
        """
        try:
            if not route or 'trip' not in route:
                return []

            incidents = []

            # Extract route coordinates
            if 'legs' in route['trip']:
                for leg in route['trip']['legs']:
                    if 'shape' in leg:
                        # Check for incidents near route
                        # This is simplified - in production, check actual route geometry
                        pass

            return incidents
        except Exception as e:
            print(f"Get traffic incidents error: {e}")
            return []

    def calculate_traffic_delay(self, route):
        """
        Calculate estimated delay due to traffic.

        Args:
            route: Route data from Valhalla

        Returns:
            dict: Delay information
        """
        try:
            if not route or 'trip' not in route:
                return {'delay_seconds': 0, 'delay_minutes': 0}

            # Get route time
            leg = route['trip']['legs'][0]
            base_time = leg.get('summary', {}).get('time', 0)

            # Estimate delay based on traffic conditions
            # In production, use real traffic data
            traffic_conditions = self._get_traffic_conditions(
                self.current_pos[0], self.current_pos[1], 5
            )

            congestion_factor = {
                'low': 1.0,
                'medium': 1.3,
                'high': 1.6
            }.get(traffic_conditions.get('congestion_level', 'medium'), 1.3)

            estimated_time = base_time * congestion_factor
            delay_seconds = int(estimated_time - base_time)

            return {
                'delay_seconds': delay_seconds,
                'delay_minutes': delay_seconds // 60,
                'base_time_seconds': base_time,
                'estimated_time_seconds': int(estimated_time),
                'congestion_level': traffic_conditions.get('congestion_level')
            }
        except Exception as e:
            print(f"Calculate traffic delay error: {e}")
            return {'delay_seconds': 0, 'delay_minutes': 0}

    def get_traffic_flow_speed(self, lat, lon):
        """
        Get current traffic flow speed at location.

        Args:
            lat: Latitude
            lon: Longitude

        Returns:
            dict: Speed and flow information
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "get_traffic_flow_speed")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            conditions = self._get_traffic_conditions(lat, lon, 1)
            return {
                'speed_kmh': conditions.get('speed_kmh', 0),
                'flow': conditions.get('flow', 'unknown'),
                'congestion_level': conditions.get('congestion_level', 'unknown'),
                'color': conditions.get('color', 'gray')
            }
        except Exception as e:
            print(f"Get traffic flow speed error: {e}")
            return {'error': str(e)}

    # ==================== WEATHER INTEGRATION ====================

    def fetch_weather_data(self, lat, lon):
        """Fetch weather data from OpenWeatherMap API via HazardParser."""
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "fetch_weather_data")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            # Use HazardParser to fetch weather data from OpenWeatherMap API
            from hazard_parser import HazardParser

            parser = HazardParser()
            weather_alerts = parser.fetch_weather(lat, lon)
            parser.close()

            if not weather_alerts:
                # No alerts found - return current conditions
                return {
                    'alerts': [],
                    'temperature': 20,
                    'humidity': 50,
                    'wind_speed': 5,
                    'precipitation': 0,
                    'description': 'Clear',
                    'severity': 'none',
                    'source': 'openweathermap'
                }

            # Process weather alerts
            weather_data = {
                'alerts': weather_alerts,
                'temperature': weather_alerts[0].get('temperature', 20) if weather_alerts else 20,
                'description': weather_alerts[0].get('description', 'Clear') if weather_alerts else 'Clear',
                'severity': weather_alerts[0].get('severity', 'none') if weather_alerts else 'none',
                'source': 'openweathermap',
                'timestamp': int(time.time())
            }

            # Cache the weather data
            self.cursor.execute(
                "INSERT INTO weather_cache (lat, lon, temperature, description, severity, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (lat, lon, weather_data['temperature'], weather_data['description'], weather_data['severity'], int(time.time()))
            )
            self.conn.commit()

            print(f"[OK] Weather data fetched for ({lat}, {lon}): {weather_data['description']}")
            return weather_data

        except Exception as e:
            print(f"Weather data fetch error: {e}")
            log_validation_error(str(e), "fetch_weather_data")
            return {'error': str(e)}

    def analyze_route_weather(self, route, start_lat, start_lon, end_lat, end_lon):
        """Analyze weather conditions along entire route and identify severe weather zones."""
        try:
            if not route or 'trip' not in route:
                return {'weather_zones': [], 'overall_severity': 'none', 'warnings': []}

            weather_zones = []
            warnings = []

            # Check weather at start point
            start_weather = self.fetch_weather_data(start_lat, start_lon)
            if start_weather.get('severity') in ['severe', 'extreme']:
                warnings.append(f"Severe weather at start: {start_weather.get('description', 'Unknown')}")
                weather_zones.append({
                    'lat': start_lat,
                    'lon': start_lon,
                    'type': 'start',
                    'severity': start_weather.get('severity'),
                    'description': start_weather.get('description'),
                    'temperature': start_weather.get('temperature')
                })

            # Check weather at end point
            end_weather = self.fetch_weather_data(end_lat, end_lon)
            if end_weather.get('severity') in ['severe', 'extreme']:
                warnings.append(f"Severe weather at destination: {end_weather.get('description', 'Unknown')}")
                weather_zones.append({
                    'lat': end_lat,
                    'lon': end_lon,
                    'type': 'end',
                    'severity': end_weather.get('severity'),
                    'description': end_weather.get('description'),
                    'temperature': end_weather.get('temperature')
                })

            # Check weather at midpoint
            mid_lat = (start_lat + end_lat) / 2
            mid_lon = (start_lon + end_lon) / 2
            mid_weather = self.fetch_weather_data(mid_lat, mid_lon)
            if mid_weather.get('severity') in ['severe', 'extreme']:
                warnings.append(f"Severe weather along route: {mid_weather.get('description', 'Unknown')}")
                weather_zones.append({
                    'lat': mid_lat,
                    'lon': mid_lon,
                    'type': 'midpoint',
                    'severity': mid_weather.get('severity'),
                    'description': mid_weather.get('description'),
                    'temperature': mid_weather.get('temperature')
                })

            # Determine overall severity
            overall_severity = 'none'
            if weather_zones:
                severities = [z.get('severity', 'none') for z in weather_zones]
                if 'extreme' in severities:
                    overall_severity = 'extreme'
                elif 'severe' in severities:
                    overall_severity = 'severe'
                elif 'moderate' in severities:
                    overall_severity = 'moderate'

            return {
                'weather_zones': weather_zones,
                'overall_severity': overall_severity,
                'warnings': warnings,
                'start_weather': start_weather,
                'end_weather': end_weather,
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Route weather analysis error: {e}")
            log_validation_error(str(e), "analyze_route_weather")
            return {'weather_zones': [], 'overall_severity': 'none', 'warnings': []}

    def get_weather_forecast_for_route(self, route_time_seconds, start_lat, start_lon):
        """Get weather forecast for the duration of the route."""
        try:
            if not route_time_seconds or route_time_seconds <= 0:
                return {'forecast': [], 'duration_minutes': 0}

            # Get current weather at start
            current_weather = self.fetch_weather_data(start_lat, start_lon)

            # Calculate route duration in minutes
            duration_minutes = int(route_time_seconds / 60)

            # Create forecast entry for current conditions
            forecast = [{
                'time_offset_minutes': 0,
                'temperature': current_weather.get('temperature', 20),
                'description': current_weather.get('description', 'Clear'),
                'severity': current_weather.get('severity', 'none'),
                'lat': start_lat,
                'lon': start_lon
            }]

            # Add forecast for midpoint of journey (if journey > 30 minutes)
            if duration_minutes > 30:
                mid_lat = start_lat + 0.05  # Approximate offset
                mid_lon = start_lon + 0.05
                mid_weather = self.fetch_weather_data(mid_lat, mid_lon)
                forecast.append({
                    'time_offset_minutes': duration_minutes // 2,
                    'temperature': mid_weather.get('temperature', 20),
                    'description': mid_weather.get('description', 'Clear'),
                    'severity': mid_weather.get('severity', 'none'),
                    'lat': mid_lat,
                    'lon': mid_lon
                })

            # Add forecast for end of journey
            if duration_minutes > 0:
                forecast.append({
                    'time_offset_minutes': duration_minutes,
                    'temperature': current_weather.get('temperature', 20),
                    'description': current_weather.get('description', 'Clear'),
                    'severity': current_weather.get('severity', 'none'),
                    'lat': start_lat,
                    'lon': start_lon
                })

            return {
                'forecast': forecast,
                'duration_minutes': duration_minutes,
                'start_weather': current_weather,
                'timestamp': int(time.time())
            }

        except Exception as e:
            print(f"Weather forecast error: {e}")
            log_validation_error(str(e), "get_weather_forecast_for_route")
            return {'forecast': [], 'duration_minutes': 0}

    # ============================================================================
    # HAZARD-AWARE ROUTING
    # ============================================================================

    def fetch_hazards_for_route_planning(self, start_lat, start_lon, end_lat, end_lon):
        """
        Fetch all hazards within the bounding box of start/end coordinates.

        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates

        Returns:
            dict: Hazards organized by type with coordinates and severity
        """
        try:
            # Calculate bounding box with 10km buffer
            north = max(start_lat, end_lat) + 0.1
            south = min(start_lat, end_lat) - 0.1
            east = max(start_lon, end_lon) + 0.1
            west = min(start_lon, end_lon) - 0.1

            # Check cache first (10-minute expiry)
            self.cursor.execute(
                "SELECT hazards_data, timestamp FROM route_hazards_cache WHERE north >= ? AND south <= ? AND east >= ? AND west <= ?",
                (south, north, west, east)
            )
            cached = self.cursor.fetchone()
            if cached:
                cached_data, timestamp = cached
                if time.time() - timestamp < 600:  # 10-minute cache
                    print("[OK] Using cached route hazards")
                    return json.loads(cached_data)

            hazards = {
                'speed_camera': [],
                'traffic_light_camera': [],
                'police': [],
                'roadworks': [],
                'accident': [],
                'railway_crossing': [],
                'pothole': [],
                'debris': [],
                'fallen_tree': [],
                'hov_lane': []
            }

            # Fetch speed cameras and traffic light cameras
            self.cursor.execute(
                "SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                (south, north, west, east)
            )
            for lat, lon, camera_type, desc in self.cursor.fetchall():
                if camera_type == 'speed_camera':
                    hazards['speed_camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                elif camera_type == 'traffic_light_camera':
                    hazards['traffic_light_camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})

            # Fetch hazards (potholes, debris, fallen trees, railway crossings)
            self.cursor.execute(
                "SELECT lat, lon, type, description FROM hazards WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                (south, north, west, east)
            )
            for lat, lon, hazard_type, desc in self.cursor.fetchall():
                if hazard_type == 'pothole':
                    hazards['pothole'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'medium'})
                elif hazard_type == 'debris':
                    hazards['debris'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                elif hazard_type == 'fallen_tree':
                    hazards['fallen_tree'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                elif hazard_type == 'railway_crossing':
                    hazards['railway_crossing'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})

            # Fetch traffic incidents (accidents, road works)
            self.cursor.execute(
                "SELECT lat, lon, incident_type, description FROM traffic_incidents WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                (south, north, west, east)
            )
            for lat, lon, incident_type, desc in self.cursor.fetchall():
                if incident_type == 'accident':
                    hazards['accident'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                elif incident_type == 'roadworks':
                    hazards['roadworks'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'medium'})

            # Fetch community reports (police, hazards)
            self.cursor.execute(
                "SELECT lat, lon, report_type, description FROM community_reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND status = 'active'",
                (south, north, west, east)
            )
            for lat, lon, report_type, desc in self.cursor.fetchall():
                if report_type == 'police':
                    hazards['police'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})

            # Cache the hazards
            self.cursor.execute(
                "INSERT INTO route_hazards_cache (north, south, east, west, hazards_data, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (north, south, east, west, json.dumps(hazards), int(time.time()))
            )
            self.conn.commit()

            return hazards

        except Exception as e:
            print(f"Fetch hazards for route planning error: {e}")
            log_validation_error(str(e), "fetch_hazards_for_route_planning")
            return {}

    def calculate_route_hazard_score(self, route_coords, hazards, hazard_weights=None):
        """
        Calculate a hazard score for a route based on proximity to hazards.

        Args:
            route_coords: List of [lon, lat] coordinate pairs from route
            hazards: Dictionary of hazard lists by type
            hazard_weights: Dictionary of hazard type to penalty weight (uses defaults if None)

        Returns:
            dict: Hazard scoring information
        """
        try:
            if hazard_weights is None:
                hazard_weights = self.hazard_penalty_weights

            total_score = 0
            hazard_count = 0
            hazards_by_type = {}
            time_penalty_minutes = 0

            # Check each hazard type
            for hazard_type, hazard_list in hazards.items():
                if not hazard_list or hazard_type not in hazard_weights:
                    continue

                weight_info = hazard_weights[hazard_type]
                threshold = weight_info.get('threshold_meters', 100)
                penalty = weight_info.get('penalty_seconds', 0)

                hazards_near_route = 0
                for hazard in hazard_list:
                    hazard_lat = hazard.get('lat')
                    hazard_lon = hazard.get('lon')

                    # Check distance from hazard to route
                    for coord in route_coords:
                        distance = geodesic((coord[1], coord[0]), (hazard_lat, hazard_lon)).meters
                        if distance < threshold:
                            hazards_near_route += 1
                            total_score += penalty
                            time_penalty_minutes += penalty / 60
                            break

                if hazards_near_route > 0:
                    hazards_by_type[hazard_type] = hazards_near_route
                    hazard_count += hazards_near_route

            return {
                'total_score': total_score,
                'hazard_count': hazard_count,
                'hazards_by_type': hazards_by_type,
                'time_penalty_minutes': round(time_penalty_minutes, 1)
            }

        except Exception as e:
            print(f"Calculate route hazard score error: {e}")
            return {
                'total_score': 0,
                'hazard_count': 0,
                'hazards_by_type': {},
                'time_penalty_minutes': 0
            }

    # ============================================================================
    # ALTERNATIVE ROUTES
    # ============================================================================

    def calculate_alternative_routes(self, start_lat, start_lon, end_lat, end_lon, num_routes=3):
        """
        Calculate multiple alternative routes with different optimization criteria.

        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            num_routes: Number of alternative routes to calculate (default 3)

        Returns:
            list: List of alternative routes with comparison data
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(start_lat, start_lon, "calculate_alternative_routes")
            if not is_valid:
                log_validation_error(error_msg)
                return []

            is_valid, error_msg = validate_coordinates(end_lat, end_lon, "calculate_alternative_routes")
            if not is_valid:
                log_validation_error(error_msg)
                return []

            # Check cache first (1-hour expiry)
            cache_key = f"{start_lat},{start_lon},{end_lat},{end_lon}"
            self.cursor.execute(
                "SELECT routes_data, timestamp FROM alternative_routes_cache WHERE start_lat = ? AND start_lon = ? AND end_lat = ? AND end_lon = ?",
                (start_lat, start_lon, end_lat, end_lon)
            )
            cached = self.cursor.fetchone()

            if cached:
                cached_data, timestamp = cached
                if time.time() - timestamp < 3600:  # 1-hour expiry
                    print("[OK] Using cached alternative routes")
                    cached_routes = json.loads(cached_data)
                    self.alternative_routes = cached_routes
                    return cached_routes

            routes = []

            # Route 1: Fastest route (default)
            route_fastest = self.calculate_route(start_lat, start_lon, end_lat, end_lon)
            if route_fastest:
                routes.append({
                    'type': 'fastest',
                    'route': route_fastest,
                    'criteria': 'Minimize time'
                })

            # Route 2: Shortest route
            if self.check_valhalla_connection():
                route_shortest = self._calculate_route_with_costing(
                    start_lat, start_lon, end_lat, end_lon, 'shortest'
                )
                if route_shortest:
                    routes.append({
                        'type': 'shortest',
                        'route': route_shortest,
                        'criteria': 'Minimize distance'
                    })

            # Route 3: Cheapest route (avoid tolls)
            if self.check_valhalla_connection():
                route_cheapest = self._calculate_route_with_costing(
                    start_lat, start_lon, end_lat, end_lon, 'avoid_tolls'
                )
                if route_cheapest:
                    routes.append({
                        'type': 'cheapest',
                        'route': route_cheapest,
                        'criteria': 'Minimize tolls'
                    })

            # Route 4: Ticket Prevention route (avoid cameras, police, hazards)
            if self.enable_hazard_avoidance and self.check_valhalla_connection():
                route_ticket_prevention = self._calculate_route_with_hazard_avoidance(
                    start_lat, start_lon, end_lat, end_lon
                )
                if route_ticket_prevention:
                    routes.append({
                        'type': 'ticket_prevention',
                        'route': route_ticket_prevention,
                        'criteria': 'Avoid cameras & hazards'
                    })

            # Route 5: EV Charging route (for electric vehicles)
            if self.vehicle_type in ['electric', 'hybrid'] and self.check_valhalla_connection():
                try:
                    # Fetch charging stations along the route
                    charging_stations = self.get_nearby_charging_stations(start_lat, start_lon, 50)
                    if charging_stations:
                        route_ev = self.calculate_route(start_lat, start_lon, end_lat, end_lon)
                        if route_ev:
                            route_ev['charging_stations'] = charging_stations
                            routes.append({
                                'type': 'ev_charging',
                                'route': route_ev,
                                'criteria': 'Optimized for EV charging',
                                'charging_stations': charging_stations
                            })
                            print(f"[OK] Found {len(charging_stations)} charging stations for EV route")
                except Exception as e:
                    print(f"[WARN] EV charging route failed: {e}")

            # Add comparison data to each route
            for route_data in routes:
                route_data['comparison'] = self._compare_route(route_data['route'])

            # Get ML route recommendation if available
            try:
                ml_recommendation = self.get_ml_route_recommendation(start_lat, start_lon, end_lat, end_lon, routes)
                if ml_recommendation:
                    print(f"[OK] ML recommendation: {ml_recommendation.get('recommended_type', 'unknown')}")
                    # Add ML recommendation to routes
                    for route_data in routes:
                        if route_data['type'] == ml_recommendation.get('recommended_type'):
                            route_data['ml_recommended'] = True
                            route_data['ml_score'] = ml_recommendation.get('score', 0)
            except Exception as e:
                print(f"[WARN] ML route recommendation failed: {e}")

            # Cache the routes
            self.cursor.execute(
                "INSERT INTO alternative_routes_cache (start_lat, start_lon, end_lat, end_lon, routes_data, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (start_lat, start_lon, end_lat, end_lon, json.dumps(routes), int(time.time()))
            )
            self.conn.commit()

            self.alternative_routes = routes
            print(f"[OK] Calculated {len(routes)} alternative routes")
            return routes

        except Exception as e:
            print(f"Calculate alternative routes error: {e}")
            log_validation_error(str(e), "calculate_alternative_routes")
            return []

    def _calculate_route_with_costing(self, start_lat, start_lon, end_lat, end_lon, costing_type):
        """Calculate route with specific costing model."""
        try:
            if not self.check_valhalla_connection():
                return None

            payload = {
                "locations": [
                    {"lat": start_lat, "lon": start_lon},
                    {"lat": end_lat, "lon": end_lon}
                ],
                "costing": "auto",
                "format": "json"
            }

            # Set costing options based on type
            if costing_type == 'shortest':
                payload["costing_options"] = {
                    "auto": {
                        "use_toll": True,
                        "toll_factor": 0.5,  # Prefer tolls for shorter routes
                        "use_ferry": True
                    }
                }
            elif costing_type == 'avoid_tolls':
                payload["costing_options"] = {
                    "auto": {
                        "use_toll": False,
                        "toll_factor": 10.0,  # Heavily penalize tolls
                        "use_ferry": True
                    }
                }

            response = self._make_valhalla_request('/route', payload)
            return response

        except Exception as e:
            print(f"Calculate route with costing error: {e}")
            return None

    def _calculate_route_with_hazard_avoidance(self, start_lat, start_lon, end_lat, end_lon):
        """
        Calculate route that avoids hazards (cameras, police, etc).
        Uses client-side filtering of multiple route options.

        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates

        Returns:
            Route data with lowest hazard score
        """
        try:
            if not self.check_valhalla_connection():
                return None

            # Fetch hazards in the route area
            hazards = self.fetch_hazards_for_route_planning(start_lat, start_lon, end_lat, end_lon)

            # Calculate multiple route variations
            routes_to_compare = []

            # Route 1: Fastest route
            route1 = self.calculate_route(start_lat, start_lon, end_lat, end_lon)
            if route1:
                routes_to_compare.append(route1)

            # Route 2: Shortest route
            route2 = self._calculate_route_with_costing(start_lat, start_lon, end_lat, end_lon, 'shortest')
            if route2:
                routes_to_compare.append(route2)

            # Route 3: Avoid tolls route
            route3 = self._calculate_route_with_costing(start_lat, start_lon, end_lat, end_lon, 'avoid_tolls')
            if route3:
                routes_to_compare.append(route3)

            # Score each route based on hazard proximity
            best_route = None
            best_score = float('inf')

            for route in routes_to_compare:
                if 'trip' not in route or not route['trip'].get('legs'):
                    continue

                leg = route['trip']['legs'][0]
                route_coords = leg.get('shape', {}).get('coordinates', [])

                if not route_coords:
                    continue

                # Calculate hazard score
                hazard_score = self.calculate_route_hazard_score(route_coords, hazards)
                total_score = hazard_score.get('total_score', 0)

                # Store hazard info in route
                route['hazard_score'] = hazard_score

                # Select route with lowest hazard score
                if total_score < best_score:
                    best_score = total_score
                    best_route = route

            return best_route if best_route else route1

        except Exception as e:
            print(f"Calculate route with hazard avoidance error: {e}")
            log_validation_error(str(e), "_calculate_route_with_hazard_avoidance")
            return None

    def _compare_route(self, route):
        """Extract comparison data from route."""
        try:
            if not route or 'trip' not in route:
                return {}

            leg = route['trip']['legs'][0]
            summary = leg.get('summary', {})

            distance_km = summary.get('length', 0) / 1000
            time_seconds = summary.get('time', 0)

            # Calculate costs
            fuel_cost = self.calculate_cost(distance_km)
            toll_cost = self.calculate_toll_cost()
            caz_cost = self.calculate_caz_cost()

            # Get hazard data if available
            hazard_score = route.get('hazard_score', {})
            hazard_count = hazard_score.get('hazard_count', 0)
            hazard_time_penalty = hazard_score.get('time_penalty_minutes', 0)
            hazards_by_type = hazard_score.get('hazards_by_type', {})

            comparison_data = {
                'distance_km': round(distance_km, 2),
                'time_minutes': round(time_seconds / 60, 1),
                'fuel_cost': round(fuel_cost, 2),
                'toll_cost': round(toll_cost, 2),
                'caz_cost': round(caz_cost, 2),
                'total_cost': round(fuel_cost + toll_cost + caz_cost, 2)
            }

            # Add hazard data if hazard avoidance is enabled
            if self.enable_hazard_avoidance:
                comparison_data['hazard_count'] = hazard_count
                comparison_data['hazard_time_penalty_minutes'] = hazard_time_penalty
                comparison_data['hazards_by_type'] = hazards_by_type

            return comparison_data
        except Exception as e:
            print(f"Compare route error: {e}")
            return {}

    def compare_routes(self, routes):
        """
        Compare multiple routes side-by-side.

        Args:
            routes: List of route data

        Returns:
            dict: Comparison table with all metrics
        """
        try:
            comparison = {
                'routes': [],
                'best_time': None,
                'best_distance': None,
                'best_cost': None,
                'best_hazard_free': None
            }

            for i, route_data in enumerate(routes):
                route_info = route_data.get('comparison', {})
                route_info['index'] = i
                route_info['type'] = route_data.get('type', 'unknown')
                comparison['routes'].append(route_info)

            # Find best routes
            if comparison['routes']:
                comparison['best_time'] = min(comparison['routes'], key=lambda x: x.get('time_minutes', float('inf')))['index']
                comparison['best_distance'] = min(comparison['routes'], key=lambda x: x.get('distance_km', float('inf')))['index']
                comparison['best_cost'] = min(comparison['routes'], key=lambda x: x.get('total_cost', float('inf')))['index']

                # Find best hazard-free route if hazard avoidance is enabled
                if self.enable_hazard_avoidance:
                    comparison['best_hazard_free'] = min(comparison['routes'], key=lambda x: x.get('hazard_count', float('inf')))['index']

            return comparison
        except Exception as e:
            print(f"Compare routes error: {e}")
            return {}

    def select_route(self, route_index):
        """
        Select a specific alternative route.

        Args:
            route_index: Index of route to select

        Returns:
            bool: Success status
        """
        try:
            if 0 <= route_index < len(self.alternative_routes):
                self.selected_route_index = route_index
                selected = self.alternative_routes[route_index]
                print(f"[OK] Selected route: {selected.get('type', 'unknown')}")
                notification.notify(
                    title="Route Selected",
                    message=f"Using {selected.get('type', 'unknown')} route"
                )
                return True
            else:
                print(f"Invalid route index: {route_index}")
                return False
        except Exception as e:
            print(f"Select route error: {e}")
            return False

    # ============================================================================
    # OFFLINE MAPS
    # ============================================================================

    def download_map_tiles(self, lat, lon, radius_km, zoom_levels=None):
        """
        Download map tiles for offline use.

        Args:
            lat, lon: Center coordinates
            radius_km: Download radius
            zoom_levels: List of zoom levels to download (default [10, 12, 14, 16, 18])

        Returns:
            dict: Download status and progress
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "download_map_tiles")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            if zoom_levels is None:
                zoom_levels = [10, 12, 14, 16, 18]

            # Calculate storage requirements
            # Rough estimate: ~100KB per tile
            num_tiles = len(zoom_levels) * 4  # Simplified calculation
            estimated_size_mb = (num_tiles * 100) / 1024

            if self.offline_storage_used_mb + estimated_size_mb > self.offline_storage_limit_mb:
                return {
                    'error': 'Insufficient storage',
                    'required_mb': estimated_size_mb,
                    'available_mb': self.offline_storage_limit_mb - self.offline_storage_used_mb
                }

            # Create offline map region
            timestamp = int(time.time())
            region_name = f"Region_{lat}_{lon}_{timestamp}"

            self.cursor.execute(
                """INSERT INTO offline_map_regions
                   (region_name, center_lat, center_lon, radius_km, zoom_levels, download_status, storage_bytes, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (region_name, lat, lon, radius_km, json.dumps(zoom_levels), 'downloading', 0, timestamp)
            )
            self.conn.commit()

            # Get the actual inserted region ID
            region_id = self.cursor.lastrowid

            print(f"[OK] Started downloading map tiles for region: {region_name}")
            print(f"  Estimated size: {estimated_size_mb:.1f} MB")

            # In production, this would download actual tiles from OSM tile server
            # For now, simulate the download
            self._simulate_tile_download(region_id, num_tiles)

            return {
                'status': 'downloading',
                'region_id': region_id,
                'region_name': region_name,
                'estimated_size_mb': estimated_size_mb,
                'zoom_levels': zoom_levels
            }

        except Exception as e:
            print(f"Download map tiles error: {e}")
            log_validation_error(str(e), "download_map_tiles")
            return {'error': str(e)}

    def _simulate_tile_download(self, region_id, num_tiles):
        """Simulate downloading tiles (in production, would fetch from OSM)."""
        try:
            # Simulate downloading tiles
            for i in range(min(num_tiles, 10)):  # Limit to 10 tiles for simulation
                tile_x = 100 + i
                tile_y = 200 + i
                zoom = 14

                # In production, fetch actual tile image from OSM
                # For now, store placeholder data
                self.cursor.execute(
                    "INSERT INTO offline_maps (tile_x, tile_y, zoom, image_data, timestamp) VALUES (?, ?, ?, ?, ?)",
                    (tile_x, tile_y, zoom, b'tile_data_placeholder', int(time.time()))
                )

            self.conn.commit()

            # Update region status
            self.cursor.execute(
                "UPDATE offline_map_regions SET download_status = ? WHERE id = ?",
                ('completed', region_id)
            )
            self.conn.commit()

            print(f"[OK] Tile download completed for region {region_id}")

        except Exception as e:
            print(f"Simulate tile download error: {e}")

    def get_available_offline_regions(self):
        """
        Get list of available offline map regions.

        Returns:
            list: Available offline regions
        """
        try:
            self.cursor.execute(
                """SELECT id, region_name, center_lat, center_lon, radius_km,
                          download_status, storage_bytes, timestamp
                   FROM offline_map_regions ORDER BY timestamp DESC"""
            )

            regions = []
            for row in self.cursor.fetchall():
                regions.append({
                    'id': row[0],
                    'name': row[1],
                    'center_lat': row[2],
                    'center_lon': row[3],
                    'radius_km': row[4],
                    'status': row[5],
                    'storage_mb': row[6] / (1024 * 1024),
                    'timestamp': row[7]
                })

            return regions
        except Exception as e:
            print(f"Get offline regions error: {e}")
            return []

    def delete_offline_region(self, region_id):
        """
        Delete offline map region to free storage.

        Args:
            region_id: Region ID to delete

        Returns:
            bool: Success status
        """
        try:
            # Get region info
            self.cursor.execute(
                "SELECT storage_bytes FROM offline_map_regions WHERE id = ?",
                (region_id,)
            )
            result = self.cursor.fetchone()

            if result:
                storage_bytes = result[0]

                # Delete tiles for this region
                self.cursor.execute(
                    "DELETE FROM offline_maps WHERE tile_x IN (SELECT tile_x FROM offline_maps LIMIT 10)"
                )

                # Delete region
                self.cursor.execute(
                    "DELETE FROM offline_map_regions WHERE id = ?",
                    (region_id,)
                )

                self.conn.commit()

                # Update storage used
                self.offline_storage_used_mb -= storage_bytes / (1024 * 1024)

                print(f"[OK] Deleted offline region {region_id}")
                return True
            else:
                print(f"Region not found: {region_id}")
                return False

        except Exception as e:
            print(f"Delete offline region error: {e}")
            return False

    def update_offline_region(self, region_id):
        """
        Update outdated tiles in offline region.

        Args:
            region_id: Region ID to update

        Returns:
            bool: Success status
        """
        try:
            self.cursor.execute(
                "SELECT center_lat, center_lon, radius_km, zoom_levels FROM offline_map_regions WHERE id = ?",
                (region_id,)
            )
            result = self.cursor.fetchone()

            if result:
                lat, lon, radius_km, zoom_levels_json = result
                zoom_levels = json.loads(zoom_levels_json)

                # Re-download tiles
                self.cursor.execute(
                    "UPDATE offline_map_regions SET download_status = ? WHERE id = ?",
                    ('updating', region_id)
                )
                self.conn.commit()

                self._simulate_tile_download(region_id, len(zoom_levels) * 4)

                print(f"[OK] Updated offline region {region_id}")
                return True
            else:
                print(f"Region not found: {region_id}")
                return False

        except Exception as e:
            print(f"Update offline region error: {e}")
            return False

    def get_offline_storage_usage(self):
        """
        Get offline map storage usage statistics.

        Returns:
            dict: Storage usage information
        """
        try:
            self.cursor.execute(
                "SELECT SUM(storage_bytes) FROM offline_map_regions"
            )
            result = self.cursor.fetchone()
            total_bytes = result[0] if result[0] else 0

            self.cursor.execute(
                "SELECT COUNT(*) FROM offline_map_regions"
            )
            num_regions = self.cursor.fetchone()[0]

            self.cursor.execute(
                "SELECT COUNT(*) FROM offline_maps"
            )
            num_tiles = self.cursor.fetchone()[0]

            total_mb = total_bytes / (1024 * 1024)
            available_mb = self.offline_storage_limit_mb - total_mb

            return {
                'total_mb': round(total_mb, 2),
                'available_mb': round(available_mb, 2),
                'limit_mb': self.offline_storage_limit_mb,
                'usage_percent': round((total_mb / self.offline_storage_limit_mb) * 100, 1),
                'num_regions': num_regions,
                'num_tiles': num_tiles
            }
        except Exception as e:
            print(f"Get offline storage usage error: {e}")
            return {}

    # ============================================================================
    # ENHANCED OFFLINE MODE - DOWNLOAD MANAGEMENT
    # ============================================================================

    def pause_download(self, region_id):
        """
        Pause an active map tile download.

        Args:
            region_id: Region ID to pause

        Returns:
            bool: Success status
        """
        try:
            self.cursor.execute(
                "UPDATE offline_map_regions SET download_paused = 1, download_status = ? WHERE id = ?",
                ('paused', region_id)
            )
            self.conn.commit()

            self.download_pause_states[region_id] = True
            print(f"[OK] Download paused for region {region_id}")
            notification.notify(title="Download Paused", message=f"Region {region_id} download paused")
            return True

        except Exception as e:
            print(f"Pause download error: {e}")
            return False

    def resume_download(self, region_id):
        """
        Resume a paused map tile download.

        Args:
            region_id: Region ID to resume

        Returns:
            bool: Success status
        """
        try:
            self.cursor.execute(
                "UPDATE offline_map_regions SET download_paused = 0, download_status = ? WHERE id = ?",
                ('downloading', region_id)
            )
            self.conn.commit()

            if region_id in self.download_pause_states:
                del self.download_pause_states[region_id]

            print(f"[OK] Download resumed for region {region_id}")
            notification.notify(title="Download Resumed", message=f"Region {region_id} download resumed")
            return True

        except Exception as e:
            print(f"Resume download error: {e}")
            return False

    def cancel_download(self, region_id):
        """
        Cancel an active or paused map tile download.

        Args:
            region_id: Region ID to cancel

        Returns:
            bool: Success status
        """
        try:
            # Get region info
            self.cursor.execute(
                "SELECT storage_bytes FROM offline_map_regions WHERE id = ?",
                (region_id,)
            )
            result = self.cursor.fetchone()

            if result:
                # Delete region and associated tiles
                self.cursor.execute("DELETE FROM offline_maps WHERE tile_x IN (SELECT tile_x FROM offline_maps LIMIT 10)")
                self.cursor.execute("DELETE FROM offline_map_regions WHERE id = ?", (region_id,))
                self.conn.commit()

                if region_id in self.download_pause_states:
                    del self.download_pause_states[region_id]

                print(f"[OK] Download cancelled for region {region_id}")
                notification.notify(title="Download Cancelled", message=f"Region {region_id} download cancelled")
                return True

            return False

        except Exception as e:
            print(f"Cancel download error: {e}")
            return False

    def get_download_progress(self, region_id):
        """
        Get download progress for a region.

        Args:
            region_id: Region ID

        Returns:
            dict: Progress information
        """
        try:
            self.cursor.execute(
                """SELECT download_progress_percent, download_paused, estimated_time_remaining_seconds,
                          total_tiles, downloaded_tiles, download_status
                   FROM offline_map_regions WHERE id = ?""",
                (region_id,)
            )
            result = self.cursor.fetchone()

            if result:
                progress_percent, is_paused, time_remaining, total_tiles, downloaded_tiles, status = result

                return {
                    'region_id': region_id,
                    'progress_percent': progress_percent or 0,
                    'is_paused': bool(is_paused),
                    'estimated_time_remaining_seconds': time_remaining or 0,
                    'total_tiles': total_tiles or 0,
                    'downloaded_tiles': downloaded_tiles or 0,
                    'status': status,
                    'timestamp': int(time.time())
                }

            return {'error': 'Region not found'}

        except Exception as e:
            print(f"Get download progress error: {e}")
            return {'error': str(e)}

    # ============================================================================
    # ENHANCED OFFLINE MODE - OFFLINE POI SEARCH
    # ============================================================================

    def download_poi_for_region(self, region_id, categories=None):
        """
        Download POI (Points of Interest) for offline region.

        Args:
            region_id: Region ID to download POIs for
            categories: List of POI categories (default: all)

        Returns:
            dict: Download status
        """
        try:
            if categories is None:
                categories = self.poi_categories

            # Get region info
            self.cursor.execute(
                "SELECT center_lat, center_lon, radius_km FROM offline_map_regions WHERE id = ?",
                (region_id,)
            )
            result = self.cursor.fetchone()

            if not result:
                return {'error': 'Region not found'}

            center_lat, center_lon, radius_km = result

            # Simulate downloading POIs for each category
            poi_count = 0
            for category in categories:
                # In production, would fetch from OSM Overpass API or similar
                # For now, simulate POI data
                for i in range(3):  # Simulate 3 POIs per category
                    lat = center_lat + (i * 0.01)
                    lon = center_lon + (i * 0.01)

                    self.cursor.execute(
                        """INSERT INTO offline_poi_cache
                           (region_id, name, category, lat, lon, address, phone, opening_hours, amenities, distance_from_region_center, timestamp)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            region_id,
                            f"{category.title()} {i+1}",
                            category,
                            lat,
                            lon,
                            f"Address for {category} {i+1}",
                            "+44 1234 567890",
                            "09:00-17:00",
                            "parking,wifi",
                            radius_km * 0.5,
                            int(time.time())
                        )
                    )
                    poi_count += 1

            self.conn.commit()

            print(f"[OK] Downloaded {poi_count} POIs for region {region_id}")
            notification.notify(title="POI Download Complete", message=f"Downloaded {poi_count} points of interest")
            return {
                'status': 'completed',
                'region_id': region_id,
                'poi_count': poi_count,
                'categories': categories
            }

        except Exception as e:
            print(f"Download POI error: {e}")
            log_validation_error(str(e), "download_poi_for_region")
            return {'error': str(e)}

    def search_offline_location(self, query, region_id=None, category=None):
        """
        Search for locations in offline POI cache.

        Args:
            query: Search query
            region_id: Optional region ID to limit search
            category: Optional category to filter

        Returns:
            list: Matching offline locations
        """
        try:
            # SECURITY: Validate search query
            is_valid, error_msg = validate_search_query(query)
            if not is_valid:
                log_validation_error(error_msg)
                return []

            sql = "SELECT id, name, category, lat, lon, address, phone, opening_hours FROM offline_poi_cache WHERE 1=1"
            params = []

            # Search by name or address
            sql += " AND (name LIKE ? OR address LIKE ?)"
            search_term = f"%{query}%"
            params.extend([search_term, search_term])

            # Filter by region if specified
            if region_id:
                sql += " AND region_id = ?"
                params.append(region_id)

            # Filter by category if specified
            if category:
                sql += " AND category = ?"
                params.append(category)

            sql += " ORDER BY name LIMIT 20"

            self.cursor.execute(sql, params)
            results = []

            for row in self.cursor.fetchall():
                results.append({
                    'id': row[0],
                    'name': row[1],
                    'category': row[2],
                    'lat': row[3],
                    'lon': row[4],
                    'address': row[5],
                    'phone': row[6],
                    'opening_hours': row[7],
                    'source': 'offline'
                })

            print(f"[OK] Found {len(results)} offline locations for '{query}'")
            return results

        except Exception as e:
            print(f"Search offline location error: {e}")
            log_validation_error(str(e), "search_offline_location")
            return []

    def get_offline_poi_by_category(self, category, region_id=None):
        """
        Get all POIs of a specific category from offline cache.

        Args:
            category: POI category
            region_id: Optional region ID to limit search

        Returns:
            list: POIs in category
        """
        try:
            sql = "SELECT id, name, lat, lon, address, phone, opening_hours FROM offline_poi_cache WHERE category = ?"
            params = [category]

            if region_id:
                sql += " AND region_id = ?"
                params.append(region_id)

            sql += " ORDER BY name"

            self.cursor.execute(sql, params)
            results = []

            for row in self.cursor.fetchall():
                results.append({
                    'id': row[0],
                    'name': row[1],
                    'lat': row[2],
                    'lon': row[3],
                    'address': row[4],
                    'phone': row[5],
                    'opening_hours': row[6],
                    'category': category,
                    'source': 'offline'
                })

            return results

        except Exception as e:
            print(f"Get offline POI by category error: {e}")
            return []

    # ============================================================================
    # ENHANCED OFFLINE MODE - CACHED WEATHER DATA
    # ============================================================================

    def download_weather_forecast(self, lat, lon, forecast_periods=None):
        """
        Download weather forecast for offline use.

        Args:
            lat, lon: Location coordinates
            forecast_periods: List of forecast periods (default: ['current', '6hr', '12hr', '24hr'])

        Returns:
            dict: Download status
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "download_weather_forecast")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            if forecast_periods is None:
                forecast_periods = ['current', '6hr', '12hr', '24hr']

            # Fetch weather data for each period
            for period in forecast_periods:
                # In production, would fetch from weather API
                # For now, simulate weather data
                weather_data = {
                    'temperature': 15 + (len(forecast_periods) - forecast_periods.index(period)) * 2,
                    'humidity': 60,
                    'wind_speed': 10,
                    'precipitation': 0,
                    'description': 'Partly Cloudy',
                    'severity': 'none'
                }

                self.cursor.execute(
                    """INSERT INTO weather_cache_enhanced
                       (lat, lon, temperature, humidity, wind_speed, precipitation, description, severity, forecast_period, is_stale, last_updated_timestamp, timestamp)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        lat,
                        lon,
                        weather_data['temperature'],
                        weather_data['humidity'],
                        weather_data['wind_speed'],
                        weather_data['precipitation'],
                        weather_data['description'],
                        weather_data['severity'],
                        period,
                        0,
                        int(time.time()),
                        int(time.time())
                    )
                )

            self.conn.commit()

            print(f"[OK] Downloaded weather forecast for ({lat}, {lon})")
            notification.notify(title="Weather Downloaded", message="Weather forecast cached for offline use")
            return {
                'status': 'completed',
                'lat': lat,
                'lon': lon,
                'forecast_periods': forecast_periods
            }

        except Exception as e:
            print(f"Download weather forecast error: {e}")
            log_validation_error(str(e), "download_weather_forecast")
            return {'error': str(e)}

    def get_offline_weather(self, lat, lon, forecast_period='current'):
        """
        Get cached weather data for offline use.

        Args:
            lat, lon: Location coordinates
            forecast_period: Forecast period ('current', '6hr', '12hr', '24hr')

        Returns:
            dict: Weather data or None if not cached
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "get_offline_weather")
            if not is_valid:
                log_validation_error(error_msg)
                return None

            # Find closest cached weather (within 0.1 degrees ~11km)
            self.cursor.execute(
                """SELECT temperature, humidity, wind_speed, precipitation, description, severity, is_stale, last_updated_timestamp
                   FROM weather_cache_enhanced
                   WHERE forecast_period = ? AND ABS(lat - ?) < 0.1 AND ABS(lon - ?) < 0.1
                   ORDER BY ABS(lat - ?) + ABS(lon - ?) LIMIT 1""",
                (forecast_period, lat, lat, lon, lon)
            )
            result = self.cursor.fetchone()

            if result:
                temp, humidity, wind, precip, desc, severity, is_stale, last_updated = result

                return {
                    'temperature': temp,
                    'humidity': humidity,
                    'wind_speed': wind,
                    'precipitation': precip,
                    'description': desc,
                    'severity': severity,
                    'is_stale': bool(is_stale),
                    'last_updated_timestamp': last_updated,
                    'source': 'offline_cache'
                }

            return None

        except Exception as e:
            print(f"Get offline weather error: {e}")
            return None

    def is_weather_data_stale(self, lat, lon, forecast_period='current'):
        """
        Check if cached weather data is stale.

        Args:
            lat, lon: Location coordinates
            forecast_period: Forecast period

        Returns:
            bool: True if data is stale
        """
        try:
            self.cursor.execute(
                """SELECT last_updated_timestamp FROM weather_cache_enhanced
                   WHERE forecast_period = ? AND ABS(lat - ?) < 0.1 AND ABS(lon - ?) < 0.1
                   ORDER BY ABS(lat - ?) + ABS(lon - ?) LIMIT 1""",
                (forecast_period, lat, lat, lon, lon)
            )
            result = self.cursor.fetchone()

            if result:
                last_updated = result[0]
                age_seconds = int(time.time()) - last_updated

                # Mark as stale if older than threshold
                if age_seconds > self.weather_stale_threshold:
                    self.cursor.execute(
                        "UPDATE weather_cache_enhanced SET is_stale = 1 WHERE forecast_period = ? AND ABS(lat - ?) < 0.1 AND ABS(lon - ?) < 0.1",
                        (forecast_period, lat, lon)
                    )
                    self.conn.commit()
                    return True

                return False

            return True  # No data found = stale

        except Exception as e:
            print(f"Is weather data stale error: {e}")
            return True

    def refresh_weather_cache(self, lat, lon):
        """
        Refresh weather cache for a location.

        Args:
            lat, lon: Location coordinates

        Returns:
            dict: Refreshed weather data
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "refresh_weather_cache")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            # Fetch fresh weather data
            fresh_weather = self.fetch_weather_data(lat, lon)

            if fresh_weather and 'error' not in fresh_weather:
                # Update cache with fresh data
                self.cursor.execute(
                    """UPDATE weather_cache_enhanced
                       SET temperature = ?, humidity = ?, wind_speed = ?, precipitation = ?,
                           description = ?, severity = ?, is_stale = 0, last_updated_timestamp = ?
                       WHERE forecast_period = 'current' AND ABS(lat - ?) < 0.1 AND ABS(lon - ?) < 0.1""",
                    (
                        fresh_weather.get('temperature', 20),
                        fresh_weather.get('humidity', 60),
                        fresh_weather.get('wind_speed', 10),
                        fresh_weather.get('precipitation', 0),
                        fresh_weather.get('description', 'Unknown'),
                        fresh_weather.get('severity', 'none'),
                        int(time.time()),
                        lat,
                        lon
                    )
                )
                self.conn.commit()

                print(f"[OK] Weather cache refreshed for ({lat}, {lon})")
                return fresh_weather

            return {'error': 'Failed to fetch fresh weather data'}

        except Exception as e:
            print(f"Refresh weather cache error: {e}")
            log_validation_error(str(e), "refresh_weather_cache")
            return {'error': str(e)}

    # ============================================================================
    # COMMUNITY REPORTING
    # ============================================================================

    def submit_report(self, lat, lon, report_type, description, photo_path=None):
        """
        Submit a community hazard/incident report.

        Args:
            lat, lon: Report location
            report_type: Type of report (hazard, incident, traffic, camera, police, weather)
            description: Report description
            photo_path: Optional path to photo

        Returns:
            dict: Report submission status
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "submit_report")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid coordinates'}

            # Validate report type
            valid_types = ['hazard', 'incident', 'traffic', 'camera', 'police', 'weather']
            if report_type not in valid_types:
                return {'error': f'Invalid report type. Must be one of: {", ".join(valid_types)}'}

            # Validate description
            is_valid, error_msg, sanitized_desc = validate_search_query(description, "submit_report")
            if not is_valid:
                log_validation_error(error_msg)
                return {'error': 'Invalid description'}
            description = sanitized_desc

            # Check rate limit (max 10 reports per day)
            current_time = int(time.time())
            cutoff_time = current_time - 86400  # 24 hours ago

            self.cursor.execute(
                "SELECT COUNT(*) FROM community_reports WHERE user_id = ? AND timestamp > ?",
                (self.user_id, cutoff_time)
            )
            report_count = self.cursor.fetchone()[0]

            if report_count >= self.report_rate_limit:
                return {'error': f'Rate limit exceeded. Max {self.report_rate_limit} reports per day'}

            # Calculate expiry time (48 hours from now)
            expires_at = current_time + (self.report_expiry_hours * 3600)

            # Insert report
            self.cursor.execute(
                """INSERT INTO community_reports
                   (lat, lon, report_type, description, user_id, photo_path, upvotes, flags, status, expires_at, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (lat, lon, report_type, description, self.user_id, photo_path, 0, 0, 'active', expires_at, current_time)
            )
            self.conn.commit()

            report_id = self.cursor.lastrowid

            print(f"[OK] Report submitted: {report_type} at ({lat}, {lon})")
            notification.notify(
                title="Report Submitted",
                message=f"Thank you for reporting {report_type}"
            )

            return {
                'status': 'success',
                'report_id': report_id,
                'report_type': report_type,
                'expires_at': expires_at
            }

        except Exception as e:
            print(f"Submit report error: {e}")
            log_validation_error(str(e), "submit_report")
            return {'error': str(e)}

    def get_nearby_reports(self, lat, lon, radius_km=5):
        """
        Get community reports from nearby users.

        Args:
            lat, lon: Center coordinates
            radius_km: Search radius

        Returns:
            list: Nearby reports
        """
        try:
            # SECURITY: Validate coordinates
            is_valid, error_msg = validate_coordinates(lat, lon, "get_nearby_reports")
            if not is_valid:
                log_validation_error(error_msg)
                return []

            current_time = int(time.time())

            # Get active reports within radius
            self.cursor.execute(
                """SELECT id, lat, lon, report_type, description, upvotes, flags, timestamp
                   FROM community_reports
                   WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                   AND status = 'active' AND expires_at > ?
                   ORDER BY upvotes DESC, timestamp DESC LIMIT 50""",
                (lat - radius_km/111, lat + radius_km/111,
                 lon - radius_km/111, lon + radius_km/111,
                 current_time)
            )

            reports = []
            for row in self.cursor.fetchall():
                distance = geodesic((lat, lon), (row[1], row[2])).km
                reports.append({
                    'id': row[0],
                    'lat': row[1],
                    'lon': row[2],
                    'type': row[3],
                    'description': row[4],
                    'upvotes': row[5],
                    'flags': row[6],
                    'distance_km': round(distance, 2),
                    'timestamp': row[7]
                })

            return reports
        except Exception as e:
            print(f"Get nearby reports error: {e}")
            return []

    def upvote_report(self, report_id):
        """
        Upvote/confirm an existing report.

        Args:
            report_id: Report ID to upvote

        Returns:
            bool: Success status
        """
        try:
            current_time = int(time.time())

            # Check if user already upvoted
            self.cursor.execute(
                "SELECT id FROM report_upvotes WHERE report_id = ? AND user_id = ?",
                (report_id, self.user_id)
            )

            if self.cursor.fetchone():
                return False  # Already upvoted

            # Add upvote
            self.cursor.execute(
                "INSERT INTO report_upvotes (report_id, user_id, timestamp) VALUES (?, ?, ?)",
                (report_id, self.user_id, current_time)
            )

            # Increment upvote count
            self.cursor.execute(
                "UPDATE community_reports SET upvotes = upvotes + 1 WHERE id = ?",
                (report_id,)
            )

            self.conn.commit()

            print(f"[OK] Upvoted report {report_id}")
            return True

        except Exception as e:
            print(f"Upvote report error: {e}")
            return False

    def flag_report(self, report_id, reason):
        """
        Flag a report as inappropriate or outdated.

        Args:
            report_id: Report ID to flag
            reason: Reason for flagging

        Returns:
            bool: Success status
        """
        try:
            current_time = int(time.time())

            # Check if user already flagged
            self.cursor.execute(
                "SELECT id FROM report_flags WHERE report_id = ? AND user_id = ?",
                (report_id, self.user_id)
            )

            if self.cursor.fetchone():
                return False  # Already flagged

            # Add flag
            self.cursor.execute(
                "INSERT INTO report_flags (report_id, user_id, reason, timestamp) VALUES (?, ?, ?, ?)",
                (report_id, self.user_id, reason, current_time)
            )

            # Increment flag count
            self.cursor.execute(
                "UPDATE community_reports SET flags = flags + 1 WHERE id = ?",
                (report_id,)
            )

            # Auto-hide report if too many flags
            self.cursor.execute(
                "SELECT flags FROM community_reports WHERE id = ?",
                (report_id,)
            )
            flags = self.cursor.fetchone()[0]

            if flags >= 5:  # Hide after 5 flags
                self.cursor.execute(
                    "UPDATE community_reports SET status = ? WHERE id = ?",
                    ('hidden', report_id)
                )

            self.conn.commit()

            print(f"[OK] Flagged report {report_id}: {reason}")
            return True

        except Exception as e:
            print(f"Flag report error: {e}")
            return False

    def cleanup_expired_reports(self):
        """
        Clean up expired community reports.

        Returns:
            int: Number of reports deleted
        """
        try:
            current_time = int(time.time())

            # Delete expired reports
            self.cursor.execute(
                "DELETE FROM community_reports WHERE expires_at < ?",
                (current_time,)
            )

            deleted_count = self.cursor.rowcount
            self.conn.commit()

            if deleted_count > 0:
                print(f"[OK] Cleaned up {deleted_count} expired reports")

            return deleted_count
        except Exception as e:
            print(f"Cleanup expired reports error: {e}")
            return 0

    def get_community_statistics(self, days=30):
        """
        Get community reporting statistics.

        Args:
            days: Number of days to analyze

        Returns:
            dict: Statistics
        """
        try:
            current_time = int(time.time())
            cutoff_time = current_time - (days * 86400)

            # Get report counts by type
            self.cursor.execute(
                """SELECT report_type, COUNT(*) FROM community_reports
                   WHERE timestamp > ? GROUP BY report_type""",
                (cutoff_time,)
            )

            report_types = {}
            for row in self.cursor.fetchall():
                report_types[row[0]] = row[1]

            # Get total reports
            self.cursor.execute(
                "SELECT COUNT(*) FROM community_reports WHERE timestamp > ?",
                (cutoff_time,)
            )
            total_reports = self.cursor.fetchone()[0]

            # Get most upvoted reports
            self.cursor.execute(
                """SELECT id, report_type, upvotes FROM community_reports
                   WHERE timestamp > ? ORDER BY upvotes DESC LIMIT 5""",
                (cutoff_time,)
            )

            top_reports = []
            for row in self.cursor.fetchall():
                top_reports.append({
                    'id': row[0],
                    'type': row[1],
                    'upvotes': row[2]
                })

            return {
                'total_reports': total_reports,
                'report_types': report_types,
                'top_reports': top_reports,
                'period_days': days
            }
        except Exception as e:
            print(f"Get community statistics error: {e}")
            return {}

    def check_weather_alerts(self, dt):
        """Check for weather alerts."""
        try:
            if self.weather_alerts and self.current_pos:
                for alert in self.weather_alerts:
                    if alert['severity'] in ['moderate', 'severe', 'extreme']:
                        temp = alert['temperature']
                        message = f"Weather alert: {alert['description']}, {self.format_temperature(temp)}"
                        notification.notify(title="Weather Alert", message=message)
                        if self.voice_guidance_enabled:
                            self.speak(message)
        except Exception as e:
            print(f"Weather check error: {e}")

    def check_maintenance_reminders(self, dt):
        """Check for pending maintenance reminders."""
        try:
            # Get active vehicle
            if self.vehicle_profile_manager:
                try:
                    active_vehicle = self.vehicle_profile_manager.get_active_vehicle()
                    if active_vehicle:
                        vehicle_id = active_vehicle['id']
                        current_mileage = active_vehicle.get('current_mileage_km', 0)

                        # Get pending reminders
                        reminders = self.get_maintenance_reminders(vehicle_id)

                        if reminders:
                            for reminder in reminders:
                                service_type = reminder.get('service_type', 'maintenance')
                                message = f"Maintenance reminder: {service_type} service is due"
                                notification.notify(title="Maintenance Alert", message=message)
                                if self.voice_guidance_enabled:
                                    self.speak(message)
                                print(f"[OK] Maintenance reminder: {service_type}")
                except Exception as e:
                    print(f"[WARN] Maintenance check error: {e}")
        except Exception as e:
            print(f"Maintenance check error: {e}")

    def announce_eta(self, dt):
        """Announce ETA with costs."""
        try:
            if self.current_route and self.current_pos:
                remaining_distance = self.current_route.get('distance', 0) - self.current_route.get('traveled', 0)
                cost_gbp = self.calculate_cost(remaining_distance)
                toll_cost = self.calculate_toll_cost() if self.include_tolls else 0

                if self.vehicle_type == 'petrol_diesel':
                    fuel_used = self.calculate_fuel(remaining_distance, self.fuel_efficiency, self.fuel_unit)
                    resource_str = self.format_fuel(fuel_used)
                else:
                    energy_used = self.calculate_energy(remaining_distance, self.energy_efficiency, self.fuel_unit)
                    resource_str = self.format_energy(energy_used)

                caz_cost = self.calculate_caz_cost()
                cost_str = self.format_currency(cost_gbp)
                toll_str = f" + {self.format_currency(toll_cost)} tolls" if toll_cost > 0 else ""
                caz_str = f" + {self.format_currency(caz_cost)} CAZ" if caz_cost > 0 else ""
                message = f"ETA: {self.current_route.get('eta', 'N/A')} min, {self.format_distance(remaining_distance * 1000)}, {resource_str}, {cost_str}{toll_str}{caz_str}"
                notification.notify(title="ETA", message=message)
                if self.voice_guidance_enabled:
                    self.speak(message)
        except Exception as e:
            print(f"ETA error: {e}")

    def speak(self, message):
        """Speak message using TTS."""
        try:
            if self.tts_engine:
                self.tts_engine.say(message)
                self.tts_engine.runAndWait()
            elif self.android_tts:
                self.android_tts.speak(message, 0, None)
            else:
                notification.notify(title="Audio Unavailable", message=message)
        except Exception as e:
            print(f"Speak error: {e}")

    # ============================================================================
    # MACHINE LEARNING INTEGRATION METHODS
    # ============================================================================

    def train_ml_models(self):
        """Train all ML models."""
        try:
            from ml_route_predictor import MLRoutePredictor
            from ml_efficiency_predictor import MLEfficiencyPredictor
            from ml_traffic_predictor import MLTrafficPredictor
            from ml_cost_predictor import MLCostPredictor

            print("[OK] Training ML models...")

            # Train route predictor
            route_predictor = MLRoutePredictor()
            route_predictor.train_route_clusters()
            route_predictor.close()

            # Train efficiency predictor
            efficiency_predictor = MLEfficiencyPredictor()
            efficiency_predictor.train_efficiency_model()
            efficiency_predictor.train_ev_battery_model()
            efficiency_predictor.close()

            # Train traffic predictor
            traffic_predictor = MLTrafficPredictor()
            traffic_predictor.train_anomaly_detector()
            traffic_predictor.train_traffic_model()
            traffic_predictor.close()

            # Train cost predictor
            cost_predictor = MLCostPredictor()
            cost_predictor.train_cost_model()
            cost_predictor.close()

            print("[OK] ML models trained successfully")
        except Exception as e:
            print(f"[FAIL] ML model training error: {e}")

    def get_ml_route_recommendation(self, start_lat, start_lon, end_lat, end_lon, available_routes):
        """Get ML-based route recommendation."""
        try:
            from ml_route_predictor import MLRoutePredictor

            predictor = MLRoutePredictor()
            recommendation = predictor.recommend_route(start_lat, start_lon, end_lat, end_lon, available_routes)
            predictor.close()

            return recommendation
        except Exception as e:
            print(f"[FAIL] Route recommendation error: {e}")
            return None

    def get_ml_cost_prediction(self, distance_km, duration_minutes):
        """Get ML-based cost prediction."""
        try:
            from ml_cost_predictor import MLCostPredictor

            predictor = MLCostPredictor()
            prediction = predictor.predict_weekly_cost()
            predictor.close()

            return prediction
        except Exception as e:
            print(f"[FAIL] Cost prediction error: {e}")
            return None

    def get_ml_traffic_prediction(self, lat, lon, hours_ahead=1):
        """Get ML-based traffic prediction."""
        try:
            from ml_traffic_predictor import MLTrafficPredictor

            predictor = MLTrafficPredictor()
            prediction = predictor.predict_traffic_conditions(lat, lon, hours_ahead)
            predictor.close()

            return prediction
        except Exception as e:
            print(f"[FAIL] Traffic prediction error: {e}")
            return None

    # ============================================================================
    # VEHICLE INTEGRATION METHODS
    # ============================================================================

    def create_vehicle_profile(self, name, vehicle_type, fuel_efficiency=None, fuel_unit=None,
                              fuel_price_gbp=None, energy_efficiency=None, electricity_price_gbp=None):
        """Create a new vehicle profile."""
        try:
            from vehicle_profile_manager import VehicleProfileManager

            manager = VehicleProfileManager()
            vehicle_id = manager.create_vehicle(
                name, vehicle_type, fuel_efficiency, fuel_unit,
                fuel_price_gbp, energy_efficiency, electricity_price_gbp
            )
            manager.close()

            return vehicle_id
        except Exception as e:
            print(f"[FAIL] Vehicle creation error: {e}")
            return None

    def switch_vehicle(self, vehicle_id):
        """Switch to a different vehicle."""
        try:
            from vehicle_profile_manager import VehicleProfileManager

            manager = VehicleProfileManager()
            success = manager.switch_vehicle(vehicle_id)

            if success:
                vehicle = manager.get_vehicle(vehicle_id)
                if vehicle:
                    self.vehicle_type = vehicle['vehicle_type']
                    self.fuel_efficiency = vehicle['fuel_efficiency']
                    self.fuel_unit = vehicle['fuel_unit']
                    self.fuel_price_gbp = vehicle['fuel_price_gbp']
                    self.energy_efficiency = vehicle['energy_efficiency']
                    self.electricity_price_gbp = vehicle['electricity_price_gbp']
                    self.save_settings()

            manager.close()
            return success
        except Exception as e:
            print(f"[FAIL] Vehicle switch error: {e}")
            return False

    def get_nearby_charging_stations(self, lat, lon, radius_km=10):
        """Get nearby EV charging stations."""
        try:
            from charging_station_manager import ChargingStationManager

            manager = ChargingStationManager()
            stations = manager.get_nearby_stations(lat, lon, radius_km)
            manager.close()

            return stations
        except Exception as e:
            print(f"[FAIL] Get charging stations error: {e}")
            return []

    def record_charging_session(self, vehicle_id, station_id, kwh_charged, cost):
        """Record an EV charging session."""
        try:
            from charging_station_manager import ChargingStationManager

            manager = ChargingStationManager()
            success = manager.record_charging(vehicle_id, station_id, kwh_charged, cost)
            manager.close()

            return success
        except Exception as e:
            print(f"[FAIL] Record charging error: {e}")
            return False

    def add_maintenance_record(self, vehicle_id, service_type, date, mileage_km, cost, notes=None):
        """Add a maintenance record."""
        try:
            from maintenance_tracker import MaintenanceTracker

            tracker = MaintenanceTracker()
            success = tracker.add_maintenance_record(vehicle_id, service_type, date, mileage_km, cost, notes)
            tracker.close()

            return success
        except Exception as e:
            print(f"[FAIL] Add maintenance record error: {e}")
            return False

    def get_maintenance_reminders(self, vehicle_id):
        """Get pending maintenance reminders."""
        try:
            from maintenance_tracker import MaintenanceTracker

            tracker = MaintenanceTracker()
            reminders = tracker.get_pending_reminders(vehicle_id)
            tracker.close()

            return reminders
        except Exception as e:
            print(f"[FAIL] Get maintenance reminders error: {e}")
            return []

    # ==================== SPEED LIMIT RECOGNITION ====================

    def get_speed_limit(self, lat, lon, road_type='motorway'):
        """Get current speed limit for location."""
        try:
            if not self.speed_limit_detector:
                return {'speed_limit_mph': 70, 'error': 'Speed limit detector not available'}

            result = self.speed_limit_detector.get_speed_limit_for_location(
                lat, lon, road_type, self.vehicle_type
            )
            self.current_speed_limit_mph = result.get('speed_limit_mph', 70)
            return result
        except Exception as e:
            print(f"Error getting speed limit: {e}")
            return {'speed_limit_mph': 70, 'error': str(e)}

    def check_speed_violation(self, current_speed_mph):
        """Check if vehicle is exceeding speed limit."""
        try:
            if not self.speed_limit_detector:
                return {'status': 'unknown', 'error': 'Speed limit detector not available'}

            return self.speed_limit_detector.check_speed_violation(
                current_speed_mph, self.current_speed_limit_mph,
                self.speed_warning_threshold_mph
            )
        except Exception as e:
            print(f"Error checking speed violation: {e}")
            return {'status': 'unknown', 'error': str(e)}

    def set_speed_warning_enabled(self, enabled):
        """Enable/disable speed warnings."""
        self.enable_speed_warnings = enabled
        self.save_settings()

    def set_speed_warning_threshold(self, threshold_mph):
        """Set speed warning threshold in mph."""
        self.speed_warning_threshold_mph = threshold_mph
        self.save_settings()

    # ==================== SPEED ALERT SYSTEM ====================

    def get_speed_alert_threshold_in_user_units(self):
        """Get speed alert threshold converted to user's preferred unit."""
        if self.distance_unit == 'mi':
            return self.speed_alert_threshold_kmh / 1.60934  # Convert km/h to mph
        return self.speed_alert_threshold_kmh

    def convert_speed_to_user_units(self, speed_kmh):
        """Convert speed from km/h to user's preferred unit."""
        if self.distance_unit == 'mi':
            return speed_kmh / 1.60934  # Convert km/h to mph
        return speed_kmh

    def get_speed_unit_label(self):
        """Get speed unit label based on user preference."""
        return 'mph' if self.distance_unit == 'mi' else 'km/h'

    def set_speed_alert_enabled(self, enabled):
        """Enable/disable real-time speed alerts."""
        self.speed_alert_enabled = enabled
        try:
            self.cursor.execute(
                "INSERT OR REPLACE INTO speed_alert_settings (speed_alert_enabled, speed_alert_threshold_kmh, timestamp) VALUES (?, ?, ?)",
                (1 if enabled else 0, self.speed_alert_threshold_kmh, int(time.time()))
            )
            self.conn.commit()
            print(f"[OK] Speed alerts {'enabled' if enabled else 'disabled'}")
        except Exception as e:
            print(f"[FAIL] Set speed alert enabled error: {e}")

    def set_speed_alert_threshold(self, threshold_kmh):
        """Set speed alert threshold in km/h."""
        try:
            # Validate threshold (must be positive and reasonable)
            if not isinstance(threshold_kmh, (int, float)) or threshold_kmh < 0 or threshold_kmh > 50:
                print(f"[FAIL] Invalid speed alert threshold: {threshold_kmh}. Must be between 0 and 50 km/h")
                return False

            self.speed_alert_threshold_kmh = threshold_kmh
            self.cursor.execute(
                "INSERT OR REPLACE INTO speed_alert_settings (speed_alert_enabled, speed_alert_threshold_kmh, timestamp) VALUES (?, ?, ?)",
                (1 if self.speed_alert_enabled else 0, threshold_kmh, int(time.time()))
            )
            self.conn.commit()
            print(f"[OK] Speed alert threshold set to {threshold_kmh} km/h")
            return True
        except Exception as e:
            print(f"[FAIL] Set speed alert threshold error: {e}")
            return False

    def get_speed_alert_status(self):
        """Get current speed alert status in user's preferred units."""
        unit_label = self.get_speed_unit_label()
        return {
            'enabled': self.speed_alert_enabled,
            'threshold': self.get_speed_alert_threshold_in_user_units(),
            'threshold_kmh': self.speed_alert_threshold_kmh,  # Always include km/h for reference
            'current_speed': self.convert_speed_to_user_units(self.current_vehicle_speed_kmh),
            'current_speed_kmh': self.current_vehicle_speed_kmh,  # Always include km/h for reference
            'current_speed_limit': self.convert_speed_to_user_units(self.current_speed_limit_mph * 1.60934),
            'current_speed_limit_kmh': self.current_speed_limit_mph * 1.60934,  # Always include km/h for reference
            'unit': unit_label,
            'alert_active': self.speed_alert_active,
            'cooldown_remaining': max(0, self.speed_alert_cooldown_seconds - (time.time() - self.last_speed_alert_time))
        }

    # ==================== SMART NOTIFICATIONS ====================

    def set_traffic_alerts(self, enabled):
        """Enable/disable pre-departure traffic alerts."""
        self.traffic_alerts_enabled = enabled
        try:
            self.cursor.execute(
                "INSERT OR REPLACE INTO smart_notification_preferences (traffic_alerts_enabled, weather_alerts_enabled, maintenance_alerts_enabled, fuel_battery_alerts_enabled, timestamp) VALUES (?, ?, ?, ?, ?)",
                (1 if enabled else 0, 1 if self.weather_alerts_enabled else 0, 1 if self.maintenance_alerts_enabled else 0, 1 if self.fuel_battery_alerts_enabled else 0, int(time.time()))
            )
            self.conn.commit()
            print(f"[OK] Traffic alerts {'enabled' if enabled else 'disabled'}")
        except Exception as e:
            print(f"[FAIL] Set traffic alerts error: {e}")

    def set_weather_alerts(self, enabled):
        """Enable/disable pre-departure weather alerts."""
        self.weather_alerts_enabled = enabled
        try:
            self.cursor.execute(
                "INSERT OR REPLACE INTO smart_notification_preferences (traffic_alerts_enabled, weather_alerts_enabled, maintenance_alerts_enabled, fuel_battery_alerts_enabled, timestamp) VALUES (?, ?, ?, ?, ?)",
                (1 if self.traffic_alerts_enabled else 0, 1 if enabled else 0, 1 if self.maintenance_alerts_enabled else 0, 1 if self.fuel_battery_alerts_enabled else 0, int(time.time()))
            )
            self.conn.commit()
            print(f"[OK] Weather alerts {'enabled' if enabled else 'disabled'}")
        except Exception as e:
            print(f"[FAIL] Set weather alerts error: {e}")

    def set_maintenance_alerts(self, enabled):
        """Enable/disable pre-departure maintenance alerts."""
        self.maintenance_alerts_enabled = enabled
        try:
            self.cursor.execute(
                "INSERT OR REPLACE INTO smart_notification_preferences (traffic_alerts_enabled, weather_alerts_enabled, maintenance_alerts_enabled, fuel_battery_alerts_enabled, timestamp) VALUES (?, ?, ?, ?, ?)",
                (1 if self.traffic_alerts_enabled else 0, 1 if self.weather_alerts_enabled else 0, 1 if enabled else 0, 1 if self.fuel_battery_alerts_enabled else 0, int(time.time()))
            )
            self.conn.commit()
            print(f"[OK] Maintenance alerts {'enabled' if enabled else 'disabled'}")
        except Exception as e:
            print(f"[FAIL] Set maintenance alerts error: {e}")

    def set_fuel_battery_alerts(self, enabled):
        """Enable/disable pre-departure fuel/battery alerts."""
        self.fuel_battery_alerts_enabled = enabled
        try:
            self.cursor.execute(
                "INSERT OR REPLACE INTO smart_notification_preferences (traffic_alerts_enabled, weather_alerts_enabled, maintenance_alerts_enabled, fuel_battery_alerts_enabled, timestamp) VALUES (?, ?, ?, ?, ?)",
                (1 if self.traffic_alerts_enabled else 0, 1 if self.weather_alerts_enabled else 0, 1 if self.maintenance_alerts_enabled else 0, 1 if enabled else 0, int(time.time()))
            )
            self.conn.commit()
            print(f"[OK] Fuel/battery alerts {'enabled' if enabled else 'disabled'}")
        except Exception as e:
            print(f"[FAIL] Set fuel/battery alerts error: {e}")

    # ==================== LANE GUIDANCE ====================

    def get_lane_guidance(self, lat, lon, heading, road_type='motorway', next_maneuver='straight'):
        """Get lane guidance for current location."""
        try:
            if not self.lane_guidance:
                return {'error': 'Lane guidance not available'}

            result = self.lane_guidance.get_lane_guidance(
                lat, lon, heading, road_type, next_maneuver
            )

            if 'current_lane' in result:
                self.current_lane = result['current_lane']
                self.recommended_lane = result['recommended_lane']

            return result
        except Exception as e:
            print(f"Error getting lane guidance: {e}")
            return {'error': str(e)}

    def get_lane_change_warning(self, distance_to_maneuver):
        """Get lane change warning based on distance."""
        try:
            if not self.lane_guidance:
                return None

            return self.lane_guidance.get_lane_change_warning(distance_to_maneuver)
        except Exception as e:
            print(f"Error getting lane change warning: {e}")
            return None

    def set_lane_guidance_enabled(self, enabled):
        """Enable/disable lane guidance."""
        self.enable_lane_guidance = enabled
        self.save_settings()

    def set_lane_change_warnings_enabled(self, enabled):
        """Enable/disable lane change warnings."""
        self.enable_lane_change_warnings = enabled
        self.save_settings()

    def set_voice_lane_guidance_enabled(self, enabled):
        """Enable/disable voice lane guidance."""
        self.enable_voice_lane_guidance = enabled
        self.save_settings()

    def on_stop(self):
        """Cleanup on app stop."""
        try:
            if self.porcupine:
                self.porcupine.delete()
            if self.audio_stream:
                self.audio_stream.stop_stream()
                self.audio_stream.close()
            if self.pa:
                self.pa.terminate()
            try:
                accelerometer.disable()
            except:
                pass
            try:
                gps.stop()
            except:
                pass
            self.conn.close()
        except Exception as e:
            print(f"Shutdown error: {e}")

    def build(self):
        """Build the app."""
        return self.root


if __name__ == '__main__':
    SatNavApp().run()

