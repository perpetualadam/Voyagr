"""
Check if Contraction Hierarchies tables exist in the database
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import sqlite3

db_file = 'data/uk_router.db'
conn = sqlite3.connect(db_file, timeout=60)
cursor = conn.cursor()

print("=" * 70)
print("CHECKING CONTRACTION HIERARCHIES TABLES")
print("=" * 70)

# List all tables
print("\n[CHECK 1] All tables in database:")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = cursor.fetchall()
for table in tables:
    print(f"  - {table[0]}")

# Check for CH tables
print("\n[CHECK 2] Contraction Hierarchies tables:")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ch_%'")
ch_tables = cursor.fetchall()

if ch_tables:
    print(f"✅ Found {len(ch_tables)} CH tables:")
    for table in ch_tables:
        print(f"  - {table[0]}")
        
    # Check ch_node_order table
    cursor.execute("SELECT COUNT(*) FROM ch_node_order")
    count = cursor.fetchone()[0]
    print(f"\n  ch_node_order: {count:,} rows")
    
    # Check ch_shortcuts table
    cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
    count = cursor.fetchone()[0]
    print(f"  ch_shortcuts: {count:,} rows")
else:
    print("❌ No CH tables found")
    print("\nTo build CH index, run:")
    print("  python build_ch_index.py --sample-size 26544335")

conn.close()

print("\n" + "=" * 70)

