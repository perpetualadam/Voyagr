#!/usr/bin/env python3
"""
Check Database Health After Rebuild
Verifies that the oneway=-1 fix was applied correctly
"""

import sqlite3
import os

def check_database_health():
    """Check database health and edge statistics."""
    db_file = 'data/uk_router.db'
    
    if not os.path.exists(db_file):
        print(f"❌ Database not found: {db_file}")
        return False
    
    print("=" * 70)
    print("DATABASE HEALTH CHECK")
    print("=" * 70)
    
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # Basic statistics
        print("\n[1] Basic Statistics")
        print("-" * 70)
        
        cursor.execute('SELECT COUNT(*) FROM nodes')
        node_count = cursor.fetchone()[0]
        print(f"Nodes: {node_count:,}")
        
        cursor.execute('SELECT COUNT(*) FROM edges')
        edge_count = cursor.fetchone()[0]
        print(f"Edges: {edge_count:,}")
        
        cursor.execute('SELECT COUNT(*) FROM ways')
        way_count = cursor.fetchone()[0]
        print(f"Ways: {way_count:,}")
        
        cursor.execute('SELECT COUNT(*) FROM turn_restrictions')
        restriction_count = cursor.fetchone()[0]
        print(f"Turn restrictions: {restriction_count:,}")
        
        db_size_gb = os.path.getsize(db_file) / (1024**3)
        print(f"Database size: {db_size_gb:.2f} GB")
        
        # Edge statistics
        print("\n[2] Edge Statistics")
        print("-" * 70)
        
        avg_edges_per_node = edge_count / node_count if node_count > 0 else 0
        print(f"Average edges per node: {avg_edges_per_node:.2f}")
        
        # Check for bidirectional edges (indicator of proper oneway handling)
        print("\n[3] Bidirectional Edge Check")
        print("-" * 70)
        print("Checking for reverse edges (this may take 30-60 seconds)...")
        
        cursor.execute('''
            SELECT COUNT(*) FROM edges e1 
            WHERE EXISTS (
                SELECT 1 FROM edges e2 
                WHERE e1.from_node_id = e2.to_node_id 
                AND e1.to_node_id = e2.from_node_id
            )
            LIMIT 100000
        ''')
        bidirectional_count = cursor.fetchone()[0]
        bidirectional_pct = (bidirectional_count / edge_count * 100) if edge_count > 0 else 0
        
        print(f"Edges with reverse: {bidirectional_count:,} ({bidirectional_pct:.1f}%)")
        
        if bidirectional_pct > 50:
            print("✅ GOOD: Most edges are bidirectional (normal roads)")
        elif bidirectional_pct > 20:
            print("⚠️  WARNING: Low bidirectional percentage (possible oneway issue)")
        else:
            print("❌ ERROR: Very few bidirectional edges (oneway=-1 fix may not be applied)")
        
        # Sample some edges
        print("\n[4] Sample Edges")
        print("-" * 70)
        
        cursor.execute('''
            SELECT e.from_node_id, e.to_node_id, e.distance_m, e.speed_limit_kmh, w.name, w.highway
            FROM edges e
            JOIN ways w ON e.way_id = w.id
            LIMIT 10
        ''')
        
        print(f"{'From Node':<12} {'To Node':<12} {'Distance':<10} {'Speed':<8} {'Road Name':<30} {'Type':<15}")
        print("-" * 70)
        for row in cursor.fetchall():
            from_node, to_node, distance, speed, name, highway = row
            print(f"{from_node:<12} {to_node:<12} {distance:<10.1f} {speed:<8} {name[:30]:<30} {highway:<15}")
        
        # Check for London and Oxford nodes
        print("\n[5] London & Oxford Node Check")
        print("-" * 70)
        
        # London (Trafalgar Square): 51.5074, -0.1278
        cursor.execute('''
            SELECT id, lat, lon FROM nodes
            WHERE lat BETWEEN 51.50 AND 51.51
            AND lon BETWEEN -0.13 AND -0.12
            LIMIT 5
        ''')
        london_nodes = cursor.fetchall()
        print(f"London area nodes found: {len(london_nodes)}")
        if london_nodes:
            print(f"  Sample: Node {london_nodes[0][0]} at ({london_nodes[0][1]:.4f}, {london_nodes[0][2]:.4f})")
        
        # Oxford (City Centre): 51.7520, -1.2577
        cursor.execute('''
            SELECT id, lat, lon FROM nodes
            WHERE lat BETWEEN 51.75 AND 51.76
            AND lon BETWEEN -1.26 AND -1.25
            LIMIT 5
        ''')
        oxford_nodes = cursor.fetchall()
        print(f"Oxford area nodes found: {len(oxford_nodes)}")
        if oxford_nodes:
            print(f"  Sample: Node {oxford_nodes[0][0]} at ({oxford_nodes[0][1]:.4f}, {oxford_nodes[0][2]:.4f})")
        
        conn.close()
        
        # Overall health assessment
        print("\n" + "=" * 70)
        print("HEALTH ASSESSMENT")
        print("=" * 70)
        
        issues = []
        
        if edge_count < 10000000:
            issues.append("⚠️  Edge count is low (expected 40-60M for full UK)")
        
        if bidirectional_pct < 50:
            issues.append("⚠️  Low bidirectional edge percentage")
        
        if not london_nodes:
            issues.append("❌ No London nodes found")
        
        if not oxford_nodes:
            issues.append("❌ No Oxford nodes found")
        
        if issues:
            print("Issues found:")
            for issue in issues:
                print(f"  {issue}")
        else:
            print("✅ Database appears healthy!")
            print("   - Good edge count")
            print("   - High bidirectional percentage")
            print("   - London and Oxford nodes present")
        
        print("\nNext step: Run 'python test_bulletproof_routing.py' to test routing")
        
        return True
        
    except Exception as e:
        print(f"❌ Error checking database: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    check_database_health()

