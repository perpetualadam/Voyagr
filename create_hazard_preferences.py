#!/usr/bin/env python3
"""
Create hazard_preferences table if it doesn't exist.
"""

import sqlite3

conn = sqlite3.connect('voyagr.db')
cursor = conn.cursor()

# Check if table exists
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='hazard_preferences'")
if cursor.fetchone():
    print("✅ hazard_preferences table already exists")
else:
    print("Creating hazard_preferences table...")
    
    # Create table
    cursor.execute('''
        CREATE TABLE hazard_preferences (
            hazard_type TEXT PRIMARY KEY,
            penalty_seconds INTEGER,
            proximity_threshold_meters INTEGER,
            enabled INTEGER DEFAULT 1
        )
    ''')
    
    # Insert default preferences
    preferences = [
        ('speed_camera', 300, 500, 1),      # 5 min penalty, 500m threshold
        ('police', 180, 300, 1),            # 3 min penalty, 300m threshold
        ('accident', 120, 200, 1),          # 2 min penalty, 200m threshold
        ('roadworks', 60, 150, 1),          # 1 min penalty, 150m threshold
        ('railway_crossing', 30, 100, 1),   # 30s penalty, 100m threshold
        ('pothole', 15, 50, 1),             # 15s penalty, 50m threshold
        ('debris', 15, 50, 1)               # 15s penalty, 50m threshold
    ]
    
    cursor.executemany(
        'INSERT INTO hazard_preferences (hazard_type, penalty_seconds, proximity_threshold_meters, enabled) VALUES (?, ?, ?, ?)',
        preferences
    )
    
    conn.commit()
    print("✅ hazard_preferences table created with default values")

# Show current preferences
cursor.execute('SELECT hazard_type, penalty_seconds, proximity_threshold_meters, enabled FROM hazard_preferences ORDER BY penalty_seconds DESC')
print("\n📊 Hazard Preferences:")
for row in cursor.fetchall():
    status = "✅ Enabled" if row[3] else "❌ Disabled"
    print(f"  {row[0]:20s} - Threshold: {row[2]:4d}m, Penalty: {row[1]:3d}s - {status}")

conn.close()
print("\n✅ Done!")

