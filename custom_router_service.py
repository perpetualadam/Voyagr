"""
Custom Router Service - Singleton pattern for persistent router instance
Loads graph once at startup and keeps it in memory for fast route calculations
Includes route caching for frequently used routes
"""
import threading
import time
from typing import Optional, Dict
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.k_shortest_paths import KShortestPaths
from custom_router.edge_cache import RouteCache
from custom_router.component_analyzer import ComponentAnalyzer

class CustomRouterService:
    """Singleton service for custom router - loads once, reuses forever."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return

        self.graph: Optional[RoadNetwork] = None
        self.router: Optional[Router] = None
        self.k_paths: Optional[KShortestPaths] = None
        self.route_cache = RouteCache(max_size=1000)
        self.load_time = 0
        self.is_ready = False
        self._initialized = True
    
    def initialize(self, db_file: str = 'data/uk_router.db', use_ch: bool = False):
        """Initialize router (loads graph once)."""
        if self.is_ready:
            print("[RouterService] Already initialized, skipping...")
            return

        print("[RouterService] Initializing custom router...")
        start = time.time()

        try:
            # Load graph
            print("[RouterService] Loading graph...")
            self.graph = RoadNetwork(db_file)

            # Initialize component analyzer for connectivity checking
            print("[RouterService] Initializing component analyzer...")
            analyzer = ComponentAnalyzer(self.graph)
            # Use FULL analysis (analyzes all nodes, not sampled)
            # This ensures we find the true main component (26M+ nodes)
            analyzer.analyze_full()
            self.graph.set_component_analyzer(analyzer)
            print(f"[RouterService] ✅ Component analysis complete")

            # Initialize router
            print("[RouterService] Initializing router...")
            self.router = Router(self.graph, use_ch=use_ch, db_file=db_file)
            self.k_paths = KShortestPaths(self.router)

            self.load_time = time.time() - start
            self.is_ready = True

            print(f"[RouterService] ✅ Ready in {self.load_time:.1f}s")
            print(f"[RouterService] Nodes: {len(self.graph.nodes):,}")
            print(f"[RouterService] Edges: {sum(len(e) for e in self.graph.edges.values()):,}")

        except Exception as e:
            print(f"[RouterService] ❌ Initialization failed: {e}")
            self.is_ready = False
            raise
    
    def calculate_route(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float, use_cache: bool = True) -> Optional[Dict]:
        """Calculate route using persistent router with optional caching."""
        if not self.is_ready:
            raise RuntimeError("Router not initialized. Call initialize() first.")

        # Check cache first
        if use_cache:
            cached = self.route_cache.get(start_lat, start_lon, end_lat, end_lon)
            if cached:
                return cached

        # Calculate route
        route = self.router.route(start_lat, start_lon, end_lat, end_lon)

        # Cache result
        if use_cache and route and 'error' not in route:
            self.route_cache.set(start_lat, start_lon, end_lat, end_lon, route)

        return route
    
    def find_k_paths(self, start_lat: float, start_lon: float,
                    end_lat: float, end_lon: float, k: int = 4):
        """Find K shortest paths."""
        if not self.is_ready:
            raise RuntimeError("Router not initialized. Call initialize() first.")
        
        return self.k_paths.find_k_paths(start_lat, start_lon, end_lat, end_lon, k)
    
    def get_stats(self) -> Dict:
        """Get router statistics."""
        if not self.is_ready:
            return {'status': 'not_initialized'}

        cache_stats = self.route_cache.get_stats()
        return {
            'status': 'ready',
            'load_time_s': self.load_time,
            'nodes': len(self.graph.nodes),
            'edges': sum(len(e) for e in self.graph.edges.values()),
            'ways': len(self.graph.ways),
            'ch_available': self.router.ch_available if self.router else False,
            'cache': cache_stats
        }

# Global instance
_router_service = None

def get_router_service() -> CustomRouterService:
    """Get or create router service instance."""
    global _router_service
    if _router_service is None:
        _router_service = CustomRouterService()
    return _router_service

def initialize_router(db_file: str = 'data/uk_router.db', use_ch: bool = False):
    """Initialize the router service."""
    service = get_router_service()
    service.initialize(db_file, use_ch)
    return service

