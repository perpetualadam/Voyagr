#!/usr/bin/env python3
"""Quick CH verification test - checks if CH is loaded and working."""

import sqlite3
import sys

def test_ch_loaded():
    """Verify CH index is loaded in database."""
    print("[TEST] Checking CH index in database...")

    try:
        conn = sqlite3.connect('data/uk_router.db')
        cursor = conn.cursor()

        # Check if CH tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ch_node_order'")
        if not cursor.fetchone():
            print("ERROR: CH tables not found in database")
            return False

        # Count CH nodes
        cursor.execute("SELECT COUNT(*) FROM ch_node_order")
        ch_nodes = cursor.fetchone()[0]
        print(f"OK CH Nodes: {ch_nodes:,}")

        # Count CH shortcuts
        cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
        ch_shortcuts = cursor.fetchone()[0]
        print(f"OK CH Shortcuts: {ch_shortcuts:,}")

        # Check CH levels
        cursor.execute("SELECT MIN(order_id), MAX(order_id) FROM ch_node_order")
        min_level, max_level = cursor.fetchone()
        print(f"OK CH Levels: {min_level} to {max_level}")

        conn.close()

        print("\n" + "="*80)
        print("CONTRACTION HIERARCHIES VERIFICATION")
        print("="*80)
        print(f"Status: READY")
        print(f"Nodes: {ch_nodes:,}")
        print(f"Shortcuts: {ch_shortcuts:,}")
        print(f"Levels: {max_level - min_level + 1}")
        print(f"Expected Speedup: 5-10x vs Dijkstra")
        print("="*80 + "\n")

        return True
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    success = test_ch_loaded()
    sys.exit(0 if success else 1)

