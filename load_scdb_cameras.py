#!/usr/bin/env python3
"""
Load SCDB Speed Camera Database into Voyagr database.
This script imports 144,528+ speed cameras from SCDB_Camera.csv into the cameras table.
"""

import sqlite3
import csv
import sys
from pathlib import Path

def load_scdb_cameras(csv_file='SCDB_Camera.csv', db_file='voyagr_web.db'):
    """Load SCDB cameras into database."""
    
    if not Path(csv_file).exists():
        print(f"❌ Error: {csv_file} not found")
        return False
    
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # Create cameras table if not exists
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cameras (
                id INTEGER PRIMARY KEY,
                lat REAL, lon REAL, type TEXT,
                description TEXT, severity TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Check existing count
        cursor.execute('SELECT COUNT(*) FROM cameras')
        existing = cursor.fetchone()[0]
        print(f"📊 Existing cameras: {existing}")
        
        # Clear old data if needed
        if existing > 0:
            response = input(f"Clear {existing} existing cameras? (y/n): ")
            if response.lower() == 'y':
                cursor.execute('DELETE FROM cameras')
                conn.commit()
                print("✅ Cleared old cameras")
        
        # Load SCDB data
        print(f"📥 Loading cameras from {csv_file}...")
        loaded = 0
        skipped = 0
        
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        f = None
        
        for encoding in encodings:
            try:
                f = open(csv_file, 'r', encoding=encoding)
                f.readline()
                f.seek(0)
                print(f"✅ Using encoding: {encoding}")
                break
            except (UnicodeDecodeError, UnicodeError):
                if f:
                    f.close()
                continue
        
        if f is None:
            print("❌ Could not determine file encoding")
            return False
        
        reader = csv.reader(f)
        
        for row_num, row in enumerate(reader, 1):
            try:
                if len(row) < 2:
                    skipped += 1
                    continue
                
                lon = float(row[0].strip())
                lat = float(row[1].strip())
                description = row[2].strip() if len(row) > 2 else "Speed camera"
                
                if lat == 0 or lon == 0 or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    skipped += 1
                    continue
                
                cursor.execute('''
                    INSERT INTO cameras (lat, lon, type, description, severity)
                    VALUES (?, ?, ?, ?, ?)
                ''', (lat, lon, 'speed_camera', description, 'high'))
                
                loaded += 1
                
                if loaded % 10000 == 0:
                    print(f"  ✓ Loaded {loaded} cameras...")
                    conn.commit()
            
            except (ValueError, IndexError):
                skipped += 1
                continue
        
        f.close()
        conn.commit()
        
        # Verify
        cursor.execute('SELECT COUNT(*) FROM cameras')
        total = cursor.fetchone()[0]
        
        print(f"\n✅ Successfully loaded {loaded} cameras")
        print(f"⚠️  Skipped {skipped} invalid rows")
        print(f"📊 Total cameras in database: {total}")
        
        conn.close()
        return True
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == '__main__':
    success = load_scdb_cameras()
    sys.exit(0 if success else 1)

