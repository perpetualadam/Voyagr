#!/usr/bin/env python3
"""Simple BallTree test without loading full graph"""

import time
import numpy as np
from sklearn.neighbors import BallTree

print("Testing BallTree with Haversine metric...")
print("=" * 70)

# Create sample nodes (lat, lon in radians)
test_nodes = [
    (51.5074, -0.1278),  # London
    (51.7520, -1.2577),  # Oxford
    (53.4808, -2.2426),  # Manchester
    (52.9548, -1.1581),  # Nottingham
    (52.6386, -1.1319),  # Leicester
]

# Convert to radians
coords_rad = np.deg2rad(test_nodes)
print(f"Created {len(test_nodes)} test nodes")

# Build BallTree
print("\nBuilding BallTree with Haversine metric...")
start = time.time()
tree = BallTree(coords_rad, metric='haversine')
build_time = (time.time() - start) * 1000
print(f"✅ BallTree built in {build_time:.2f}ms")

# Test queries
print("\nTesting nearest neighbor queries...")
earth_radius_km = 6371.0

query_points = [
    (51.5074, -0.1278, "London"),
    (51.7520, -1.2577, "Oxford"),
    (53.4808, -2.2426, "Manchester"),
]

for lat, lon, name in query_points:
    lat_rad = np.radians(lat)
    lon_rad = np.radians(lon)
    
    start = time.time()
    distances, indices = tree.query([[lat_rad, lon_rad]], k=1)
    elapsed = (time.time() - start) * 1000
    
    # Convert distance from radians to km
    dist_km = distances[0][0] * earth_radius_km
    nearest_idx = indices[0][0]
    nearest_lat, nearest_lon = test_nodes[nearest_idx]
    
    print(f"✅ {name:15} - Query in {elapsed:.2f}ms - Nearest: ({nearest_lat:.4f}, {nearest_lon:.4f}) - {dist_km:.2f}km away")

print("\n" + "=" * 70)
print("✅ BallTree test complete!")

