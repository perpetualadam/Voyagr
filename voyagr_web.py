#!/usr/bin/env python3
"""
Voyagr Web App - Full-featured Flask-based navigation app
Run this on your PC and access from any device with a browser
Features: Route calculation, cost estimation, multi-stop routing, trip history, vehicle profiles
"""

from flask import Flask, render_template_string, request, jsonify, send_file
import requests
import os
from dotenv import load_dotenv
import json
import polyline
import sqlite3
from datetime import datetime
import threading
import math
import time

# Import speed limit detector
try:
    from speed_limit_detector import SpeedLimitDetector
except ImportError:
    SpeedLimitDetector = None

# Import routing monitor
try:
    from routing_monitor import get_monitor
except ImportError:
    get_monitor = None

load_dotenv()

app = Flask(__name__, static_folder='.')
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
USE_OSRM = os.getenv('USE_OSRM', 'false').lower() == 'true'

# Database setup
DB_FILE = 'voyagr_web.db'

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

# Initialize speed limit detector
speed_limit_detector = SpeedLimitDetector() if SpeedLimitDetector else None

# Cost calculation functions
def calculate_fuel_cost(distance_km, fuel_efficiency_l_per_100km, fuel_price_gbp_per_l):
    """Calculate fuel cost for a route."""
    fuel_needed = (distance_km / 100) * fuel_efficiency_l_per_100km
    return fuel_needed * fuel_price_gbp_per_l

def calculate_energy_cost(distance_km, energy_efficiency_kwh_per_100km, electricity_price_gbp_per_kwh):
    """Calculate energy cost for EV."""
    energy_needed = (distance_km / 100) * energy_efficiency_kwh_per_100km
    return energy_needed * electricity_price_gbp_per_kwh

def calculate_toll_cost(distance_km, route_type='motorway'):
    """Estimate toll cost based on distance and route type."""
    # UK toll rates (approximate)
    toll_rates = {
        'motorway': 0.15,  # £0.15 per km
        'a_road': 0.05,    # £0.05 per km
        'local': 0.0       # No toll
    }
    rate = toll_rates.get(route_type, 0.05)
    return distance_km * rate

def calculate_caz_cost(distance_km, vehicle_type='petrol_diesel', is_exempt=False):
    """Calculate Congestion Charge Zone cost."""
    if is_exempt:
        return 0.0

    # UK CAZ rates (daily charge)
    caz_rates = {
        'petrol_diesel': 8.0,
        'electric': 0.0,
        'hybrid': 4.0
    }

    # Assume 1 CAZ entry per 50km
    caz_entries = max(1, int(distance_km / 50))
    rate = caz_rates.get(vehicle_type, 8.0)
    return caz_entries * rate

# Hazard avoidance functions
import math
import time

def get_distance_between_points(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using Haversine formula."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon):
    """Fetch hazards within bounding box of route."""
    try:
        conn = sqlite3.connect(DB_FILE)
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
                conn.close()
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
            if camera_type in hazards:
                hazards[camera_type].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})

        # Fetch community reports
        cursor.execute(
            "SELECT lat, lon, hazard_type, description, severity FROM community_hazard_reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND status = 'active' AND expiry_timestamp > ?",
            (south, north, west, east, int(time.time()))
        )
        for lat, lon, hazard_type, desc, severity in cursor.fetchall():
            if hazard_type in hazards:
                hazards[hazard_type].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': severity})

        conn.close()
        return hazards
    except Exception as e:
        print(f"Error fetching hazards: {e}")
        return {}

def score_route_by_hazards(route_points, hazards):
    """
    Calculate hazard score for a route based on proximity to hazards.

    Traffic light cameras are weighted with a multiplier to ensure they are the highest priority hazard.
    Closer cameras receive exponentially higher penalties to strongly discourage routes passing near them.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        total_penalty = 0
        hazard_count = 0

        # Get hazard preferences
        cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters FROM hazard_preferences WHERE enabled = 1")
        preferences = {row[0]: {'penalty': row[1], 'threshold': row[2]} for row in cursor.fetchall()}
        conn.close()

        # Decode polyline to get route points
        try:
            if isinstance(route_points, str):
                decoded_points = polyline.decode(route_points)
            else:
                decoded_points = route_points
        except:
            return 0, 0

        # Check each hazard against route
        for hazard_type, hazard_list in hazards.items():
            if hazard_type not in preferences:
                continue

            pref = preferences[hazard_type]
            threshold = pref['threshold']
            penalty = pref['penalty']

            for hazard in hazard_list:
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

        return total_penalty, hazard_count
    except Exception as e:
        print(f"Error scoring route: {e}")
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
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            overflow: hidden;
        }

        body {
            display: flex;
            flex-direction: column;
        }

        /* Full-screen map layout */
        .app-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        #map {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        }

        /* Floating action buttons */
        .fab-container {
            position: absolute;
            bottom: 100px;
            right: 20px;
            z-index: 100;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .fab {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: white;
            border: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            transition: all 0.3s;
        }

        .fab:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(0,0,0,0.2);
        }

        .fab:active {
            transform: scale(0.95);
        }

        /* Bottom sheet drawer */
        .bottom-sheet {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            border-radius: 20px 20px 0 0;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
            z-index: 50;
            max-height: 90vh;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateY(calc(100% - 80px));
            display: flex;
            flex-direction: column;
        }

        .bottom-sheet.expanded {
            transform: translateY(0);
        }

        .bottom-sheet-handle {
            width: 40px;
            height: 4px;
            background: #ddd;
            border-radius: 2px;
            margin: 12px auto;
            cursor: grab;
        }

        .bottom-sheet-handle:active {
            cursor: grabbing;
        }

        .bottom-sheet-header {
            padding: 0 20px 10px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .bottom-sheet-header h2 {
            font-size: 18px;
            color: #333;
            margin: 0;
        }

        .bottom-sheet-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .bottom-sheet-content::-webkit-scrollbar {
            width: 6px;
        }

        .bottom-sheet-content::-webkit-scrollbar-track {
            background: #f1f1f1;
        }

        .bottom-sheet-content::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 3px;
        }

        .bottom-sheet-content::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        /* Form styles */
        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 600;
            font-size: 14px;
        }

        input, select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
            font-family: inherit;
        }

        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .location-input-group {
            position: relative;
            margin-bottom: 15px;
        }

        .location-input-group input {
            padding-right: 40px;
        }

        .location-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            font-size: 18px;
            color: #667eea;
            padding: 8px;
        }

        .location-btn:hover {
            color: #5568d3;
        }

        .button-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 20px;
        }

        button {
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
        }

        .btn-calculate {
            background: #667eea;
            color: white;
            grid-column: 1 / -1;
        }

        .btn-calculate:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .btn-calculate:active {
            transform: translateY(0);
        }

        .btn-clear {
            background: #f0f0f0;
            color: #333;
        }

        .btn-clear:hover {
            background: #e0e0e0;
        }

        /* Quick search buttons */
        .quick-search {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }

        .quick-search-btn {
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: #333;
        }

        .quick-search-btn:hover {
            border-color: #667eea;
            background: #f8f9ff;
        }

        .quick-search-btn-icon {
            font-size: 24px;
        }

        /* Trip info section */
        .trip-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            display: none;
        }

        .trip-info.show {
            display: block;
        }

        .trip-info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 14px;
        }

        .trip-info-row:last-child {
            margin-bottom: 0;
        }

        .trip-info-label {
            color: #666;
            font-weight: 500;
        }

        .trip-info-value {
            color: #333;
            font-weight: 600;
        }

        /* Status messages */
        .status {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            display: none;
        }

        .status.show {
            display: block;
        }

        .status.loading {
            background: #fff3cd;
            color: #856404;
        }

        .status.success {
            background: #d4edda;
            color: #155724;
        }

        .status.error {
            background: #f8d7da;
            color: #721c24;
        }

        /* Preferences section */
        .preferences-section {
            border-top: 1px solid #eee;
            padding-top: 20px;
            margin-top: 20px;
        }

        .preferences-section h3 {
            font-size: 14px;
            color: #666;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .preference-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
        }

        .preference-label {
            font-size: 14px;
            color: #333;
            font-weight: 500;
        }

        .toggle-switch {
            position: relative;
            width: 44px;
            height: 24px;
            background: #ccc;
            border-radius: 12px;
            cursor: pointer;
            transition: background 0.3s;
            border: none;
            padding: 0;
        }

        .toggle-switch.active {
            background: #667eea;
        }

        .toggle-switch::after {
            content: '';
            position: absolute;
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            transition: left 0.3s;
        }

        .toggle-switch.active::after {
            left: 22px;
        }

        /* Voice control section */
        .voice-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .voice-section h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .voice-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .btn-voice {
            background: #ff6b6b;
            color: white;
            padding: 10px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-voice:hover {
            background: #ff5252;
        }

        .btn-voice.active {
            background: #51cf66;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .btn-voice-secondary {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            padding: 10px;
            border: 2px solid white;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-voice-secondary:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .voice-status {
            background: rgba(0, 0, 0, 0.2);
            padding: 8px;
            border-radius: 4px;
            margin-top: 10px;
            min-height: 18px;
            font-size: 12px;
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .bottom-sheet {
                border-radius: 16px 16px 0 0;
            }

            .bottom-sheet-content {
                padding: 15px;
            }

            .quick-search {
                grid-template-columns: 1fr 1fr;
            }

            .button-group {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 480px) {
            .fab-container {
                bottom: 90px;
                right: 10px;
            }

            .fab {
                width: 48px;
                height: 48px;
                font-size: 20px;
            }

            .quick-search {
                grid-template-columns: 1fr;
            }

            .bottom-sheet-content {
                padding: 12px;
            }
        }
        
        h1 {
            color: #333;
            margin-bottom: 30px;
            text-align: center;
            font-size: 28px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: bold;
        }
        
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .button-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 30px;
        }
        
        button {
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .btn-calculate {
            background: #667eea;
            color: white;
        }
        
        .btn-calculate:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .btn-clear {
            background: #f0f0f0;
            color: #333;
        }
        
        .btn-clear:hover {
            background: #e0e0e0;
        }

        /* Voice Control Styles */
        .voice-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin-top: 30px;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }

        .voice-section h3 {
            margin-top: 0;
            margin-bottom: 15px;
            font-size: 18px;
        }

        .voice-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 15px;
        }

        .btn-voice {
            background: #ff6b6b;
            color: white;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-voice:hover {
            background: #ff5252;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(255, 107, 107, 0.4);
        }

        .btn-voice.active {
            background: #51cf66;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .btn-voice-secondary {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            padding: 12px;
            border: 2px solid white;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-voice-secondary:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .voice-status {
            background: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            min-height: 20px;
            font-size: 14px;
        }

        .voice-transcript {
            background: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            min-height: 30px;
            font-size: 14px;
            font-style: italic;
        }

        .voice-commands {
            background: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 6px;
            font-size: 13px;
        }

        .voice-commands p {
            margin: 0 0 8px 0;
            font-weight: bold;
        }

        .voice-commands ul {
            margin: 0;
            padding-left: 20px;
        }

        .voice-commands li {
            margin: 4px 0;
        }

        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            font-weight: bold;
            display: none;
        }
        
        .status.loading {
            display: block;
            background: #fff3cd;
            color: #856404;
        }
        
        .status.success {
            display: block;
            background: #d4edda;
            color: #155724;
        }
        
        .status.error {
            display: block;
            background: #f8d7da;
            color: #721c24;
        }
        
        .result {
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            display: none;
        }
        
        .result.show {
            display: block;
        }
        
        .result-item {
            margin: 10px 0;
            font-size: 16px;
        }
        
        .result-label {
            font-weight: bold;
            color: #667eea;
        }

        /* Phase 2 Features Styles */
        .search-history-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #e0e0e0;
            border-top: none;
            border-radius: 0 0 8px 8px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
        }

        .search-history-dropdown.show {
            display: block;
        }

        .search-history-item {
            padding: 12px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: background 0.2s;
        }

        .search-history-item:hover {
            background: #f8f9ff;
        }

        .search-history-item-text {
            font-size: 14px;
            color: #333;
            font-weight: 500;
        }

        .search-history-item-meta {
            font-size: 12px;
            color: #999;
            margin-top: 4px;
        }

        .favorites-section {
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .favorites-section h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .favorites-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .favorite-btn {
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
            font-size: 13px;
            color: #333;
        }

        .favorite-btn:hover {
            border-color: #667eea;
            background: #f8f9ff;
        }

        .favorite-btn-name {
            font-weight: 600;
            display: block;
            margin-bottom: 4px;
        }

        .favorite-btn-category {
            font-size: 11px;
            color: #999;
        }

        .lane-guidance-display {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            display: none;
        }

        .lane-guidance-display.show {
            display: block;
        }

        .lane-guidance-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            opacity: 0.9;
        }

        .lane-visual {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
            justify-content: center;
        }

        .lane-indicator {
            width: 40px;
            height: 40px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
        }

        .lane-indicator.current {
            background: rgba(255, 255, 255, 0.3);
            border-color: white;
        }

        .lane-indicator.recommended {
            background: #51cf66;
            border-color: #51cf66;
        }

        .lane-guidance-text {
            font-size: 14px;
            text-align: center;
        }

        .speed-warning-display {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            display: none;
            font-weight: 600;
        }

        .speed-warning-display.show {
            display: block;
        }

        .speed-warning-display.compliant {
            background: #d4edda;
            color: #155724;
            border-left: 4px solid #28a745;
        }

        .speed-warning-display.approaching {
            background: #fff3cd;
            color: #856404;
            border-left: 4px solid #ffc107;
        }

        .speed-warning-display.exceeding {
            background: #f8d7da;
            color: #721c24;
            border-left: 4px solid #dc3545;
        }

        .speed-warning-text {
            font-size: 14px;
        }

        .speed-warning-details {
            font-size: 12px;
            margin-top: 6px;
            opacity: 0.9;
        }

        /* Variable Speed Limit Display */
        .variable-speed-display {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            display: none;
        }

        .variable-speed-display.show {
            display: block;
        }

        .variable-speed-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.9;
        }

        .variable-speed-icon {
            font-size: 16px;
        }

        .variable-speed-title {
            font-weight: 600;
        }

        .variable-speed-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .variable-speed-limit {
            font-size: 28px;
            font-weight: bold;
        }

        .variable-speed-info {
            font-size: 12px;
            text-align: right;
            opacity: 0.9;
        }

        .variable-speed-info-item {
            margin: 4px 0;
        }

        /* Phase 3 Features Styles */
        .gesture-indicator {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            height: 100px;
            background: rgba(102, 126, 234, 0.9);
            border-radius: 50%;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            z-index: 300;
            animation: shake-pulse 0.5s ease-out;
        }

        .gesture-indicator.show {
            display: flex;
        }

        @keyframes shake-pulse {
            0% {
                transform: translate(-50%, -50%) scale(0.5);
                opacity: 1;
            }
            100% {
                transform: translate(-50%, -50%) scale(1.5);
                opacity: 0;
            }
        }

        .battery-indicator {
            position: fixed;
            top: 10px;
            right: 10px;
            background: white;
            border: 2px solid #667eea;
            border-radius: 20px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 600;
            z-index: 150;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .battery-indicator.low {
            background: #f8d7da;
            border-color: #dc3545;
            color: #721c24;
        }

        .battery-indicator.medium {
            background: #fff3cd;
            border-color: #ffc107;
            color: #856404;
        }

        .battery-indicator.high {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
        }

        .battery-icon {
            font-size: 14px;
        }

        .theme-selector {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
        }

        .theme-option {
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            font-size: 13px;
            font-weight: 500;
        }

        .theme-option:hover {
            border-color: #667eea;
            background: #f8f9ff;
        }

        .theme-option.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        .theme-preview {
            width: 100%;
            height: 40px;
            border-radius: 4px;
            margin-bottom: 6px;
        }

        .theme-preview.standard {
            background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
            border: 1px solid #ccc;
        }

        .theme-preview.satellite {
            background: linear-gradient(135deg, #8b7355 0%, #5a4a3a 100%);
        }

        .theme-preview.dark {
            background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
        }

        .ml-predictions-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            display: none;
        }

        .ml-predictions-section.show {
            display: block;
        }

        .ml-predictions-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
            opacity: 0.9;
        }

        .ml-prediction-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 13px;
            border-left: 3px solid rgba(255, 255, 255, 0.3);
        }

        .ml-prediction-item:last-child {
            margin-bottom: 0;
        }

        .ml-prediction-label {
            font-weight: 600;
            display: block;
            margin-bottom: 4px;
        }

        .ml-prediction-details {
            font-size: 12px;
            opacity: 0.9;
        }

        .gesture-sensitivity-slider {
            width: 100%;
            margin-top: 8px;
        }

        .preference-slider {
            width: 100%;
            height: 6px;
            border-radius: 3px;
            background: #e0e0e0;
            outline: none;
            -webkit-appearance: none;
        }

        .preference-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #667eea;
            cursor: pointer;
        }

        .preference-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #667eea;
            cursor: pointer;
            border: none;
        }

        /* Routing Mode Buttons */
        .routing-mode-btn {
            flex: 1;
            padding: 10px;
            border: 2px solid #ddd;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.3s ease;
            color: #666;
        }

        .routing-mode-btn:hover {
            border-color: #667eea;
            background: #f5f5ff;
        }

        .routing-mode-btn.active {
            border-color: #667eea;
            background: #667eea;
            color: white;
        }

        /* Vehicle Marker Icon */
        .vehicle-marker-icon {
            width: 40px;
            height: 40px;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
        }
    </style>
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
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                        <button class="fab" title="Saved Routes" onclick="switchTab('savedRoutes')" style="width: 40px; height: 40px; font-size: 18px; background: #E91E63; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">⭐</button>
                        <button class="fab" title="Analytics" onclick="switchTab('routeAnalytics')" style="width: 40px; height: 40px; font-size: 18px; background: #FF5722; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">📊</button>
                        <button class="fab" title="Share Route" onclick="switchTab('routeSharing')" style="width: 40px; height: 40px; font-size: 18px; background: #9C27B0; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">🔗</button>
                        <button class="fab" title="Route Options" onclick="switchTab('routeComparison')" style="width: 40px; height: 40px; font-size: 18px; background: #4CAF50; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">🛣️</button>
                        <button class="fab" title="Trip History" onclick="switchTab('tripHistory')" style="width: 40px; height: 40px; font-size: 18px; background: #FF9800; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">📋</button>
                        <button class="fab" title="Settings" onclick="switchTab('settings')" style="width: 40px; height: 40px; font-size: 18px; background: #667eea; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">⚙️</button>
                    </div>
                </div>
            </div>

            <div class="bottom-sheet-content">
                <!-- Location Inputs -->
                <div class="form-group">
                    <label for="start">Start Location</label>
                    <div class="location-input-group">
                        <input type="text" id="start" placeholder="Enter address or tap map">
                        <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: flex; gap: 4px;">
                            <button class="location-btn" title="Use current location" onclick="setCurrentLocation('start')" style="font-size: 16px;">📍</button>
                            <button class="location-btn" title="Pick from map" onclick="pickLocationFromMap('start')" style="font-size: 16px;">🗺️</button>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="end">Destination</label>
                    <div class="location-input-group">
                        <input type="text" id="end" placeholder="Enter address or tap map" onfocus="showSearchHistory()">
                        <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: flex; gap: 4px;">
                            <button class="location-btn" title="Use current location" onclick="setCurrentLocation('end')" style="font-size: 16px;">📍</button>
                            <button class="location-btn" title="Pick from map" onclick="pickLocationFromMap('end')" style="font-size: 16px;">🗺️</button>
                        </div>
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

                <!-- Route Calculation Button -->
                <button class="btn-calculate" onclick="calculateRoute()">Calculate Route</button>

                <!-- Add to Favorites Button (Phase 2) -->
                <button class="btn-calculate" onclick="addCurrentToFavorites()" style="background: #764ba2; margin-top: 10px;">⭐ Save Location</button>

                <!-- Preferences Section -->
                <div class="preferences-section">
                    <h3>Preferences</h3>

                    <div class="preference-item">
                        <span class="preference-label">Avoid Tolls</span>
                        <button class="toggle-switch" id="avoidTolls" onclick="togglePreference('tolls')"></button>
                    </div>

                    <div class="preference-item">
                        <span class="preference-label">Avoid CAZ</span>
                        <button class="toggle-switch" id="avoidCAZ" onclick="togglePreference('caz')"></button>
                    </div>

                    <div class="preference-item">
                        <span class="preference-label">Avoid Speed Cameras</span>
                        <button class="toggle-switch" id="avoidSpeedCameras" onclick="togglePreference('speedCameras')"></button>
                    </div>

                    <div class="preference-item">
                        <span class="preference-label">Avoid Traffic Cameras</span>
                        <button class="toggle-switch" id="avoidTrafficCameras" onclick="togglePreference('trafficCameras')"></button>
                    </div>

                    <div class="preference-item">
                        <span class="preference-label">📊 Variable Speed Alerts</span>
                        <button class="toggle-switch" id="variableSpeedAlerts" onclick="togglePreference('variableSpeedAlerts')"></button>
                    </div>

                    <div class="preference-item">
                        <span class="preference-label">🔍 Smart Zoom</span>
                        <button class="toggle-switch" id="smartZoomToggle" onclick="toggleSmartZoom()"></button>
                    </div>

                    <!-- Phase 3: Gesture Control -->
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

                    <!-- Phase 3: Battery Saving Mode -->
                    <div class="preference-item">
                        <span class="preference-label">🔋 Battery Saving Mode</span>
                        <button class="toggle-switch" id="batterySavingMode" onclick="toggleBatterySavingMode()"></button>
                    </div>

                    <!-- Phase 3: Map Themes -->
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

                    <!-- Phase 3: ML Predictions -->
                    <div class="preference-item">
                        <span class="preference-label">🤖 Smart Route Predictions</span>
                        <button class="toggle-switch" id="mlPredictionsEnabled" onclick="toggleMLPredictions()"></button>
                    </div>
                </div>

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

                <!-- SETTINGS TAB (NEW FEATURE) -->
                <div id="settingsTab" style="display: none;">
                    <div class="preferences-section">
                        <h3>⚙️ Units & Preferences</h3>

                        <!-- Distance Unit Toggle -->
                        <div class="preference-item">
                            <span class="preference-label">📏 Distance Unit</span>
                            <select id="distanceUnit" onchange="updateDistanceUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="km">Kilometers (km)</option>
                                <option value="mi">Miles (mi)</option>
                            </select>
                        </div>

                        <!-- Currency Unit Selector -->
                        <div class="preference-item">
                            <span class="preference-label">💱 Currency</span>
                            <select id="currencyUnit" onchange="updateCurrencyUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="GBP">GBP (£)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                            </select>
                        </div>

                        <!-- Speed Unit Toggle -->
                        <div class="preference-item">
                            <span class="preference-label">⚡ Speed Unit</span>
                            <select id="speedUnit" onchange="updateSpeedUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="kmh">km/h</option>
                                <option value="mph">mph</option>
                            </select>
                        </div>

                        <!-- Temperature Unit Toggle -->
                        <div class="preference-item">
                            <span class="preference-label">🌡️ Temperature</span>
                            <select id="temperatureUnit" onchange="updateTemperatureUnit()" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <option value="celsius">Celsius (°C)</option>
                                <option value="fahrenheit">Fahrenheit (°F)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Advanced Route Preferences -->
                    <div class="preferences-section" style="margin-top: 20px;">
                        <h3>🛣️ Advanced Route Preferences</h3>

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
                                <input type="checkbox" id="avoidTolls" onchange="saveRoutePreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px;">Avoid Tolls</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="avoidCAZ" onchange="saveRoutePreferences()" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px;">Avoid CAZ</span>
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

                        <!-- Route Optimization -->
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

                        <!-- Max Detour Percentage -->
                        <div class="preference-item">
                            <span class="preference-label">Max Detour Allowed</span>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <input type="range" id="maxDetour" min="0" max="50" value="20" onchange="updateDetourLabel()" style="flex: 1; cursor: pointer;">
                                <span id="detourLabel" style="font-size: 13px; font-weight: 500; min-width: 40px;">20%</span>
                            </div>
                        </div>
                    </div>

                    <button class="btn-calculate" onclick="switchTab('navigation')" style="width: 100%; margin-top: 20px;">← Back to Navigation</button>
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
    </style>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/polyline-encoded/0.0.9/polyline.js"></script>
    <script>
        // Suppress ethereum property redefinition warning from browser extensions
        if (typeof window !== 'undefined' && window.ethereum) {
            try {
                Object.defineProperty(window, 'ethereum', {
                    value: window.ethereum,
                    writable: false,
                    configurable: false
                });
            } catch (e) {
                // Ignore if property is already defined by extension
                console.log('[Init] Ethereum property already defined by extension');
            }
        }

        // Initialize map
        const map = L.map('map').setView([51.5074, -0.1278], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        let routeLayer = null;
        let startMarker = null;
        let endMarker = null;
        let mapPickerMode = null; // 'start' or 'end' when picking location from map

        // ===== UNIT CONVERSION VARIABLES =====
        let distanceUnit = localStorage.getItem('unit_distance') || 'km';
        let currencyUnit = localStorage.getItem('unit_currency') || 'GBP';
        let speedUnit = localStorage.getItem('unit_speed') || 'kmh';
        let temperatureUnit = localStorage.getItem('unit_temperature') || 'celsius';

        const currencySymbols = {
            'GBP': '£',
            'USD': '$',
            'EUR': '€'
        };

        // Unit conversion functions
        function convertDistance(km) {
            if (distanceUnit === 'mi') {
                return (km * 0.621371).toFixed(2);
            }
            return km.toFixed(2);
        }

        function getDistanceUnit() {
            return distanceUnit === 'mi' ? 'mi' : 'km';
        }

        function convertSpeed(kmh) {
            if (speedUnit === 'mph') {
                return (kmh * 0.621371).toFixed(1);
            }
            return kmh.toFixed(1);
        }

        function getSpeedUnit() {
            return speedUnit === 'mph' ? 'mph' : 'km/h';
        }

        function convertTemperature(celsius) {
            if (temperatureUnit === 'fahrenheit') {
                return ((celsius * 9/5) + 32).toFixed(1);
            }
            return celsius.toFixed(1);
        }

        function getTemperatureUnit() {
            return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
        }

        function getCurrencySymbol() {
            return currencySymbols[currencyUnit] || '£';
        }

        // Tab switching function
        function switchTab(tab) {
            const navigationContent = document.querySelector('.bottom-sheet-content > div:not(#settingsTab):not(#tripHistoryTab):not(#routeComparisonTab):not(#routeSharingTab):not(#routeAnalyticsTab):not(#savedRoutesTab)');
            const settingsTab = document.getElementById('settingsTab');
            const tripHistoryTab = document.getElementById('tripHistoryTab');
            const routeComparisonTab = document.getElementById('routeComparisonTab');
            const routeSharingTab = document.getElementById('routeSharingTab');
            const routeAnalyticsTab = document.getElementById('routeAnalyticsTab');
            const savedRoutesTab = document.getElementById('savedRoutesTab');
            const sheetTitle = document.getElementById('sheetTitle');

            // Hide all tabs
            if (navigationContent) navigationContent.style.display = 'none';
            settingsTab.style.display = 'none';
            tripHistoryTab.style.display = 'none';
            routeComparisonTab.style.display = 'none';
            routeSharingTab.style.display = 'none';
            routeAnalyticsTab.style.display = 'none';
            savedRoutesTab.style.display = 'none';

            if (tab === 'settings') {
                settingsTab.style.display = 'block';
                sheetTitle.textContent = '⚙️ Settings';
                loadUnitPreferences();
                loadRoutePreferences();
            } else if (tab === 'tripHistory') {
                tripHistoryTab.style.display = 'block';
                sheetTitle.textContent = '📋 Trip History';
                loadTripHistory();
            } else if (tab === 'routeComparison') {
                routeComparisonTab.style.display = 'block';
                sheetTitle.textContent = '🛣️ Route Options';
                displayRouteComparison();
            } else if (tab === 'routeSharing') {
                routeSharingTab.style.display = 'block';
                sheetTitle.textContent = '🔗 Share Route';
                prepareRouteSharing();
            } else if (tab === 'routeAnalytics') {
                routeAnalyticsTab.style.display = 'block';
                sheetTitle.textContent = '📊 Analytics';
                loadRouteAnalytics();
            } else if (tab === 'savedRoutes') {
                savedRoutesTab.style.display = 'block';
                sheetTitle.textContent = '⭐ Saved Routes';
                loadSavedRoutes();
            } else {
                if (navigationContent) navigationContent.style.display = 'block';
                sheetTitle.textContent = '🗺️ Navigation';
            }
        }

        // Load unit preferences from localStorage
        function loadUnitPreferences() {
            document.getElementById('distanceUnit').value = distanceUnit;
            document.getElementById('currencyUnit').value = currencyUnit;
            document.getElementById('speedUnit').value = speedUnit;
            document.getElementById('temperatureUnit').value = temperatureUnit;
        }

        // Update distance unit
        function updateDistanceUnit() {
            const newUnit = document.getElementById('distanceUnit').value;
            distanceUnit = newUnit;
            localStorage.setItem('unit_distance', newUnit);
            saveUnitSettingsToBackend();
            updateAllDistanceDisplays();
            showStatus(`Distance unit changed to ${newUnit === 'mi' ? 'miles' : 'kilometers'}`, 'success');
        }

        // Update currency unit
        function updateCurrencyUnit() {
            const newUnit = document.getElementById('currencyUnit').value;
            currencyUnit = newUnit;
            localStorage.setItem('unit_currency', newUnit);
            saveUnitSettingsToBackend();
            updateAllCostDisplays();
            showStatus(`Currency changed to ${newUnit}`, 'success');
        }

        // Update speed unit
        function updateSpeedUnit() {
            const newUnit = document.getElementById('speedUnit').value;
            speedUnit = newUnit;
            localStorage.setItem('unit_speed', newUnit);
            saveUnitSettingsToBackend();
            updateAllSpeedDisplays();
            showStatus(`Speed unit changed to ${newUnit === 'mph' ? 'mph' : 'km/h'}`, 'success');
        }

        // Update temperature unit
        function updateTemperatureUnit() {
            const newUnit = document.getElementById('temperatureUnit').value;
            temperatureUnit = newUnit;
            localStorage.setItem('unit_temperature', newUnit);
            saveUnitSettingsToBackend();
            updateAllTemperatureDisplays();
            showStatus(`Temperature unit changed to ${newUnit === 'fahrenheit' ? 'Fahrenheit' : 'Celsius'}`, 'success');
        }

        // Save unit settings to backend
        function saveUnitSettingsToBackend() {
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance_unit: distanceUnit,
                    currency_unit: currencyUnit,
                    speed_unit: speedUnit,
                    temperature_unit: temperatureUnit
                })
            }).catch(error => console.error('Error saving unit settings:', error));
        }

        // Update all distance displays
        function updateAllDistanceDisplays() {
            const distanceElement = document.getElementById('distance');
            if (distanceElement && distanceElement.textContent !== '-') {
                const km = parseFloat(distanceElement.dataset.km || distanceElement.textContent);
                distanceElement.textContent = convertDistance(km) + ' ' + getDistanceUnit();
            }
        }

        // Update all cost displays
        function updateAllCostDisplays() {
            const fuelCostEl = document.getElementById('fuelCost');
            const tollCostEl = document.getElementById('tollCost');
            const cazCostEl = document.getElementById('cazCost');
            const symbol = getCurrencySymbol();

            if (fuelCostEl && fuelCostEl.dataset.value) {
                fuelCostEl.textContent = symbol + fuelCostEl.dataset.value;
            }
            if (tollCostEl && tollCostEl.dataset.value) {
                tollCostEl.textContent = symbol + tollCostEl.dataset.value;
            }
            if (cazCostEl && cazCostEl.dataset.value) {
                cazCostEl.textContent = symbol + cazCostEl.dataset.value;
            }
        }

        // Update all speed displays
        function updateAllSpeedDisplays() {
            // This will be called when speed updates occur
            console.log('[Units] Speed unit updated to', speedUnit);
        }

        // Update all temperature displays
        function updateAllTemperatureDisplays() {
            // This will be called when weather updates occur
            console.log('[Units] Temperature unit updated to', temperatureUnit);
        }

        // ===== TRIP HISTORY FUNCTIONS =====
        let allTrips = [];

        async function loadTripHistory() {
            try {
                const response = await fetch('/api/trip-history');
                const data = await response.json();

                if (data.success && data.trips) {
                    allTrips = data.trips;
                    displayTripHistory(allTrips);
                } else {
                    document.getElementById('tripHistoryList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trips found</div>';
                }
            } catch (error) {
                console.error('Error loading trip history:', error);
                document.getElementById('tripHistoryList').innerHTML = '<div style="text-align: center; padding: 20px; color: #f44336;">Error loading trips</div>';
            }
        }

        function displayTripHistory(trips) {
            const listContainer = document.getElementById('tripHistoryList');

            if (!trips || trips.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trips found</div>';
                return;
            }

            listContainer.innerHTML = trips.map((trip, index) => {
                const date = new Date(trip.timestamp);
                const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const distance = convertDistance(trip.distance_km);
                const distUnit = getDistanceUnit();
                const totalCost = (parseFloat(trip.fuel_cost || 0) + parseFloat(trip.toll_cost || 0) + parseFloat(trip.caz_cost || 0)).toFixed(2);
                const symbol = getCurrencySymbol();

                return `
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #667eea;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                            <div>
                                <div style="font-weight: 600; color: #333; margin-bottom: 4px;">
                                    ${trip.start_address || 'Start'} → ${trip.end_address || 'End'}
                                </div>
                                <div style="font-size: 12px; color: #666;">
                                    ${dateStr}
                                </div>
                            </div>
                            <button onclick="deleteTripHistory(${trip.id})" style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">Delete</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #666; margin-bottom: 8px;">
                            <div>📏 ${distance} ${distUnit}</div>
                            <div>⏱️ ${trip.duration_minutes} min</div>
                            <div>💰 ${symbol}${totalCost}</div>
                            <div>🛣️ ${trip.routing_mode}</div>
                        </div>
                        <button onclick="recalculateTrip(${trip.id})" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Recalculate Route</button>
                    </div>
                `;
            }).join('');

            // Add search functionality
            document.getElementById('tripSearchInput').oninput = (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filtered = allTrips.filter(trip =>
                    (trip.start_address && trip.start_address.toLowerCase().includes(searchTerm)) ||
                    (trip.end_address && trip.end_address.toLowerCase().includes(searchTerm)) ||
                    (trip.timestamp && trip.timestamp.toLowerCase().includes(searchTerm))
                );
                displayTripHistory(filtered);
            };
        }

        async function recalculateTrip(tripId) {
            const trip = allTrips.find(t => t.id === tripId);
            if (!trip) return;

            // Populate form with trip data
            document.getElementById('start').value = trip.start_address || `${trip.start_lat},${trip.start_lon}`;
            document.getElementById('end').value = trip.end_address || `${trip.end_lat},${trip.end_lon}`;

            // Switch back to navigation tab
            switchTab('navigation');

            // Trigger route calculation
            setTimeout(() => {
                calculateRoute();
            }, 300);

            showStatus('Trip loaded. Recalculating route...', 'success');
        }

        async function deleteTripHistory(tripId) {
            if (!confirm('Are you sure you want to delete this trip?')) return;

            try {
                const response = await fetch(`/api/trip-history/${tripId}`, {
                    method: 'DELETE'
                });
                const data = await response.json();

                if (data.success) {
                    allTrips = allTrips.filter(t => t.id !== tripId);
                    displayTripHistory(allTrips);
                    showStatus('Trip deleted', 'success');
                } else {
                    showStatus('Error deleting trip', 'error');
                }
            } catch (error) {
                console.error('Error deleting trip:', error);
                showStatus('Error deleting trip', 'error');
            }
        }

        // ===== ROUTE COMPARISON FUNCTIONS =====
        let routeOptions = [];
        let selectedRouteIndex = 0;
        let routePreference = 'fastest';

        function setRoutePreference(preference) {
            routePreference = preference;

            // Update button states
            document.getElementById('routePrefFastest').classList.remove('active');
            document.getElementById('routePrefShortest').classList.remove('active');
            document.getElementById('routePrefCheapest').classList.remove('active');
            document.getElementById('routePrefEco').classList.remove('active');

            document.getElementById('routePref' + preference.charAt(0).toUpperCase() + preference.slice(1)).classList.add('active');

            // Re-sort routes based on preference
            sortRoutesByPreference();
            displayRouteComparison();
        }

        function sortRoutesByPreference() {
            if (!routeOptions || routeOptions.length === 0) return;

            routeOptions.sort((a, b) => {
                switch(routePreference) {
                    case 'fastest':
                        return a.duration_minutes - b.duration_minutes;
                    case 'shortest':
                        return a.distance_km - b.distance_km;
                    case 'cheapest':
                        const costA = (a.fuel_cost || 0) + (a.toll_cost || 0) + (a.caz_cost || 0);
                        const costB = (b.fuel_cost || 0) + (b.toll_cost || 0) + (b.caz_cost || 0);
                        return costA - costB;
                    case 'eco':
                        return (a.fuel_cost || 0) - (b.fuel_cost || 0);
                    default:
                        return 0;
                }
            });
        }

        function displayRouteComparison() {
            if (!routeOptions || routeOptions.length === 0) {
                document.getElementById('routeComparisonList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Calculate a route to see options</div>';
                return;
            }

            const listContainer = document.getElementById('routeComparisonList');
            const symbol = getCurrencySymbol();

            listContainer.innerHTML = routeOptions.map((route, index) => {
                const distance = convertDistance(route.distance_km);
                const distUnit = getDistanceUnit();
                const totalCost = (parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2);
                const isRecommended = index === 0;
                const borderColor = isRecommended ? '#4CAF50' : '#ddd';
                const bgColor = isRecommended ? '#E8F5E9' : '#f8f9fa';

                return `
                    <div style="background: ${bgColor}; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${borderColor}; cursor: pointer;" onclick="selectRoute(${index})">
                        ${isRecommended ? '<div style="font-size: 12px; color: #4CAF50; font-weight: 600; margin-bottom: 6px;">✓ RECOMMENDED</div>' : ''}
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #333; margin-bottom: 8px;">
                            <div><strong>⏱️ ${route.duration_minutes} min</strong></div>
                            <div><strong>📏 ${distance} ${distUnit}</strong></div>
                            <div>⛽ ${symbol}${route.fuel_cost || 0}</div>
                            <div>🛣️ ${symbol}${route.toll_cost || 0}</div>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                            Total: <strong>${symbol}${totalCost}</strong>
                        </div>
                        <button onclick="useRoute(${index}); event.stopPropagation();" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Use This Route</button>
                    </div>
                `;
            }).join('');
        }

        function selectRoute(index) {
            selectedRouteIndex = index;
            displayRouteComparison();
        }

        function useRoute(index) {
            const route = routeOptions[index];
            if (!route) return;

            // Update the map to show this route
            if (routeLayer) {
                map.removeLayer(routeLayer);
            }

            // Draw the selected route on map
            const polylinePoints = route.polyline || [];
            if (polylinePoints.length > 0) {
                routeLayer = L.polyline(polylinePoints, {
                    color: '#667eea',
                    weight: 5,
                    opacity: 0.8,
                    dashArray: '5, 5'
                }).addTo(map);

                const bounds = routeLayer.getBounds().pad(0.1);
                const center = bounds.getCenter();
                const zoomLevel = map.getBoundsZoom(bounds);
                map.flyTo(center, zoomLevel, {
                    duration: 0.5,
                    easeLinearity: 0.25
                });
            }

            // Update trip info
            const distance = convertDistance(route.distance_km);
            const distUnit = getDistanceUnit();
            const symbol = getCurrencySymbol();
            const totalCost = (parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2);

            document.getElementById('distance').textContent = distance + ' ' + distUnit;
            document.getElementById('distance').dataset.km = route.distance_km;
            document.getElementById('time').textContent = route.duration_minutes + ' min';
            document.getElementById('fuelCost').textContent = symbol + (route.fuel_cost || 0);
            document.getElementById('fuelCost').dataset.value = route.fuel_cost || 0;
            document.getElementById('tollCost').textContent = symbol + (route.toll_cost || 0);
            document.getElementById('tollCost').dataset.value = route.toll_cost || 0;

            // Store selected route for navigation
            window.lastCalculatedRoute = route;

            showStatus('Route selected. Ready to navigate!', 'success');
            switchTab('navigation');
        }

        // ===== ROUTE SHARING FUNCTIONS =====
        function prepareRouteSharing() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            const route = window.lastCalculatedRoute;
            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;
            const symbol = getCurrencySymbol();
            const distUnit = getDistanceUnit();

            // Update route summary
            document.getElementById('shareStart').textContent = `Start: ${startInput}`;
            document.getElementById('shareEnd').textContent = `End: ${endInput}`;
            document.getElementById('shareDistance').textContent = `Distance: ${convertDistance(route.distance_km || 0)} ${distUnit}`;
            document.getElementById('shareTime').textContent = `Duration: ${route.time || 'N/A'}`;

            const totalCost = (parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2);
            document.getElementById('shareCost').textContent = `Total Cost: ${symbol}${totalCost}`;
        }

        function generateShareLink() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            const route = window.lastCalculatedRoute;
            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;

            // Create shareable link with route data
            const routeData = {
                start: startInput,
                end: endInput,
                distance: route.distance_km,
                time: route.time,
                fuel_cost: route.fuel_cost,
                toll_cost: route.toll_cost,
                caz_cost: route.caz_cost,
                geometry: route.geometry
            };

            // Encode route data as base64
            const encodedRoute = btoa(JSON.stringify(routeData));
            const shareLink = `${window.location.origin}?route=${encodedRoute}`;

            // Display share link
            document.getElementById('shareLink').value = shareLink;
            document.getElementById('shareLinkContainer').style.display = 'block';
            document.getElementById('qrCodeContainer').style.display = 'none';

            showStatus('Share link generated!', 'success');
        }

        function copyShareLink() {
            const shareLink = document.getElementById('shareLink');
            shareLink.select();
            document.execCommand('copy');
            showStatus('Link copied to clipboard!', 'success');
        }

        function generateQRCode() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            // Generate share link first
            const route = window.lastCalculatedRoute;
            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;

            const routeData = {
                start: startInput,
                end: endInput,
                distance: route.distance_km,
                time: route.time,
                fuel_cost: route.fuel_cost,
                toll_cost: route.toll_cost,
                caz_cost: route.caz_cost
            };

            const encodedRoute = btoa(JSON.stringify(routeData));
            const shareLink = `${window.location.origin}?route=${encodedRoute}`;

            // Clear previous QR code
            const qrContainer = document.getElementById('qrCode');
            qrContainer.innerHTML = '';

            // Generate QR code using QR Server API
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareLink)}`;
            const qrImage = document.createElement('img');
            qrImage.src = qrImageUrl;
            qrImage.alt = 'Route QR Code';
            qrImage.style.width = '200px';
            qrImage.style.height = '200px';
            qrContainer.appendChild(qrImage);

            // Store QR image URL for download
            window.qrImageUrl = qrImageUrl;

            document.getElementById('qrCodeContainer').style.display = 'block';
            document.getElementById('shareLinkContainer').style.display = 'none';

            showStatus('QR code generated!', 'success');
        }

        function downloadQRCode() {
            if (!window.qrImageUrl) {
                showStatus('Generate QR code first', 'error');
                return;
            }

            const link = document.createElement('a');
            link.href = window.qrImageUrl;
            link.download = 'route-qr-code.png';
            link.click();

            showStatus('QR code downloaded!', 'success');
        }

        function shareViaWhatsApp() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            const route = window.lastCalculatedRoute;
            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;
            const symbol = getCurrencySymbol();
            const distUnit = getDistanceUnit();

            const message = `📍 Route from ${startInput} to ${endInput}\n📏 Distance: ${convertDistance(route.distance_km)} ${distUnit}\n⏱️ Duration: ${route.time}\n💰 Cost: ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}\n\nShared via Voyagr Navigation`;

            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');

            showStatus('Opening WhatsApp...', 'success');
        }

        function shareViaEmail() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            const route = window.lastCalculatedRoute;
            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;
            const symbol = getCurrencySymbol();
            const distUnit = getDistanceUnit();

            const subject = `Route: ${startInput} to ${endInput}`;
            const body = `I'm sharing a route with you:\n\nFrom: ${startInput}\nTo: ${endInput}\nDistance: ${convertDistance(route.distance_km)} ${distUnit}\nDuration: ${route.time}\nEstimated Cost: ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}\n\nShared via Voyagr Navigation`;

            const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.location.href = mailtoUrl;

            showStatus('Opening email client...', 'success');
        }

        // ===== ROUTE ANALYTICS FUNCTIONS =====
        function loadRouteAnalytics() {
            fetch('/api/trip-analytics')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        displayAnalytics(data);
                    } else {
                        showStatus('Failed to load analytics', 'error');
                    }
                })
                .catch(error => {
                    console.error('Analytics error:', error);
                    showStatus('Error loading analytics', 'error');
                });
        }

        function displayAnalytics(data) {
            const symbol = getCurrencySymbol();
            const distUnit = getDistanceUnit();

            // Update summary stats
            document.getElementById('totalTrips').textContent = data.total_trips || 0;
            document.getElementById('totalDistance').textContent = `${convertDistance(data.total_distance_km || 0)} ${distUnit}`;
            document.getElementById('totalCost').textContent = `${symbol}${(data.total_cost || 0).toFixed(2)}`;
            document.getElementById('avgDuration').textContent = `${data.avg_duration || 0} min`;

            // Update cost breakdown
            document.getElementById('totalFuelCost').textContent = `${symbol}${(data.total_fuel_cost || 0).toFixed(2)}`;
            document.getElementById('totalTollCost').textContent = `${symbol}${(data.total_toll_cost || 0).toFixed(2)}`;
            document.getElementById('totalCAZCost').textContent = `${symbol}${(data.total_caz_cost || 0).toFixed(2)}`;

            // Update time statistics
            const totalHours = Math.floor((data.total_time_minutes || 0) / 60);
            const totalMinutes = (data.total_time_minutes || 0) % 60;
            document.getElementById('totalTime').textContent = `${totalHours}h ${totalMinutes}m`;
            document.getElementById('avgSpeed').textContent = `${(data.avg_speed || 0).toFixed(1)} ${distUnit === 'km' ? 'km/h' : 'mph'}`;

            // Display most frequent routes
            const frequentRoutesList = document.getElementById('frequentRoutesList');
            if (data.frequent_routes && data.frequent_routes.length > 0) {
                frequentRoutesList.innerHTML = data.frequent_routes.map((route, idx) => `
                    <div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #FF5722;">
                        <div style="font-weight: 500; font-size: 13px; margin-bottom: 4px;">${idx + 1}. ${route.start} → ${route.end}</div>
                        <div style="font-size: 12px; color: #666;">
                            <span>🔄 ${route.count} trips</span> |
                            <span>📏 ${convertDistance(route.avg_distance)} ${distUnit}</span> |
                            <span>💰 ${symbol}${route.avg_cost.toFixed(2)}</span>
                        </div>
                    </div>
                `).join('');
            } else {
                frequentRoutesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trip history yet</div>';
            }
        }

        // ===== ADVANCED ROUTE PREFERENCES FUNCTIONS =====
        function saveRoutePreferences() {
            const preferences = {
                avoidHighways: document.getElementById('avoidHighways').checked,
                preferScenic: document.getElementById('preferScenic').checked,
                avoidTolls: document.getElementById('avoidTolls').checked,
                avoidCAZ: document.getElementById('avoidCAZ').checked,
                preferQuiet: document.getElementById('preferQuiet').checked,
                avoidUnpaved: document.getElementById('avoidUnpaved').checked,
                routeOptimization: document.getElementById('routeOptimization').value,
                maxDetour: parseInt(document.getElementById('maxDetour').value)
            };

            localStorage.setItem('routePreferences', JSON.stringify(preferences));
            showStatus('Route preferences saved!', 'success');
        }

        function loadRoutePreferences() {
            const saved = localStorage.getItem('routePreferences');
            if (saved) {
                const preferences = JSON.parse(saved);
                document.getElementById('avoidHighways').checked = preferences.avoidHighways || false;
                document.getElementById('preferScenic').checked = preferences.preferScenic || false;
                document.getElementById('avoidTolls').checked = preferences.avoidTolls || false;
                document.getElementById('avoidCAZ').checked = preferences.avoidCAZ || false;
                document.getElementById('preferQuiet').checked = preferences.preferQuiet || false;
                document.getElementById('avoidUnpaved').checked = preferences.avoidUnpaved || false;
                document.getElementById('routeOptimization').value = preferences.routeOptimization || 'fastest';
                document.getElementById('maxDetour').value = preferences.maxDetour || 20;
                updateDetourLabel();
            }
        }

        function updateDetourLabel() {
            const value = document.getElementById('maxDetour').value;
            document.getElementById('detourLabel').textContent = value + '%';
        }

        function getRoutePreferences() {
            const saved = localStorage.getItem('routePreferences');
            if (saved) {
                return JSON.parse(saved);
            }
            return {
                avoidHighways: false,
                preferScenic: false,
                avoidTolls: false,
                avoidCAZ: false,
                preferQuiet: false,
                avoidUnpaved: false,
                routeOptimization: 'fastest',
                maxDetour: 20
            };
        }

        // ===== ROUTE SAVING FUNCTIONS =====
        function saveCurrentRoute() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            const routeName = document.getElementById('routeName').value.trim();
            if (!routeName) {
                showStatus('Please enter a route name', 'error');
                return;
            }

            const route = window.lastCalculatedRoute;
            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;

            const savedRoute = {
                id: Date.now(),
                name: routeName,
                start: startInput,
                end: endInput,
                distance_km: route.distance_km,
                duration_minutes: route.time,
                fuel_cost: route.fuel_cost,
                toll_cost: route.toll_cost,
                caz_cost: route.caz_cost,
                geometry: route.geometry,
                timestamp: new Date().toISOString()
            };

            // Get existing saved routes
            let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
            savedRoutes.push(savedRoute);
            localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));

            document.getElementById('routeName').value = '';
            showStatus(`Route "${routeName}" saved!`, 'success');
            loadSavedRoutes();
        }

        function loadSavedRoutes() {
            const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
            const savedRoutesList = document.getElementById('savedRoutesList');

            if (savedRoutes.length === 0) {
                savedRoutesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No saved routes yet</div>';
                return;
            }

            const symbol = getCurrencySymbol();
            const distUnit = getDistanceUnit();

            savedRoutesList.innerHTML = savedRoutes.map(route => `
                <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #E91E63;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 500; font-size: 14px;">${route.name}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 4px;">📍 ${route.start} → ${route.end}</div>
                        </div>
                        <button onclick="deleteSavedRoute(${route.id})" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">✕</button>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                        📏 ${convertDistance(route.distance_km)} ${distUnit} | ⏱️ ${route.duration_minutes} | 💰 ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}
                    </div>
                    <button onclick="useSavedRoute(${route.id})" style="width: 100%; background: #E91E63; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 13px;">🚀 Use This Route</button>
                </div>
            `).join('');
        }

        function useSavedRoute(routeId) {
            const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
            const route = savedRoutes.find(r => r.id === routeId);

            if (route) {
                document.getElementById('start').value = route.start;
                document.getElementById('end').value = route.end;
                window.lastCalculatedRoute = {
                    distance_km: route.distance_km,
                    time: route.duration_minutes,
                    fuel_cost: route.fuel_cost,
                    toll_cost: route.toll_cost,
                    caz_cost: route.caz_cost,
                    geometry: route.geometry
                };
                showStatus(`Loaded route: ${route.name}`, 'success');
                switchTab('navigation');
            }
        }

        function deleteSavedRoute(routeId) {
            if (confirm('Delete this saved route?')) {
                let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
                savedRoutes = savedRoutes.filter(r => r.id !== routeId);
                localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
                showStatus('Route deleted', 'success');
                loadSavedRoutes();
            }
        }

        // ===== REAL-TIME TRAFFIC UPDATE FUNCTIONS =====
        function updateTrafficConditions() {
            if (!window.lastCalculatedRoute) {
                showStatus('No route calculated yet', 'error');
                return;
            }

            const startInput = document.getElementById('start').value;
            const endInput = document.getElementById('end').value;

            showStatus('Checking traffic conditions...', 'info');

            // Fetch traffic data from backend
            fetch('/api/traffic-conditions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start: startInput,
                    end: endInput
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayTrafficUpdate(data);
                } else {
                    showStatus('Could not fetch traffic data', 'error');
                }
            })
            .catch(error => {
                console.error('Traffic update error:', error);
                showStatus('Error updating traffic conditions', 'error');
            });
        }

        function displayTrafficUpdate(data) {
            const symbol = getCurrencySymbol();
            const distUnit = getDistanceUnit();

            // Update traffic status
            const trafficStatus = document.getElementById('trafficStatus');
            const now = new Date();
            const timeStr = now.toLocaleTimeString();
            trafficStatus.textContent = `Last updated: ${timeStr} | Conditions: ${data.traffic_level}`;

            // Update route information if traffic has changed
            if (data.updated_duration_minutes !== window.lastCalculatedRoute.time) {
                const oldTime = parseInt(window.lastCalculatedRoute.time);
                const newTime = data.updated_duration_minutes;
                const timeDiff = newTime - oldTime;
                const timeDiffStr = timeDiff > 0 ? `+${timeDiff}` : `${timeDiff}`;

                showStatus(`Traffic update: Duration changed from ${oldTime} to ${newTime} min (${timeDiffStr} min)`, 'warning');

                // Update route data
                window.lastCalculatedRoute.time = newTime;
                window.lastCalculatedRoute.traffic_level = data.traffic_level;
                window.lastCalculatedRoute.updated_at = new Date().toISOString();

                // Recalculate costs if distance changed
                if (data.updated_distance_km) {
                    window.lastCalculatedRoute.distance_km = data.updated_distance_km;
                }
            } else {
                showStatus(`Traffic conditions: ${data.traffic_level}`, 'success');
            }

            // Display traffic details
            const trafficDetails = `
                🚦 Traffic Level: ${data.traffic_level}
                📏 Distance: ${convertDistance(data.updated_distance_km || window.lastCalculatedRoute.distance_km)} ${distUnit}
                ⏱️ Duration: ${data.updated_duration_minutes} minutes
                🚗 Congestion: ${data.congestion_percentage}%
                ⚠️ Incidents: ${data.incidents_count}
            `;

            console.log('Traffic Update:', trafficDetails);
        }

        // Auto-update traffic every 5 minutes during navigation
        function startTrafficMonitoring() {
            if (window.trafficMonitoringInterval) {
                clearInterval(window.trafficMonitoringInterval);
            }

            window.trafficMonitoringInterval = setInterval(() => {
                if (window.lastCalculatedRoute && document.getElementById('start').value) {
                    updateTrafficConditions();
                }
            }, 5 * 60 * 1000); // Update every 5 minutes

            showStatus('Traffic monitoring started', 'success');
        }

        function stopTrafficMonitoring() {
            if (window.trafficMonitoringInterval) {
                clearInterval(window.trafficMonitoringInterval);
                window.trafficMonitoringInterval = null;
                showStatus('Traffic monitoring stopped', 'info');
            }
        }

        // Map click handler for location picker
        map.on('click', (e) => {
            if (mapPickerMode) {
                const lat = e.latlng.lat;
                const lon = e.latlng.lng;
                document.getElementById(mapPickerMode).value = `${lat},${lon}`;

                // Add marker
                if (mapPickerMode === 'start' && startMarker) map.removeLayer(startMarker);
                if (mapPickerMode === 'end' && endMarker) map.removeLayer(endMarker);

                const marker = L.circleMarker([lat, lon], {
                    radius: 8,
                    fillColor: mapPickerMode === 'start' ? '#00ff00' : '#ff0000',
                    color: '#000',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                if (mapPickerMode === 'start') {
                    startMarker = marker;
                } else {
                    endMarker = marker;
                }

                mapPickerMode = null;
                showStatus('Location selected!', 'success');
                collapseBottomSheet();
            }
        });

        // Decode polyline (for OSRM format)
        function decodePolyline(encoded) {
            if (!encoded) return [];
            const inv = 1.0 / 1e5;
            const decoded = [];
            let previous = [0, 0];
            let i = 0;

            while (i < encoded.length) {
                let ll = [0, 0];
                for (let j = 0; j < 2; j++) {
                    let shift = 0;
                    let result = 0;
                    let byte = 0;
                    do {
                        byte = encoded.charCodeAt(i++) - 63;
                        result |= (byte & 0x1f) << shift;
                        shift += 5;
                    } while (byte >= 0x20);
                    ll[j] = previous[j] + (result & 1 ? ~(result >> 1) : result >> 1);
                    previous[j] = ll[j];
                }
                decoded.push([ll[0] * inv, ll[1] * inv]);
            }
            return decoded;
        }

        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
        }

        async function calculateRoute() {
            const startInput = document.getElementById('start');
            const endInput = document.getElementById('end');

            if (!startInput || !endInput) {
                showStatus('Error: Input fields not found', 'error');
                return;
            }

            const start = startInput.value ? startInput.value.trim() : '';
            const end = endInput.value ? endInput.value.trim() : '';

            if (!start || !end) {
                showStatus('Please enter both start and end locations', 'error');
                return;
            }

            // Prevent multiple simultaneous geocoding requests
            if (isGeocoding) {
                showStatus('⏳ Geocoding in progress...', 'loading');
                return;
            }

            // Geocode locations if needed
            let geocodedResult = await geocodeLocations(start, end);
            if (!geocodedResult) {
                return; // Error already shown by geocodeLocations
            }

            const geocodedStart = geocodedResult.start;
            const geocodedEnd = geocodedResult.end;

            showStatus('📍 Calculating route...', 'loading');

            fetch('/api/route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    start: geocodedStart,
                    end: geocodedEnd,
                    routing_mode: currentRoutingMode,
                    vehicle_type: currentVehicleType
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Parse coordinates
                    try {
                        const startParts = geocodedStart.split(',');
                        const endParts = geocodedEnd.split(',');

                        if (startParts.length < 2 || endParts.length < 2) {
                            showStatus('Error: Invalid coordinates format', 'error');
                            return;
                        }

                        const startCoords = [parseFloat(startParts[0].trim()), parseFloat(startParts[1].trim())];
                        const endCoords = [parseFloat(endParts[0].trim()), parseFloat(endParts[1].trim())];

                        if (isNaN(startCoords[0]) || isNaN(startCoords[1]) || isNaN(endCoords[0]) || isNaN(endCoords[1])) {
                            showStatus('Error: Invalid coordinates', 'error');
                            return;
                        }

                        // Clear previous markers and route
                        if (startMarker) map.removeLayer(startMarker);
                        if (endMarker) map.removeLayer(endMarker);
                        if (routeLayer) map.removeLayer(routeLayer);

                        // Add markers
                        startMarker = L.circleMarker([startCoords[0], startCoords[1]], {
                            radius: 8,
                            fillColor: '#00ff00',
                            color: '#000',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).addTo(map).bindPopup('Start Location');

                        endMarker = L.circleMarker([endCoords[0], endCoords[1]], {
                            radius: 8,
                            fillColor: '#ff0000',
                            color: '#000',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).addTo(map).bindPopup('End Location');

                        // Draw route line
                        let routePath = [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];

                        // If we have geometry from the routing service, use it
                        if (data.geometry) {
                            try {
                                // Decode polyline geometry
                                routePath = decodePolyline(data.geometry);
                                console.log('Route path decoded:', routePath.length, 'points');
                            } catch (e) {
                                console.log('Could not decode geometry, using straight line:', e);
                            }
                        }

                        routeLayer = L.polyline(routePath, {
                            color: '#667eea',
                            weight: 4,
                            opacity: 0.8
                        }).addTo(map);

                        // Fit map to route with smooth animation
                        const bounds = routeLayer.getBounds().pad(0.1);
                        const center = bounds.getCenter();
                        const zoomLevel = map.getBoundsZoom(bounds);

                        // Use smooth animation to fit route
                        map.flyTo(center, zoomLevel, {
                            duration: ZOOM_ANIMATION_DURATION,
                            easeLinearity: 0.25
                        });

                        lastZoomLevel = zoomLevel;

                        // Update info
                        updateTripInfo(data.distance, data.time, data.fuel_cost || '-', data.toll_cost || '-');
                        showStatus('Route calculated successfully! (' + data.source + ')', 'success');

                        // Store route data for navigation
                        window.lastCalculatedRoute = data;

                        // Use real routes from backend if available, otherwise use main route
                        if (data.routes && data.routes.length > 0) {
                            // Real routes from routing engine
                            routeOptions = data.routes.map(route => ({
                                id: route.id,
                                name: route.name,
                                distance_km: route.distance_km,
                                duration_minutes: route.duration_minutes,
                                fuel_cost: route.fuel_cost,
                                toll_cost: route.toll_cost,
                                caz_cost: route.caz_cost,
                                polyline: decodePolyline(route.geometry || ''),
                                geometry: route.geometry
                            }));
                            console.log(`[Route Comparison] Loaded ${routeOptions.length} real routes from ${data.source}`);
                        } else {
                            // Fallback: single route (for backward compatibility)
                            routeOptions = [
                                {
                                    id: 1,
                                    name: 'Route',
                                    distance_km: parseFloat(data.distance) || 0,
                                    duration_minutes: parseInt(data.time) || 0,
                                    fuel_cost: data.fuel_cost || 0,
                                    toll_cost: data.toll_cost || 0,
                                    caz_cost: data.caz_cost || 0,
                                    polyline: routePath,
                                    geometry: data.geometry
                                }
                            ];
                            console.log('[Route Comparison] Using single route (fallback)');
                        }

                        // Sort by preference
                        sortRoutesByPreference();

                        // Show start navigation button
                        const startNavBtn = document.getElementById('startNavBtn');
                        if (startNavBtn) {
                            startNavBtn.style.display = 'block';
                        }

                        // Send notification
                        sendNotification('Route Ready', `${data.distance} in ${data.time}. Ready to navigate?`, 'success');
                    } catch (e) {
                        showStatus('Error parsing coordinates: ' + e.message, 'error');
                        console.error('Coordinate parsing error:', e);
                    }
                } else {
                    showStatus('Error: ' + data.error, 'error');
                }
            })
            .catch(error => {
                showStatus('Error: ' + error.message, 'error');
            });
        }

        function startNavigation() {
            if (!window.lastCalculatedRoute) {
                showStatus('Please calculate a route first', 'error');
                return;
            }
            startTurnByTurnNavigation(window.lastCalculatedRoute);
            document.getElementById('startNavBtn').style.display = 'none';
        }

        function clearForm() {
            document.getElementById('start').value = '';
            document.getElementById('end').value = '';
            document.getElementById('result').classList.remove('show');
            document.getElementById('status').className = 'status';

            if (startMarker) map.removeLayer(startMarker);
            if (endMarker) map.removeLayer(endMarker);
            if (routeLayer) map.removeLayer(routeLayer);

            // Use smooth animation to return to default view
            map.flyTo([51.5074, -0.1278], 13, {
                duration: ZOOM_ANIMATION_DURATION,
                easeLinearity: 0.25
            });
            lastZoomLevel = 13;
        }

        // ===== PHASE 2 FEATURES: SEARCH HISTORY & FAVORITES =====

        // Load and display search history
        function showSearchHistory() {
            fetch('/api/search-history')
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.history.length > 0) {
                        const dropdown = document.getElementById('searchHistoryDropdown');
                        dropdown.innerHTML = '';

                        data.history.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'search-history-item';
                            div.innerHTML = `
                                <div class="search-history-item-text">${item.query}</div>
                                ${item.result_name ? `<div class="search-history-item-meta">${item.result_name}</div>` : ''}
                            `;
                            div.onclick = () => {
                                document.getElementById('end').value = item.query;
                                dropdown.classList.remove('show');
                            };
                            dropdown.appendChild(div);
                        });

                        dropdown.classList.add('show');
                    }
                })
                .catch(error => console.error('Error loading search history:', error));
        }

        // Add search to history
        function addToSearchHistory(query, resultName, lat, lon) {
            fetch('/api/search-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, result_name: resultName, lat, lon })
            })
            .catch(error => console.error('Error adding to search history:', error));
        }

        // Load and display favorite locations
        function loadFavorites() {
            fetch('/api/favorites')
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.favorites.length > 0) {
                        const section = document.getElementById('favoritesSection');
                        const grid = document.getElementById('favoritesGrid');
                        grid.innerHTML = '';

                        data.favorites.forEach(fav => {
                            const btn = document.createElement('button');
                            btn.className = 'favorite-btn';
                            btn.innerHTML = `
                                <span class="favorite-btn-name">${fav.name}</span>
                                <span class="favorite-btn-category">${fav.category}</span>
                            `;
                            btn.onclick = () => {
                                document.getElementById('end').value = `${fav.lat},${fav.lon}`;
                                addToSearchHistory(fav.name, fav.name, fav.lat, fav.lon);
                                expandBottomSheet();
                            };
                            grid.appendChild(btn);
                        });

                        section.style.display = 'block';
                    }
                })
                .catch(error => console.error('Error loading favorites:', error));
        }

        // Add current location to favorites
        function addCurrentToFavorites() {
            const name = prompt('Enter name for this location (e.g., Home, Work):');
            if (!name) return;

            const category = prompt('Enter category (e.g., home, work, shopping):', 'location');

            fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    address: document.getElementById('end').value,
                    lat: currentLat,
                    lon: currentLon,
                    category: category || 'location'
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showStatus(`Added ${name} to favorites!`, 'success');
                    loadFavorites();
                } else {
                    showStatus('Error adding to favorites', 'error');
                }
            })
            .catch(error => {
                showStatus('Error: ' + error.message, 'error');
            });
        }

        // ===== PHASE 2 FEATURES: LANE GUIDANCE =====

        function updateLaneGuidance(lat, lon, heading, maneuver) {
            fetch(`/api/lane-guidance?lat=${lat}&lon=${lon}&heading=${heading}&maneuver=${maneuver}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const display = document.getElementById('laneGuidanceDisplay');
                        const visual = document.getElementById('laneVisual');
                        const text = document.getElementById('laneGuidanceText');

                        visual.innerHTML = '';
                        for (let i = 1; i <= data.total_lanes; i++) {
                            const lane = document.createElement('div');
                            lane.className = 'lane-indicator';
                            if (i === data.current_lane) lane.classList.add('current');
                            if (i === data.recommended_lane) lane.classList.add('recommended');
                            lane.textContent = i;
                            visual.appendChild(lane);
                        }

                        text.textContent = data.guidance_text;
                        display.classList.add('show');
                    }
                })
                .catch(error => console.error('Error updating lane guidance:', error));
        }

        // ===== PHASE 2 FEATURES: SPEED WARNINGS =====

        function updateSpeedWarning(lat, lon, currentSpeed, roadType) {
            fetch(`/api/speed-warnings?lat=${lat}&lon=${lon}&speed=${currentSpeed}&road_type=${roadType}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const display = document.getElementById('speedWarningDisplay');
                        const text = document.getElementById('speedWarningText');
                        const details = document.getElementById('speedWarningDetails');

                        display.className = `speed-warning-display show ${data.status}`;
                        text.textContent = data.message;
                        details.textContent = `Limit: ${data.speed_limit_mph} mph | Current: ${data.current_speed_mph} mph`;
                    }
                })
                .catch(error => console.error('Error updating speed warning:', error));
        }

        // ===== DISTANCE CALCULATION & TURN DETECTION =====

        function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
            /**
             * Calculate distance between two coordinates using Haversine formula.
             * Returns distance in meters.
             */
            const R = 6371000; // Earth's radius in meters
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        function detectUpcomingTurn(userLat, userLon) {
            /**
             * Detect if user is approaching an upcoming turn in the route.
             * Returns object with distance to next turn or null if no turn ahead.
             */
            if (!routeInProgress || !routePolyline || routePolyline.length === 0) {
                return null;
            }

            // Find the closest point on the route to the user
            let closestDistance = Infinity;
            let closestIndex = 0;

            for (let i = 0; i < routePolyline.length; i++) {
                const point = routePolyline[i];
                const distance = calculateHaversineDistance(userLat, userLon, point[0], point[1]);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = i;
                }
            }

            // Look ahead for the next turn point (typically every 50-100 points)
            // For now, we'll use the next significant waypoint
            const lookAheadDistance = 100; // meters
            let nextTurnIndex = closestIndex;

            // Find next point that's at least lookAheadDistance away
            for (let i = closestIndex + 1; i < routePolyline.length; i++) {
                const point = routePolyline[i];
                const distance = calculateHaversineDistance(userLat, userLon, point[0], point[1]);
                if (distance > lookAheadDistance) {
                    nextTurnIndex = i;
                    break;
                }
            }

            if (nextTurnIndex === closestIndex) {
                return null; // No turn ahead
            }

            const nextTurnPoint = routePolyline[nextTurnIndex];
            const distanceToTurn = calculateHaversineDistance(
                userLat, userLon,
                nextTurnPoint[0], nextTurnPoint[1]
            );

            return {
                distance: distanceToTurn,
                lat: nextTurnPoint[0],
                lon: nextTurnPoint[1],
                index: nextTurnIndex
            };
        }

        // ===== VEHICLE TYPE & ROUTING MODE MANAGEMENT =====

        function updateVehicleType() {
            const select = document.getElementById('vehicleType');
            currentVehicleType = select.value;
            localStorage.setItem('vehicleType', currentVehicleType);

            // Update user marker icon
            updateUserMarkerIcon();

            console.log('[Vehicle] Type changed to:', currentVehicleType);
            showStatus(`🚗 Vehicle type: ${select.options[select.selectedIndex].text}`, 'info');
        }

        function setRoutingMode(mode) {
            currentRoutingMode = mode;
            localStorage.setItem('routingMode', mode);

            // Update button states
            document.getElementById('routingAuto').classList.toggle('active', mode === 'auto');
            document.getElementById('routingPedestrian').classList.toggle('active', mode === 'pedestrian');
            document.getElementById('routingBicycle').classList.toggle('active', mode === 'bicycle');

            // Update vehicle type selector visibility
            if (mode === 'pedestrian') {
                document.getElementById('vehicleType').style.display = 'none';
                currentVehicleType = 'pedestrian';
            } else if (mode === 'bicycle') {
                document.getElementById('vehicleType').style.display = 'none';
                currentVehicleType = 'bicycle';
            } else {
                document.getElementById('vehicleType').style.display = 'block';
                currentVehicleType = document.getElementById('vehicleType').value;
            }

            // Update user marker icon
            updateUserMarkerIcon();

            console.log('[Routing] Mode changed to:', mode);
            const modeNames = { 'auto': '🚗 Auto', 'pedestrian': '🚶 Pedestrian', 'bicycle': '🚴 Bicycle' };
            showStatus(`${modeNames[mode]} mode`, 'info');
        }

        function updateUserMarkerIcon() {
            // Determine which icon to use
            let iconEmoji = vehicleIcons[currentRoutingMode] || vehicleIcons[currentVehicleType] || '🚗';

            // Update the marker if it exists
            if (currentUserMarker) {
                map.removeLayer(currentUserMarker);
                currentUserMarker = null;
            }

            currentUserMarkerIcon = iconEmoji;
            console.log('[Marker] Icon updated to:', iconEmoji);
        }

        function createVehicleMarker(lat, lon, speed, accuracy) {
            // Create a custom marker with vehicle icon
            const iconEmoji = vehicleIcons[currentRoutingMode] || vehicleIcons[currentVehicleType] || '🚗';

            // Create a div element for the marker
            const markerDiv = document.createElement('div');
            markerDiv.style.fontSize = '24px';
            markerDiv.style.textAlign = 'center';
            markerDiv.style.width = '30px';
            markerDiv.style.height = '30px';
            markerDiv.innerHTML = iconEmoji;

            // Create custom icon
            const customIcon = L.divIcon({
                html: markerDiv.innerHTML,
                iconSize: [30, 30],
                className: 'vehicle-marker-icon'
            });

            // Create marker with custom icon
            const marker = L.marker([lat, lon], { icon: customIcon })
                .bindPopup(`${iconEmoji} Current Position<br>Speed: ${(speed * 3.6).toFixed(1)} km/h<br>Accuracy: ${accuracy.toFixed(0)}m`);

            return marker;
        }

        // ===== SMART ZOOM FUNCTIONALITY =====

        function calculateSmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
            /**
             * Calculate optimal zoom level based on:
             * - Distance to next turn (highest priority)
             * - Current speed
             * - Road type
             */
            let zoomLevel = ZOOM_LEVELS.urban_low_speed; // Default

            // Priority 1: Turn-based zoom (highest priority)
            if (distanceToNextTurn !== null && distanceToNextTurn < TURN_ZOOM_THRESHOLD) {
                // Zoom in for turn details when within 500m
                zoomLevel = ZOOM_LEVELS.turn_ahead;
                return zoomLevel;
            }

            // Priority 2: Speed-based zoom
            if (speedMph > 100) {
                // Motorway - zoom out to see more ahead
                zoomLevel = ZOOM_LEVELS.motorway_high_speed;
            } else if (speedMph > 50) {
                // Main road - medium zoom
                zoomLevel = ZOOM_LEVELS.main_road_medium_speed;
            } else if (speedMph > 20) {
                // Urban - normal zoom
                zoomLevel = ZOOM_LEVELS.urban_low_speed;
            } else {
                // Parking/very slow - zoom in
                zoomLevel = ZOOM_LEVELS.parking_very_low_speed;
            }

            return zoomLevel;
        }

        function applySmartZoomWithAnimation(speedMph, distanceToNextTurn = null, roadType = 'urban', userLat = null, userLon = null) {
            if (!smartZoomEnabled || !routeInProgress) return;

            const newZoomLevel = calculateSmartZoom(speedMph, distanceToNextTurn, roadType);

            // Only update if zoom level changed significantly
            if (Math.abs(newZoomLevel - lastZoomLevel) >= 1) {
                // Use smooth animation with flyTo
                if (userLat !== null && userLon !== null) {
                    map.flyTo([userLat, userLon], newZoomLevel, {
                        duration: ZOOM_ANIMATION_DURATION,
                        easeLinearity: 0.25
                    });
                } else {
                    // Fallback if coordinates not provided
                    map.setZoom(newZoomLevel);
                }

                lastZoomLevel = newZoomLevel;

                // Log zoom reason
                if (distanceToNextTurn !== null && distanceToNextTurn < TURN_ZOOM_THRESHOLD) {
                    console.log('[SmartZoom] Turn-based zoom to level', newZoomLevel, '- Turn in', distanceToNextTurn.toFixed(0), 'm');
                    lastTurnZoomApplied = true;
                } else {
                    console.log('[SmartZoom] Speed-based zoom to level', newZoomLevel, 'for speed', speedMph.toFixed(1), 'mph');
                    lastTurnZoomApplied = false;
                }
            }
        }

        // Legacy function for backward compatibility
        function applySmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
            applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, currentLat, currentLon);
        }

        function toggleSmartZoom() {
            smartZoomEnabled = !smartZoomEnabled;
            const btn = document.getElementById('smartZoomToggle');
            if (btn) {
                btn.classList.toggle('active', smartZoomEnabled);
            }
            localStorage.setItem('smartZoomEnabled', smartZoomEnabled ? '1' : '0');
            showStatus(`🔍 Smart Zoom ${smartZoomEnabled ? 'enabled' : 'disabled'}`, 'info');
            console.log('[SmartZoom] Toggled to:', smartZoomEnabled);
        }

        // ===== VARIABLE SPEED LIMIT DETECTION =====

        function updateVariableSpeedLimit(lat, lon, roadType = 'motorway', vehicleType = 'car') {
            fetch(`/api/speed-limit?lat=${lat}&lon=${lon}&road_type=${roadType}&vehicle_type=${vehicleType}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const display = document.getElementById('variableSpeedDisplay');
                        const limitEl = document.getElementById('variableSpeedLimit');
                        const infoEl = document.getElementById('variableSpeedInfo');

                        const speedData = data.data;
                        limitEl.textContent = `${speedData.speed_limit_mph} mph`;

                        let infoHtml = '';
                        if (speedData.is_smart_motorway) {
                            infoHtml += `<div class="variable-speed-info-item">🚗 Smart Motorway: ${speedData.motorway_name}</div>`;
                        }
                        infoHtml += `<div class="variable-speed-info-item">Road: ${speedData.road_type.replace(/_/g, ' ')}</div>`;

                        infoEl.innerHTML = infoHtml;
                        display.classList.add('show');
                    }
                })
                .catch(error => console.error('Error updating variable speed limit:', error));
        }

        function checkSpeedViolation(currentSpeedMph, speedLimitMph, threshold = 5) {
            fetch('/api/speed-violation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_speed_mph: currentSpeedMph,
                    speed_limit_mph: speedLimitMph,
                    warning_threshold_mph: threshold
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const violation = data.data;
                        console.log(`[Speed] Status: ${violation.status}, Diff: ${violation.speed_diff_mph} mph`);

                        // Announce speed violations via voice if enabled
                        if (violation.status === 'exceeding' && voiceRecognition) {
                            speakMessage(`⚠️ Exceeding speed limit by ${violation.speed_diff_mph} mph`);
                        }
                    }
                })
                .catch(error => console.error('Error checking speed violation:', error));
        }

        // Initialize Phase 2 features on page load
        window.addEventListener('load', () => {
            loadFavorites();
            initPhase3Features();
        });

        // ===== PHASE 3 FEATURES: GESTURE CONTROL =====

        let lastAcceleration = { x: 0, y: 0, z: 0 };
        let shakeCount = 0;
        let lastShakeTime = 0;
        let gestureEnabled = true;
        let gestureSensitivity = 'medium';
        let gestureAction = 'recalculate';

        function initPhase3Features() {
            // Load gesture settings
            fetch('/api/app-settings')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        gestureEnabled = data.settings.gesture_enabled;
                        gestureSensitivity = data.settings.gesture_sensitivity;
                        gestureAction = data.settings.gesture_action;

                        // Update UI
                        document.getElementById('gestureEnabled').checked = gestureEnabled;
                        document.getElementById('gestureSensitivity').value = gestureSensitivity;
                        document.getElementById('gestureAction').value = gestureAction;
                        document.getElementById('gestureSettings').style.display = gestureEnabled ? 'block' : 'none';

                        // Initialize gesture detection
                        if (gestureEnabled && 'DeviceMotionEvent' in window) {
                            window.addEventListener('devicemotion', handleDeviceMotion);
                        }
                    }
                })
                .catch(error => console.error('Error loading app settings:', error));

            // Initialize battery monitoring
            if ('getBattery' in navigator) {
                navigator.getBattery().then(battery => {
                    updateBatteryStatus(battery);
                    battery.addEventListener('levelchange', () => updateBatteryStatus(battery));
                    battery.addEventListener('chargingchange', () => updateBatteryStatus(battery));
                });
            }

            // Load ML predictions
            loadMLPredictions();
        }

        function handleDeviceMotion(event) {
            if (!gestureEnabled) return;

            const accel = event.acceleration;
            if (!accel) return;

            // Calculate acceleration magnitude
            const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);

            // Sensitivity thresholds
            const thresholds = {
                'low': 20,
                'medium': 15,
                'high': 10
            };
            const threshold = thresholds[gestureSensitivity] || 15;

            // Detect shake
            if (magnitude > threshold) {
                const now = Date.now();
                if (now - lastShakeTime < 1000) {
                    shakeCount++;
                    if (shakeCount >= 2) {
                        triggerGestureAction();
                        shakeCount = 0;
                    }
                } else {
                    shakeCount = 1;
                }
                lastShakeTime = now;
            }
        }

        function triggerGestureAction() {
            // Show gesture indicator
            const indicator = document.getElementById('gestureIndicator');
            indicator.classList.add('show');
            setTimeout(() => indicator.classList.remove('show'), 500);

            // Trigger haptic feedback if available
            if ('vibrate' in navigator) {
                navigator.vibrate(100);
            }

            // Log gesture event
            fetch('/api/gesture-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gesture_type: 'shake', action: gestureAction })
            }).catch(error => console.error('Error logging gesture:', error));

            // Execute action
            switch (gestureAction) {
                case 'recalculate':
                    showStatus('🔄 Recalculating route...', 'info');
                    calculateRoute();
                    break;
                case 'report':
                    showStatus('📍 Report hazard mode activated', 'info');
                    // Would open hazard reporting UI
                    break;
                case 'clear':
                    showStatus('🗑️ Route cleared', 'info');
                    clearForm();
                    break;
            }
        }

        function toggleGestureControl() {
            gestureEnabled = !gestureEnabled;
            document.getElementById('gestureSettings').style.display = gestureEnabled ? 'block' : 'none';

            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gesture_enabled: gestureEnabled })
            }).catch(error => console.error('Error updating gesture setting:', error));

            if (gestureEnabled && 'DeviceMotionEvent' in window) {
                window.addEventListener('devicemotion', handleDeviceMotion);
                showStatus('✅ Gesture control enabled', 'success');
            } else {
                window.removeEventListener('devicemotion', handleDeviceMotion);
                showStatus('❌ Gesture control disabled', 'info');
            }
        }

        function updateGestureSensitivity() {
            gestureSensitivity = document.getElementById('gestureSensitivity').value;
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gesture_sensitivity: gestureSensitivity })
            }).catch(error => console.error('Error updating gesture sensitivity:', error));
        }

        function updateGestureAction() {
            gestureAction = document.getElementById('gestureAction').value;
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gesture_action: gestureAction })
            }).catch(error => console.error('Error updating gesture action:', error));
        }

        // ===== PHASE 3 FEATURES: BATTERY SAVING MODE =====

        let batterySavingMode = false;
        let originalGPSFrequency = 1000; // ms

        function updateBatteryStatus(battery) {
            const level = Math.round(battery.level * 100);
            const indicator = document.getElementById('batteryIndicator');

            indicator.style.display = 'block';
            document.getElementById('batteryLevel').textContent = level + '%';

            // Update battery status class
            indicator.className = 'battery-indicator';
            if (level < 20) {
                indicator.classList.add('low');
            } else if (level < 50) {
                indicator.classList.add('medium');
            } else {
                indicator.classList.add('high');
            }

            // Auto-enable battery saving if low
            if (level < 15 && !batterySavingMode) {
                enableBatterySavingMode();
            }
        }

        function toggleBatterySavingMode() {
            batterySavingMode = !batterySavingMode;
            if (batterySavingMode) {
                enableBatterySavingMode();
            } else {
                disableBatterySavingMode();
            }
        }

        function enableBatterySavingMode() {
            batterySavingMode = true;
            document.getElementById('batterySavingMode').checked = true;

            // Reduce GPS update frequency
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = navigator.geolocation.watchPosition(
                    (position) => {
                        // GPS callback - will be handled by existing tracking
                    },
                    (error) => console.error('GPS error:', error),
                    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
                );
            }

            // Disable animations
            document.body.style.animation = 'none';
            document.querySelectorAll('[style*="animation"]').forEach(el => {
                el.style.animation = 'none';
            });

            showStatus('🔋 Battery saving mode enabled', 'success');
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ battery_saving_mode: 1 })
            }).catch(error => console.error('Error updating battery mode:', error));
        }

        function disableBatterySavingMode() {
            batterySavingMode = false;
            document.getElementById('batterySavingMode').checked = false;

            // Restore GPS update frequency
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = navigator.geolocation.watchPosition(
                    (position) => {
                        // GPS callback
                    },
                    (error) => console.error('GPS error:', error),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }

            // Re-enable animations
            document.body.style.animation = '';

            showStatus('🔋 Battery saving mode disabled', 'info');
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ battery_saving_mode: 0 })
            }).catch(error => console.error('Error updating battery mode:', error));
        }

        // ===== PHASE 3 FEATURES: MAP THEMES =====

        let currentMapTheme = 'standard';

        function setMapTheme(theme) {
            currentMapTheme = theme;

            // Update UI
            document.querySelectorAll('.theme-option').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.closest('.theme-option').classList.add('active');

            // Apply theme to map
            const tileUrls = {
                'standard': 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'satellite': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                'dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            };

            // Remove existing tile layer
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    map.removeLayer(layer);
                }
            });

            // Add new tile layer
            L.tileLayer(tileUrls[theme], {
                attribution: '© Map contributors',
                maxZoom: 19
            }).addTo(map);

            showStatus(`🗺️ Map theme changed to ${theme}`, 'success');

            // Save preference
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ map_theme: theme })
            }).catch(error => console.error('Error updating map theme:', error));
        }

        // ===== PHASE 3 FEATURES: ML PREDICTIONS =====

        function loadMLPredictions() {
            fetch('/api/ml-predictions')
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.predictions.length > 0) {
                        const section = document.getElementById('mlPredictionsSection');
                        const list = document.getElementById('mlPredictionsList');
                        list.innerHTML = '';

                        data.predictions.forEach(pred => {
                            const item = document.createElement('div');
                            item.className = 'ml-prediction-item';
                            item.innerHTML = `
                                <span class="ml-prediction-label">${pred.label}</span>
                                <span class="ml-prediction-details">${pred.details}</span>
                            `;
                            item.onclick = () => {
                                document.getElementById('start').value = pred.start_address;
                                document.getElementById('end').value = pred.end_address;
                                calculateRoute();
                            };
                            list.appendChild(item);
                        });

                        section.classList.add('show');
                    }
                })
                .catch(error => console.error('Error loading ML predictions:', error));
        }

        function toggleMLPredictions() {
            const enabled = document.getElementById('mlPredictionsEnabled').checked;
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ml_predictions_enabled: enabled ? 1 : 0 })
            }).catch(error => console.error('Error updating ML predictions:', error));

            if (enabled) {
                loadMLPredictions();
                showStatus('🤖 Smart predictions enabled', 'success');
            } else {
                document.getElementById('mlPredictionsSection').classList.remove('show');
                showStatus('🤖 Smart predictions disabled', 'info');
            }
        }

        // PWA Service Worker Registration
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(registration => {
                        console.log('[PWA] Service Worker registered:', registration);

                        // Check for updates periodically
                        setInterval(() => {
                            registration.update();
                        }, 60000); // Check every minute
                    })
                    .catch(error => {
                        console.log('[PWA] Service Worker registration failed:', error);
                    });
            });

            // ===== PHASE 2: Handle service worker updates with smart reload =====
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[PWA] New service worker activated');

                // Check if navigation is in progress
                if (routeInProgress) {
                    // Queue update for after navigation
                    updatePending = true;
                    showStatus('✅ Update available. Will apply after navigation.', 'info');
                } else {
                    // Safe to reload immediately
                    showStatus('🔄 Applying app update...', 'success');
                    // Save state before reload
                    saveAppState();
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            });
        }

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Request persistent storage
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(persistent => {
                console.log('[PWA] Persistent storage:', persistent ? 'granted' : 'denied');
            });
        }

        // ===== PHASE 2: Restore app state on page load =====
        window.addEventListener('load', () => {
            restoreAppState();
        });

        // ===== PHASE 3: Initialize battery monitoring =====
        initBatteryMonitoring();

        // ===== GPS TRACKING SYSTEM =====
        let gpsWatchId = null;
        let currentUserMarker = null;
        let isTrackingActive = false;
        let trackingHistory = [];
        let routeStarted = false;
        let routeInProgress = false;

        // ===== TURN-BY-TURN NAVIGATION =====
        let currentRouteSteps = [];
        let currentStepIndex = 0;
        let nextManeuverDistance = 0;
        let routePolyline = null;

        // ===== NOTIFICATIONS SYSTEM =====
        let notificationQueue = [];
        let lastNotificationTime = 0;
        const NOTIFICATION_THROTTLE_MS = 3000; // Prevent notification spam

        // ===== LIVE DATA REFRESH SYSTEM (PHASE 1) =====
        let trafficRefreshInterval = null;
        let etaRefreshInterval = null;
        let weatherRefreshInterval = null;
        let hazardRefreshInterval = null;

        const REFRESH_INTERVALS = {
            traffic_navigation: 300000,    // 5 minutes during navigation
            traffic_idle: 900000,          // 15 minutes when idle
            eta: 30000,                    // 30 seconds during navigation
            weather_navigation: 1800000,   // 30 minutes during navigation
            weather_idle: 3600000,         // 60 minutes when idle
            hazards_navigation: 300000,    // 5 minutes during navigation
            hazards_idle: 600000           // 10 minutes when idle
        };

        // ===== PWA AUTO-RELOAD SYSTEM (PHASE 2) =====
        let updatePending = false;
        let appStateBeforeReload = null;

        // ===== BATTERY-AWARE REFRESH (PHASE 3) =====
        let currentBatteryLevel = 1.0;
        let batteryStatusMonitor = null;

        // ===== VOICE CONTROL SYSTEM =====
        let voiceRecognition = null;
        let isListening = false;
        let currentLat = 51.5074;
        let currentLon = -0.1278;

        // ===== AUTO GPS LOCATION FEATURE =====
        let autoGpsEnabled = false;
        let autoGpsLocationMonitor = null;
        const AUTO_GPS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

        // ===== VEHICLE TYPE & ROUTING MODE =====
        let currentVehicleType = 'petrol_diesel';
        let currentRoutingMode = 'auto';
        let currentUserMarkerIcon = null;

        // Vehicle icon mapping
        const vehicleIcons = {
            'petrol_diesel': '🚗',
            'electric': '⚡',
            'motorcycle': '🏍️',
            'truck': '🚚',
            'van': '🚐',
            'bicycle': '🚴',
            'pedestrian': '🚶'
        };

        // ===== SMART ZOOM VARIABLES =====
        let smartZoomEnabled = true;
        let lastZoomLevel = 16;
        let lastTurnZoomApplied = false;
        const ZOOM_LEVELS = {
            'motorway_high_speed': 14,      // > 100 km/h
            'main_road_medium_speed': 15,   // 50-100 km/h
            'urban_low_speed': 16,          // 20-50 km/h
            'parking_very_low_speed': 17,   // < 20 km/h
            'turn_ahead': 18                 // Upcoming turn
        };
        const TURN_ZOOM_THRESHOLD = 500;    // Zoom in when within 500m of turn
        const ZOOM_ANIMATION_DURATION = 0.5; // 500ms smooth animation

        // ===== GEOCODING FEATURE =====
        let geocodingCache = {};
        const GEOCODING_CACHE_KEY = 'voyagr_geocoding_cache';
        const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
        const NOMINATIM_REVERSE_API = 'https://nominatim.openstreetmap.org/reverse';
        let isGeocoding = false;

        // Initialize Web Speech API
        function initVoiceRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.log('[Voice] Web Speech API not supported');
                document.getElementById('voiceStatus').textContent = '❌ Voice not supported in this browser';
                return false;
            }

            voiceRecognition = new SpeechRecognition();
            voiceRecognition.continuous = false;
            voiceRecognition.interimResults = true;
            voiceRecognition.lang = 'en-US';

            voiceRecognition.onstart = () => {
                console.log('[Voice] Listening started');
                document.getElementById('voiceStatus').textContent = '🎤 Listening...';
                document.getElementById('voiceBtnText').textContent = '⏹️ Stop Voice';
                document.getElementById('voiceBtn').classList.add('active');
            };

            voiceRecognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                document.getElementById('voiceTranscript').textContent = '📝 ' + transcript;
                console.log('[Voice] Transcript:', transcript);
            };

            voiceRecognition.onerror = (event) => {
                console.log('[Voice] Error:', event.error);
                document.getElementById('voiceStatus').textContent = '❌ Error: ' + event.error;
                document.getElementById('voiceBtnText').textContent = '🎤 Start Voice';
                document.getElementById('voiceBtn').classList.remove('active');
                isListening = false;
            };

            voiceRecognition.onend = () => {
                console.log('[Voice] Listening ended');
                document.getElementById('voiceStatus').textContent = '✅ Processing command...';
                document.getElementById('voiceBtnText').textContent = '🎤 Start Voice';
                document.getElementById('voiceBtn').classList.remove('active');
                isListening = false;
            };

            return true;
        }

        function toggleVoiceInput() {
            if (!voiceRecognition) {
                if (!initVoiceRecognition()) {
                    return;
                }
            }

            if (isListening) {
                voiceRecognition.stop();
                isListening = false;
            } else {
                document.getElementById('voiceTranscript').textContent = '';
                voiceRecognition.start();
                isListening = true;
            }
        }

        function speakText(text) {
            if (!('speechSynthesis' in window)) {
                console.log('[Voice] Speech Synthesis not supported');
                return;
            }

            // Cancel any ongoing speech
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            utterance.onstart = () => {
                console.log('[Voice] Speaking:', text);
                document.getElementById('voiceStatus').textContent = '🔊 Speaking...';
            };

            utterance.onend = () => {
                console.log('[Voice] Speech ended');
                document.getElementById('voiceStatus').textContent = '✅ Ready';
            };

            utterance.onerror = (event) => {
                console.log('[Voice] Speech error:', event.error);
                document.getElementById('voiceStatus').textContent = '❌ Speech error: ' + event.error;
            };

            window.speechSynthesis.speak(utterance);
        }

        // Override voice recognition onend to process command
        function setupVoiceCommandProcessing() {
            if (!voiceRecognition) return;

            const originalOnEnd = voiceRecognition.onend;
            voiceRecognition.onend = function() {
                originalOnEnd.call(this);

                // Get the final transcript
                const transcript = document.getElementById('voiceTranscript').textContent.replace('📝 ', '').trim();
                if (transcript) {
                    processVoiceCommand(transcript);
                }
            };
        }

        function processVoiceCommand(command) {
            if (!command) return;

            console.log('[Voice] Processing command:', command);
            document.getElementById('voiceStatus').textContent = '⚙️ Processing: ' + command;

            fetch('/api/voice/command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: command,
                    lat: currentLat,
                    lon: currentLon
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('[Voice] Command result:', data);

                if (data.success) {
                    handleVoiceAction(data);
                    speakText(data.message);
                } else {
                    speakText(data.message || 'Command not recognized');
                    document.getElementById('voiceStatus').textContent = '❌ ' + (data.message || 'Command failed');
                }
            })
            .catch(error => {
                console.log('[Voice] Error:', error);
                speakText('Error processing command');
                document.getElementById('voiceStatus').textContent = '❌ Error: ' + error.message;
            });
        }

        function handleVoiceAction(data) {
            const action = data.action;

            switch(action) {
                case 'navigate':
                    document.getElementById('end').value = data.location;
                    calculateRoute();
                    break;

                case 'search':
                    document.getElementById('end').value = data.search_term;
                    calculateRoute();
                    break;

                case 'set_preference':
                    console.log('[Voice] Setting preference:', data.preference, '=', data.value);
                    // Store preference in localStorage
                    localStorage.setItem('voice_pref_' + data.preference, JSON.stringify(data.value));
                    break;

                case 'get_info':
                    console.log('[Voice] Getting info:', data.info_type);
                    // This would be handled by the app based on current route
                    break;

                case 'report_hazard':
                    console.log('[Voice] Reporting hazard:', data.hazard_type);
                    // Report hazard to backend
                    fetch('/api/hazards/report', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            lat: currentLat,
                            lon: currentLon,
                            hazard_type: data.hazard_type,
                            description: data.description,
                            severity: 'medium'
                        })
                    })
                    .then(r => r.json())
                    .then(r => console.log('[Voice] Hazard reported:', r));
                    break;
            }
        }

        // Update current location when map is moved
        map.on('move', () => {
            const center = map.getCenter();
            currentLat = center.lat;
            currentLon = center.lng;
        });

        // Initialize voice recognition on page load
        window.addEventListener('load', () => {
            console.log('[Voice] Initializing voice system');
            initVoiceRecognition();
            setupVoiceCommandProcessing();
            initBottomSheet();
            loadPreferences();
            initGeocodeCache();

            // Load vehicle type and routing mode from localStorage
            const savedVehicleType = localStorage.getItem('vehicleType');
            if (savedVehicleType) {
                currentVehicleType = savedVehicleType;
                const vehicleSelect = document.getElementById('vehicleType');
                if (vehicleSelect) vehicleSelect.value = savedVehicleType;
            }

            const savedRoutingMode = localStorage.getItem('routingMode');
            if (savedRoutingMode) {
                setRoutingMode(savedRoutingMode);
            }

            // Load smart zoom preference
            const savedSmartZoom = localStorage.getItem('smartZoomEnabled');
            if (savedSmartZoom === '0') {
                smartZoomEnabled = false;
                const btn = document.getElementById('smartZoomToggle');
                if (btn) btn.classList.remove('active');
            } else {
                smartZoomEnabled = true;
                const btn = document.getElementById('smartZoomToggle');
                if (btn) btn.classList.add('active');
            }

            console.log('[Init] Vehicle Type:', currentVehicleType, 'Routing Mode:', currentRoutingMode, 'Smart Zoom:', smartZoomEnabled);
        });

        // ===== BOTTOM SHEET FUNCTIONALITY =====
        let bottomSheetStartY = 0;
        let bottomSheetCurrentY = 0;
        let bottomSheetIsExpanded = false;

        function initBottomSheet() {
            const bottomSheet = document.getElementById('bottomSheet');
            const handle = document.querySelector('.bottom-sheet-handle');
            let isDragging = false;

            // Touch events for dragging
            handle.addEventListener('touchstart', (e) => {
                isDragging = true;
                bottomSheetStartY = e.touches[0].clientY;
                bottomSheetCurrentY = bottomSheetStartY;
            });

            handle.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                bottomSheetCurrentY = e.touches[0].clientY;
                const diff = bottomSheetCurrentY - bottomSheetStartY;

                if (bottomSheetIsExpanded && diff > 0) {
                    // Dragging down while expanded
                    bottomSheet.style.transform = `translateY(${diff}px)`;
                }
            });

            handle.addEventListener('touchend', () => {
                isDragging = false;
                const diff = bottomSheetCurrentY - bottomSheetStartY;
                const threshold = 100; // pixels

                if (bottomSheetIsExpanded && diff > threshold) {
                    // Collapse
                    collapseBottomSheet();
                } else {
                    // Snap back
                    bottomSheet.style.transform = '';
                }
            });

            // Mouse events for desktop browsers
            handle.addEventListener('mousedown', (e) => {
                isDragging = true;
                bottomSheetStartY = e.clientY;
                bottomSheetCurrentY = bottomSheetStartY;
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                bottomSheetCurrentY = e.clientY;
                const diff = bottomSheetCurrentY - bottomSheetStartY;

                if (bottomSheetIsExpanded && diff > 0) {
                    // Dragging down while expanded
                    bottomSheet.style.transform = `translateY(${diff}px)`;
                }
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                const diff = bottomSheetCurrentY - bottomSheetStartY;
                const threshold = 100; // pixels

                if (bottomSheetIsExpanded && diff > threshold) {
                    // Collapse
                    collapseBottomSheet();
                } else {
                    // Snap back
                    bottomSheet.style.transform = '';
                }
            });

            // Click to expand/collapse
            handle.addEventListener('click', () => {
                if (bottomSheetIsExpanded) {
                    collapseBottomSheet();
                } else {
                    expandBottomSheet();
                }
            });

            // Expand on input focus
            document.getElementById('start').addEventListener('focus', expandBottomSheet);
            document.getElementById('end').addEventListener('focus', expandBottomSheet);
        }

        function expandBottomSheet() {
            const bottomSheet = document.getElementById('bottomSheet');
            bottomSheet.classList.add('expanded');
            bottomSheetIsExpanded = true;
        }

        function collapseBottomSheet() {
            const bottomSheet = document.getElementById('bottomSheet');
            bottomSheet.classList.remove('expanded');
            bottomSheetIsExpanded = false;
        }

        // ===== GPS TRACKING FUNCTIONS =====
        function startGPSTracking() {
            if (!navigator.geolocation) {
                showStatus('Geolocation not supported', 'error');
                return;
            }

            if (isTrackingActive) {
                stopGPSTracking();
                return;
            }

            isTrackingActive = true;
            trackingHistory = [];
            showStatus('🎯 GPS Tracking started...', 'success');

            // Watch position with high accuracy
            gpsWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    const speed = position.coords.speed || 0;

                    currentLat = lat;
                    currentLon = lon;

                    // Add to tracking history
                    trackingHistory.push({
                        lat: lat,
                        lon: lon,
                        timestamp: new Date(),
                        speed: speed,
                        accuracy: accuracy
                    });

                    // Update user marker on map with vehicle icon
                    if (currentUserMarker) {
                        map.removeLayer(currentUserMarker);
                    }

                    currentUserMarker = createVehicleMarker(lat, lon, speed, accuracy);
                    currentUserMarker.addTo(map);

                    // Center map on user (if not manually panned) with smooth animation
                    if (!map._userPanned) {
                        map.flyTo([lat, lon], 16, {
                            duration: 0.3,
                            easeLinearity: 0.25
                        });
                    }

                    // Check for route deviation
                    if (routeInProgress && routePolyline) {
                        checkRouteDeviation(lat, lon);
                    }

                    // Check for hazards nearby
                    checkNearbyHazards(lat, lon);

                    // Check for variable speed limits
                    updateVariableSpeedLimit(lat, lon, 'motorway', currentVehicleType);

                    // Apply smart zoom with turn detection
                    const speedMph = speed ? (speed * 2.237) : 0;
                    let distanceToNextTurn = null;

                    // Detect upcoming turns if navigation is active
                    if (routeInProgress && routePolyline && routePolyline.length > 0) {
                        const turnInfo = detectUpcomingTurn(lat, lon);
                        if (turnInfo) {
                            distanceToNextTurn = turnInfo.distance;
                        }
                    }

                    applySmartZoomWithAnimation(speedMph, distanceToNextTurn, 'motorway', lat, lon);

                    // ===== PHASE 2: Update lane guidance and speed warnings =====
                    // Convert speed from m/s to mph (already done above)
                    const speedMphFormatted = speedMph.toFixed(1);

                    // Determine heading from tracking history
                    let heading = 0;
                    if (trackingHistory.length > 1) {
                        const prev = trackingHistory[trackingHistory.length - 2];
                        const curr = trackingHistory[trackingHistory.length - 1];
                        const dLon = curr.lon - prev.lon;
                        const dLat = curr.lat - prev.lat;
                        heading = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
                    }

                    // Update lane guidance if navigating
                    if (routeInProgress && currentRouteSteps.length > 0) {
                        const nextStep = currentRouteSteps[currentStepIndex];
                        const maneuver = nextStep ? nextStep.maneuver || 'straight' : 'straight';
                        updateLaneGuidance(lat, lon, heading, maneuver);
                    }

                    // Update speed warnings (assume local roads by default)
                    updateSpeedWarning(lat, lon, speedMph, 'local');
                },
                (error) => {
                    showStatus('GPS Error: ' + error.message, 'error');
                    isTrackingActive = false;
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        }

        function stopGPSTracking() {
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = null;
            }
            isTrackingActive = false;
            showStatus('🛑 GPS Tracking stopped', 'info');
        }

        function checkRouteDeviation(lat, lon) {
            // Calculate distance from current position to route
            if (!routePolyline || routePolyline.length === 0) return;

            let minDistance = Infinity;
            for (let i = 0; i < routePolyline.length; i++) {
                const point = routePolyline[i];
                const distance = calculateDistance(lat, lon, point[0], point[1]);
                if (distance < minDistance) {
                    minDistance = distance;
                }
            }

            // If deviation > 100 meters, suggest re-routing
            if (minDistance > 100) {
                sendNotification('Route Deviation', `You are ${minDistance.toFixed(0)}m off route. Recalculating...`, 'warning');
                // Auto re-route could be triggered here
            }
        }

        function calculateDistance(lat1, lon1, lat2, lon2) {
            // Haversine formula for distance calculation
            const R = 6371; // Earth's radius in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c * 1000; // Return in meters
        }

        function checkNearbyHazards(lat, lon) {
            // Check for hazards within 500m
            fetch(`/api/hazards/nearby?lat=${lat}&lon=${lon}&radius=0.5`)
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.hazards && data.hazards.length > 0) {
                        data.hazards.forEach(hazard => {
                            const distance = calculateDistance(lat, lon, hazard.lat, hazard.lon);
                            if (distance < 500) {
                                const message = `⚠️ ${hazard.type} ${distance.toFixed(0)}m ahead`;
                                sendNotification('Hazard Alert', message, 'warning');
                                // Also announce via voice if enabled
                                if (voiceRecognition) {
                                    speakMessage(message);
                                }
                            }
                        });
                    }
                })
                .catch(error => console.log('Hazard check error:', error));
        }

        // ===== PHASE 1: LIVE DATA REFRESH FUNCTIONS =====
        function startLiveDataRefresh() {
            if (routeInProgress) {
                // Get adaptive intervals based on battery level (Phase 3)
                const trafficInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.traffic_navigation);
                const etaInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.eta);
                const weatherInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.weather_navigation);
                const hazardInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.hazards_navigation);

                // Traffic refresh every 5 minutes (or adaptive)
                trafficRefreshInterval = setInterval(() => {
                    refreshTrafficData();
                }, trafficInterval);

                // ETA refresh every 30 seconds (or adaptive)
                etaRefreshInterval = setInterval(() => {
                    updateETACalculation();
                }, etaInterval);

                // Weather refresh every 30 minutes (or adaptive)
                weatherRefreshInterval = setInterval(() => {
                    refreshWeatherData();
                }, weatherInterval);

                // Hazard refresh every 5 minutes (or adaptive)
                hazardRefreshInterval = setInterval(() => {
                    if (currentLat && currentLon) {
                        checkNearbyHazards(currentLat, currentLon);
                    }
                }, hazardInterval);

                console.log('[Live Data] Refresh intervals started');
            }
        }

        function stopLiveDataRefresh() {
            clearInterval(trafficRefreshInterval);
            clearInterval(etaRefreshInterval);
            clearInterval(weatherRefreshInterval);
            clearInterval(hazardRefreshInterval);
            console.log('[Live Data] Refresh intervals stopped');
        }

        function refreshTrafficData() {
            if (!routeInProgress || !currentLat || !currentLon) return;

            fetch(`/api/traffic-patterns?lat=${currentLat}&lon=${currentLon}`)
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.patterns && data.patterns.length > 0) {
                        const pattern = data.patterns[0];
                        if (pattern.congestion > 2) {
                            sendNotification('🚗 Traffic Update',
                                `Heavy traffic ahead (Congestion: ${pattern.congestion}/5)`,
                                'warning');
                        }
                    }
                })
                .catch(e => console.log('[Traffic] Refresh error:', e));
        }

        function updateETACalculation() {
            if (!routeInProgress || !routePolyline || currentStepIndex === undefined) return;

            // Calculate remaining distance
            let remainingDistance = 0;
            for (let i = currentStepIndex; i < routePolyline.length - 1; i++) {
                remainingDistance += calculateDistance(
                    routePolyline[i][0], routePolyline[i][1],
                    routePolyline[i+1][0], routePolyline[i+1][1]
                );
            }

            // Get average speed from recent tracking history
            let avgSpeed = 40; // Default 40 km/h
            if (trackingHistory.length > 5) {
                const recentSpeeds = trackingHistory.slice(-5).map(t => t.speed * 3.6);
                avgSpeed = recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
            }

            // Calculate ETA
            const timeRemaining = (remainingDistance / avgSpeed) * 60; // minutes
            const eta = new Date(Date.now() + timeRemaining * 60000);

            // Update display
            const turnInfo = document.getElementById('turnInfo');
            if (turnInfo) {
                turnInfo.innerHTML = `
                    <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                        <div style="font-size: 12px; color: #666;">ETA</div>
                        <div style="font-size: 18px; font-weight: bold; color: #333;">
                            ${eta.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                        </div>
                        <div style="font-size: 12px; color: #999; margin-top: 5px;">
                            ${(remainingDistance / 1000).toFixed(1)} km remaining
                        </div>
                    </div>
                `;
            }
        }

        function refreshWeatherData() {
            if (!currentLat || !currentLon) return;

            fetch(`/api/weather?lat=${currentLat}&lon=${currentLon}`)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        // Check for severe weather
                        if (data.description.includes('rain') ||
                            data.description.includes('storm') ||
                            data.description.includes('snow')) {
                            sendNotification('⛈️ Weather Alert',
                                `${data.description} ahead`,
                                'warning');
                        }
                    }
                })
                .catch(e => console.log('[Weather] Refresh error:', e));
        }

        // ===== PHASE 2: PWA AUTO-RELOAD FUNCTIONS =====
        function saveAppState() {
            try {
                const state = {
                    preferences: {
                        tolls: localStorage.getItem('pref_tolls'),
                        caz: localStorage.getItem('pref_caz'),
                        speedCameras: localStorage.getItem('pref_speedCameras'),
                        trafficCameras: localStorage.getItem('pref_trafficCameras'),
                        policeRadars: localStorage.getItem('pref_policeRadars'),
                        roadworks: localStorage.getItem('pref_roadworks'),
                        accidents: localStorage.getItem('pref_accidents'),
                        railwayCrossings: localStorage.getItem('pref_railwayCrossings'),
                        potholes: localStorage.getItem('pref_potholes'),
                        debris: localStorage.getItem('pref_debris'),
                        gestureControl: localStorage.getItem('pref_gestureControl'),
                        batterySaving: localStorage.getItem('pref_batterySaving'),
                        mapTheme: localStorage.getItem('pref_mapTheme'),
                        mlPredictions: localStorage.getItem('pref_mlPredictions')
                    },
                    timestamp: Date.now()
                };
                localStorage.setItem('appState', JSON.stringify(state));
                console.log('[PWA] App state saved');
            } catch (e) {
                console.log('[PWA] State save error:', e);
            }
        }

        function restoreAppState() {
            try {
                const saved = localStorage.getItem('appState');
                if (saved) {
                    const state = JSON.parse(saved);
                    // Restore preferences
                    Object.keys(state.preferences).forEach(key => {
                        if (state.preferences[key]) {
                            localStorage.setItem('pref_' + key, state.preferences[key]);
                        }
                    });
                    localStorage.removeItem('appState');
                    console.log('[PWA] App state restored');
                }
            } catch (e) {
                console.log('[PWA] State restore error:', e);
            }
        }

        // ===== PHASE 3: BATTERY-AWARE REFRESH INTERVALS =====
        function getAdaptiveRefreshInterval(baseInterval) {
            // Adjust refresh intervals based on battery level
            if (!('getBattery' in navigator)) {
                return baseInterval; // Use base interval if Battery API unavailable
            }

            // If battery is low, increase intervals to save power
            if (currentBatteryLevel < 0.15) {
                // Critical battery: increase intervals by 3x
                return baseInterval * 3;
            } else if (currentBatteryLevel < 0.30) {
                // Low battery: increase intervals by 2x
                return baseInterval * 2;
            } else if (currentBatteryLevel < 0.50) {
                // Medium battery: increase intervals by 1.5x
                return baseInterval * 1.5;
            }

            return baseInterval; // Normal intervals
        }

        function initBatteryMonitoring() {
            // Monitor battery status for adaptive refresh intervals
            if ('getBattery' in navigator) {
                navigator.getBattery().then(battery => {
                    currentBatteryLevel = battery.level;
                    console.log('[Battery] Initial level:', (currentBatteryLevel * 100).toFixed(0) + '%');

                    battery.addEventListener('levelchange', () => {
                        currentBatteryLevel = battery.level;
                        console.log('[Battery] Level changed:', (currentBatteryLevel * 100).toFixed(0) + '%');

                        // If battery drops below 30%, notify user
                        if (currentBatteryLevel < 0.30 && routeInProgress) {
                            sendNotification('🔋 Low Battery',
                                `Battery at ${(currentBatteryLevel * 100).toFixed(0)}%. Refresh intervals adjusted.`,
                                'warning');
                        }
                    });

                    battery.addEventListener('chargingtimechange', () => {
                        console.log('[Battery] Charging time changed');
                    });

                    battery.addEventListener('dischargingtimechange', () => {
                        console.log('[Battery] Discharging time changed');
                    });

                    battery.addEventListener('chargingchange', () => {
                        console.log('[Battery] Charging status changed:', battery.charging ? 'charging' : 'discharging');
                    });
                }).catch(e => {
                    console.log('[Battery] API error:', e);
                });
            } else {
                console.log('[Battery] Battery Status API not supported');
            }
        }

        // ===== LOCATION FUNCTIONS =====
        function getCurrentLocation() {
            if (!navigator.geolocation) {
                showStatus('Geolocation not supported', 'error');
                return;
            }

            showStatus('Getting location...', 'loading');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    currentLat = lat;
                    currentLon = lon;

                    // Center map on current location with smooth animation
                    map.flyTo([lat, lon], 15, {
                        duration: ZOOM_ANIMATION_DURATION,
                        easeLinearity: 0.25
                    });

                    // Add marker
                    if (startMarker) map.removeLayer(startMarker);
                    startMarker = L.circleMarker([lat, lon], {
                        radius: 8,
                        fillColor: '#667eea',
                        color: '#fff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(map).bindPopup('Current Location');

                    showStatus('Location found!', 'success');
                },
                (error) => {
                    showStatus('Error: ' + error.message, 'error');
                }
            );
        }

        function setCurrentLocation(field) {
            if (!navigator.geolocation) {
                showStatus('Geolocation not supported', 'error');
                return;
            }

            showStatus('Getting location...', 'loading');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    document.getElementById(field).value = `${lat},${lon}`;
                    currentLat = lat;
                    currentLon = lon;
                    showStatus('Location set!', 'success');
                },
                (error) => {
                    showStatus('Error: ' + error.message, 'error');
                }
            );
        }

        // ===== AUTO GPS LOCATION FEATURE =====
        function toggleAutoGpsLocation() {
            const toggle = document.getElementById('autoGpsToggle');
            autoGpsEnabled = toggle.checked;

            if (autoGpsEnabled) {
                startAutoGpsLocation();
            } else {
                stopAutoGpsLocation();
            }

            // Save preference to localStorage
            localStorage.setItem('autoGpsEnabled', autoGpsEnabled);
        }

        function startAutoGpsLocation() {
            if (!navigator.geolocation) {
                showStatus('❌ Geolocation not supported by your browser', 'error');
                document.getElementById('autoGpsToggle').checked = false;
                autoGpsEnabled = false;
                return;
            }

            showStatus('📍 Auto GPS location enabled. Fetching your location...', 'success');
            console.log('[Auto GPS] Starting auto location monitoring');

            // Get initial location immediately
            updateAutoGpsLocation();

            // Then update every 5 seconds
            autoGpsLocationMonitor = setInterval(() => {
                updateAutoGpsLocation();
            }, AUTO_GPS_UPDATE_INTERVAL);
        }

        function stopAutoGpsLocation() {
            if (autoGpsLocationMonitor) {
                clearInterval(autoGpsLocationMonitor);
                autoGpsLocationMonitor = null;
            }
            showStatus('📍 Auto GPS location disabled', 'info');
            console.log('[Auto GPS] Auto location monitoring stopped');
        }

        function updateAutoGpsLocation() {
            if (!autoGpsEnabled) return;

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const accuracy = position.coords.accuracy;

                    // Update the start location field
                    document.getElementById('start').value = `${lat.toFixed(6)},${lon.toFixed(6)}`;
                    currentLat = lat;
                    currentLon = lon;

                    // Log the update
                    console.log(`[Auto GPS] Location updated: ${lat.toFixed(6)}, ${lon.toFixed(6)} (accuracy: ${accuracy.toFixed(0)}m)`);

                    // Show subtle notification only on first update or significant change
                    if (!window.lastAutoGpsLat ||
                        calculateDistance(window.lastAutoGpsLat, window.lastAutoGpsLon, lat, lon) > 0.05) {
                        // Only show notification if moved more than 50 meters
                        showStatus(`📍 Location updated: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'info');
                        window.lastAutoGpsLat = lat;
                        window.lastAutoGpsLon = lon;
                    }
                },
                (error) => {
                    console.log(`[Auto GPS] Error: ${error.message}`);
                    // Don't show error every time - just log it
                    // This prevents notification spam if GPS is temporarily unavailable
                }
            );
        }

        function pickLocationFromMap(field) {
            mapPickerMode = field;
            collapseBottomSheet();
            showStatus('Click on the map to select ' + (field === 'start' ? 'start' : 'destination') + ' location', 'loading');
        }

        // ===== GEOCODING FUNCTIONS =====
        function initGeocodeCache() {
            try {
                const cached = localStorage.getItem(GEOCODING_CACHE_KEY);
                if (cached) {
                    geocodingCache = JSON.parse(cached);
                    console.log('[Geocoding] Cache loaded with', Object.keys(geocodingCache).length, 'entries');
                }
            } catch (e) {
                console.log('[Geocoding] Cache load error:', e);
                geocodingCache = {};
            }
        }

        function saveGeocodeCache() {
            try {
                localStorage.setItem(GEOCODING_CACHE_KEY, JSON.stringify(geocodingCache));
            } catch (e) {
                console.log('[Geocoding] Cache save error:', e);
            }
        }

        function isCoordinateFormat(input) {
            // Check if input is already in "lat,lon" format
            const parts = input.trim().split(',');
            if (parts.length !== 2) return false;

            const lat = parseFloat(parts[0].trim());
            const lon = parseFloat(parts[1].trim());

            // Valid latitude: -90 to 90, Valid longitude: -180 to 180
            return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        }

        async function geocodeAddress(address) {
            if (!address || address.trim() === '') {
                return null;
            }

            const trimmedAddress = address.trim();

            // Check if already in coordinate format
            if (isCoordinateFormat(trimmedAddress)) {
                const parts = trimmedAddress.split(',');
                const lat = parseFloat(parts[0].trim());
                const lon = parseFloat(parts[1].trim());
                console.log('[Geocoding] Input is already coordinates:', lat, lon);
                return { lat, lon, display_name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, cached: false };
            }

            // Check cache first
            if (geocodingCache[trimmedAddress]) {
                console.log('[Geocoding] Cache hit for:', trimmedAddress);
                return { ...geocodingCache[trimmedAddress], cached: true };
            }

            try {
                console.log('[Geocoding] Fetching:', trimmedAddress);
                const response = await fetch(`${NOMINATIM_API}?q=${encodeURIComponent(trimmedAddress)}&format=json&limit=1`, {
                    headers: {
                        'User-Agent': 'Voyagr-PWA/1.0'
                    }
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();

                if (!data || data.length === 0) {
                    console.log('[Geocoding] No results for:', trimmedAddress);
                    return null;
                }

                const result = data[0];
                const geocoded = {
                    lat: parseFloat(result.lat),
                    lon: parseFloat(result.lon),
                    display_name: result.display_name
                };

                // Cache the result
                geocodingCache[trimmedAddress] = geocoded;
                saveGeocodeCache();

                console.log('[Geocoding] Success:', trimmedAddress, '→', geocoded.lat, geocoded.lon);
                return { ...geocoded, cached: false };
            } catch (error) {
                console.log('[Geocoding] Error:', error.message);
                return null;
            }
        }

        async function geocodeLocations(startAddress, endAddress) {
            isGeocoding = true;
            showStatus('🔍 Geocoding locations...', 'loading');

            try {
                // Geocode start location
                const startResult = await geocodeAddress(startAddress);
                if (!startResult) {
                    showStatus('❌ Could not find start location: ' + startAddress, 'error');
                    isGeocoding = false;
                    return null;
                }

                // Geocode end location
                const endResult = await geocodeAddress(endAddress);
                if (!endResult) {
                    showStatus('❌ Could not find end location: ' + endAddress, 'error');
                    isGeocoding = false;
                    return null;
                }

                // Show resolved locations
                const cacheInfo = (startResult.cached ? ' (cached)' : '') + (endResult.cached ? ' (cached)' : '');
                showStatus(`✅ Resolved: ${startResult.display_name} → ${endResult.display_name}${cacheInfo}`, 'success');

                isGeocoding = false;
                return {
                    start: `${startResult.lat},${startResult.lon}`,
                    end: `${endResult.lat},${endResult.lon}`,
                    startName: startResult.display_name,
                    endName: endResult.display_name
                };
            } catch (error) {
                console.log('[Geocoding] Error:', error);
                showStatus('❌ Geocoding error: ' + error.message, 'error');
                isGeocoding = false;
                return null;
            }
        }

        // ===== TURN-BY-TURN NAVIGATION FUNCTIONS =====
        function startTurnByTurnNavigation(routeData) {
            if (!routeData || !routeData.geometry) {
                showStatus('No route geometry available', 'error');
                return;
            }

            routeInProgress = true;
            currentStepIndex = 0;
            currentRouteSteps = [];

            // Decode route geometry
            try {
                routePolyline = decodePolyline(routeData.geometry);
                console.log('Route polyline decoded:', routePolyline.length, 'points');
            } catch (e) {
                console.log('Could not decode geometry:', e);
                return;
            }

            // Start GPS tracking if not already active
            if (!isTrackingActive) {
                startGPSTracking();
            }

            // ===== PHASE 1: Start live data refresh =====
            startLiveDataRefresh();

            sendNotification('Navigation Started', 'Turn-by-turn guidance activated', 'success');
            speakMessage('Navigation started. Follow the route.');
            showStatus('🧭 Turn-by-turn navigation active', 'success');
        }

        function stopTurnByTurnNavigation() {
            routeInProgress = false;
            currentStepIndex = 0;
            currentRouteSteps = [];
            stopGPSTracking();

            // ===== PHASE 1: Stop live data refresh =====
            stopLiveDataRefresh();

            // ===== PHASE 2: Apply pending PWA update if available =====
            if (updatePending) {
                showStatus('🔄 Applying pending update...', 'success');
                saveAppState();
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
                return;
            }

            showStatus('Navigation stopped', 'info');
            sendNotification('Navigation Ended', 'Route guidance ended', 'info');
        }

        function updateTurnGuidance(userLat, userLon) {
            if (!routeInProgress || !routePolyline || routePolyline.length === 0) return;

            // Find closest point on route
            let closestIndex = 0;
            let minDistance = Infinity;

            for (let i = 0; i < routePolyline.length; i++) {
                const distance = calculateDistance(userLat, userLon, routePolyline[i][0], routePolyline[i][1]);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = i;
                }
            }

            // Calculate distance to end of route
            let distanceToEnd = 0;
            for (let i = closestIndex; i < routePolyline.length - 1; i++) {
                distanceToEnd += calculateDistance(
                    routePolyline[i][0], routePolyline[i][1],
                    routePolyline[i + 1][0], routePolyline[i + 1][1]
                );
            }

            // Update turn guidance display
            const turnInfo = document.getElementById('turnInfo');
            if (turnInfo) {
                turnInfo.innerHTML = `
                    <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                        <div style="font-size: 14px; color: #666;">Distance to destination</div>
                        <div style="font-size: 24px; font-weight: bold; color: #333;">${(distanceToEnd / 1000).toFixed(1)} km</div>
                        <div style="font-size: 12px; color: #999; margin-top: 5px;">Route progress: ${((closestIndex / routePolyline.length) * 100).toFixed(0)}%</div>
                    </div>
                `;
            }

            // Announce upcoming turns (every 500m)
            if (closestIndex % 50 === 0 && closestIndex > 0) {
                const nextTurnDistance = Math.min(500, distanceToEnd);
                if (nextTurnDistance < 500) {
                    speakMessage(`Turn ahead in ${nextTurnDistance.toFixed(0)} meters`);
                }
            }
        }

        // ===== QUICK SEARCH FUNCTIONS =====
        function quickSearch(type) {
            if (!navigator.geolocation) {
                showStatus('Geolocation not supported', 'error');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    const searchTerms = {
                        'parking': 'parking near ' + lat + ',' + lon,
                        'fuel': 'gas station near ' + lat + ',' + lon,
                        'food': 'restaurant near ' + lat + ',' + lon
                    };

                    document.getElementById('end').value = searchTerms[type] || type;
                    showStatus('Search term set. Click Calculate Route to find ' + type, 'success');
                    expandBottomSheet();
                },
                (error) => {
                    showStatus('Error getting location: ' + error.message, 'error');
                }
            );
        }

        // ===== NOTIFICATIONS SYSTEM FUNCTIONS =====
        function sendNotification(title, message, type = 'info') {
            // Throttle notifications to prevent spam
            const now = Date.now();
            if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) {
                return;
            }
            lastNotificationTime = now;

            // Send browser push notification if permission granted
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    const notification = new Notification(title, {
                        body: message,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag: type,
                        requireInteraction: type === 'warning' || type === 'error'
                    });

                    // Auto-close after 5 seconds (unless warning/error)
                    if (type !== 'warning' && type !== 'error') {
                        setTimeout(() => notification.close(), 5000);
                    }

                    notification.onclick = () => {
                        window.focus();
                        notification.close();
                    };
                } catch (e) {
                    console.log('Notification error:', e);
                }
            }

            // Also show in-app notification
            showInAppNotification(title, message, type);
        }

        function showInAppNotification(title, message, type = 'info') {
            // Create notification element
            const notifContainer = document.getElementById('notificationContainer');
            if (!notifContainer) {
                console.log('Notification container not found');
                return;
            }

            const notif = document.createElement('div');
            notif.className = `in-app-notification notification-${type}`;
            notif.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
                        <div style="font-size: 14px; opacity: 0.9;">${message}</div>
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
                </div>
            `;

            notifContainer.appendChild(notif);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notif.parentElement) {
                    notif.remove();
                }
            }, 5000);
        }

        function speakMessage(message) {
            // Use Web Speech API for voice output
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(message);
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                speechSynthesis.speak(utterance);
            }
        }

        function sendETANotification(eta, distance) {
            const etaTime = new Date(eta);
            const timeStr = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            sendNotification('ETA Update', `Arriving at ${timeStr} (${distance} remaining)`, 'info');
        }

        function sendArrivalNotification() {
            sendNotification('🎉 Destination Reached', 'You have arrived at your destination', 'success');
            speakMessage('You have arrived at your destination');
            stopTurnByTurnNavigation();
        }

        // ===== PREFERENCE FUNCTIONS =====
        function togglePreference(pref) {
            const button = document.getElementById('avoid' + pref.charAt(0).toUpperCase() + pref.slice(1));
            if (!button) return;

            button.classList.toggle('active');
            const isActive = button.classList.contains('active');
            localStorage.setItem('pref_' + pref, isActive);
        }

        function loadPreferences() {
            const prefs = ['tolls', 'caz', 'speedCameras', 'trafficCameras', 'variableSpeedAlerts'];
            prefs.forEach(pref => {
                const saved = localStorage.getItem('pref_' + pref);
                if (saved === 'true') {
                    const button = document.getElementById('avoid' + pref.charAt(0).toUpperCase() + pref.slice(1)) ||
                                   document.getElementById(pref.charAt(0).toLowerCase() + pref.slice(1));
                    if (button) {
                        button.classList.add('active');
                    }
                }
            });

            // ===== LOAD AUTO GPS PREFERENCE =====
            const autoGpsSaved = localStorage.getItem('autoGpsEnabled');
            if (autoGpsSaved === 'true') {
                const toggle = document.getElementById('autoGpsToggle');
                if (toggle) {
                    toggle.checked = true;
                    autoGpsEnabled = true;
                    startAutoGpsLocation();
                    console.log('[Auto GPS] Preference restored from localStorage');
                }
            }
        }

        // Update trip info display
        function updateTripInfo(distance, time, fuelCost, tollCost) {
            const tripInfo = document.getElementById('tripInfo');
            if (distance && time) {
                document.getElementById('distance').textContent = distance;
                document.getElementById('time').textContent = time;
                document.getElementById('fuelCost').textContent = fuelCost || '-';
                document.getElementById('tollCost').textContent = tollCost || '-';
                tripInfo.classList.add('show');
            }
        }

        // Update clearForm to also hide trip info
        const originalClearForm = clearForm;
        clearForm = function() {
            originalClearForm();
            document.getElementById('tripInfo').classList.remove('show');
        };

        // Update calculateRoute to show trip info
        const originalCalculateRoute = calculateRoute;
        calculateRoute = function() {
            originalCalculateRoute();
            // Trip info will be updated when route is calculated
        };
    </script>
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
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT * FROM vehicles')
            vehicles = cursor.fetchall()
            conn.close()
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
            cursor.execute('''
                INSERT INTO vehicles (name, vehicle_type, fuel_efficiency, fuel_price,
                                     energy_efficiency, electricity_price, is_caz_exempt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (data['name'], data['vehicle_type'], data.get('fuel_efficiency', 6.5),
                  data.get('fuel_price', 1.40), data.get('energy_efficiency', 18.5),
                  data.get('electricity_price', 0.30), data.get('caz_exempt', 0)))
            conn.commit()
            vehicle_id = cursor.lastrowid
            conn.close()
            return jsonify({'success': True, 'vehicle_id': vehicle_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/charging-stations', methods=['GET'])
def get_charging_stations():
    """Get nearby charging stations."""
    try:
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
        radius_km = float(request.args.get('radius', 5))

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
def trip_history(trip_id=None):
    """Get, save, or delete trip history."""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT * FROM trips ORDER BY timestamp DESC LIMIT 50')
            trips = cursor.fetchall()
            conn.close()
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
            cursor.execute('''
                INSERT INTO trips (start_lat, start_lon, start_address, end_lat, end_lon,
                                  end_address, distance_km, duration_minutes, fuel_cost,
                                  toll_cost, caz_cost, routing_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (data['start_lat'], data['start_lon'], data.get('start_address', ''),
                  data['end_lat'], data['end_lon'], data.get('end_address', ''),
                  data['distance_km'], data['duration_minutes'], data.get('fuel_cost', 0),
                  data.get('toll_cost', 0), data.get('caz_cost', 0), data.get('routing_mode', 'auto')))
            conn.commit()
            trip_id = cursor.lastrowid
            conn.close()
            return jsonify({'success': True, 'trip_id': trip_id})

        elif request.method == 'DELETE':  # DELETE - remove trip
            cursor.execute('DELETE FROM trips WHERE id = ?', (trip_id,))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': f'Trip {trip_id} deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/trip-analytics', methods=['GET'])
def get_trip_analytics():
    """Get trip analytics and statistics"""
    try:
        conn = sqlite3.connect(DB_FILE)
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

        conn.close()

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
        print(f"Error fetching trip analytics: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/traffic-conditions', methods=['POST'])
def get_traffic_conditions():
    """Get real-time traffic conditions for a route"""
    try:
        data = request.json
        start = data.get('start', '').strip()
        end = data.get('end', '').strip()

        # Simulate traffic data (in production, integrate with real traffic API)
        # This would connect to services like Google Maps Traffic, HERE Traffic, or TomTom Traffic

        import random
        import math

        # Simulate traffic level based on time of day
        hour = datetime.datetime.now().hour
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
            'timestamp': datetime.datetime.now().isoformat()
        })
    except Exception as e:
        print(f"Error fetching traffic conditions: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/route', methods=['POST'])
def calculate_route():
    try:
        data = request.json
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

        if not start or not end:
            return jsonify({'success': False, 'error': 'Missing start or end location'})

        # Parse coordinates - handle both "lat,lon" and "lon,lat" formats
        try:
            start_parts = start.split(',')
            end_parts = end.split(',')
            start_lat = float(start_parts[0].strip())
            start_lon = float(start_parts[1].strip())
            end_lat = float(end_parts[0].strip())
            end_lon = float(end_parts[1].strip())
        except:
            # Default to London if parsing fails
            start_lat, start_lon = 51.5074, -0.1278
            end_lat, end_lon = 51.5174, -0.1278

        # Fetch hazards if hazard avoidance is enabled
        hazards = {}
        if enable_hazard_avoidance:
            hazards = fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)

        # Try routing engines in order: GraphHopper, Valhalla, OSRM
        graphhopper_error = None
        valhalla_error = None

        # Try GraphHopper first (if available)
        try:
            url = f"{GRAPHHOPPER_URL}/route"
            params = {
                "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
                "profile": "car",
                "locale": "en",
                "ch.disable": "true"  # Disable CH to get alternative routes
            }
            print(f"[GraphHopper] Requesting route from ({start_lat},{start_lon}) to ({end_lat},{end_lon})")
            response = requests.get(url, params=params, timeout=10)
            print(f"[GraphHopper] Response status: {response.status_code}")

            if response.status_code == 200:
                route_data = response.json()
                print(f"[GraphHopper] Response keys: {route_data.keys()}")

                if 'paths' in route_data and len(route_data['paths']) > 0:
                    # Extract all available routes (up to 4)
                    routes = []
                    for idx, path in enumerate(route_data['paths'][:4]):
                        distance = path.get('distance', 0) / 1000  # Convert to km
                        time = path.get('time', 0) / 60000  # Convert to minutes

                        # Extract route geometry
                        route_geometry = None
                        if 'points' in path:
                            points = path['points']
                            if isinstance(points, list):
                                # Convert points to polyline format for consistency
                                route_geometry = polyline.encode([(p['lat'], p['lng']) for p in points])
                            elif isinstance(points, str):
                                # Already encoded as polyline
                                route_geometry = points

                        # Calculate costs
                        fuel_cost = 0
                        toll_cost = 0
                        caz_cost = 0

                        if vehicle_type == 'electric':
                            fuel_cost = (distance / 100) * energy_efficiency * electricity_price
                        else:
                            fuel_cost = (distance / 100) * fuel_efficiency * fuel_price

                        if include_tolls:
                            toll_cost = calculate_toll_cost(distance, 'motorway')

                        if include_caz and not caz_exempt:
                            caz_cost = calculate_caz_cost(distance, vehicle_type, caz_exempt)

                        # Determine route type based on index
                        if idx == 0:
                            route_type = 'Fastest'
                        elif idx == 1:
                            route_type = 'Shortest'
                        elif idx == 2:
                            route_type = 'Balanced'
                        else:
                            route_type = f'Alternative {idx}'

                        routes.append({
                            'id': idx + 1,
                            'name': route_type,
                            'distance_km': round(distance, 2),
                            'duration_minutes': round(time, 0),
                            'fuel_cost': round(fuel_cost, 2),
                            'toll_cost': round(toll_cost, 2),
                            'caz_cost': round(caz_cost, 2),
                            'geometry': route_geometry
                        })

                    print(f"[GraphHopper] SUCCESS: {len(routes)} routes found")
                    return jsonify({
                        'success': True,
                        'routes': routes,
                        'source': 'GraphHopper ✅',
                        'distance': f'{routes[0]["distance_km"]:.2f} km',
                        'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                        'geometry': routes[0]['geometry'],
                        'fuel_cost': routes[0]['fuel_cost'],
                        'toll_cost': routes[0]['toll_cost'],
                        'caz_cost': routes[0]['caz_cost']
                    })
                else:
                    graphhopper_error = f"Unexpected response format: {route_data.keys()}"
            else:
                graphhopper_error = f"HTTP {response.status_code}"
        except requests.exceptions.Timeout:
            graphhopper_error = "Timeout (>10s)"
        except requests.exceptions.ConnectionError as e:
            graphhopper_error = f"Connection error"
        except Exception as e:
            graphhopper_error = str(e)

        if graphhopper_error:
            print(f"[GraphHopper] Failed: {graphhopper_error}")

        # Try Valhalla as fallback
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
            response = requests.post(url, json=payload, timeout=10)
            print(f"[Valhalla] Response status: {response.status_code}")

            if response.status_code == 200:
                route_data = response.json()
                print(f"[Valhalla] Response keys: {route_data.keys()}")

                if 'trip' in route_data and 'legs' in route_data['trip']:
                    # Extract all available routes
                    routes = []

                    # Main route
                    distance = route_data['trip']['summary']['length']
                    time = route_data['trip']['summary']['time']
                    distance_km = distance / 1000
                    time_min = time / 60

                    # Extract route geometry
                    route_geometry = None
                    if 'legs' in route_data['trip']:
                        for leg in route_data['trip']['legs']:
                            if 'shape' in leg:
                                route_geometry = leg['shape']
                                break

                    # Calculate costs for main route
                    fuel_cost = 0
                    toll_cost = 0
                    caz_cost = 0

                    if vehicle_type == 'electric':
                        fuel_cost = (distance_km / 100) * energy_efficiency * electricity_price
                    else:
                        fuel_cost = (distance_km / 100) * fuel_efficiency * fuel_price

                    if include_tolls:
                        toll_cost = calculate_toll_cost(distance_km, 'motorway')

                    if include_caz and not caz_exempt:
                        caz_cost = calculate_caz_cost(distance_km, vehicle_type, caz_exempt)

                    routes.append({
                        'id': 1,
                        'name': 'Fastest',
                        'distance_km': round(distance_km, 2),
                        'duration_minutes': round(time_min, 0),
                        'fuel_cost': round(fuel_cost, 2),
                        'toll_cost': round(toll_cost, 2),
                        'caz_cost': round(caz_cost, 2),
                        'geometry': route_geometry
                    })

                    # Alternative routes (if available)
                    if 'alternatives' in route_data:
                        for idx, alt_route in enumerate(route_data['alternatives'][:3]):
                            if 'trip' in alt_route and 'summary' in alt_route['trip']:
                                alt_distance = alt_route['trip']['summary']['length']
                                alt_time = alt_route['trip']['summary']['time']
                                alt_distance_km = alt_distance / 1000
                                alt_time_min = alt_time / 60

                                # Extract geometry
                                alt_geometry = None
                                if 'legs' in alt_route['trip']:
                                    for leg in alt_route['trip']['legs']:
                                        if 'shape' in leg:
                                            alt_geometry = leg['shape']
                                            break

                                # Calculate costs
                                alt_fuel_cost = 0
                                alt_toll_cost = 0
                                alt_caz_cost = 0

                                if vehicle_type == 'electric':
                                    alt_fuel_cost = (alt_distance_km / 100) * energy_efficiency * electricity_price
                                else:
                                    alt_fuel_cost = (alt_distance_km / 100) * fuel_efficiency * fuel_price

                                if include_tolls:
                                    alt_toll_cost = calculate_toll_cost(alt_distance_km, 'motorway')

                                if include_caz and not caz_exempt:
                                    alt_caz_cost = calculate_caz_cost(alt_distance_km, vehicle_type, caz_exempt)

                                route_names = ['Shortest', 'Balanced', 'Alternative']
                                routes.append({
                                    'id': idx + 2,
                                    'name': route_names[idx] if idx < len(route_names) else f'Alternative {idx}',
                                    'distance_km': round(alt_distance_km, 2),
                                    'duration_minutes': round(alt_time_min, 0),
                                    'fuel_cost': round(alt_fuel_cost, 2),
                                    'toll_cost': round(alt_toll_cost, 2),
                                    'caz_cost': round(alt_caz_cost, 2),
                                    'geometry': alt_geometry
                                })

                    print(f"[Valhalla] SUCCESS: {len(routes)} routes found")
                    return jsonify({
                        'success': True,
                        'routes': routes,
                        'source': 'Valhalla ✅',
                        'distance': f'{routes[0]["distance_km"]:.2f} km',
                        'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                        'geometry': routes[0]['geometry'],
                        'fuel_cost': routes[0]['fuel_cost'],
                        'toll_cost': routes[0]['toll_cost'],
                        'caz_cost': routes[0]['caz_cost']
                    })
                else:
                    valhalla_error = f"Unexpected response format: {route_data.keys()}"
            else:
                valhalla_error = f"HTTP {response.status_code}"
        except requests.exceptions.Timeout:
            valhalla_error = "Timeout (>10s)"
        except requests.exceptions.ConnectionError as e:
            valhalla_error = f"Connection error"
        except Exception as e:
            valhalla_error = str(e)

        if valhalla_error:
            print(f"[Valhalla] Failed: {valhalla_error}")

        # Fallback to OSRM (public service)
        print(f"[OSRM] Trying fallback with ({start_lon},{start_lat}) to ({end_lon},{end_lat})")
        osrm_url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?alternatives=true"
        response = requests.get(osrm_url, timeout=10)

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

                    # Calculate costs
                    fuel_cost = 0
                    toll_cost = 0
                    caz_cost = 0

                    if vehicle_type == 'electric':
                        fuel_cost = (distance_km / 100) * energy_efficiency * electricity_price
                    else:
                        fuel_cost = (distance_km / 100) * fuel_efficiency * fuel_price

                    if include_tolls:
                        toll_cost = calculate_toll_cost(distance_km, 'motorway')

                    if include_caz and not caz_exempt:
                        caz_cost = calculate_caz_cost(distance_km, vehicle_type, caz_exempt)

                    # Determine route type
                    if idx == 0:
                        route_type = 'Fastest'
                    elif idx == 1:
                        route_type = 'Shortest'
                    elif idx == 2:
                        route_type = 'Balanced'
                    else:
                        route_type = f'Alternative {idx}'

                    routes.append({
                        'id': idx + 1,
                        'name': route_type,
                        'distance_km': round(distance_km, 2),
                        'duration_minutes': round(time_min, 0),
                        'fuel_cost': round(fuel_cost, 2),
                        'toll_cost': round(toll_cost, 2),
                        'caz_cost': round(caz_cost, 2),
                        'geometry': route_geometry
                    })

                print(f"[OSRM] SUCCESS: {len(routes)} routes found")
                return jsonify({
                    'success': True,
                    'routes': routes,
                    'source': 'OSRM (Fallback)',
                    'distance': f'{routes[0]["distance_km"]:.2f} km',
                    'time': f'{routes[0]["duration_minutes"]:.0f} minutes',
                    'geometry': routes[0]['geometry'],
                    'fuel_cost': routes[0]['fuel_cost'],
                    'toll_cost': routes[0]['toll_cost'],
                    'caz_cost': routes[0]['caz_cost']
                })

        return jsonify({
            'success': False,
            'error': f'Valhalla failed ({valhalla_error}), OSRM also unavailable'
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

        if len(waypoints) < 2:
            return jsonify({'success': False, 'error': 'Need at least 2 waypoints'})

        # Parse all waypoints
        coords = []
        coords_gh = []  # For GraphHopper format
        for wp in waypoints:
            parts = wp.split(',')
            lat = float(parts[0].strip())
            lon = float(parts[1].strip())
            coords.append({
                'lat': lat,
                'lon': lon
            })
            coords_gh.append({
                'lat': lat,
                'lng': lon
            })

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
                    time = path.get('time', 0) / 60000

                    return jsonify({
                        'success': True,
                        'distance': f'{distance:.2f} km',
                        'time': f'{time:.0f} minutes',
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
                    distance = route_data['trip']['summary']['length'] / 1000
                    time = route_data['trip']['summary']['time'] / 60

                    return jsonify({
                        'success': True,
                        'distance': f'{distance:.2f} km',
                        'time': f'{time:.0f} minutes',
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
        conn = sqlite3.connect(DB_FILE)
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
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        if request.method == 'GET':
            cursor.execute('SELECT hazard_type, penalty_seconds, enabled, proximity_threshold_meters FROM hazard_preferences')
            prefs = cursor.fetchall()
            conn.close()
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
            conn.close()
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
        description = data.get('description', '')

        conn = sqlite3.connect(DB_FILE)
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
def report_hazard():
    """Report a hazard (community report)."""
    try:
        data = request.json
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        hazard_type = data.get('hazard_type')  # speed_camera, police, roadworks, accident, etc.
        description = data.get('description', '')
        severity = data.get('severity', 'medium')
        user_id = data.get('user_id', 'anonymous')

        # Set expiry to 24 hours from now
        expiry_timestamp = int(time.time()) + 86400

        conn = sqlite3.connect(DB_FILE)
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

        conn = sqlite3.connect(DB_FILE)
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
# PHASE 2 FEATURES - SEARCH HISTORY & FAVORITES
# ============================================================================

@app.route('/api/search-history', methods=['GET', 'POST', 'DELETE'])
def manage_search_history():
    """Get, add, or clear search history."""
    try:
        conn = sqlite3.connect(DB_FILE)
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
            query = data.get('query', '').strip()
            result_name = data.get('result_name', '')
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
        conn = sqlite3.connect(DB_FILE)
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
            name = data.get('name', '').strip()
            address = data.get('address', '').strip()
            lat = float(data.get('lat', 0))
            lon = float(data.get('lon', 0))
            category = data.get('category', 'location').strip()

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
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
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
        lat = float(request.args.get('lat', 51.5074))
        lon = float(request.args.get('lon', -0.1278))
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
            import pyttsx3
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

def parse_voice_command_web(command, lat, lon):
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
        conn = sqlite3.connect(DB_FILE)
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
        conn = sqlite3.connect(DB_FILE)
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
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        if request.method == 'GET':
            # Get current day and hour
            from datetime import datetime
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
        conn = sqlite3.connect(DB_FILE)
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
            from datetime import datetime
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
def get_single_engine_status(engine_name):
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
def resolve_alert_endpoint(alert_id):
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
def get_alerts_by_severity(severity):
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
def get_alerts_by_engine_endpoint(engine_name):
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
def send_alert_notification(alert_id):
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
def resolve_all_engine_alerts(engine_name):
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

if __name__ == '__main__':
    # Get port from environment variable (Railway sets this)
    port = int(os.getenv('PORT', 5000))

    # Initialize and start monitoring
    if get_monitor:
        monitor = get_monitor()
        monitor.start_monitoring()
        print("✅ Routing engine monitoring started")

    print("\n" + "="*60)
    print("🚀 Voyagr Web App is running!")
    print("="*60)
    print(f"\n🌐 Access the app at:")
    print(f"   http://localhost:{port}")
    print("\n📱 Access from your Pixel 6:")
    print("   1. Find your PC's IP address (usually 192.168.x.x)")
    print("   2. Open browser on Pixel 6")
    print(f"   3. Go to: http://YOUR_PC_IP:{port}")
    print("\n📊 Monitoring Dashboard:")
    print(f"   http://localhost:{port}/monitoring")
    print("\n" + "="*60 + "\n")

    try:
        app.run(host='0.0.0.0', port=port, debug=False)
    finally:
        if get_monitor:
            monitor = get_monitor()
            monitor.stop_monitoring()

