#!/usr/bin/env python3
"""Rebuild CH index with fixed algorithm - FULL 26.5M nodes."""

import sqlite3
import sys
import time

# Delete old CH data
print("[CH] Deleting old CH data from database...")
conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

try:
    cursor.execute("DROP TABLE IF EXISTS ch_node_order")
    cursor.execute("DROP TABLE IF EXISTS ch_shortcuts")
    conn.commit()
    print("[CH] Old CH tables deleted")
except Exception as e:
    print(f"[CH] Error deleting tables: {e}")

conn.close()

# Now build new CH index
print("\n[CH] Building new CH index with fixed algorithm...")
print("[CH] This will take 30-60 minutes for full 26.5M nodes")
print()

from custom_router.graph import RoadNetwork
from custom_router.contraction_hierarchies import ContractionHierarchies

# Load graph
print("[CH] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
elapsed = time.time() - start
print(f"[CH] Graph loaded in {elapsed:.1f}s")

# CRITICAL: Wait for edges to load in background before building CH
print("\n[CH] Waiting for edges to load in background...")
start_wait = time.time()
last_print = 0
while not getattr(graph, '_edges_loaded', False):
    elapsed_wait = time.time() - start_wait
    if elapsed_wait - last_print >= 10:  # Print every 10 seconds
        try:
            edges_loaded = sum(len(e) for e in list(graph.edges.values()))
            print(f"[CH] Waiting... {edges_loaded:,} edges loaded so far ({elapsed_wait:.0f}s)")
            last_print = elapsed_wait
        except:
            pass
    time.sleep(1)

elapsed_wait = time.time() - start_wait
try:
    edges_loaded = sum(len(e) for e in list(graph.edges.values()))
except:
    edges_loaded = len(graph.edges)
print(f"[CH] OK Edges loaded: {edges_loaded:,} edges in {elapsed_wait:.1f}s")

# Build CH with FULL sample size (all 26.5M nodes)
print("\n[CH] Building CH index with FULL sample (26,544,335 nodes)...")
print("[CH] This will take 30-60 minutes...")
start = time.time()
ch = ContractionHierarchies(graph, 'data/uk_router.db')
ch.build(sample_size=26544335)  # Full size
elapsed = time.time() - start
print(f"[CH] CH built in {elapsed:.1f}s ({elapsed/60:.1f} minutes)")

# Save CH
print("\n[CH] Saving CH to database...")
start = time.time()
ch.save()
elapsed = time.time() - start
print(f"[CH] CH saved in {elapsed:.1f}s")

# Verify
print("\n[CH] Verifying CH index...")
conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM ch_node_order")
node_count = cursor.fetchone()[0]
print(f"[CH] CH Nodes: {node_count:,}")

cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
shortcut_count = cursor.fetchone()[0]
print(f"[CH] CH Shortcuts: {shortcut_count:,}")

if shortcut_count > 0:
    print(f"\nOK SUCCESS! CH index rebuilt with {shortcut_count:,} shortcuts")
else:
    print(f"\nERROR FAILED! No shortcuts created")

conn.close()

