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
            url = f"{engine['url']}{engine['health_endpoint']}"
            response = requests.get(url, timeout=engine['timeout'])
            response_time = (time.time() - start_time) * 1000
            
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
        
        # Update engine status
        cursor.execute('''
            SELECT consecutive_failures FROM engine_status WHERE engine_name = ?
        ''', (engine_name,))
        result = cursor.fetchone()
        consecutive_failures = result[0] if result else 0
        
        if status == 'up':
            consecutive_failures = 0
            new_status = 'up'
        else:
            consecutive_failures += 1
            new_status = 'down' if consecutive_failures >= ALERT_THRESHOLD else 'degraded'
        
        cursor.execute('''
            UPDATE engine_status
            SET status = ?, last_check = ?, consecutive_failures = ?, last_failure_time = ?
            WHERE engine_name = ?
        ''', (new_status, datetime.now(), consecutive_failures, 
              datetime.now() if status == 'down' else None, engine_name))
        
        # Check if alert should be created
        if consecutive_failures == ALERT_THRESHOLD:
            self._create_alert(cursor, engine_name, 'engine_down', 'critical', 
                             f'{engine_name} has failed {ALERT_THRESHOLD} consecutive health checks')
        elif consecutive_failures == 1 and status == 'down':
            self._create_alert(cursor, engine_name, 'engine_failure', 'warning',
                             f'{engine_name} health check failed: {error}')
        
        conn.commit()
        conn.close()
    
    def _create_alert(self, cursor, engine_name: str, alert_type: str, severity: str, message: str):
        """Create an alert in the database."""
        cursor.execute('''
            INSERT INTO routing_alerts (engine_name, alert_type, severity, message)
            VALUES (?, ?, ?, ?)
        ''', (engine_name, alert_type, severity, message))
        logger.warning(f"ALERT: {engine_name} - {message}")
    
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
    
    def get_recent_alerts(self, limit: int = 10) -> List[Dict]:
        """Get recent alerts."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        
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
    
    def _monitor_loop(self):
        """Background monitoring loop."""
        while self.running:
            try:
                for engine_name in ENGINES.keys():
                    status, response_time, error = self.check_engine_health(engine_name)
                    self.record_health_check(engine_name, status, response_time, error)
                    logger.info(f"{engine_name}: {status} ({response_time:.0f}ms)")
                
                time.sleep(HEALTH_CHECK_INTERVAL)
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")
                time.sleep(10)


# Global monitor instance
_monitor = None

def get_monitor() -> RoutingMonitor:
    """Get or create global monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = RoutingMonitor()
    return _monitor

