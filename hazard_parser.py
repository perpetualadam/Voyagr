"""
Hazard, Incident, Camera, and Toll Parser
Fetches data from OpenStreetMap and Overpass API for hazards, incidents, cameras, and tolls.
Updates shared memory with data every 5 minutes within 10km radius.
"""

import requests
import json
import time
import sqlite3
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Overpass API endpoint
OVERPASS_API = "https://overpass-api.de/api/interpreter"

# MapQuest API for traffic incidents (free tier)
MAPQUEST_API = "https://www.mapquestapi.com/traffic/v2/incidents"
MAPQUEST_KEY = os.getenv('MAPQUEST_API_KEY', '')

# OpenWeatherMap API for weather alerts (free tier)
WEATHER_API = "https://api.openweathermap.org/data/2.5/weather"
WEATHER_KEY = os.getenv('OPENWEATHERMAP_API_KEY', '')


class HazardParser:
    def __init__(self, db_path='satnav.db'):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.last_update = {}
        self._init_database()

    def _init_database(self):
        """Initialize database tables."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS hazards
                              (lat REAL, lon REAL, type TEXT, description TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS incidents
                              (lat REAL, lon REAL, type TEXT, description TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS cameras
                              (lat REAL, lon REAL, type TEXT, description TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS tolls
                              (road_name TEXT, lat REAL, lon REAL, cost_gbp REAL, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS weather
                              (lat REAL, lon REAL, description TEXT, temperature REAL, severity TEXT, timestamp INTEGER)''')
        self.conn.commit()

    def fetch_cameras(self, lat, lon, radius_km=10):
        """Fetch traffic cameras from Overpass API."""
        try:
            # Query for speed cameras and traffic signals with cameras
            query = f"""
            [bbox:{lat-radius_km/111}:{lon-radius_km/111}:{lat+radius_km/111}:{lon+radius_km/111}];
            (
              node["highway"="speed_camera"];
              node["highway"="traffic_signals"]["camera"~"yes|red_light|speed"];
              way["highway"="speed_camera"];
              way["highway"="traffic_signals"]["camera"~"yes|red_light|speed"];
            );
            out center;
            """
            
            response = requests.post(OVERPASS_API, data=query, timeout=10)
            if response.status_code == 200:
                data = response.json()
                cameras = []
                
                for element in data.get('elements', []):
                    camera_type = 'speed_camera'
                    if element.get('tags', {}).get('camera') == 'red_light':
                        camera_type = 'traffic_light_camera'
                    
                    lat_val = element.get('lat') or element.get('center', {}).get('lat')
                    lon_val = element.get('lon') or element.get('center', {}).get('lon')
                    
                    if lat_val and lon_val:
                        cameras.append({
                            'lat': lat_val,
                            'lon': lon_val,
                            'type': camera_type,
                            'description': element.get('tags', {}).get('name', 'Camera')
                        })
                
                # Store in database
                self.cursor.execute("DELETE FROM cameras WHERE timestamp < ?", (int(time.time()) - 3600,))
                for camera in cameras:
                    self.cursor.execute("INSERT OR REPLACE INTO cameras (lat, lon, type, description, timestamp) VALUES (?, ?, ?, ?, ?)",
                                       (camera['lat'], camera['lon'], camera['type'], camera['description'], int(time.time())))
                self.conn.commit()
                
                return cameras
        except Exception as e:
            print(f"Camera fetch error: {e}")
        
        return []

    def fetch_tolls(self, lat, lon, radius_km=10):
        """Fetch toll roads from Overpass API."""
        try:
            # Query for toll roads
            query = f"""
            [bbox:{lat-radius_km/111}:{lon-radius_km/111}:{lat+radius_km/111}:{lon+radius_km/111}];
            (
              way["toll"="yes"];
              way["toll"~"yes|customers"];
              node["toll"="yes"];
            );
            out center;
            """
            
            response = requests.post(OVERPASS_API, data=query, timeout=10)
            if response.status_code == 200:
                data = response.json()
                tolls = []
                
                # Static toll database for UK
                static_tolls = {
                    'M6 Toll': {'lat': 52.664, 'lon': -1.932, 'cost': 7.00},
                    'Dartford Crossing': {'lat': 51.465, 'lon': 0.258, 'cost': 2.50},
                    'Severn Bridge': {'lat': 51.385, 'lon': -2.635, 'cost': 6.70},
                    'Humber Bridge': {'lat': 53.710, 'lon': -0.305, 'cost': 1.50},
                }
                
                for element in data.get('elements', []):
                    lat_val = element.get('lat') or element.get('center', {}).get('lat')
                    lon_val = element.get('lon') or element.get('center', {}).get('lon')
                    road_name = element.get('tags', {}).get('name', 'Toll Road')
                    
                    if lat_val and lon_val:
                        # Look up cost in static database
                        cost = static_tolls.get(road_name, {}).get('cost', 0)
                        tolls.append({
                            'road_name': road_name,
                            'lat': lat_val,
                            'lon': lon_val,
                            'cost_gbp': cost
                        })
                
                # Add static tolls
                for name, data in static_tolls.items():
                    tolls.append({
                        'road_name': name,
                        'lat': data['lat'],
                        'lon': data['lon'],
                        'cost_gbp': data['cost']
                    })
                
                # Store in database
                self.cursor.execute("DELETE FROM tolls WHERE timestamp < ?", (int(time.time()) - 3600,))
                for toll in tolls:
                    self.cursor.execute("INSERT OR REPLACE INTO tolls (road_name, lat, lon, cost_gbp, timestamp) VALUES (?, ?, ?, ?, ?)",
                                       (toll['road_name'], toll['lat'], toll['lon'], toll['cost_gbp'], int(time.time())))
                self.conn.commit()
                
                return tolls
        except Exception as e:
            print(f"Toll fetch error: {e}")
        
        return []

    def fetch_hazards(self, lat, lon, radius_km=10):
        """Fetch hazards from Overpass API."""
        try:
            # Query for hazards and obstacles
            query = f"""
            [bbox:{lat-radius_km/111}:{lon-radius_km/111}:{lat+radius_km/111}:{lon+radius_km/111}];
            (
              node["hazard"~"yes|pothole|debris|fallen_tree"];
              node["obstacle"~"yes|fallen_tree|debris"];
              way["hazard"~"yes|pothole|debris|fallen_tree"];
              way["obstacle"~"yes|fallen_tree|debris"];
            );
            out center;
            """
            
            response = requests.post(OVERPASS_API, data=query, timeout=10)
            if response.status_code == 200:
                data = response.json()
                hazards = []
                
                for element in data.get('elements', []):
                    hazard_type = element.get('tags', {}).get('hazard') or element.get('tags', {}).get('obstacle', 'hazard')
                    lat_val = element.get('lat') or element.get('center', {}).get('lat')
                    lon_val = element.get('lon') or element.get('center', {}).get('lon')
                    
                    if lat_val and lon_val:
                        hazards.append({
                            'lat': lat_val,
                            'lon': lon_val,
                            'type': hazard_type,
                            'description': element.get('tags', {}).get('name', 'Hazard')
                        })
                
                # Store in database
                self.cursor.execute("DELETE FROM hazards WHERE timestamp < ?", (int(time.time()) - 3600,))
                for hazard in hazards:
                    self.cursor.execute("INSERT INTO hazards (lat, lon, type, description, timestamp) VALUES (?, ?, ?, ?, ?)",
                                       (hazard['lat'], hazard['lon'], hazard['type'], hazard['description'], int(time.time())))
                self.conn.commit()
                
                return hazards
        except Exception as e:
            print(f"Hazard fetch error: {e}")
        
        return []

    def fetch_incidents(self, lat, lon, radius_km=10):
        """Fetch incidents from MapQuest API."""
        try:
            # Check if API key is configured
            if not MAPQUEST_KEY or MAPQUEST_KEY.strip() == '':
                print("[INFO] MapQuest API key not configured. Skipping incident fetch.")
                print("[INFO] To enable: Add MAPQUEST_API_KEY to .env file (see API_INTEGRATION_GUIDE.md)")
                return []

            params = {
                'key': MAPQUEST_KEY,
                'boundingBox': f"{lat-radius_km/111},{lon-radius_km/111},{lat+radius_km/111},{lon+radius_km/111}"
            }

            response = requests.get(MAPQUEST_API, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                incidents = []

                for incident in data.get('incidents', []):
                    incidents.append({
                        'lat': incident.get('lat'),
                        'lon': incident.get('lng'),
                        'type': incident.get('type', 'incident'),
                        'description': incident.get('description', 'Incident')
                    })

                # Store in database
                self.cursor.execute("DELETE FROM incidents WHERE timestamp < ?", (int(time.time()) - 3600,))
                for incident in incidents:
                    self.cursor.execute("INSERT INTO incidents (lat, lon, type, description, timestamp) VALUES (?, ?, ?, ?, ?)",
                                       (incident['lat'], incident['lon'], incident['type'], incident['description'], int(time.time())))
                self.conn.commit()
                
                return incidents
        except Exception as e:
            print(f"Incident fetch error: {e}")
        
        return []

    def fetch_weather(self, lat, lon):
        """Fetch weather alerts from OpenWeatherMap API."""
        try:
            # Check if API key is configured
            if not WEATHER_KEY or WEATHER_KEY.strip() == '':
                print("[INFO] OpenWeatherMap API key not configured. Skipping weather fetch.")
                print("[INFO] To enable: Add OPENWEATHERMAP_API_KEY to .env file (see API_INTEGRATION_GUIDE.md)")
                return []

            params = {
                'lat': lat,
                'lon': lon,
                'appid': WEATHER_KEY,
                'units': 'metric'
            }

            response = requests.get(WEATHER_API, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                weather_alerts = []

                for alert in data.get('alerts', []):
                    weather_alerts.append({
                        'lat': lat,
                        'lon': lon,
                        'description': alert.get('description', 'Weather alert'),
                        'temperature': data.get('main', {}).get('temp', 0),
                        'severity': 'moderate'  # Default severity
                    })

                # Store in database
                self.cursor.execute("DELETE FROM weather WHERE timestamp < ?", (int(time.time()) - 3600,))
                for alert in weather_alerts:
                    self.cursor.execute("INSERT INTO weather (lat, lon, description, temperature, severity, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                                       (alert['lat'], alert['lon'], alert['description'], alert['temperature'], alert['severity'], int(time.time())))
                self.conn.commit()
                
                return weather_alerts
        except Exception as e:
            print(f"Weather fetch error: {e}")
        
        return []

    def update_all(self, lat, lon, radius_km=10):
        """Update all data within radius."""
        try:
            current_time = time.time()
            
            # Update every 5 minutes
            if current_time - self.last_update.get('cameras', 0) > 300:
                self.fetch_cameras(lat, lon, radius_km)
                self.last_update['cameras'] = current_time
            
            if current_time - self.last_update.get('tolls', 0) > 300:
                self.fetch_tolls(lat, lon, radius_km)
                self.last_update['tolls'] = current_time
            
            if current_time - self.last_update.get('hazards', 0) > 300:
                self.fetch_hazards(lat, lon, radius_km)
                self.last_update['hazards'] = current_time
            
            if current_time - self.last_update.get('incidents', 0) > 300:
                self.fetch_incidents(lat, lon, radius_km)
                self.last_update['incidents'] = current_time
            
            if current_time - self.last_update.get('weather', 0) > 300:
                self.fetch_weather(lat, lon)
                self.last_update['weather'] = current_time
        except Exception as e:
            print(f"Update all error: {e}")

    def get_cameras(self):
        """Get cameras from database."""
        try:
            self.cursor.execute("SELECT lat, lon, type, description FROM cameras WHERE timestamp > ?", (int(time.time()) - 3600,))
            return [{'lat': row[0], 'lon': row[1], 'type': row[2], 'description': row[3]} for row in self.cursor.fetchall()]
        except Exception as e:
            print(f"Get cameras error: {e}")
            return []

    def get_tolls(self):
        """Get tolls from database."""
        try:
            self.cursor.execute("SELECT road_name, lat, lon, cost_gbp FROM tolls WHERE timestamp > ?", (int(time.time()) - 3600,))
            return [{'road_name': row[0], 'lat': row[1], 'lon': row[2], 'cost_gbp': row[3]} for row in self.cursor.fetchall()]
        except Exception as e:
            print(f"Get tolls error: {e}")
            return []

    def get_hazards(self):
        """Get hazards from database."""
        try:
            self.cursor.execute("SELECT lat, lon, type, description FROM hazards WHERE timestamp > ?", (int(time.time()) - 3600,))
            return [{'lat': row[0], 'lon': row[1], 'type': row[2], 'description': row[3]} for row in self.cursor.fetchall()]
        except Exception as e:
            print(f"Get hazards error: {e}")
            return []

    def get_incidents(self):
        """Get incidents from database."""
        try:
            self.cursor.execute("SELECT lat, lon, type, description FROM incidents WHERE timestamp > ?", (int(time.time()) - 3600,))
            return [{'lat': row[0], 'lon': row[1], 'type': row[2], 'description': row[3]} for row in self.cursor.fetchall()]
        except Exception as e:
            print(f"Get incidents error: {e}")
            return []

    def get_weather(self):
        """Get weather alerts from database."""
        try:
            self.cursor.execute("SELECT lat, lon, description, temperature, severity FROM weather WHERE timestamp > ?", (int(time.time()) - 3600,))
            return [{'lat': row[0], 'lon': row[1], 'description': row[2], 'temperature': row[3], 'severity': row[4]} for row in self.cursor.fetchall()]
        except Exception as e:
            print(f"Get weather error: {e}")
            return []

    def close(self):
        """Close database connection."""
        self.conn.close()


if __name__ == '__main__':
    parser = HazardParser()
    
    # Example: Update data for Barnsley
    parser.update_all(53.5526, -1.4797, radius_km=10)
    
    print("Cameras:", parser.get_cameras())
    print("Tolls:", parser.get_tolls())
    print("Hazards:", parser.get_hazards())
    print("Incidents:", parser.get_incidents())
    print("Weather:", parser.get_weather())
    
    parser.close()

