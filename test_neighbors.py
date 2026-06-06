"""
Test if graph is loading neighbors correctly
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import time
from custom_router.graph import RoadNetwork

print("Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Loaded in {time.time() - start:.1f}s")

# Test a few nodes
test_nodes = [7639001106, 4770811000, 1234567890]

for node_id in test_nodes:
    neighbors = graph.get_neighbors(node_id)
    print(f"Node {node_id}: {len(neighbors)} neighbors")
    if neighbors:
        print(f"  First neighbor: {neighbors[0]}")

