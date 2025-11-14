"""
Turn instruction generation
Generate human-readable turn-by-turn instructions
"""

import math
from typing import List, Dict, Tuple
from .graph import RoadNetwork

class InstructionGenerator:
    """Generate turn-by-turn instructions."""
    
    def __init__(self, graph: RoadNetwork):
        """Initialize instruction generator."""
        self.graph = graph
    
    def generate(self, path_nodes: List[int]) -> List[Dict]:
        """Generate turn instructions for a path."""
        if len(path_nodes) < 2:
            return []
        
        instructions = []
        
        for i in range(1, len(path_nodes) - 1):
            prev_node = path_nodes[i - 1]
            curr_node = path_nodes[i]
            next_node = path_nodes[i + 1]
            
            # Get coordinates
            prev_coords = self.graph.get_node_coords(prev_node)
            curr_coords = self.graph.get_node_coords(curr_node)
            next_coords = self.graph.get_node_coords(next_node)
            
            if not all([prev_coords, curr_coords, next_coords]):
                continue
            
            # Calculate bearings
            prev_bearing = self.calculate_bearing(prev_coords, curr_coords)
            next_bearing = self.calculate_bearing(curr_coords, next_coords)
            
            # Detect maneuver
            maneuver = self.detect_maneuver(prev_bearing, next_bearing)
            
            # Get street name
            street_name = self.get_street_name(curr_node, next_node)
            
            # Generate instruction
            instruction_text = self.generate_instruction_text(maneuver, street_name)
            
            # Calculate distance to next node
            distance = self.graph.haversine_distance(curr_coords, next_coords)
            
            instructions.append({
                'instruction': instruction_text,
                'maneuver': maneuver,
                'distance_m': distance,
                'node_id': curr_node,
                'street_name': street_name
            })
        
        return instructions
    
    @staticmethod
    def calculate_bearing(coord1: Tuple[float, float], 
                         coord2: Tuple[float, float]) -> float:
        """Calculate bearing between two coordinates."""
        lat1, lon1 = coord1
        lat2, lon2 = coord2
        
        dlon = math.radians(lon2 - lon1)
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        
        y = math.sin(dlon) * math.cos(lat2_rad)
        x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon)
        
        bearing = math.atan2(y, x)
        return (bearing + 2 * math.pi) % (2 * math.pi)
    
    @staticmethod
    def detect_maneuver(prev_bearing: float, next_bearing: float) -> str:
        """Classify turn type."""
        # Calculate angle difference
        angle_diff = (next_bearing - prev_bearing + math.pi) % (2 * math.pi) - math.pi
        
        # Classify maneuver
        if abs(angle_diff) < 0.1:  # ~6 degrees
            return 'continue'
        elif angle_diff > 0.3:  # ~17 degrees
            if angle_diff > 1.5:  # ~86 degrees
                return 'turn_left'
            else:
                return 'slight_left'
        elif angle_diff < -0.3:
            if angle_diff < -1.5:
                return 'turn_right'
            else:
                return 'slight_right'
        else:
            return 'continue'
    
    def get_street_name(self, from_node: int, to_node: int) -> str:
        """Get street name for edge."""
        neighbors = self.graph.get_neighbors(from_node)
        
        for neighbor, distance, speed, way_id in neighbors:
            if neighbor == to_node:
                way_info = self.graph.get_way_info(way_id)
                if way_info:
                    return way_info['name']
        
        return 'Unknown Street'
    
    @staticmethod
    def generate_instruction_text(maneuver: str, street_name: str) -> str:
        """Generate human-readable instruction."""
        instructions = {
            'continue': f'Continue on {street_name}',
            'slight_left': f'Slight left onto {street_name}',
            'slight_right': f'Slight right onto {street_name}',
            'turn_left': f'Turn left onto {street_name}',
            'turn_right': f'Turn right onto {street_name}'
        }
        
        return instructions.get(maneuver, f'Continue on {street_name}')

