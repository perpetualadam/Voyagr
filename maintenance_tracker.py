"""
Vehicle Maintenance Tracking Module for Voyagr
Tracks maintenance records and generates service reminders.
"""

import json
import time
import sqlite3
from datetime import datetime, timedelta


class MaintenanceTracker:
    """Tracks vehicle maintenance and service reminders."""
    
    # Standard maintenance intervals
    MAINTENANCE_INTERVALS = {
        'oil_change': {'months': 6, 'mileage_km': 10000},
        'tire_rotation': {'months': 6, 'mileage_km': 10000},
        'air_filter': {'months': 12, 'mileage_km': 20000},
        'cabin_filter': {'months': 12, 'mileage_km': 20000},
        'brake_inspection': {'months': 12, 'mileage_km': 20000},
        'battery_check': {'months': 12, 'mileage_km': 0},
        'coolant_flush': {'months': 24, 'mileage_km': 40000},
        'transmission_fluid': {'months': 24, 'mileage_km': 40000},
        'spark_plugs': {'months': 36, 'mileage_km': 60000},
        'suspension_inspection': {'months': 12, 'mileage_km': 20000}
    }
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the maintenance tracker."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
    
    def add_maintenance_record(self, vehicle_id, service_type, date, mileage_km, cost, notes=None):
        """Add a maintenance record."""
        try:
            timestamp = int(time.time())
            
            self.cursor.execute("""
                INSERT INTO maintenance_records
                (vehicle_id, service_type, date, mileage_km, cost, notes, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (vehicle_id, service_type, date, mileage_km, cost, notes, timestamp))
            
            self.conn.commit()
            print(f"[OK] Maintenance record added: {service_type}")
            return True
        except Exception as e:
            print(f"[FAIL] Add maintenance record error: {e}")
            return False
    
    def create_maintenance_reminder(self, vehicle_id, service_type, due_date, due_mileage_km):
        """Create a maintenance reminder."""
        try:
            timestamp = int(time.time())
            
            self.cursor.execute("""
                INSERT INTO maintenance_reminders
                (vehicle_id, service_type, due_date, due_mileage_km, status, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (vehicle_id, service_type, due_date, due_mileage_km, 'pending', timestamp))
            
            self.conn.commit()
            print(f"[OK] Maintenance reminder created: {service_type}")
            return True
        except Exception as e:
            print(f"[FAIL] Create reminder error: {e}")
            return False
    
    def generate_reminders(self, vehicle_id, current_mileage_km):
        """Generate maintenance reminders based on vehicle state."""
        try:
            reminders = []
            current_time = int(time.time())
            
            for service_type, intervals in self.MAINTENANCE_INTERVALS.items():
                # Check if reminder already exists
                self.cursor.execute("""
                    SELECT id FROM maintenance_reminders
                    WHERE vehicle_id = ? AND service_type = ? AND status = 'pending'
                """, (vehicle_id, service_type))
                
                if self.cursor.fetchone():
                    continue
                
                # Get last service date
                self.cursor.execute("""
                    SELECT date, mileage_km FROM maintenance_records
                    WHERE vehicle_id = ? AND service_type = ?
                    ORDER BY date DESC LIMIT 1
                """, (vehicle_id, service_type))
                
                last_service = self.cursor.fetchone()
                
                if last_service:
                    last_date, last_mileage = last_service
                    months_since = (current_time - last_date) / (30 * 86400)
                    mileage_since = current_mileage_km - last_mileage
                else:
                    months_since = 999
                    mileage_since = 999999
                
                # Check if service is due
                due_months = intervals.get('months', 999)
                due_mileage = intervals.get('mileage_km', 999999)
                
                if months_since >= due_months or mileage_since >= due_mileage:
                    due_date = current_time + (7 * 86400)  # Due in 1 week
                    due_mileage_km = current_mileage_km + 500
                    
                    self.create_maintenance_reminder(
                        vehicle_id, service_type, due_date, due_mileage_km
                    )
                    
                    reminders.append({
                        'service_type': service_type,
                        'reason': 'time' if months_since >= due_months else 'mileage',
                        'overdue_by': max(months_since - due_months, mileage_since - due_mileage)
                    })
            
            return reminders
        except Exception as e:
            print(f"[FAIL] Generate reminders error: {e}")
            return []
    
    def get_pending_reminders(self, vehicle_id):
        """Get pending maintenance reminders."""
        try:
            self.cursor.execute("""
                SELECT id, service_type, due_date, due_mileage_km
                FROM maintenance_reminders
                WHERE vehicle_id = ? AND status = 'pending'
                ORDER BY due_date ASC
            """, (vehicle_id,))
            
            reminders = []
            for row in self.cursor.fetchall():
                days_until = (row[2] - int(time.time())) / 86400
                reminders.append({
                    'id': row[0],
                    'service_type': row[1],
                    'due_date': row[2],
                    'due_mileage_km': row[3],
                    'days_until': max(days_until, 0)
                })
            
            return reminders
        except Exception as e:
            print(f"[FAIL] Get pending reminders error: {e}")
            return []
    
    def complete_reminder(self, reminder_id):
        """Mark a reminder as completed."""
        try:
            self.cursor.execute("""
                UPDATE maintenance_reminders
                SET status = 'completed'
                WHERE id = ?
            """, (reminder_id,))
            
            self.conn.commit()
            print(f"[OK] Reminder completed: {reminder_id}")
            return True
        except Exception as e:
            print(f"[FAIL] Complete reminder error: {e}")
            return False
    
    def get_maintenance_history(self, vehicle_id, limit=20):
        """Get maintenance history for a vehicle."""
        try:
            self.cursor.execute("""
                SELECT id, service_type, date, mileage_km, cost, notes
                FROM maintenance_records
                WHERE vehicle_id = ?
                ORDER BY date DESC
                LIMIT ?
            """, (vehicle_id, limit))
            
            history = []
            for row in self.cursor.fetchall():
                history.append({
                    'id': row[0],
                    'service_type': row[1],
                    'date': row[2],
                    'mileage_km': row[3],
                    'cost': row[4],
                    'notes': row[5]
                })
            
            return history
        except Exception as e:
            print(f"[FAIL] Get maintenance history error: {e}")
            return []
    
    def get_maintenance_costs(self, vehicle_id, days=365):
        """Get maintenance costs for a vehicle."""
        try:
            cutoff_time = int(time.time()) - (days * 86400)
            
            self.cursor.execute("""
                SELECT service_type, SUM(cost) as total_cost, COUNT(*) as count
                FROM maintenance_records
                WHERE vehicle_id = ? AND date >= ?
                GROUP BY service_type
                ORDER BY total_cost DESC
            """, (vehicle_id, cutoff_time))
            
            costs = {}
            total = 0
            for row in self.cursor.fetchall():
                costs[row[0]] = {'total': row[1], 'count': row[2]}
                total += row[1]
            
            return {'by_service': costs, 'total': total}
        except Exception as e:
            print(f"[FAIL] Get maintenance costs error: {e}")
            return {'by_service': {}, 'total': 0}
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

