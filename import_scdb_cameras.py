#!/usr/bin/env python3
"""
Import SCDB camera data into voyagr.db
Converts all cameras to 'speed_camera' type only (simplified)
"""

import sqlite3
import csv
import time

def import_scdb_cameras():
    """Import SCDB cameras into voyagr.db database."""
    
    print("\n" + "="*80)
    print("SCDB CAMERA DATA IMPORT")
    print("="*80)
    
    # Connect to database
    print("\n[1/4] Connecting to database...")
    conn = sqlite3.connect('voyagr.db')
    cursor = conn.cursor()
    
    # Clear existing cameras
    print("[2/4] Clearing existing cameras...")
    cursor.execute("DELETE FROM cameras")
    conn.commit()
    print(f"  ✅ Cleared {cursor.rowcount} existing cameras")
    
    # Read SCDB CSV file
    print("[3/4] Reading SCDB_Camera.csv...")
    cameras_imported = 0
    cameras_skipped = 0
    
    start_time = time.time()
    
    try:
        with open('SCDB_Camera.csv', 'r', encoding='latin-1') as f:
            reader = csv.reader(f)

            batch = []
            batch_size = 1000

            for row in reader:
                try:
                    # SCDB format: [lon, lat, description, type]
                    # Example: ['6.09972', '50.75939', 'Rtg. Hauptbahnhof...', '[4]']
                    if len(row) < 2:
                        cameras_skipped += 1
                        continue

                    lon = float(row[0])
                    lat = float(row[1])

                    # Get description (column 2) or use default
                    description = row[2] if len(row) > 2 else 'Speed Camera'

                    # Truncate long descriptions
                    if len(description) > 200:
                        description = description[:197] + '...'

                    # All cameras are 'speed_camera' type (simplified)
                    camera_type = 'speed_camera'

                    batch.append((lat, lon, camera_type, description))
                    
                    # Insert batch when it reaches batch_size
                    if len(batch) >= batch_size:
                        cursor.executemany(
                            "INSERT INTO cameras (lat, lon, type, description) VALUES (?, ?, ?, ?)",
                            batch
                        )
                        conn.commit()
                        cameras_imported += len(batch)
                        batch = []
                        
                        # Progress update every 10,000 cameras
                        if cameras_imported % 10000 == 0:
                            elapsed = time.time() - start_time
                            rate = cameras_imported / elapsed
                            print(f"  Progress: {cameras_imported:,} cameras imported ({rate:.0f} cameras/sec)")
                
                except (ValueError, KeyError) as e:
                    cameras_skipped += 1
                    continue
            
            # Insert remaining batch
            if batch:
                cursor.executemany(
                    "INSERT INTO cameras (lat, lon, type, description) VALUES (?, ?, ?, ?)",
                    batch
                )
                conn.commit()
                cameras_imported += len(batch)
    
    except FileNotFoundError:
        print("  ❌ Error: SCDB_Camera.csv not found")
        conn.close()
        return
    except Exception as e:
        print(f"  ❌ Error reading CSV: {e}")
        conn.close()
        return
    
    elapsed = time.time() - start_time
    
    print(f"\n[4/4] Import complete!")
    print(f"  ✅ Imported: {cameras_imported:,} cameras")
    print(f"  ⚠️  Skipped: {cameras_skipped:,} cameras (invalid data)")
    print(f"  ⏱️  Time: {elapsed:.1f}s ({cameras_imported/elapsed:.0f} cameras/sec)")
    
    # Verify import
    cursor.execute("SELECT COUNT(*) FROM cameras")
    total = cursor.fetchone()[0]
    print(f"\n  📊 Total cameras in database: {total:,}")
    
    # Show camera distribution by country (if available)
    cursor.execute("SELECT type, COUNT(*) FROM cameras GROUP BY type")
    print(f"\n  📊 Camera types:")
    for camera_type, count in cursor.fetchall():
        print(f"    {camera_type}: {count:,}")
    
    # Show sample cameras
    cursor.execute("SELECT lat, lon, type, description FROM cameras LIMIT 5")
    print(f"\n  📍 Sample cameras:")
    for lat, lon, cam_type, desc in cursor.fetchall():
        print(f"    ({lat:.4f}, {lon:.4f}) - {cam_type}: {desc[:50]}")
    
    # Show UK cameras (approximate bounds)
    cursor.execute(
        "SELECT COUNT(*) FROM cameras WHERE lat BETWEEN 49.9 AND 60.9 AND lon BETWEEN -8.2 AND 1.8"
    )
    uk_count = cursor.fetchone()[0]
    print(f"\n  🇬🇧 UK cameras (approximate): {uk_count:,}")
    
    conn.close()
    print("\n" + "="*80)
    print("✅ IMPORT COMPLETE")
    print("="*80)

if __name__ == "__main__":
    import_scdb_cameras()

