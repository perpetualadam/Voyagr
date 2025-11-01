"""
Lane Guidance Module for Voyagr
Provides lane-level navigation with visual and voice guidance.
"""

import json
import time
import requests
from typing import Dict, List, Optional, Tuple
from datetime import datetime

# Lane configuration for different road types
LANE_CONFIGURATIONS = {
    'motorway': {'min_lanes': 2, 'max_lanes': 6, 'lane_width_m': 3.5},
    'trunk_road': {'min_lanes': 2, 'max_lanes': 4, 'lane_width_m': 3.5},
    'primary_road': {'min_lanes': 1, 'max_lanes': 3, 'lane_width_m': 3.5},
    'secondary_road': {'min_lanes': 1, 'max_lanes': 2, 'lane_width_m': 3.5},
}

# Lane change warning distances (meters)
LANE_CHANGE_WARNINGS = {
    'far': 500,      # 500m warning
    'medium': 200,   # 200m warning
    'near': 100,     # 100m warning
}


class LaneGuidance:
    """Provides lane-level navigation guidance."""
    
    def __init__(self, db_cursor=None):
        """Initialize lane guidance system."""
        self.cursor = db_cursor
        self.current_lane = None
        self.recommended_lane = None
        self.lane_change_needed = False
        self.lane_change_distance = None
        self.lane_data_cache = {}
        self.cache_expiry = 600  # 10 minutes
        
    def get_lane_guidance(self, lat: float, lon: float, 
                         heading: float,
                         road_type: str = 'motorway',
                         next_maneuver: str = 'straight') -> Dict:
        """
        Get lane guidance for current location.
        
        Args:
            lat: Latitude
            lon: Longitude
            heading: Vehicle heading in degrees (0-360)
            road_type: Type of road
            next_maneuver: Next maneuver (straight, left, right, exit)
            
        Returns:
            dict: Lane guidance information
        """
        try:
            # Get lane data from OSM
            lane_data = self._get_lane_data(lat, lon, road_type)
            
            if not lane_data:
                return {'error': 'No lane data available'}
            
            # Determine current lane based on heading
            current_lane = self._determine_current_lane(heading, lane_data)
            
            # Determine recommended lane for maneuver
            recommended_lane = self._get_recommended_lane(
                next_maneuver, lane_data, current_lane
            )
            
            # Check if lane change is needed
            lane_change_needed = current_lane != recommended_lane
            
            return {
                'current_lane': current_lane,
                'recommended_lane': recommended_lane,
                'total_lanes': lane_data['total_lanes'],
                'lane_change_needed': lane_change_needed,
                'next_maneuver': next_maneuver,
                'lane_guidance_text': self._generate_lane_guidance_text(
                    current_lane, recommended_lane, next_maneuver
                ),
                'timestamp': int(time.time())
            }
        except Exception as e:
            print(f"Error getting lane guidance: {e}")
            return {'error': str(e)}
    
    def _get_lane_data(self, lat: float, lon: float, road_type: str) -> Optional[Dict]:
        """Get lane data from OpenStreetMap."""
        try:
            # Check cache first
            cache_key = f"{lat:.4f},{lon:.4f}"
            if cache_key in self.lane_data_cache:
                cached_data = self.lane_data_cache[cache_key]
                if time.time() - cached_data['timestamp'] < self.cache_expiry:
                    return cached_data['data']
            
            # Query Overpass API for lanes tag
            overpass_url = "http://overpass-api.de/api/interpreter"
            query = f"""
            [bbox:{lat-0.01},{lon-0.01},{lat+0.01},{lon+0.01}];
            way[lanes];
            out geom;
            """
            
            response = requests.get(overpass_url, params={'data': query}, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('elements'):
                    # Extract lane data from first element
                    for element in data['elements']:
                        if 'tags' in element and 'lanes' in element['tags']:
                            lanes_str = element['tags']['lanes']
                            total_lanes = int(lanes_str)
                            
                            # Get turn:lanes data if available
                            turn_lanes = element['tags'].get('turn:lanes', '')
                            
                            lane_data = {
                                'total_lanes': total_lanes,
                                'turn_lanes': turn_lanes,
                                'road_type': road_type,
                                'timestamp': time.time()
                            }
                            
                            # Cache the result
                            self.lane_data_cache[cache_key] = {
                                'data': lane_data,
                                'timestamp': time.time()
                            }
                            return lane_data
            
            # Fallback to default lane configuration
            config = LANE_CONFIGURATIONS.get(road_type, {})
            return {
                'total_lanes': config.get('max_lanes', 2),
                'turn_lanes': '',
                'road_type': road_type,
                'timestamp': time.time()
            }
        except Exception as e:
            print(f"Error getting lane data: {e}")
            return None
    
    def _determine_current_lane(self, heading: float, lane_data: Dict) -> int:
        """Determine current lane based on heading."""
        try:
            total_lanes = lane_data['total_lanes']
            
            # Normalize heading to 0-360
            heading = heading % 360
            
            # Determine lane based on heading
            # This is a simplified approach - in production, use GPS position
            if total_lanes == 1:
                return 1
            elif total_lanes == 2:
                # Left lane if heading 270-90, right lane if heading 90-270
                return 1 if 270 <= heading or heading < 90 else 2
            elif total_lanes == 3:
                if 270 <= heading or heading < 90:
                    return 1  # Left lane
                elif 90 <= heading < 180:
                    return 2  # Middle lane
                else:
                    return 3  # Right lane
            else:
                # For 4+ lanes, distribute evenly
                lane_angle = 360 / total_lanes
                return min(int(heading / lane_angle) + 1, total_lanes)
        except Exception as e:
            print(f"Error determining current lane: {e}")
            return 1
    
    def _get_recommended_lane(self, maneuver: str, lane_data: Dict, 
                             current_lane: int) -> int:
        """Get recommended lane for maneuver."""
        try:
            total_lanes = lane_data['total_lanes']
            turn_lanes = lane_data.get('turn_lanes', '')
            
            if maneuver == 'left':
                # Recommend left lane
                return 1
            elif maneuver == 'right':
                # Recommend right lane
                return total_lanes
            elif maneuver == 'exit':
                # Recommend rightmost lane for exit
                return total_lanes
            else:
                # Straight - recommend middle lane if available
                if total_lanes >= 3:
                    return (total_lanes + 1) // 2
                else:
                    return current_lane
        except Exception as e:
            print(f"Error getting recommended lane: {e}")
            return current_lane
    
    def _generate_lane_guidance_text(self, current_lane: int, 
                                     recommended_lane: int,
                                     maneuver: str) -> str:
        """Generate lane guidance text."""
        try:
            if current_lane == recommended_lane:
                return f"Keep in lane {current_lane}"
            
            if recommended_lane < current_lane:
                direction = "left"
            else:
                direction = "right"
            
            if maneuver == 'exit':
                return f"Move to {direction} lane for exit"
            elif maneuver == 'left':
                return f"Move to {direction} lane for left turn"
            elif maneuver == 'right':
                return f"Move to {direction} lane for right turn"
            else:
                return f"Move to lane {recommended_lane}"
        except Exception as e:
            print(f"Error generating lane guidance text: {e}")
            return "Lane guidance unavailable"
    
    def get_lane_change_warning(self, distance_to_maneuver: float) -> Optional[str]:
        """
        Get lane change warning based on distance to maneuver.
        
        Args:
            distance_to_maneuver: Distance to next maneuver in meters
            
        Returns:
            str: Warning message or None
        """
        try:
            if distance_to_maneuver <= LANE_CHANGE_WARNINGS['near']:
                return "Lane change now"
            elif distance_to_maneuver <= LANE_CHANGE_WARNINGS['medium']:
                return f"Prepare to change lane in {int(distance_to_maneuver)}m"
            elif distance_to_maneuver <= LANE_CHANGE_WARNINGS['far']:
                return f"Lane change needed in {int(distance_to_maneuver)}m"
            else:
                return None
        except Exception as e:
            print(f"Error getting lane change warning: {e}")
            return None
    
    def clear_cache(self):
        """Clear lane data cache."""
        self.lane_data_cache.clear()
        print("[OK] Lane data cache cleared")

