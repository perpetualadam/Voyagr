"""
Hazard avoidance service layer.
Consolidates all hazard-related business logic into a single service.
"""

import sqlite3
import math
import time
import json
import polyline
from typing import Dict, List, Tuple


class HazardService:
    """Service for hazard avoidance and detection."""
    
    def __init__(self, db_file: str = 'voyagr_web.db'):
        """Initialize hazard service.
        
        Args:
            db_file: Path to SQLite database
        """
        self.db_file = db_file
    
    @staticmethod
    def get_distance_between_points(lat1: float, lon1: float,
                                   lat2: float, lon2: float) -> float:
        """Calculate distance between two points in meters using Haversine formula.
        
        Args:
            lat1, lon1: First point coordinates
            lat2, lon2: Second point coordinates
            
        Returns:
            Distance in meters
        """
        R = 6371000  # Earth radius in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    def fetch_hazards_for_route(self, start_lat: float, start_lon: float,
                               end_lat: float, end_lon: float) -> Dict:
        """Fetch hazards within bounding box of route.
        
        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            
        Returns:
            Dict with hazard types and locations
        """
        try:
            conn = sqlite3.connect(self.db_file)
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
    
    def score_route_by_hazards(self, route_points, hazards: Dict) -> Tuple[float, int]:
        """Calculate hazard score for a route based on proximity to hazards.
        
        Args:
            route_points: Encoded polyline or list of points
            hazards: Dict of hazard types and locations
            
        Returns:
            Tuple of (total_penalty_seconds, hazard_count)
        """
        try:
            conn = sqlite3.connect(self.db_file)
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
                        distance = self.get_distance_between_points(hazard_lat, hazard_lon, point_lat, point_lon)
                        min_distance = min(min_distance, distance)
                    
                    # If hazard is within threshold, add penalty
                    if min_distance <= threshold:
                        # Traffic light cameras get distance-based multiplier
                        if hazard_type == 'traffic_light_camera':
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


# Global instance
hazard_service = HazardService()

