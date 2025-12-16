"""
Test component connectivity to understand graph fragmentation
"""
import time
from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer
from custom_router_service import initialize_router

print("=" * 70)
print("COMPONENT CONNECTIVITY TEST")
print("=" * 70)

# Initialize router service
print("\n[TEST] Initializing router service...")
service = initialize_router('data/uk_router.db', use_ch=False)

graph = service.graph
analyzer = graph.component_analyzer

print(f"\n[TEST] Graph Statistics:")
print(f"  Total nodes: {len(graph.nodes):,}")
print(f"  Total components: {len(analyzer.component_sizes)}")
print(f"  Main component: {analyzer.main_component_size:,} nodes")

# Test cities
cities = {
    'London': (51.5074, -0.1278),
    'Oxford': (51.7520, -1.2577),
    'Manchester': (53.4808, -2.2426),
    'Leeds': (53.8008, -1.5491),
    'Birmingham': (52.5086, 1.8853),
    'Bristol': (51.4545, -2.5879),
    'Liverpool': (53.4084, -2.9916),
    'Sheffield': (53.3811, -1.4701),
}

print(f"\n[TEST] Finding nearest nodes for cities...")
city_nodes = {}
for city, (lat, lon) in cities.items():
    node = graph.find_nearest_node(lat, lon)
    if node is None:
        print(f"  {city:15} -> ❌ No node found")
        continue
    comp_id = analyzer.get_component_id(node)
    comp_size = analyzer.component_sizes.get(comp_id, 0)
    city_nodes[city] = (node, comp_id, comp_size)
    print(f"  {city:15} -> Node {node:10,} (Component {comp_id:3}, Size {comp_size:10,})")

print(f"\n[TEST] Testing connectivity between cities...")
print(f"{'From':15} {'To':15} {'Connected':10} {'Same Comp':10}")
print("-" * 50)

for city1 in cities:
    for city2 in cities:
        if city1 >= city2:
            continue
        node1, comp1, _ = city_nodes[city1]
        node2, comp2, _ = city_nodes[city2]
        connected = analyzer.is_connected(node1, node2)
        same_comp = comp1 == comp2
        print(f"{city1:15} {city2:15} {str(connected):10} {str(same_comp):10}")

print(f"\n[TEST] Testing routes within same component...")
# Find two cities in the main component
main_comp_cities = [c for c, (_, comp_id, _) in city_nodes.items() 
                    if comp_id == analyzer.main_component_id]

if len(main_comp_cities) >= 2:
    city1, city2 = main_comp_cities[0], main_comp_cities[1]
    lat1, lon1 = cities[city1]
    lat2, lon2 = cities[city2]
    
    print(f"\nTesting route: {city1} -> {city2}")
    start = time.time()
    route = service.calculate_route(lat1, lon1, lat2, lon2, use_cache=False)
    elapsed = time.time() - start
    
    if route and 'error' not in route:
        print(f"✅ Route found in {elapsed:.2f}s")
        print(f"   Distance: {route.get('distance_m', 0) / 1000:.1f} km")
        print(f"   Duration: {route.get('duration_s', 0) / 60:.1f} min")
    else:
        print(f"❌ No route found in {elapsed:.2f}s")
        if route:
            print(f"   Error: {route.get('error', 'Unknown')}")
else:
    print(f"⚠️  Not enough cities in main component to test")

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)

