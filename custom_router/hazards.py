"""
Hazard management for custom router.
Loads and manages static (cameras) and dynamic (accidents, roadworks) hazards.
"""

import sqlite3
import math
from typing import Dict, List, Tuple, Optional
from collections import defaultdict


class HazardManager:
    """Manages hazard data for route calculation."""
    
    # Hazard penalties (seconds) - matches voyagr_web.py preferences
    HAZARD_PENALTIES = {
        'speed_camera': 800,       # ~13 minutes - HIGHEST PRIORITY (unified camera type)
        'police': 180,             # 3 minutes
        'roadworks': 300,          # 5 minutes
        'accident': 600,           # 10 minutes
        'railway_crossing': 120,   # 2 minutes
        'pothole': 120,            # 2 minutes
        'debris': 300,             # 5 minutes
    }
    
    # Proximity thresholds (meters)
    HAZARD_THRESHOLDS = {
        'speed_camera': 100,
        'police': 200,
        'roadworks': 500,
        'accident': 500,
        'railway_crossing': 100,
        'pothole': 50,
        'debris': 100,
    }
    
    def __init__(self, db_file: str = 'data/voyagr.db'):
        """Initialize hazard manager.
        
        Args:
            db_file: Path to Voyagr database containing hazard data
        """
        self.db_file = db_file
        self.static_hazards = {}  # hazard_type -> [(lat, lon), ...]
        self.dynamic_hazards = {}  # hazard_type -> [(lat, lon), ...]
        
    def load_static_hazards(self) -> Dict[str, List[Tuple[float, float]]]:
        """Load static hazards (cameras, railway crossings) from database.
        
        Returns:
            Dictionary of hazard_type -> [(lat, lon), ...]
        """
        hazards = defaultdict(list)
        
        try:
            conn = sqlite3.connect(self.db_file)
            cursor = conn.cursor()
            
            # Load cameras (all stored as speed_camera type)
            cursor.execute("SELECT lat, lon FROM cameras")
            for lat, lon in cursor.fetchall():
                hazards['speed_camera'].append((lat, lon))
            
            conn.close()
            
            self.static_hazards = dict(hazards)
            return self.static_hazards
            
        except Exception as e:
            print(f"[HazardManager] Warning: Could not load static hazards: {e}")
            return {}
    
    def load_dynamic_hazards(self) -> Dict[str, List[Tuple[float, float]]]:
        """Load dynamic hazards (accidents, roadworks, police) from database.
        
        Returns:
            Dictionary of hazard_type -> [(lat, lon), ...]
        """
        hazards = defaultdict(list)
        
        try:
            conn = sqlite3.connect(self.db_file)
            cursor = conn.cursor()
            
            # Check if community_reports table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='community_reports'")
            if cursor.fetchone():
                # Load community reports (accidents, roadworks, police, etc.)
                cursor.execute("SELECT lat, lon, hazard_type FROM community_reports WHERE verified = 1")
                for lat, lon, hazard_type in cursor.fetchall():
                    if hazard_type in self.HAZARD_PENALTIES:
                        hazards[hazard_type].append((lat, lon))
            
            conn.close()
            
            self.dynamic_hazards = dict(hazards)
            return self.dynamic_hazards
            
        except Exception as e:
            print(f"[HazardManager] Warning: Could not load dynamic hazards: {e}")
            return {}
    
    def get_edge_hazard_penalty(self, from_lat: float, from_lon: float,
                                to_lat: float, to_lon: float,
                                hazard_type: str = 'speed_camera') -> float:
        """Calculate hazard penalty for an edge (static hazards only).
        
        Args:
            from_lat: Start latitude
            from_lon: Start longitude
            to_lat: End latitude
            to_lon: End longitude
            hazard_type: Type of hazard to check
            
        Returns:
            Penalty in seconds
        """
        if hazard_type not in self.static_hazards:
            return 0.0
        
        penalty = self.HAZARD_PENALTIES.get(hazard_type, 0)
        threshold = self.HAZARD_THRESHOLDS.get(hazard_type, 100)
        
        total_penalty = 0.0
        
        # Check each hazard of this type
        for hazard_lat, hazard_lon in self.static_hazards[hazard_type]:
            # Calculate distance from hazard to edge (simplified: use midpoint)
            mid_lat = (from_lat + to_lat) / 2
            mid_lon = (from_lon + to_lon) / 2
            
            distance = self._haversine_distance(hazard_lat, hazard_lon, mid_lat, mid_lon)
            
            if distance <= threshold:
                # Apply distance-based multiplier for cameras
                if hazard_type == 'speed_camera':
                    # Proximity multiplier: 1.0 at threshold, 3.0 at 0m
                    proximity_multiplier = 1.0 + (2.0 * (1.0 - distance / threshold))
                    multiplier = max(1.0, proximity_multiplier)
                    total_penalty += penalty * multiplier
                else:
                    total_penalty += penalty
        
        return total_penalty

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate Haversine distance between two points in meters.

        Args:
            lat1, lon1: First point coordinates
            lat2, lon2: Second point coordinates

        Returns:
            Distance in meters
        """
        R = 6371000  # Earth radius in meters
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat/2)**2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon/2)**2)
        c = 2 * math.asin(math.sqrt(a))
        return R * c

    def get_runtime_hazard_penalty(self, from_lat: float, from_lon: float,
                                   to_lat: float, to_lon: float) -> float:
        """Calculate hazard penalty for dynamic hazards at runtime.

        Args:
            from_lat: Start latitude
            from_lon: Start longitude
            to_lat: End latitude
            to_lon: End longitude

        Returns:
            Penalty in seconds
        """
        total_penalty = 0.0

        # Check each dynamic hazard type
        for hazard_type, hazard_list in self.dynamic_hazards.items():
            penalty = self.HAZARD_PENALTIES.get(hazard_type, 0)
            threshold = self.HAZARD_THRESHOLDS.get(hazard_type, 100)

            # Check each hazard
            for hazard_lat, hazard_lon in hazard_list:
                # Calculate distance from hazard to edge (simplified: use midpoint)
                mid_lat = (from_lat + to_lat) / 2
                mid_lon = (from_lon + to_lon) / 2

                distance = self._haversine_distance(hazard_lat, hazard_lon, mid_lat, mid_lon)

                if distance <= threshold:
                    total_penalty += penalty

        return total_penalty

    def get_all_hazards_penalty(self, from_lat: float, from_lon: float,
                                to_lat: float, to_lon: float) -> float:
        """Calculate hazard penalty for ALL hazards (static + dynamic) at runtime.

        This is the main method used during routing to check all hazards.

        Args:
            from_lat: Start latitude
            from_lon: Start longitude
            to_lat: End latitude
            to_lon: End longitude

        Returns:
            Total penalty in seconds
        """
        total_penalty = 0.0

        # Calculate edge midpoint once
        mid_lat = (from_lat + to_lat) / 2
        mid_lon = (from_lon + to_lon) / 2

        # Check static hazards (cameras)
        for hazard_type, hazard_list in self.static_hazards.items():
            penalty = self.HAZARD_PENALTIES.get(hazard_type, 0)
            threshold = self.HAZARD_THRESHOLDS.get(hazard_type, 100)

            for hazard_lat, hazard_lon in hazard_list:
                distance = self._haversine_distance(hazard_lat, hazard_lon, mid_lat, mid_lon)

                if distance <= threshold:
                    # Apply proximity multiplier for cameras
                    if hazard_type == 'speed_camera':
                        proximity_multiplier = 1.0 + (2.0 * (1.0 - distance / threshold))
                        multiplier = max(1.0, proximity_multiplier)
                        total_penalty += penalty * multiplier
                    else:
                        total_penalty += penalty

        # Check dynamic hazards (accidents, roadworks, police)
        for hazard_type, hazard_list in self.dynamic_hazards.items():
            penalty = self.HAZARD_PENALTIES.get(hazard_type, 0)
            threshold = self.HAZARD_THRESHOLDS.get(hazard_type, 100)

            for hazard_lat, hazard_lon in hazard_list:
                distance = self._haversine_distance(hazard_lat, hazard_lon, mid_lat, mid_lon)

                if distance <= threshold:
                    total_penalty += penalty

        return total_penalty

