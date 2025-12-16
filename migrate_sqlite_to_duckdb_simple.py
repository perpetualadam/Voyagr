"""
Simple migration from SQLite to DuckDB - copy edges and ways
"""
import sqlite3
import duckdb
import time

SQLITE_DB = 'data/uk_router.db'
DUCKDB_DB = 'data/uk_router.duckdb'

def migrate():
    print("[Migration] Starting SQLite to DuckDB migration...")
    
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    duckdb_conn = duckdb.connect(DUCKDB_DB)
    
    try:
        # Copy edges - use DISTINCT to handle duplicates
        print("\n[Migration] Copying edges...")
        start = time.time()
        edges = sqlite_conn.execute('SELECT DISTINCT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges').fetchall()
        print(f"[Migration] Read {len(edges):,} unique edges from SQLite")

        # Insert in batches
        batch_size = 100000
        for i in range(0, len(edges), batch_size):
            batch = edges[i:i+batch_size]
            duckdb_conn.executemany(
                'INSERT INTO edges VALUES (?, ?, ?, ?, ?)',
                batch
            )
            print(f"[Migration] Inserted {min(i+batch_size, len(edges)):,}/{len(edges):,} edges")
        
        elapsed = time.time() - start
        print(f"[Migration] ✅ Edges copied in {elapsed:.1f}s")
        
        # Copy ways
        print("\n[Migration] Copying ways...")
        start = time.time()
        ways = sqlite_conn.execute('SELECT id, name, highway, speed_limit_kmh FROM ways').fetchall()
        print(f"[Migration] Read {len(ways):,} ways from SQLite")
        
        batch_size = 100000
        for i in range(0, len(ways), batch_size):
            batch = ways[i:i+batch_size]
            duckdb_conn.executemany(
                'INSERT INTO ways VALUES (?, ?, ?, ?)',
                batch
            )
            print(f"[Migration] Inserted {min(i+batch_size, len(ways)):,}/{len(ways):,} ways")
        
        elapsed = time.time() - start
        print(f"[Migration] ✅ Ways copied in {elapsed:.1f}s")
        
        # Verify
        edge_count = duckdb_conn.execute('SELECT COUNT(*) FROM edges').fetchall()[0][0]
        way_count = duckdb_conn.execute('SELECT COUNT(*) FROM ways').fetchall()[0][0]
        print(f"\n[Migration] ✅ Complete: {edge_count:,} edges, {way_count:,} ways")
        
    finally:
        sqlite_conn.close()
        duckdb_conn.close()

if __name__ == '__main__':
    migrate()

