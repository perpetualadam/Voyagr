"""
EV Charging Station Management Module for Voyagr
Manages charging stations and charging history.
"""

import json
import time
import sqlite3
import requests
from geopy.distance import geodesic


class ChargingStationManager:
    """Manages EV charging stations and charging history."""
    
    def __init__(self, db_path='satnav.db'):
        """Initialize the charging station manager."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.openchargeapi_url = 'https://api.openchargemap.io/v3/poi'
        
    def fetch_charging_stations(self, lat, lon, radius_km=10):
        """Fetch charging stations from OpenChargeMap API."""
        try:
            # Convert radius to miles for API
            radius_miles = radius_km * 0.621371
            
            params = {
                'latitude': lat,
                'longitude': lon,
                'distance': radius_miles,
                'distanceunit': 'Miles',
                'maxresults': 50,
                'compact': True,
                'verbose': False
            }
            
            response = requests.get(self.openchargeapi_url, params=params, timeout=10)
            response.raise_for_status()
            
            stations = response.json()
            if not stations:
                print(f"[OK] No charging stations found within {radius_km}km")
                return []
            
            # Store stations in database
            stored_count = 0
            for station in stations:
                if self.add_charging_station(
                    name=station.get('AddressInfo', {}).get('Title', 'Unknown'),
                    lat=station.get('AddressInfo', {}).get('Latitude', lat),
                    lon=station.get('AddressInfo', {}).get('Longitude', lon),
                    network=station.get('OperatorInfo', {}).get('Title', 'Unknown'),
                    connector_types=self._extract_connectors(station),
                    power_kw=self._extract_power(station),
                    availability=100
                ):
                    stored_count += 1
            
            print(f"[OK] Fetched {stored_count} charging stations")
            return self.get_nearby_stations(lat, lon, radius_km)
        except Exception as e:
            print(f"[FAIL] Charging station fetch error: {e}")
            return []
    
    def _extract_connectors(self, station):
        """Extract connector types from station data."""
        try:
            connectors = []
            connections = station.get('Connections', [])
            for conn in connections:
                conn_type = conn.get('ConnectionType', {}).get('Title', 'Unknown')
                if conn_type not in connectors:
                    connectors.append(conn_type)
            return json.dumps(connectors)
        except:
            return json.dumps(['Unknown'])
    
    def _extract_power(self, station):
        """Extract power rating from station data."""
        try:
            connections = station.get('Connections', [])
            if connections:
                power = connections[0].get('PowerKW', 7.0)
                return float(power) if power else 7.0
            return 7.0
        except:
            return 7.0
    
    def add_charging_station(self, name, lat, lon, network=None, connector_types=None,
                            power_kw=7.0, availability=100, cost_per_kwh=0.30):
        """Add a charging station."""
        try:
            timestamp = int(time.time())
            
            self.cursor.execute("""
                INSERT INTO charging_stations
                (name, lat, lon, network, connector_types, power_kw, availability, cost_per_kwh, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, lat, lon, network, connector_types, power_kw, availability, cost_per_kwh, timestamp))
            
            self.conn.commit()
            return True
        except Exception as e:
            print(f"[FAIL] Add charging station error: {e}")
            return False
    
    def get_nearby_stations(self, lat, lon, radius_km=10):
        """Get nearby charging stations."""
        try:
            self.cursor.execute("""
                SELECT id, name, lat, lon, network, connector_types, power_kw, availability, cost_per_kwh
                FROM charging_stations
                ORDER BY timestamp DESC LIMIT 100
            """)
            
            stations = []
            for row in self.cursor.fetchall():
                distance = geodesic((lat, lon), (row[2], row[3])).km
                if distance <= radius_km:
                    stations.append({
                        'id': row[0],
                        'name': row[1],
                        'lat': row[2],
                        'lon': row[3],
                        'network': row[4],
                        'connector_types': json.loads(row[5]) if row[5] else [],
                        'power_kw': row[6],
                        'availability': row[7],
                        'cost_per_kwh': row[8],
                        'distance_km': distance
                    })
            
            return sorted(stations, key=lambda x: x['distance_km'])
        except Exception as e:
            print(f"[FAIL] Get nearby stations error: {e}")
            return []
    
    def record_charging(self, vehicle_id, station_id, kwh_charged, cost):
        """Record a charging session."""
        try:
            timestamp = int(time.time())
            
            self.cursor.execute("""
                INSERT INTO charging_history
                (vehicle_id, station_id, start_time, end_time, kwh_charged, cost, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (vehicle_id, station_id, timestamp - 3600, timestamp, kwh_charged, cost, timestamp))
            
            self.conn.commit()
            print(f"[OK] Charging recorded: {kwh_charged} kWh, £{cost:.2f}")
            return True
        except Exception as e:
            print(f"[FAIL] Record charging error: {e}")
            return False
    
    def calculate_charging_time(self, battery_capacity_kwh, current_charge_pct, target_charge_pct, power_kw):
        """Calculate charging time."""
        try:
            kwh_needed = battery_capacity_kwh * ((target_charge_pct - current_charge_pct) / 100)
            charging_hours = kwh_needed / power_kw if power_kw > 0 else 0
            
            return {
                'kwh_needed': kwh_needed,
                'charging_hours': charging_hours,
                'charging_minutes': charging_hours * 60
            }
        except Exception as e:
            print(f"[FAIL] Charging time calculation error: {e}")
            return {'kwh_needed': 0, 'charging_hours': 0, 'charging_minutes': 0}
    
    def calculate_charging_cost(self, kwh_charged, cost_per_kwh):
        """Calculate charging cost."""
        try:
            return kwh_charged * cost_per_kwh
        except Exception as e:
            print(f"[FAIL] Charging cost calculation error: {e}")
            return 0
    
    def get_charging_history(self, vehicle_id, limit=20):
        """Get charging history for a vehicle."""
        try:
            self.cursor.execute("""
                SELECT id, station_id, start_time, end_time, kwh_charged, cost, timestamp
                FROM charging_history
                WHERE vehicle_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (vehicle_id, limit))
            
            history = []
            for row in self.cursor.fetchall():
                history.append({
                    'id': row[0],
                    'station_id': row[1],
                    'start_time': row[2],
                    'end_time': row[3],
                    'kwh_charged': row[4],
                    'cost': row[5],
                    'timestamp': row[6]
                })
            
            return history
        except Exception as e:
            print(f"[FAIL] Get charging history error: {e}")
            return []
    
    def get_charging_statistics(self, vehicle_id, days=30):
        """Get charging statistics for a vehicle."""
        try:
            cutoff_time = int(time.time()) - (days * 86400)
            
            self.cursor.execute("""
                SELECT COUNT(*), SUM(kwh_charged), SUM(cost)
                FROM charging_history
                WHERE vehicle_id = ? AND timestamp >= ?
            """, (vehicle_id, cutoff_time))
            
            result = self.cursor.fetchone()
            if result and result[0]:
                return {
                    'sessions': result[0],
                    'total_kwh': result[1] or 0,
                    'total_cost': result[2] or 0,
                    'avg_kwh_per_session': (result[1] or 0) / result[0] if result[0] > 0 else 0
                }
            
            return {'sessions': 0, 'total_kwh': 0, 'total_cost': 0, 'avg_kwh_per_session': 0}
        except Exception as e:
            print(f"[FAIL] Charging statistics error: {e}")
            return {}
    
    def close(self):
        """Close database connection."""
        try:
            self.conn.close()
        except:
            pass

