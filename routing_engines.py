"""
Unified routing engine abstraction layer.
Consolidates GraphHopper, Valhalla, and OSRM API calls into a single interface.
Eliminates code duplication and improves maintainability.
"""

import requests
import os
import polyline
import json
from typing import Dict, List, Tuple, Optional
from dotenv import load_dotenv

load_dotenv()

# Configuration
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
OSRM_URL = 'http://router.project-osrm.org/route/v1/driving'


class RoutingEngineError(Exception):
    """Base exception for routing engine errors."""
    pass


class RoutingEngine:
    """Abstract base class for routing engines."""
    
    def __init__(self, name: str, url: str, timeout: int = 10):
        """Initialize routing engine.
        
        Args:
            name: Engine name (graphhopper, valhalla, osrm)
            url: Base URL for the engine
            timeout: Request timeout in seconds
        """
        self.name = name
        self.url = url
        self.timeout = timeout
    
    def calculate_route(self, start_lat: float, start_lon: float, 
                       end_lat: float, end_lon: float,
                       routing_mode: str = 'auto') -> Optional[Dict]:
        """Calculate route between two points.
        
        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            routing_mode: Routing mode (auto, pedestrian, bicycle)
            
        Returns:
            Route data dict or None if failed
        """
        raise NotImplementedError
    
    def is_available(self) -> bool:
        """Check if engine is available."""
        raise NotImplementedError


class ValhallaEngine(RoutingEngine):
    """Valhalla routing engine implementation."""
    
    def __init__(self):
        super().__init__('valhalla', VALHALLA_URL)
    
    def calculate_route(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float,
                       routing_mode: str = 'auto') -> Optional[Dict]:
        """Calculate route using Valhalla API."""
        try:
            costing_map = {'auto': 'auto', 'pedestrian': 'pedestrian', 'bicycle': 'bicycle'}
            costing = costing_map.get(routing_mode, 'auto')
            
            payload = {
                'locations': [
                    {'lat': start_lat, 'lon': start_lon},
                    {'lat': end_lat, 'lon': end_lon}
                ],
                'costing': costing
            }
            
            response = requests.post(f'{self.url}/route', json=payload, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            
            if 'trip' in data and len(data['trip']['legs']) > 0:
                leg = data['trip']['legs'][0]
                return {
                    'distance_km': leg['summary']['length'] / 1000,
                    'duration_minutes': leg['summary']['time'] / 60,
                    'geometry': polyline.encode([(p['lat'], p['lon']) for p in leg['shape']]),
                    'source': 'Valhalla'
                }
        except Exception as e:
            print(f"[Valhalla] Error: {e}")
        return None
    
    def is_available(self) -> bool:
        """Check if Valhalla is available."""
        try:
            response = requests.get(f'{self.url}/status', timeout=5)
            return response.status_code == 200
        except:
            return False


class GraphHopperEngine(RoutingEngine):
    """GraphHopper routing engine implementation."""
    
    def __init__(self):
        super().__init__('graphhopper', GRAPHHOPPER_URL)
    
    def calculate_route(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float,
                       routing_mode: str = 'auto') -> Optional[Dict]:
        """Calculate route using GraphHopper API."""
        try:
            vehicle_map = {'auto': 'car', 'pedestrian': 'foot', 'bicycle': 'bike'}
            vehicle = vehicle_map.get(routing_mode, 'car')
            
            params = {
                'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
                'vehicle': vehicle,
                'locale': 'en',
                'points_encoded': True
            }
            
            response = requests.get(f'{self.url}/route', params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            
            if 'paths' in data and len(data['paths']) > 0:
                path = data['paths'][0]
                return {
                    'distance_km': path['distance'] / 1000,
                    'duration_minutes': path['time'] / 60000,
                    'geometry': path['points'],
                    'source': 'GraphHopper'
                }
        except Exception as e:
            print(f"[GraphHopper] Error: {e}")
        return None
    
    def is_available(self) -> bool:
        """Check if GraphHopper is available."""
        try:
            response = requests.get(f'{self.url}/info', timeout=5)
            return response.status_code == 200
        except:
            return False


class OSRMEngine(RoutingEngine):
    """OSRM routing engine implementation (fallback)."""
    
    def __init__(self):
        super().__init__('osrm', OSRM_URL)
    
    def calculate_route(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float,
                       routing_mode: str = 'auto') -> Optional[Dict]:
        """Calculate route using OSRM API."""
        try:
            url = f'{self.url}/{start_lon},{start_lat};{end_lon},{end_lat}'
            response = requests.get(url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            
            if data.get('code') == 'Ok' and len(data['routes']) > 0:
                route = data['routes'][0]
                return {
                    'distance_km': route['distance'] / 1000,
                    'duration_minutes': route['duration'] / 60,
                    'geometry': polyline.encode([(p[1], p[0]) for p in route['geometry']['coordinates']]),
                    'source': 'OSRM'
                }
        except Exception as e:
            print(f"[OSRM] Error: {e}")
        return None
    
    def is_available(self) -> bool:
        """Check if OSRM is available."""
        try:
            response = requests.get(f'{self.url}/0,0;0,0', timeout=5)
            return response.status_code == 200
        except:
            return False


class RoutingEngineManager:
    """Manages multiple routing engines with fallback chain."""
    
    def __init__(self):
        """Initialize routing engine manager."""
        self.engines = [
            ValhallaEngine(),
            GraphHopperEngine(),
            OSRMEngine()
        ]
        self.stats = {engine.name: {'success': 0, 'failure': 0, 'avg_time': 0} for engine in self.engines}
    
    def calculate_route(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float,
                       routing_mode: str = 'auto',
                       preferred_engine: Optional[str] = None) -> Optional[Dict]:
        """Calculate route with fallback chain.
        
        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            routing_mode: Routing mode
            preferred_engine: Preferred engine name (optional)
            
        Returns:
            Route data dict or None if all engines fail
        """
        # Try preferred engine first
        if preferred_engine:
            for engine in self.engines:
                if engine.name == preferred_engine:
                    result = engine.calculate_route(start_lat, start_lon, end_lat, end_lon, routing_mode)
                    if result:
                        self.stats[engine.name]['success'] += 1
                        return result
                    self.stats[engine.name]['failure'] += 1
        
        # Try all engines in order
        for engine in self.engines:
            result = engine.calculate_route(start_lat, start_lon, end_lat, end_lon, routing_mode)
            if result:
                self.stats[engine.name]['success'] += 1
                return result
            self.stats[engine.name]['failure'] += 1
        
        return None
    
    def get_available_engines(self) -> List[str]:
        """Get list of available engines."""
        return [engine.name for engine in self.engines if engine.is_available()]
    
    def get_stats(self) -> Dict:
        """Get routing engine statistics."""
        return self.stats


# Global instance
routing_manager = RoutingEngineManager()

