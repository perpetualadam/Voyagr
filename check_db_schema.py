#!/usr/bin/env python3
"""Check database schema"""

import sqlite3

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

print("=" * 60)
print("Cameras Table Schema")
print("=" * 60)
cursor.execute("PRAGMA table_info(cameras)")
columns = cursor.fetchall()
for col in columns:
    print(f"  {col[1]} ({col[2]})")

print()
print("=" * 60)
print("Sample Camera Records")
print("=" * 60)
cursor.execute("SELECT * FROM cameras LIMIT 3")
rows = cursor.fetchall()
for row in rows:
    print(row)

print()
print("=" * 60)
print("Total Cameras in Database")
print("=" * 60)
cursor.execute("SELECT COUNT(*) FROM cameras")
count = cursor.fetchone()[0]
print(f"Total: {count}")

conn.close()

