#!/usr/bin/env python3
"""
Routing Engine Health Monitoring System for Voyagr PWA
Monitors GraphHopper, Valhalla, and OSRM routing engines
Tracks health status, alerts, and OCI costs
"""

import requests
import sqlite3
import threading
import time
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('routing_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Routing engine URLs
ENGINES = {
    'graphhopper': {
        'url': os.getenv('GRAPHHOPPER_URL', 'http://81.0.246.97:8989'),
        'health_endpoint': '/info',
        'timeout': 5
    },
    'valhalla': {
        'url': os.getenv('VALHALLA_URL', 'http://141.147.102.102:8002'),
        'health_endpoint': '/status',
        'timeout': 5
    },
    'osrm': {
        'url': 'http://router.project-osrm.org',
        'health_endpoint': '/status',
        'timeout': 5
    }
}

DB_FILE = 'voyagr_web.db'
HEALTH_CHECK_INTERVAL = 300  # 5 minutes
ALERT_THRESHOLD = 3  # Alert after 3 consecutive failures


class RoutingMonitor:
    """Monitor routing engine health and track costs."""
    
    def __init__(self, db_file=DB_FILE):
        self.db_file = db_file
        self.running = False
        self.monitor_thread = None
        self.init_monitoring_db()
    
    def init_monitoring_db(self):
        """Initialize monitoring database tables."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        
        # Health check history table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS engine_health_checks (
                id INTEGER PRIMARY KEY,
                engine_name TEXT,
                status TEXT,
                response_time_ms REAL,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Engine status table (current status)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS engine_status (
                engine_name TEXT PRIMARY KEY,
                status TEXT,
                last_check DATETIME,
                consecutive_failures INTEGER DEFAULT 0,
                last_failure_time DATETIME,
                uptime_percentage REAL DEFAULT 100.0
            )
        ''')
        
        # Alerts table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS routing_alerts (
                id INTEGER PRIMARY KEY,
                engine_name TEXT,
                alert_type TEXT,
                severity TEXT,
                message TEXT,
                is_resolved INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME
            )
        ''')
        
        # OCI cost tracking table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS oci_cost_tracking (
                id INTEGER PRIMARY KEY,
                date DATE,
                bandwidth_gb REAL DEFAULT 0,
                compute_hours REAL DEFAULT 0,
                api_requests INTEGER DEFAULT 0,
                storage_gb REAL DEFAULT 0,
                estimated_cost REAL DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Bandwidth tracking table (detailed)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bandwidth_tracking (
                id INTEGER PRIMARY KEY,
                engine_name TEXT,
                inbound_gb REAL DEFAULT 0,
                outbound_gb REAL DEFAULT 0,
                request_type TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # API request tracking table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS api_request_tracking (
                id INTEGER PRIMARY KEY,
                engine_name TEXT,
                request_type TEXT,
                count INTEGER DEFAULT 1,
                date DATE,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Cost trend analysis table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cost_trends (
                id INTEGER PRIMARY KEY,
                date DATE,
                daily_cost REAL,
                daily_bandwidth_gb REAL,
                daily_requests INTEGER,
                weekly_avg_cost REAL,
                monthly_total_cost REAL,
                cost_spike_detected INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Initialize engine status
        for engine_name in ENGINES.keys():
            cursor.execute('''
                INSERT OR IGNORE INTO engine_status (engine_name, status, last_check)
                VALUES (?, ?, ?)
            ''', (engine_name, 'unknown', datetime.now()))
        
        conn.commit()
        conn.close()
        logger.info("Monitoring database initialized")
    
    def check_engine_health(self, engine_name: str) -> Tuple[str, float, str]:
        """
        Check health of a routing engine.
        Returns: (status, response_time_ms, error_message)
        """
        engine = ENGINES.get(engine_name)
        if not engine:
            return 'unknown', 0, 'Engine not found'

        try:
            start_time = time.time()

            # Special handling for OSRM - use route endpoint instead of status
            if engine_name == 'osrm':
                # OSRM /status endpoint returns 400, so test with a simple route instead
                url = f"{engine['url']}/route/v1/driving/-0.1278,51.5074;-0.1378,51.5174"
            else:
                url = f"{engine['url']}{engine['health_endpoint']}"

            response = requests.get(url, timeout=engine['timeout'])
            response_time = (time.time() - start_time) * 1000

            # OSRM returns 200 for successful route, other engines return 200 for status
            if response.status_code == 200:
                return 'up', response_time, ''
            else:
                return 'down', response_time, f'HTTP {response.status_code}'

        except requests.Timeout:
            response_time = (time.time() - start_time) * 1000
            return 'down', response_time, 'Timeout'
        except requests.ConnectionError:
            response_time = (time.time() - start_time) * 1000
            return 'down', response_time, 'Connection refused'
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return 'down', response_time, str(e)
    
    def record_health_check(self, engine_name: str, status: str, response_time: float, error: str):
        """Record health check result in database."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        # Record health check
        cursor.execute('''
            INSERT INTO engine_health_checks (engine_name, status, response_time_ms, error_message)
            VALUES (?, ?, ?, ?)
        ''', (engine_name, status, response_time, error))

        # Get current engine status
        cursor.execute('''
            SELECT consecutive_failures, status FROM engine_status WHERE engine_name = ?
        ''', (engine_name,))
        result = cursor.fetchone()
        consecutive_failures = result[0] if result else 0
        previous_status = result[1] if result else 'unknown'

        # Update consecutive failures and status
        if status == 'up':
            # Engine recovered
            if consecutive_failures > 0:
                # Create recovery alert
                self._create_alert(cursor, engine_name, 'engine_recovery', 'info',
                                 f'{engine_name} recovered after {consecutive_failures} failures')
                logger.info(f"✅ {engine_name} RECOVERED (was down for {consecutive_failures} checks)")
            consecutive_failures = 0
            new_status = 'up'
        else:
            # Engine failed
            consecutive_failures += 1
            new_status = 'down' if consecutive_failures >= ALERT_THRESHOLD else 'degraded'

            # Create appropriate alert based on failure count
            if consecutive_failures == ALERT_THRESHOLD:
                self._create_alert(cursor, engine_name, 'engine_down', 'critical',
                                 f'{engine_name} is DOWN - {ALERT_THRESHOLD} consecutive failures. Error: {error}')
                logger.error(f"🔴 CRITICAL: {engine_name} DOWN after {ALERT_THRESHOLD} failures")
            elif consecutive_failures == 1:
                self._create_alert(cursor, engine_name, 'engine_failure', 'warning',
                                 f'{engine_name} health check failed (1/3): {error}')
                logger.warning(f"⚠️ {engine_name} FAILURE (1/3): {error}")
            elif consecutive_failures == 2:
                self._create_alert(cursor, engine_name, 'engine_failure', 'warning',
                                 f'{engine_name} health check failed (2/3): {error}')
                logger.warning(f"⚠️ {engine_name} FAILURE (2/3): {error}")

        # Update engine status
        cursor.execute('''
            UPDATE engine_status
            SET status = ?, last_check = ?, consecutive_failures = ?, last_failure_time = ?
            WHERE engine_name = ?
        ''', (new_status, datetime.now(), consecutive_failures,
              datetime.now() if status == 'down' else None, engine_name))

        conn.commit()
        conn.close()

    def _create_alert(self, cursor, engine_name: str, alert_type: str, severity: str, message: str):
        """Create an alert in the database with deduplication."""
        # Check if a similar unresolved alert already exists (within last 5 minutes)
        five_min_ago = datetime.now() - timedelta(minutes=5)
        cursor.execute('''
            SELECT id FROM routing_alerts
            WHERE engine_name = ? AND alert_type = ? AND is_resolved = 0
            AND created_at > ?
            LIMIT 1
        ''', (engine_name, alert_type, five_min_ago))

        existing_alert = cursor.fetchone()

        # Only create new alert if no similar unresolved alert exists
        if not existing_alert:
            cursor.execute('''
                INSERT INTO routing_alerts (engine_name, alert_type, severity, message)
                VALUES (?, ?, ?, ?)
            ''', (engine_name, alert_type, severity, message))
            logger.warning(f"🚨 ALERT [{severity.upper()}]: {engine_name} - {message}")
        else:
            logger.debug(f"Alert deduplication: Similar alert already exists for {engine_name}")
    
    def calculate_uptime(self, engine_name: str, hours: int = 24) -> float:
        """Calculate uptime percentage for an engine."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        
        cutoff_time = datetime.now() - timedelta(hours=hours)
        cursor.execute('''
            SELECT COUNT(*) as total, SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up_count
            FROM engine_health_checks
            WHERE engine_name = ? AND timestamp > ?
        ''', (engine_name, cutoff_time))
        
        result = cursor.fetchone()
        conn.close()
        
        total = result[0] if result[0] else 1
        up_count = result[1] if result[1] else 0
        
        return (up_count / total * 100) if total > 0 else 100.0
    
    def get_engine_status(self, engine_name: str) -> Dict:
        """Get current status of an engine."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT status, last_check, consecutive_failures, uptime_percentage
            FROM engine_status WHERE engine_name = ?
        ''', (engine_name,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            uptime = self.calculate_uptime(engine_name)
            return {
                'engine': engine_name,
                'status': result[0],
                'last_check': result[1],
                'consecutive_failures': result[2],
                'uptime_24h': round(uptime, 2)
            }
        return None
    
    def get_all_engine_status(self) -> List[Dict]:
        """Get status of all engines."""
        return [self.get_engine_status(engine) for engine in ENGINES.keys()]
    
    def get_recent_alerts(self, limit: int = 10, unresolved_only: bool = False) -> List[Dict]:
        """Get recent alerts with optional filtering."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        if unresolved_only:
            cursor.execute('''
                SELECT id, engine_name, alert_type, severity, message, created_at, is_resolved
                FROM routing_alerts
                WHERE is_resolved = 0
                ORDER BY created_at DESC LIMIT ?
            ''', (limit,))
        else:
            cursor.execute('''
                SELECT id, engine_name, alert_type, severity, message, created_at, is_resolved
                FROM routing_alerts
                ORDER BY created_at DESC LIMIT ?
            ''', (limit,))

        alerts = []
        for row in cursor.fetchall():
            alerts.append({
                'id': row[0],
                'engine': row[1],
                'type': row[2],
                'severity': row[3],
                'message': row[4],
                'created_at': row[5],
                'resolved': bool(row[6])
            })

        conn.close()
        return alerts

    def get_alerts_by_severity(self, severity: str, limit: int = 10) -> List[Dict]:
        """Get alerts filtered by severity level."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, engine_name, alert_type, severity, message, created_at, is_resolved
            FROM routing_alerts
            WHERE severity = ?
            ORDER BY created_at DESC LIMIT ?
        ''', (severity, limit))

        alerts = []
        for row in cursor.fetchall():
            alerts.append({
                'id': row[0],
                'engine': row[1],
                'type': row[2],
                'severity': row[3],
                'message': row[4],
                'created_at': row[5],
                'resolved': bool(row[6])
            })

        conn.close()
        return alerts

    def get_alerts_by_engine(self, engine_name: str, limit: int = 10) -> List[Dict]:
        """Get alerts for a specific engine."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, engine_name, alert_type, severity, message, created_at, is_resolved
            FROM routing_alerts
            WHERE engine_name = ?
            ORDER BY created_at DESC LIMIT ?
        ''', (engine_name, limit))

        alerts = []
        for row in cursor.fetchall():
            alerts.append({
                'id': row[0],
                'engine': row[1],
                'type': row[2],
                'severity': row[3],
                'message': row[4],
                'created_at': row[5],
                'resolved': bool(row[6])
            })

        conn.close()
        return alerts

    def resolve_alert(self, alert_id: int):
        """Mark an alert as resolved."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE routing_alerts
            SET is_resolved = 1, resolved_at = ?
            WHERE id = ?
        ''', (datetime.now(), alert_id))

        conn.commit()
        conn.close()
        logger.info(f"Alert {alert_id} marked as resolved")

    def resolve_all_alerts_for_engine(self, engine_name: str):
        """Resolve all unresolved alerts for an engine."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE routing_alerts
            SET is_resolved = 1, resolved_at = ?
            WHERE engine_name = ? AND is_resolved = 0
        ''', (datetime.now(), engine_name))

        conn.commit()
        conn.close()
        logger.info(f"All alerts for {engine_name} marked as resolved")

    def get_alert_summary(self) -> Dict:
        """Get summary of all alerts."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        # Count by severity
        cursor.execute('''
            SELECT severity, COUNT(*) as count
            FROM routing_alerts
            WHERE is_resolved = 0
            GROUP BY severity
        ''')
        severity_counts = {row[0]: row[1] for row in cursor.fetchall()}

        # Count by engine
        cursor.execute('''
            SELECT engine_name, COUNT(*) as count
            FROM routing_alerts
            WHERE is_resolved = 0
            GROUP BY engine_name
        ''')
        engine_counts = {row[0]: row[1] for row in cursor.fetchall()}

        # Total counts
        cursor.execute('SELECT COUNT(*) FROM routing_alerts WHERE is_resolved = 0')
        total_unresolved = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM routing_alerts')
        total_all = cursor.fetchone()[0]

        conn.close()

        return {
            'total_unresolved': total_unresolved,
            'total_all': total_all,
            'by_severity': severity_counts,
            'by_engine': engine_counts
        }
    
    def track_oci_cost(self, bandwidth_gb: float = 0, api_requests: int = 0):
        """Track OCI Valhalla costs."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        
        today = datetime.now().date()
        
        # Get or create today's record
        cursor.execute('''
            SELECT id, bandwidth_gb, api_requests FROM oci_cost_tracking WHERE date = ?
        ''', (today,))
        
        result = cursor.fetchone()
        
        if result:
            record_id, existing_bandwidth, existing_requests = result
            new_bandwidth = existing_bandwidth + bandwidth_gb
            new_requests = existing_requests + api_requests
            
            cursor.execute('''
                UPDATE oci_cost_tracking
                SET bandwidth_gb = ?, api_requests = ?, estimated_cost = ?
                WHERE id = ?
            ''', (new_bandwidth, new_requests, self._calculate_cost(new_bandwidth, new_requests), record_id))
        else:
            cursor.execute('''
                INSERT INTO oci_cost_tracking (date, bandwidth_gb, api_requests, estimated_cost)
                VALUES (?, ?, ?, ?)
            ''', (today, bandwidth_gb, api_requests, self._calculate_cost(bandwidth_gb, api_requests)))
        
        conn.commit()
        conn.close()
    
    def _calculate_cost(self, bandwidth_gb: float, api_requests: int) -> float:
        """Calculate estimated OCI cost."""
        # OCI pricing (approximate)
        bandwidth_cost = bandwidth_gb * 0.0085  # $0.0085 per GB
        compute_cost = 0.05  # Rough estimate for compute instance
        return round(bandwidth_cost + compute_cost, 2)

    def track_bandwidth(self, engine_name: str, inbound_gb: float = 0, outbound_gb: float = 0, request_type: str = 'health_check'):
        """Track bandwidth usage for routing engine."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO bandwidth_tracking (engine_name, inbound_gb, outbound_gb, request_type)
            VALUES (?, ?, ?, ?)
        ''', (engine_name, inbound_gb, outbound_gb, request_type))

        conn.commit()
        conn.close()
        logger.debug(f"Bandwidth tracked for {engine_name}: {outbound_gb}GB out")

    def track_api_request(self, engine_name: str, request_type: str = 'health_check'):
        """Track API request to routing engine."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        today = datetime.now().date()

        # Check if record exists
        cursor.execute('''
            SELECT id, count FROM api_request_tracking
            WHERE engine_name = ? AND request_type = ? AND date = ?
        ''', (engine_name, request_type, today))

        result = cursor.fetchone()

        if result:
            record_id, count = result
            cursor.execute('''
                UPDATE api_request_tracking SET count = ? WHERE id = ?
            ''', (count + 1, record_id))
        else:
            cursor.execute('''
                INSERT INTO api_request_tracking (engine_name, request_type, count, date)
                VALUES (?, ?, 1, ?)
            ''', (engine_name, request_type, today))

        conn.commit()
        conn.close()

    def get_bandwidth_usage(self, days: int = 30) -> List[Dict]:
        """Get bandwidth usage history."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT DATE(timestamp) as date, engine_name, SUM(inbound_gb) as inbound, SUM(outbound_gb) as outbound
            FROM bandwidth_tracking
            WHERE DATE(timestamp) >= ?
            GROUP BY DATE(timestamp), engine_name
            ORDER BY date DESC
        ''', (cutoff_date,))

        bandwidth_data = []
        for row in cursor.fetchall():
            bandwidth_data.append({
                'date': str(row[0]),
                'engine': row[1],
                'inbound_gb': round(row[2], 4),
                'outbound_gb': round(row[3], 4),
                'total_gb': round(row[2] + row[3], 4)
            })

        conn.close()
        return bandwidth_data

    def get_request_counts(self, days: int = 30) -> Dict:
        """Get API request counts by type."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT date, engine_name, request_type, SUM(count) as total
            FROM api_request_tracking
            WHERE date >= ?
            GROUP BY date, engine_name, request_type
            ORDER BY date DESC
        ''', (cutoff_date,))

        request_data = {}
        for row in cursor.fetchall():
            date_str = str(row[0])
            if date_str not in request_data:
                request_data[date_str] = {}

            key = f"{row[1]}_{row[2]}"
            request_data[date_str][key] = row[3]

        conn.close()
        return request_data

    def get_daily_costs(self, days: int = 30) -> List[Dict]:
        """Get daily cost tracking."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT date, bandwidth_gb, api_requests, estimated_cost
            FROM oci_cost_tracking
            WHERE date >= ?
            ORDER BY date DESC
        ''', (cutoff_date,))

        costs = []
        for row in cursor.fetchall():
            costs.append({
                'date': str(row[0]),
                'bandwidth_gb': round(row[1], 2),
                'api_requests': row[2],
                'estimated_cost': row[3]
            })

        conn.close()
        return costs
    
    def start_monitoring(self):
        """Start background health check monitoring."""
        if self.running:
            logger.warning("Monitoring already running")
            return
        
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        logger.info("Monitoring started")
    
    def stop_monitoring(self):
        """Stop background monitoring."""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        logger.info("Monitoring stopped")
    
    def estimate_monthly_cost(self, days: int = 30) -> Dict:
        """Estimate monthly OCI costs based on historical data."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT SUM(bandwidth_gb), SUM(api_requests), COUNT(DISTINCT date)
            FROM oci_cost_tracking
            WHERE date >= ?
        ''', (cutoff_date,))

        result = cursor.fetchone()
        total_bandwidth = result[0] if result[0] else 0
        total_requests = result[1] if result[1] else 0
        days_tracked = result[2] if result[2] else 1

        # Calculate daily averages
        daily_bandwidth_avg = total_bandwidth / days_tracked if days_tracked > 0 else 0
        daily_requests_avg = total_requests / days_tracked if days_tracked > 0 else 0

        # Project to 30 days
        projected_bandwidth = daily_bandwidth_avg * 30
        projected_requests = daily_requests_avg * 30

        # Calculate costs
        bandwidth_cost = projected_bandwidth * 0.0085
        compute_cost = 0.05 * 30  # Daily compute cost
        request_cost = (projected_requests * 0.00001) if projected_requests > 0 else 0

        total_cost = round(bandwidth_cost + compute_cost + request_cost, 2)

        conn.close()

        return {
            'projected_bandwidth_gb': round(projected_bandwidth, 2),
            'projected_requests': int(projected_requests),
            'bandwidth_cost': round(bandwidth_cost, 2),
            'compute_cost': round(compute_cost, 2),
            'request_cost': round(request_cost, 2),
            'total_monthly_cost': total_cost,
            'daily_average_cost': round(total_cost / 30, 2),
            'based_on_days': days_tracked
        }

    def analyze_cost_trends(self, days: int = 30) -> Dict:
        """Analyze cost trends and identify anomalies."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT date, bandwidth_gb, api_requests, estimated_cost
            FROM oci_cost_tracking
            WHERE date >= ?
            ORDER BY date ASC
        ''', (cutoff_date,))

        daily_data = cursor.fetchall()
        conn.close()

        if not daily_data:
            return {
                'status': 'insufficient_data',
                'message': 'Not enough data for trend analysis'
            }

        # Calculate statistics
        costs = [row[3] for row in daily_data]
        bandwidths = [row[1] for row in daily_data]
        requests = [row[2] for row in daily_data]

        daily_avg_cost = sum(costs) / len(costs) if costs else 0
        daily_avg_bandwidth = sum(bandwidths) / len(bandwidths) if bandwidths else 0
        daily_avg_requests = sum(requests) / len(requests) if requests else 0

        # Calculate weekly averages
        weekly_avg_cost = daily_avg_cost * 7

        # Detect cost spikes (>20% increase day-over-day)
        spikes = []
        for i in range(1, len(costs)):
            prev_cost = costs[i-1]
            curr_cost = costs[i]
            if prev_cost > 0:
                increase_pct = ((curr_cost - prev_cost) / prev_cost) * 100
                if increase_pct > 20:
                    spikes.append({
                        'date': str(daily_data[i][0]),
                        'cost': curr_cost,
                        'increase_pct': round(increase_pct, 2),
                        'bandwidth_gb': daily_data[i][1],
                        'requests': daily_data[i][2]
                    })

        # Calculate 7-day and 30-day forecasts
        if len(costs) >= 7:
            last_7_days_avg = sum(costs[-7:]) / 7
            forecast_7_days = round(last_7_days_avg * 7, 2)
        else:
            forecast_7_days = round(daily_avg_cost * 7, 2)

        forecast_30_days = round(daily_avg_cost * 30, 2)

        # Check if forecast exceeds threshold
        cost_alert = forecast_30_days > 10.0

        return {
            'analysis_period_days': len(daily_data),
            'daily_average_cost': round(daily_avg_cost, 2),
            'daily_average_bandwidth_gb': round(daily_avg_bandwidth, 2),
            'daily_average_requests': int(daily_avg_requests),
            'weekly_average_cost': round(weekly_avg_cost, 2),
            'monthly_total_cost': round(sum(costs), 2),
            'cost_spikes_detected': len(spikes),
            'cost_spikes': spikes,
            'forecast_7_days': forecast_7_days,
            'forecast_30_days': forecast_30_days,
            'cost_alert_threshold_exceeded': cost_alert,
            'alert_message': f'Projected monthly cost (${forecast_30_days}) exceeds $10 threshold' if cost_alert else 'Cost within normal range'
        }

    def get_cost_history(self, days: int = 30) -> Dict:
        """Get comprehensive cost history."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT date, bandwidth_gb, api_requests, estimated_cost
            FROM oci_cost_tracking
            WHERE date >= ?
            ORDER BY date DESC
        ''', (cutoff_date,))

        history = []
        total_bandwidth = 0
        total_requests = 0
        total_cost = 0

        for row in cursor.fetchall():
            history.append({
                'date': str(row[0]),
                'bandwidth_gb': round(row[1], 2),
                'api_requests': row[2],
                'estimated_cost': row[3]
            })
            total_bandwidth += row[1]
            total_requests += row[2]
            total_cost += row[3]

        conn.close()

        return {
            'history': history,
            'summary': {
                'period_days': len(history),
                'total_bandwidth_gb': round(total_bandwidth, 2),
                'total_requests': total_requests,
                'total_cost': round(total_cost, 2),
                'average_daily_cost': round(total_cost / len(history), 2) if history else 0
            }
        }

    def export_cost_history_csv(self, days: int = 30, filename: str = 'cost_history.csv') -> str:
        """Export cost history to CSV file."""
        import csv

        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        cursor.execute('''
            SELECT date, bandwidth_gb, api_requests, estimated_cost
            FROM oci_cost_tracking
            WHERE date >= ?
            ORDER BY date ASC
        ''', (cutoff_date,))

        rows = cursor.fetchall()
        conn.close()

        try:
            with open(filename, 'w', newline='') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(['Date', 'Bandwidth (GB)', 'API Requests', 'Estimated Cost ($)'])

                for row in rows:
                    writer.writerow([row[0], round(row[1], 2), row[2], row[3]])

            logger.info(f"Cost history exported to {filename}")
            return filename
        except Exception as e:
            logger.error(f"Failed to export cost history: {e}")
            return None

    def _monitor_loop(self):
        """Background monitoring loop."""
        logger.info("Starting monitoring loop...")
        while self.running:
            try:
                logger.debug("Running health checks...")
                for engine_name in ENGINES.keys():
                    status, response_time, error = self.check_engine_health(engine_name)
                    self.record_health_check(engine_name, status, response_time, error)

                    # Log with emoji indicators
                    if status == 'up':
                        logger.info(f"✅ {engine_name}: UP ({response_time:.0f}ms)")
                    else:
                        logger.warning(f"❌ {engine_name}: DOWN ({response_time:.0f}ms) - {error}")

                # Log alert summary
                summary = self.get_alert_summary()
                if summary['total_unresolved'] > 0:
                    logger.warning(f"⚠️ Active alerts: {summary['total_unresolved']} unresolved")

                time.sleep(HEALTH_CHECK_INTERVAL)
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}", exc_info=True)
                time.sleep(10)


    def send_alert_notification(self, alert_id: int, method: str = 'log'):
        """
        Send alert notification via specified method.
        Methods: 'log', 'email', 'browser'
        """
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT engine_name, alert_type, severity, message, created_at
            FROM routing_alerts WHERE id = ?
        ''', (alert_id,))

        result = cursor.fetchone()
        conn.close()

        if not result:
            logger.warning(f"Alert {alert_id} not found")
            return False

        engine_name, alert_type, severity, message, created_at = result

        if method == 'log':
            self._notify_log(engine_name, severity, message)
        elif method == 'email':
            self._notify_email(engine_name, severity, message, created_at)
        elif method == 'browser':
            self._notify_browser(engine_name, severity, message)
        else:
            logger.warning(f"Unknown notification method: {method}")
            return False

        return True

    def _notify_log(self, engine_name: str, severity: str, message: str):
        """Log notification."""
        if severity == 'critical':
            logger.critical(f"🔴 CRITICAL ALERT: {message}")
        elif severity == 'warning':
            logger.warning(f"⚠️ WARNING ALERT: {message}")
        else:
            logger.info(f"ℹ️ INFO ALERT: {message}")

    def _notify_email(self, engine_name: str, severity: str, message: str, created_at: str):
        """Email notification (placeholder for implementation)."""
        # This is a placeholder - implement with your email service
        logger.info(f"📧 Email notification would be sent: {engine_name} - {message}")
        # TODO: Implement email sending with SMTP or email service
        # Example: send_email(to=ADMIN_EMAIL, subject=f"Alert: {engine_name}", body=message)

    def _notify_browser(self, engine_name: str, severity: str, message: str):
        """Browser notification (via WebSocket or polling)."""
        # This is a placeholder - implement with your frontend
        logger.info(f"🔔 Browser notification would be sent: {engine_name} - {message}")
        # TODO: Implement browser notification via WebSocket or API endpoint
        # The frontend can poll /api/monitoring/alerts for new alerts


# Global monitor instance
_monitor = None

def get_monitor() -> RoutingMonitor:
    """Get or create global monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = RoutingMonitor()
    return _monitor

