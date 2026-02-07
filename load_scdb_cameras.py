#!/usr/bin/env python3
"""
Load SCDB Speed Camera Database into Voyagr database.
This script imports speed cameras from SCDB_Camera.csv into the cameras table.

Usage:
    python load_scdb_cameras.py           # Interactive mode (prompts before clearing)
    python load_scdb_cameras.py --clear   # Non-interactive: auto-clear old data
"""

import sqlite3
import csv
import sys
from pathlib import Path

def load_scdb_cameras(csv_file='SCDB_Camera.csv', db_file='voyagr_web.db', force_clear=False):
    """Load SCDB cameras into database."""

    if not Path(csv_file).exists():
        print(f"[ERROR] {csv_file} not found")
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

        # Create spatial index if not exists
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_cameras_lat_lon ON cameras (lat, lon)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_cameras_type ON cameras (type)')

        # Check existing count
        cursor.execute('SELECT COUNT(*) FROM cameras')
        existing = cursor.fetchone()[0]
        print(f"[INFO] Existing cameras: {existing}")

        # Clear old data if needed
        if existing > 0:
            if force_clear:
                cursor.execute('DELETE FROM cameras')
                conn.commit()
                print("[OK] Cleared old cameras (--clear flag)")
            else:
                response = input(f"Clear {existing} existing cameras? (y/n): ")
                if response.lower() == 'y':
                    cursor.execute('DELETE FROM cameras')
                    conn.commit()
                    print("[OK] Cleared old cameras")

        # Load SCDB data
        print(f"[INFO] Loading cameras from {csv_file}...")
        loaded = 0
        skipped = 0

        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        working_encoding = None

        for encoding in encodings:
            try:
                with open(csv_file, 'r', encoding=encoding) as test_f:
                    test_f.read()  # Read entire file to verify encoding
                working_encoding = encoding
                print(f"[OK] Using encoding: {encoding}")
                break
            except (UnicodeDecodeError, UnicodeError):
                continue

        if working_encoding is None:
            print("[ERROR] Could not determine file encoding")
            return False

        f = open(csv_file, 'r', encoding=working_encoding)
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

                if loaded % 5000 == 0:
                    print(f"  -> Loaded {loaded} cameras...")
                    conn.commit()

            except (ValueError, IndexError):
                skipped += 1
                continue

        f.close()
        conn.commit()

        # Verify
        cursor.execute('SELECT COUNT(*) FROM cameras')
        total = cursor.fetchone()[0]

        print(f"\n[OK] Successfully loaded {loaded} cameras")
        print(f"[WARN] Skipped {skipped} invalid rows")
        print(f"[INFO] Total cameras in database: {total}")

        # Show sample data
        cursor.execute('SELECT lat, lon, description FROM cameras LIMIT 3')
        samples = cursor.fetchall()
        print(f"[INFO] Sample entries:")
        for s in samples:
            print(f"  lat={s[0]}, lon={s[1]}, desc={s[2]}")

        conn.close()
        return True

    except Exception as e:
        print(f"[ERROR] {e}")
        return False

if __name__ == '__main__':
    force = '--clear' in sys.argv
    success = load_scdb_cameras(force_clear=force)
    sys.exit(0 if success else 1)
