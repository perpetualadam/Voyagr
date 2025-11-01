"""
Vehicle Profile Management Module for Voyagr
Manages multiple vehicle profiles with different settings.
"""

import json
import time
import sqlite3


class VehicleProfileManager:
    """Manages multiple vehicle profiles."""
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the vehicle profile manager."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.active_vehicle_id = None
        
    def create_vehicle(self, name, vehicle_type, fuel_efficiency=None, fuel_unit=None,
                      fuel_price_gbp=None, energy_efficiency=None, electricity_price_gbp=None,
                      emission_class=None, registration_number=None, caz_exempt=False):
        """Create a new vehicle profile."""
        try:
            timestamp = int(time.time())
            
            self.cursor.execute("""
                INSERT INTO vehicles
                (name, vehicle_type, fuel_efficiency, fuel_unit, fuel_price_gbp,
                 energy_efficiency, electricity_price_gbp, emission_class,
                 registration_number, current_mileage_km, is_active, caz_exempt, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, vehicle_type, fuel_efficiency, fuel_unit, fuel_price_gbp,
                  energy_efficiency, electricity_price_gbp, emission_class,
                  registration_number, 0, 1, 1 if caz_exempt else 0, timestamp))
            
            self.conn.commit()
            vehicle_id = self.cursor.lastrowid
            
            print(f"[OK] Vehicle created: {name} (ID: {vehicle_id})")
            return vehicle_id
        except Exception as e:
            print(f"[FAIL] Vehicle creation error: {e}")
            return None
    
    def get_vehicle(self, vehicle_id):
        """Get vehicle details."""
        try:
            self.cursor.execute("""
                SELECT id, name, vehicle_type, fuel_efficiency, fuel_unit,
                       fuel_price_gbp, energy_efficiency, electricity_price_gbp,
                       emission_class, registration_number, current_mileage_km,
                       is_active, caz_exempt, timestamp
                FROM vehicles WHERE id = ?
            """, (vehicle_id,))
            
            result = self.cursor.fetchone()
            if result:
                return {
                    'id': result[0],
                    'name': result[1],
                    'vehicle_type': result[2],
                    'fuel_efficiency': result[3],
                    'fuel_unit': result[4],
                    'fuel_price_gbp': result[5],
                    'energy_efficiency': result[6],
                    'electricity_price_gbp': result[7],
                    'emission_class': result[8],
                    'registration_number': result[9],
                    'current_mileage_km': result[10],
                    'is_active': result[11],
                    'caz_exempt': result[12],
                    'timestamp': result[13]
                }
            return None
        except Exception as e:
            print(f"[FAIL] Get vehicle error: {e}")
            return None
    
    def list_vehicles(self):
        """List all vehicles."""
        try:
            self.cursor.execute("""
                SELECT id, name, vehicle_type, is_active
                FROM vehicles
                ORDER BY is_active DESC, timestamp DESC
            """)
            
            vehicles = []
            for row in self.cursor.fetchall():
                vehicles.append({
                    'id': row[0],
                    'name': row[1],
                    'vehicle_type': row[2],
                    'is_active': row[3]
                })
            
            return vehicles
        except Exception as e:
            print(f"[FAIL] List vehicles error: {e}")
            return []
    
    def switch_vehicle(self, vehicle_id):
        """Switch to a different vehicle."""
        try:
            # Deactivate all vehicles
            self.cursor.execute("UPDATE vehicles SET is_active = 0")
            
            # Activate selected vehicle
            self.cursor.execute("UPDATE vehicles SET is_active = 1 WHERE id = ?", (vehicle_id,))
            self.conn.commit()
            
            self.active_vehicle_id = vehicle_id
            vehicle = self.get_vehicle(vehicle_id)
            
            print(f"[OK] Switched to vehicle: {vehicle['name']}")
            return True
        except Exception as e:
            print(f"[FAIL] Vehicle switch error: {e}")
            return False
    
    def update_vehicle(self, vehicle_id, **kwargs):
        """Update vehicle settings."""
        try:
            allowed_fields = [
                'name', 'fuel_efficiency', 'fuel_unit', 'fuel_price_gbp',
                'energy_efficiency', 'electricity_price_gbp', 'emission_class',
                'current_mileage_km', 'caz_exempt'
            ]
            
            updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
            if not updates:
                return False
            
            set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
            values = list(updates.values()) + [vehicle_id]
            
            self.cursor.execute(f"UPDATE vehicles SET {set_clause} WHERE id = ?", values)
            self.conn.commit()
            
            print(f"[OK] Vehicle updated: {vehicle_id}")
            return True
        except Exception as e:
            print(f"[FAIL] Vehicle update error: {e}")
            return False
    
    def delete_vehicle(self, vehicle_id):
        """Delete a vehicle profile."""
        try:
            self.cursor.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
            self.conn.commit()
            
            print(f"[OK] Vehicle deleted: {vehicle_id}")
            return True
        except Exception as e:
            print(f"[FAIL] Vehicle deletion error: {e}")
            return False
    
    def get_active_vehicle(self):
        """Get the currently active vehicle."""
        try:
            self.cursor.execute("""
                SELECT id FROM vehicles WHERE is_active = 1 LIMIT 1
            """)
            result = self.cursor.fetchone()
            
            if result:
                self.active_vehicle_id = result[0]
                return self.get_vehicle(result[0])
            
            return None
        except Exception as e:
            print(f"[FAIL] Get active vehicle error: {e}")
            return None
    
    def get_vehicle_statistics(self, vehicle_id, days=30):
        """Get statistics for a vehicle."""
        try:
            cutoff_time = int(time.time()) - (days * 86400)
            
            self.cursor.execute("""
                SELECT COUNT(*), SUM(distance_km), SUM(duration_seconds),
                       SUM(total_cost), SUM(fuel_cost), SUM(toll_cost), SUM(caz_cost)
                FROM trip_history
                WHERE timestamp_start >= ?
            """, (cutoff_time,))
            
            result = self.cursor.fetchone()
            if result and result[0]:
                return {
                    'trips': result[0],
                    'distance_km': result[1] or 0,
                    'duration_hours': (result[2] or 0) / 3600,
                    'total_cost': result[3] or 0,
                    'fuel_cost': result[4] or 0,
                    'toll_cost': result[5] or 0,
                    'caz_cost': result[6] or 0
                }
            
            return {
                'trips': 0,
                'distance_km': 0,
                'duration_hours': 0,
                'total_cost': 0,
                'fuel_cost': 0,
                'toll_cost': 0,
                'caz_cost': 0
            }
        except Exception as e:
            print(f"[FAIL] Vehicle statistics error: {e}")
            return {}
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

