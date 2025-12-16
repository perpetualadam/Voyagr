#!/usr/bin/env python3
"""
Rebuild UK router database with hazard avoidance support.

This script demonstrates how to rebuild the database with hazard avoidance.
The actual rebuild is done by loading the graph with a HazardManager.

Usage:
    python rebuild_with_hazards.py
"""

import os
import sys
import time

# Add custom_router to path
sys.path.insert(0, os.path.dirname(__file__))

from custom_router.graph import RoadNetwork
from custom_router.hazards import HazardManager


def main():
    print("=" * 80)
    print("REBUILD UK ROUTER DATABASE WITH HAZARD AVOIDANCE")
    print("=" * 80)
    print()
    print("This will load the existing database and add hazard penalties.")
    print()
    print("NOTE: The current database already has pre-calculated costs.")
    print("      This script demonstrates how to add hazard penalties.")
    print()
    print("To rebuild from scratch with hazards:")
    print("  1. Modify custom_router/graph.py to pass hazard_manager")
    print("  2. Run the OSM parser with hazard_manager parameter")
    print()
    print("Expected time: ~15 minutes (loading existing database)")
    print()

    # Check if database exists
    db_file = 'data/uk_router.db'
    if not os.path.exists(db_file):
        print(f"❌ ERROR: Database not found: {db_file}")
        print()
        print("Please build the database first using the OSM parser.")
        return

    print()
    print("=" * 80)
    print("LOADING DATABASE WITH HAZARD MANAGER")
    print("=" * 80)
    print()

    # Initialize hazard manager
    print("[1/2] Initializing hazard manager...")
    hazard_manager = HazardManager(db_file='data/voyagr.db')
    hazard_manager.load_static_hazards()
    camera_count = len(hazard_manager.static_hazards.get('speed_camera', []))
    print(f"✅ Loaded {camera_count} cameras from Voyagr database")
    print()

    # Load graph with hazard manager
    print("[2/2] Loading road network with hazard penalties...")
    print("  This will take ~15 minutes...")
    print()

    start_time = time.time()

    try:
        graph = RoadNetwork(db_file, skip_component_detection=True, hazard_manager=hazard_manager)

        elapsed = time.time() - start_time

        print()
        print("=" * 80)
        print("LOADING COMPLETE!")
        print("=" * 80)
        print(f"Total time: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
        print()
        print(f"Graph loaded with:")
        print(f"  ✅ {len(graph.nodes):,} nodes")
        print(f"  ✅ {sum(len(neighbors) for neighbors in graph.edges.values()):,} edges")
        print(f"  ✅ {camera_count} camera hazard penalties pre-calculated")
        print()
        print("Next steps:")
        print("  1. Test routing: python test_hazard_avoidance.py")
        print("  2. Verify hazard avoidance works correctly")
        print("  3. Compare routes with/without hazard avoidance")
        print()

    except KeyboardInterrupt:
        print("\n\n⚠️  Loading interrupted by user")
        return
    except Exception as e:
        print(f"\n❌ Loading failed: {e}")
        import traceback
        traceback.print_exc()
        return


if __name__ == '__main__':
    main()

