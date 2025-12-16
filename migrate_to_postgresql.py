"""
Migrate custom router data from SQLite to PostgreSQL
"""
import sqlite3
import psycopg2
from psycopg2 import sql
import sys
import time

# Connection parameters
SQLITE_DB = 'data/uk_router.db'
PG_HOST = 'localhost'
PG_PORT = 5432
PG_USER = 'postgres'
PG_PASSWORD = 'postgres'
PG_DB = 'voyagr_router'

def create_postgresql_database():
    """Create PostgreSQL database and tables."""
    print("[PostgreSQL] Connecting to PostgreSQL...")
    
    # Connect to default postgres database
    conn = psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        database='postgres'
    )
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Create database
    print(f"[PostgreSQL] Creating database '{PG_DB}'...")
    cursor.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
        sql.Identifier(PG_DB)
    ))
    cursor.execute(sql.SQL("CREATE DATABASE {}").format(
        sql.Identifier(PG_DB)
    ))
    cursor.close()
    conn.close()
    
    # Connect to new database
    conn = psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        database=PG_DB
    )
    cursor = conn.cursor()
    
    # Create tables
    print("[PostgreSQL] Creating tables...")
    
    cursor.execute("""
        CREATE TABLE nodes (
            id BIGINT PRIMARY KEY,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE edges (
            from_node_id BIGINT NOT NULL,
            to_node_id BIGINT NOT NULL,
            distance_m DOUBLE PRECISION NOT NULL,
            speed_limit_kmh INT,
            way_id BIGINT,
            PRIMARY KEY (from_node_id, to_node_id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE ways (
            id BIGINT PRIMARY KEY,
            name TEXT,
            highway TEXT,
            speed_limit_kmh INT
        )
    """)
    
    cursor.execute("""
        CREATE TABLE turn_restrictions (
            from_way_id BIGINT NOT NULL,
            to_way_id BIGINT NOT NULL,
            restriction_type TEXT,
            PRIMARY KEY (from_way_id, to_way_id)
        )
    """)
    
    # Create indexes
    print("[PostgreSQL] Creating indexes...")
    cursor.execute("CREATE INDEX idx_edges_from_node ON edges(from_node_id)")
    cursor.execute("CREATE INDEX idx_edges_to_node ON edges(to_node_id)")
    cursor.execute("CREATE INDEX idx_nodes_latlon ON nodes(lat, lon)")
    
    conn.commit()
    cursor.close()
    conn.close()
    print("[PostgreSQL] ✅ Database and tables created")

def migrate_data():
    """Migrate data from SQLite to PostgreSQL."""
    print("\n[Migration] Starting data migration...")
    
    # Open SQLite connection
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()
    
    # Open PostgreSQL connection
    pg_conn = psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        database=PG_DB
    )
    pg_cursor = pg_conn.cursor()
    
    # Migrate nodes
    print("[Migration] Migrating nodes...")
    start_time = time.time()
    sqlite_cursor.execute('SELECT id, lat, lon FROM nodes')
    nodes = sqlite_cursor.fetchall()
    
    for i, row in enumerate(nodes):
        pg_cursor.execute(
            'INSERT INTO nodes (id, lat, lon) VALUES (%s, %s, %s)',
            (row['id'], row['lat'], row['lon'])
        )
        if (i + 1) % 100000 == 0:
            print(f"  Migrated {i + 1:,} nodes...")
    
    pg_conn.commit()
    elapsed = time.time() - start_time
    print(f"[Migration] ✅ Nodes migrated: {len(nodes):,} in {elapsed:.1f}s")
    
    # Migrate edges
    print("[Migration] Migrating edges...")
    start_time = time.time()
    sqlite_cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')
    
    edge_count = 0
    batch = []
    batch_size = 10000
    
    for row in sqlite_cursor.fetchall():
        batch.append((row['from_node_id'], row['to_node_id'], row['distance_m'], row['speed_limit_kmh'], row['way_id']))
        edge_count += 1
        
        if len(batch) >= batch_size:
            pg_cursor.executemany(
                'INSERT INTO edges (from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id) VALUES (%s, %s, %s, %s, %s)',
                batch
            )
            pg_conn.commit()
            print(f"  Migrated {edge_count:,} edges...")
            batch = []
    
    if batch:
        pg_cursor.executemany(
            'INSERT INTO edges (from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id) VALUES (%s, %s, %s, %s, %s)',
            batch
        )
        pg_conn.commit()
    
    elapsed = time.time() - start_time
    print(f"[Migration] ✅ Edges migrated: {edge_count:,} in {elapsed:.1f}s")
    
    sqlite_conn.close()
    pg_conn.close()
    print("[Migration] ✅ Data migration complete!")

if __name__ == '__main__':
    try:
        create_postgresql_database()
        migrate_data()
        print("\n✅ Migration successful!")
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

