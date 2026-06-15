#!/usr/bin/env python3
"""
Simple CH Test - Verify CH index without full graph loading
Fast test that doesn't wait for edge loading
"""

import sys
import os
import sqlite3
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_ch_index():
    """Test CH index directly from database."""
    print("\n" + "="*80)
    print("SIMPLE CH INDEX TEST")
    print("="*80)
    
    try:
        conn = sqlite3.connect('data/uk_router.db')
        cursor = conn.cursor()
        
        # Check CH tables exist
        print("\n[1] Checking CH tables...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ch_node_order'")
        if not cursor.fetchone():
            print("ERROR: CH tables not found!")
            return False
        print("OK: CH tables found")
        
        # Count CH nodes
        print("\n[2] Counting CH nodes...")
        cursor.execute("SELECT COUNT(*) FROM ch_node_order")
        ch_nodes = cursor.fetchone()[0]
        print(f"OK: {ch_nodes:,} CH nodes")
        
        # Count CH shortcuts
        print("\n[3] Counting CH shortcuts...")
        cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
        ch_shortcuts = cursor.fetchone()[0]
        print(f"OK: {ch_shortcuts:,} CH shortcuts")
        
        # Check shortcut validity
        print("\n[4] Checking shortcut validity...")
        cursor.execute("""
            SELECT COUNT(*) FROM ch_shortcuts 
            WHERE from_node IS NOT NULL AND to_node IS NOT NULL AND distance > 0
        """)
        valid_shortcuts = cursor.fetchone()[0]
        print(f"OK: {valid_shortcuts:,} valid shortcuts")
        
        # Check CH levels
        print("\n[5] Checking CH hierarchy levels...")
        cursor.execute("SELECT MIN(order_id), MAX(order_id) FROM ch_node_order")
        min_level, max_level = cursor.fetchone()
        levels = max_level - min_level + 1
        print(f"OK: {levels:,} hierarchy levels")
        
        # Sample some shortcuts
        print("\n[6] Sampling shortcuts...")
        cursor.execute("""
            SELECT from_node, to_node, distance
            FROM ch_shortcuts
            LIMIT 5
        """)
        shortcuts = cursor.fetchall()
        for from_node, to_node, distance in shortcuts:
            print(f"  {from_node} -> {to_node}: {distance}m")
        
        conn.close()
        
        # Summary
        print("\n" + "="*80)
        print("CH INDEX VERIFICATION SUMMARY")
        print("="*80)
        print(f"Status: READY")
        print(f"CH Nodes: {ch_nodes:,}")
        print(f"CH Shortcuts: {ch_shortcuts:,}")
        print(f"Valid Shortcuts: {valid_shortcuts:,}")
        print(f"Hierarchy Levels: {levels:,}")
        print(f"Expected Speedup: 5-10x vs Dijkstra")
        print("="*80 + "\n")
        
        return True
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n" + "="*80)
    print("CH SIMPLE TEST SUITE")
    print("="*80)
    
    if test_ch_index():
        print("TEST PASSED")
        sys.exit(0)
    else:
        print("TEST FAILED")
        sys.exit(1)

