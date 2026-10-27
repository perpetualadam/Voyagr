"""
Unified routing engine abstraction layer.
Consolidates GraphHopper, Valhalla, and OSRM API calls into a single interface.
Eliminates code duplication and improves maintainability.
"""

import requests
import os
import polyline
from typing import Dict, List, Optional
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
                legs = data['trip']['legs']
                coords = []
                for leg in legs:
                    points = polyline.decode(leg['shape'], precision=6)
                    coords.extend(points[1:] if coords and points and coords[-1]==points[0] else points)
                summary = data['trip'].get('summary') or {
                    'length':sum(leg['summary']['length'] for leg in legs),
                    'time':sum(leg['summary']['time'] for leg in legs),
                }
                return {'distance_km':summary['length'],'duration_minutes':summary['time']/60,
                        'geometry':polyline.encode(coords,precision=6),'geometry_precision':6,'source':'Valhalla'}
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
                    'geometry_precision':5,
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
        if routing_mode != 'auto':
            return None  # This configured public provider exposes driving only.
        try:
            url = f'{self.url}/{start_lon},{start_lat};{end_lon},{end_lat}'
            response = requests.get(url, params={'geometries':'polyline6','overview':'full'}, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            
            if data.get('code') == 'Ok' and len(data['routes']) > 0:
                route = data['routes'][0]
                return {
                    'distance_km': route['distance'] / 1000,
                    'duration_minutes': route['duration'] / 60,
                    'geometry': route['geometry'] if isinstance(route['geometry'],str) else polyline.encode([(p[1],p[0]) for p in route['geometry']['coordinates']],precision=6),
                    'geometry_precision':6,
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
                       preferred_engine: Optional[str] = None, *, avoidance=None, hazards=None) -> Optional[Dict]:
        """Calculate route with fallback chain.
        
        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            routing_mode: Routing mode
            preferred_engine: Preferred engine name (optional)
            
        Returns:
            Route data dict or None if all engines fail
        """
        from voyagr.services.routing.integrity import normalize_requirements, assess_response
        requirements = normalize_requirements({'avoid_caz':False, **(avoidance or {})})
        best_effort = None
        engines = sorted(self.engines,key=lambda e:e.name!=preferred_engine) if preferred_engine else self.engines
        for engine in engines:
            try:
                result = engine.calculate_route(start_lat,start_lon,end_lat,end_lon,routing_mode)
                if not isinstance(result,dict):
                    self.stats[engine.name]['failure'] += 1
                    continue
                envelope = assess_response({'success':True,'routes':[result]},requirements,hazards)
                assessed = envelope['routes'][0]
                if not assessed['avoidance_assessment']['geometry_valid']:
                    self.stats[engine.name]['failure'] += 1
                    continue
                self.stats[engine.name]['success'] += 1
                assessed['avoidance_status'] = envelope['avoidance_status']
                if assessed['avoidance_assessment']['automatic_selection_allowed']:
                    return assessed
                if best_effort is None: best_effort = assessed
            except Exception:
                self.stats[engine.name]['failure'] += 1
        return best_effort

    def get_available_engines(self) -> List[str]:
        """Get list of available engines."""
        return [engine.name for engine in self.engines if engine.is_available()]
    
    def get_stats(self) -> Dict:
        """Get routing engine statistics."""
        return self.stats


# Global instance
routing_manager = RoutingEngineManager()

