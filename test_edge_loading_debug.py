#!/usr/bin/env python3
"""
Debug script to identify why edge loading stops at 20M edges
Tests memory, timeout, and exception handling
"""

import sqlite3
import time
import psutil
import os
import traceback
import gc

process = psutil.Process(os.getpid())

print("="*70)
print("EDGE LOADING DEBUG TEST")
print("="*70)

# Test 1: Check database
print("\n[TEST 1] Checking database...")
conn = sqlite3.connect('data/uk_router.db', timeout=600)  # 10 minutes
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM edges')
total_edges = cursor.fetchone()[0]
print(f"✓ Total edges in DB: {total_edges:,}")

# Test 2: Load edges with detailed monitoring
print("\n[TEST 2] Loading edges with memory monitoring...")
print(f"Memory start: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")

start = time.time()
cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')

edges = {}
edge_count = 0
last_print = 0

try:
    for row in cursor.fetchall():
        from_node = row[0]
        to_node = row[1]
        distance = row[2]
        speed_limit = row[3]
        way_id = row[4]
        
        if from_node not in edges:
            edges[from_node] = []
        edges[from_node].append((to_node, distance, speed_limit, way_id))
        
        edge_count += 1
        if edge_count % 5000000 == 0:
            elapsed = time.time() - start
            mem = process.memory_info().rss / 1024 / 1024 / 1024
            print(f"  Loaded {edge_count:,} edges in {elapsed:.1f}s, Memory: {mem:.2f}GB")
            last_print = edge_count

except Exception as e:
    print(f"✗ Error at {edge_count:,} edges: {e}")
    traceback.print_exc()

elapsed = time.time() - start
mem = process.memory_info().rss / 1024 / 1024 / 1024
print(f"✓ Total: {edge_count:,} edges in {elapsed:.1f}s")
print(f"✓ Memory end: {mem:.2f}GB")
print(f"✓ Expected: {total_edges:,} edges")
print(f"✓ Match: {edge_count == total_edges}")

conn.close()
print("\n" + "="*70)

