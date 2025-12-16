"""
Add database indexes to SQLite for faster edge queries
Indexes on from_node_id and to_node_id for O(log n) lookups
"""
import sqlite3
import time

def add_indexes(db_file: str = 'data/uk_router.db'):
    """Add indexes to database for faster queries."""
    print(f"[INDEXES] Connecting to {db_file}...")
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    # Check existing indexes
    print("\n[INDEXES] Checking existing indexes...")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
    existing = [row[0] for row in cursor.fetchall()]
    print(f"  Existing indexes: {existing}")
    
    indexes_to_create = [
        ('idx_edges_from_node', 'CREATE INDEX IF NOT EXISTS idx_edges_from_node ON edges(from_node_id)'),
        ('idx_edges_to_node', 'CREATE INDEX IF NOT EXISTS idx_edges_to_node ON edges(to_node_id)'),
        ('idx_nodes_id', 'CREATE INDEX IF NOT EXISTS idx_nodes_id ON nodes(id)'),
        ('idx_ways_id', 'CREATE INDEX IF NOT EXISTS idx_ways_id ON ways(id)'),
    ]
    
    print("\n[INDEXES] Creating indexes...")
    for idx_name, sql in indexes_to_create:
        if idx_name in existing:
            print(f"  ✓ {idx_name} already exists")
        else:
            print(f"  Creating {idx_name}...")
            start = time.time()
            cursor.execute(sql)
            elapsed = time.time() - start
            print(f"    ✅ Created in {elapsed:.1f}s")
    
    # Commit and analyze
    print("\n[INDEXES] Committing changes...")
    conn.commit()
    
    print("[INDEXES] Running ANALYZE for query optimization...")
    start = time.time()
    cursor.execute('ANALYZE')
    elapsed = time.time() - start
    print(f"  ✅ ANALYZE completed in {elapsed:.1f}s")
    
    conn.commit()
    conn.close()
    
    print("\n[INDEXES] ✅ Database optimization complete!")

if __name__ == '__main__':
    add_indexes()

