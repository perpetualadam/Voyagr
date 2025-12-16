"""
Migrate custom router data from SQLite to DuckDB
DuckDB is faster, supports concurrent access better, and doesn't require a server
"""
import sqlite3
import duckdb
import time
import sys
import os

SQLITE_DB = 'data/uk_router.db'
DUCKDB_DB = 'data/uk_router.duckdb'

def migrate_to_duckdb():
    """Migrate data from SQLite to DuckDB."""
    print("[Migration] Starting SQLite to DuckDB migration...")
    print(f"[Migration] Source: {SQLITE_DB}")
    print(f"[Migration] Target: {DUCKDB_DB}")

    # Connect to databases
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_conn.row_factory = sqlite3.Row
    duckdb_conn = duckdb.connect(DUCKDB_DB)

    try:
        # Check if tables already exist
        try:
            result = duckdb_conn.execute("SELECT COUNT(*) FROM edges").fetchall()
            if result[0][0] > 0:
                print("\n[DuckDB] Edges already migrated. Skipping table creation.")
                return
        except:
            pass

        # Create tables in DuckDB if they don't exist
        print("\n[DuckDB] Creating tables...")
        duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS nodes (
                id BIGINT PRIMARY KEY,
                lat DOUBLE NOT NULL,
                lon DOUBLE NOT NULL
            )
        """)

        duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS edges (
                from_node_id BIGINT NOT NULL,
                to_node_id BIGINT NOT NULL,
                distance_m DOUBLE NOT NULL,
                speed_limit_kmh INTEGER,
                way_id BIGINT,
                PRIMARY KEY (from_node_id, to_node_id)
            )
        """)

        duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS ways (
                id BIGINT PRIMARY KEY,
                name VARCHAR,
                highway VARCHAR,
                speed_limit_kmh INTEGER
            )
        """)
        
        duckdb_conn.execute("""
            CREATE TABLE turn_restrictions (
                from_way_id BIGINT NOT NULL,
                to_way_id BIGINT NOT NULL,
                restriction_type VARCHAR,
                PRIMARY KEY (from_way_id, to_way_id)
            )
        """)
        
        # Migrate nodes
        print("[Migration] Migrating nodes...")
        start_time = time.time()
        sqlite_cursor = sqlite_conn.cursor()
        sqlite_cursor.execute('SELECT id, lat, lon FROM nodes')
        nodes = sqlite_cursor.fetchall()
        
        for i, row in enumerate(nodes):
            duckdb_conn.execute(
                'INSERT INTO nodes VALUES (?, ?, ?)',
                (row['id'], row['lat'], row['lon'])
            )
            if (i + 1) % 100000 == 0:
                print(f"  Migrated {i + 1:,} nodes...")
        
        elapsed = time.time() - start_time
        print(f"[Migration] ✅ Nodes: {len(nodes):,} in {elapsed:.1f}s")
        
        # Migrate edges
        print("[Migration] Migrating edges...")
        start_time = time.time()
        sqlite_cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')
        
        edge_count = 0
        batch = []
        batch_size = 50000
        
        for row in sqlite_cursor.fetchall():
            batch.append((row['from_node_id'], row['to_node_id'], row['distance_m'], row['speed_limit_kmh'], row['way_id']))
            edge_count += 1
            
            if len(batch) >= batch_size:
                duckdb_conn.executemany(
                    'INSERT INTO edges VALUES (?, ?, ?, ?, ?)',
                    batch
                )
                print(f"  Migrated {edge_count:,} edges...")
                batch = []
        
        if batch:
            duckdb_conn.executemany(
                'INSERT INTO edges VALUES (?, ?, ?, ?, ?)',
                batch
            )
        
        elapsed = time.time() - start_time
        print(f"[Migration] ✅ Edges: {edge_count:,} in {elapsed:.1f}s")
        
        # Migrate ways
        print("[Migration] Migrating ways...")
        sqlite_cursor.execute('SELECT id, name, highway, speed_limit_kmh FROM ways')
        ways = sqlite_cursor.fetchall()
        
        for row in ways:
            duckdb_conn.execute(
                'INSERT INTO ways VALUES (?, ?, ?, ?)',
                (row['id'], row['name'], row['highway'], row['speed_limit_kmh'])
            )
        
        print(f"[Migration] ✅ Ways: {len(ways):,}")
        
        # Migrate turn restrictions
        print("[Migration] Migrating turn restrictions...")
        sqlite_cursor.execute('SELECT from_way_id, to_way_id, restriction_type FROM turn_restrictions')
        restrictions = sqlite_cursor.fetchall()
        
        for row in restrictions:
            duckdb_conn.execute(
                'INSERT INTO turn_restrictions VALUES (?, ?, ?)',
                (row['from_way_id'], row['to_way_id'], row['restriction_type'])
            )
        
        print(f"[Migration] ✅ Turn restrictions: {len(restrictions):,}")
        
        # Create indexes
        print("\n[DuckDB] Creating indexes...")
        duckdb_conn.execute("CREATE INDEX idx_edges_from ON edges(from_node_id)")
        duckdb_conn.execute("CREATE INDEX idx_edges_to ON edges(to_node_id)")
        duckdb_conn.execute("CREATE INDEX idx_nodes_latlon ON nodes(lat, lon)")
        
        duckdb_conn.commit()
        print("[DuckDB] ✅ Indexes created")
        
        print("\n✅ Migration complete!")
        print(f"[DuckDB] Database: {DUCKDB_DB}")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        sqlite_conn.close()
        duckdb_conn.close()

if __name__ == '__main__':
    migrate_to_duckdb()

