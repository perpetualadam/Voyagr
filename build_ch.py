#!/usr/bin/env python3
"""
Build Contraction Hierarchies (CH) database for custom router.

This script builds CH data for the UK road network, which provides 5-10x speedup
for route calculations. The build process takes 2-4 hours (one-time).

Usage:
    python build_ch.py [--sample-size N]

Options:
    --sample-size N    Number of nodes to contract (default: 1000000)
                       Use smaller values for faster testing (e.g., 10000)
                       Use 1000000+ for production

Example:
    # Quick test (10k nodes, ~5 minutes)
    python build_ch.py --sample-size 10000
    
    # Production build (1M nodes, ~2-4 hours)
    python build_ch.py --sample-size 1000000
"""

import argparse
import time
from custom_router.graph import RoadNetwork
from custom_router.contraction_hierarchies import ContractionHierarchies


def main():
    parser = argparse.ArgumentParser(description='Build Contraction Hierarchies database')
    parser.add_argument('--sample-size', type=int, default=1000000,
                        help='Number of nodes to contract (default: 1000000)')
    parser.add_argument('--db-file', type=str, default='data/uk_router.db',
                        help='Path to database file (default: data/uk_router.db)')
    args = parser.parse_args()

    print("=" * 80)
    print("CONTRACTION HIERARCHIES BUILD")
    print("=" * 80)
    print(f"Database: {args.db_file}")
    print(f"Sample size: {args.sample_size:,} nodes")
    print()

    # Step 1: Load graph
    print("[1/3] Loading road network...")
    start_time = time.time()
    graph = RoadNetwork(db_file=args.db_file, skip_component_detection=True)
    elapsed = time.time() - start_time
    print(f"✅ Graph loaded in {elapsed:.1f}s")
    print(f"   Nodes: {len(graph.nodes):,}")
    print(f"   Edges: {sum(len(edges) for edges in graph.edges.values()):,}")
    print()

    # Step 2: Build CH
    print("[2/3] Building Contraction Hierarchies...")
    print(f"   This will take 2-4 hours for {args.sample_size:,} nodes")
    print(f"   Progress will be printed every 10,000 nodes")
    print()
    
    ch_start = time.time()
    ch = ContractionHierarchies(graph=graph, db_file=args.db_file)
    ch.build(sample_size=args.sample_size)
    ch_elapsed = time.time() - ch_start
    
    print()
    print(f"✅ CH build complete in {ch_elapsed:.1f}s ({ch_elapsed/60:.1f} minutes)")
    print()

    # Step 3: Verify CH data
    print("[3/3] Verifying CH data...")
    import sqlite3
    conn = sqlite3.connect(args.db_file)
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) FROM ch_node_order')
    node_count = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM ch_shortcuts')
    shortcut_count = cursor.fetchone()[0]
    
    conn.close()
    
    print(f"✅ CH verification complete:")
    print(f"   Nodes with CH levels: {node_count:,}")
    print(f"   Shortcuts created: {shortcut_count:,}")
    print()

    # Summary
    total_elapsed = time.time() - start_time
    print("=" * 80)
    print("BUILD COMPLETE!")
    print("=" * 80)
    print(f"Total time: {total_elapsed:.1f}s ({total_elapsed/60:.1f} minutes)")
    print()
    print("Next steps:")
    print("1. Run: python test_bulletproof_routing.py")
    print("2. Verify routing performance improved 5-10x")
    print("3. Update voyagr_web.py to use custom router with CH enabled")
    print()
    print("Expected performance:")
    print("  Before CH: 5.41s average")
    print("  After CH:  0.5-1.0s average (5-10x faster)")
    print()


if __name__ == '__main__':
    main()

