#!/usr/bin/env python3
"""
Build Contraction Hierarchies index for custom routing engine.
This preprocesses the graph once to enable 5-10x faster routing queries.

Usage:
    python build_ch_index.py [--sample-size 10000]

The CH index is saved to the database and automatically loaded by the Router.
"""

import sys
import time
import argparse
from custom_router.graph import RoadNetwork
from custom_router.contraction_hierarchies import ContractionHierarchies

def main():
    parser = argparse.ArgumentParser(description='Build Contraction Hierarchies index')
    parser.add_argument('--sample-size', type=int, default=10000,
                       help='Number of nodes to contract (default: 10000)')
    parser.add_argument('--db', type=str, default='data/uk_router.db',
                       help='Path to routing database')
    args = parser.parse_args()

    print("=" * 70)
    print("CONTRACTION HIERARCHIES INDEX BUILDER")
    print("=" * 70)
    print(f"\nDatabase: {args.db}")
    print(f"Sample size: {args.sample_size:,} nodes")
    print()

    try:
        # Load graph
        print("[1/3] Loading graph...")
        start = time.time()
        graph = RoadNetwork(args.db)
        elapsed = time.time() - start
        print(f"[OK] Loaded {len(graph.nodes):,} nodes in {elapsed:.1f}s")

        # Build CH
        print("\n[2/3] Building Contraction Hierarchies...")
        start = time.time()
        ch = ContractionHierarchies(graph, args.db)
        ch.build(sample_size=args.sample_size)
        elapsed = time.time() - start
        print(f"[OK] Built CH with {len(ch.shortcuts):,} shortcuts in {elapsed:.1f}s")

        # Save CH
        print("\n[3/3] Saving CH index to database...")
        start = time.time()
        ch.save()
        elapsed = time.time() - start
        print(f"[OK] Saved in {elapsed:.1f}s")

        print("\n" + "=" * 70)
        print("CH INDEX BUILD COMPLETE")
        print("=" * 70)
        print("\nThe CH index is now available for routing queries.")
        print("Router will automatically use it for 5-10x faster routing.")
        print()

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()

