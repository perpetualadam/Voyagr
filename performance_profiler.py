"""
Performance Profiler for Custom Routing Engine
Analyzes routing performance and identifies bottlenecks
"""

import time
import statistics
from typing import List, Tuple, Dict
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.instructions import InstructionGenerator
from custom_router.costs import CostCalculator


class PerformanceProfiler:
    """Profile routing engine performance"""
    
    def __init__(self, db_path: str = 'data/uk_router.db'):
        """Initialize profiler"""
        print("Loading graph...")
        self.graph = RoadNetwork(db_path)
        self.router = Router(self.graph)
        self.instruction_gen = InstructionGenerator(self.graph)
        self.results = {}
    
    def profile_route(self, start_lat: float, start_lon: float, 
                     end_lat: float, end_lon: float, 
                     name: str = "Route") -> Dict:
        """Profile a single route"""
        print(f"\nProfiling: {name}")
        
        # Measure route calculation
        start_time = time.time()
        route = self.router.route(start_lat, start_lon, end_lat, end_lon)
        route_time = (time.time() - start_time) * 1000
        
        # Measure instruction generation
        start_time = time.time()
        instructions = self.instruction_gen.generate(route['path_nodes'])
        instr_time = (time.time() - start_time) * 1000
        
        # Measure cost calculation
        start_time = time.time()
        costs = CostCalculator.calculate_total_cost(
            distance_km=route['distance_km'],
            vehicle_type='petrol_diesel',
            fuel_efficiency=6.5,
            fuel_price=1.40,
            include_tolls=True,
            include_caz=True
        )
        cost_time = (time.time() - start_time) * 1000
        
        total_time = route_time + instr_time + cost_time
        
        result = {
            'name': name,
            'distance_km': route['distance_km'],
            'duration_min': route['duration_minutes'],
            'route_time_ms': route_time,
            'instr_time_ms': instr_time,
            'cost_time_ms': cost_time,
            'total_time_ms': total_time,
            'num_nodes': len(route['path_nodes']),
            'num_instructions': len(instructions),
            'total_cost': costs['total_cost']
        }
        
        print(f"  Distance: {result['distance_km']:.1f} km")
        print(f"  Duration: {result['duration_min']:.1f} min")
        print(f"  Route calc: {result['route_time_ms']:.1f}ms")
        print(f"  Instructions: {result['instr_time_ms']:.1f}ms")
        print(f"  Cost calc: {result['cost_time_ms']:.1f}ms")
        print(f"  Total: {result['total_time_ms']:.1f}ms")
        
        return result
    
    def run_benchmark_suite(self) -> None:
        """Run comprehensive benchmark suite"""
        print("=" * 60)
        print("CUSTOM ROUTING ENGINE - PERFORMANCE BENCHMARK")
        print("=" * 60)
        
        # Test routes (lat1, lon1, lat2, lon2, name, category)
        test_routes = [
            # Short routes (1-10km)
            (51.5074, -0.1278, 51.5500, -0.1000, "London: Piccadilly → Regent St", "short"),
            (51.5074, -0.1278, 51.5200, -0.1500, "London: Piccadilly → Kensington", "short"),
            (51.5074, -0.1278, 51.4900, -0.0900, "London: Piccadilly → Tower Bridge", "short"),
            (51.5074, -0.1278, 51.5300, -0.0800, "London: Piccadilly → Canary Wharf", "short"),
            (51.5074, -0.1278, 51.4800, -0.1500, "London: Piccadilly → Chelsea", "short"),
            
            # Medium routes (50-100km)
            (51.5074, -0.1278, 51.7500, 0.4600, "London → Southend", "medium"),
            (51.5074, -0.1278, 51.3000, -0.5000, "London → Guildford", "medium"),
            (51.5074, -0.1278, 51.1000, -1.3000, "London → Reading", "medium"),
            (51.5074, -0.1278, 50.8000, -0.1000, "London → Brighton", "medium"),
            (51.5074, -0.1278, 51.9000, -0.3000, "London → Watford", "medium"),
            
            # Long routes (200km+)
            (51.5074, -0.1278, 53.4808, -2.2426, "London → Manchester", "long"),
            (51.5074, -0.1278, 52.6386, -1.1319, "London → Nottingham", "long"),
            (51.5074, -0.1278, 52.9536, -1.1743, "London → Leicester", "long"),
            (51.5074, -0.1278, 52.2053, -0.1218, "London → Cambridge", "long"),
            (51.5074, -0.1278, 54.9783, -1.6178, "London → Newcastle", "long"),
        ]
        
        results_by_category = {'short': [], 'medium': [], 'long': []}
        
        for lat1, lon1, lat2, lon2, name, category in test_routes:
            result = self.profile_route(lat1, lon1, lat2, lon2, name)
            results_by_category[category].append(result)
        
        # Print summary
        self.print_summary(results_by_category)
    
    def print_summary(self, results_by_category: Dict) -> None:
        """Print performance summary"""
        print("\n" + "=" * 60)
        print("PERFORMANCE SUMMARY")
        print("=" * 60)
        
        for category in ['short', 'medium', 'long']:
            results = results_by_category[category]
            if not results:
                continue
            
            times = [r['total_time_ms'] for r in results]
            distances = [r['distance_km'] for r in results]
            
            print(f"\n{category.upper()} ROUTES ({len(results)} routes)")
            print(f"  Distance: {statistics.mean(distances):.1f} ± {statistics.stdev(distances) if len(distances) > 1 else 0:.1f} km")
            print(f"  Time: {statistics.mean(times):.1f} ± {statistics.stdev(times) if len(times) > 1 else 0:.1f} ms")
            print(f"  Min: {min(times):.1f}ms, Max: {max(times):.1f}ms")
            
            # Breakdown
            route_times = [r['route_time_ms'] for r in results]
            instr_times = [r['instr_time_ms'] for r in results]
            cost_times = [r['cost_time_ms'] for r in results]
            
            print(f"  Breakdown:")
            print(f"    Route calc: {statistics.mean(route_times):.1f}ms ({statistics.mean(route_times)/statistics.mean(times)*100:.1f}%)")
            print(f"    Instructions: {statistics.mean(instr_times):.1f}ms ({statistics.mean(instr_times)/statistics.mean(times)*100:.1f}%)")
            print(f"    Cost calc: {statistics.mean(cost_times):.1f}ms ({statistics.mean(cost_times)/statistics.mean(times)*100:.1f}%)")
        
        # Overall summary
        all_results = []
        for category in results_by_category.values():
            all_results.extend(category)
        
        if all_results:
            all_times = [r['total_time_ms'] for r in all_results]
            print(f"\nOVERALL ({len(all_results)} routes)")
            print(f"  Average: {statistics.mean(all_times):.1f}ms")
            print(f"  Median: {statistics.median(all_times):.1f}ms")
            print(f"  Min: {min(all_times):.1f}ms")
            print(f"  Max: {max(all_times):.1f}ms")
            print(f"  Std Dev: {statistics.stdev(all_times):.1f}ms")
        
        print("\n" + "=" * 60)


if __name__ == '__main__':
    profiler = PerformanceProfiler()
    profiler.run_benchmark_suite()

