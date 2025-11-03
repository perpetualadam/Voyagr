#!/usr/bin/env python3
"""
Convert SCDB Speed Camera CSV to GeoJSON for GraphHopper Custom Areas

SCDB CSV Format: longitude,latitude,description,reference
(No header row - raw data format)

Usage:
    python convert_cameras_to_geojson.py <input_csv> <output_geojson>

Example:
    python convert_cameras_to_geojson.py SCDB_Camera.csv cameras.geojson
"""

import sys
import json
import csv
from pathlib import Path


def csv_to_geojson(csv_file, output_file):
    """Convert SCDB CSV to GeoJSON format.

    SCDB format: longitude,latitude,description,reference
    No header row - data starts immediately
    """

    features = []
    skipped = 0

    try:
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        f = None

        for encoding in encodings:
            try:
                f = open(csv_file, 'r', encoding=encoding)
                # Test read first line
                f.readline()
                f.seek(0)
                print(f"✅ Using encoding: {encoding}")
                break
            except (UnicodeDecodeError, UnicodeError):
                if f:
                    f.close()
                continue

        if f is None:
            print(f"❌ Error: Could not determine file encoding")
            return False

        # SCDB has no header, so read as raw CSV
        reader = csv.reader(f)

        for row_num, row in enumerate(reader, 1):
            try:
                # SCDB format: lon, lat, description, reference
                if len(row) < 2:
                    skipped += 1
                    continue

                lon = float(row[0].strip())
                lat = float(row[1].strip())
                description = row[2].strip() if len(row) > 2 else ""
                reference = row[3].strip() if len(row) > 3 else ""

                # Skip invalid coordinates
                if lat == 0 or lon == 0:
                    skipped += 1
                    continue

                # Validate coordinate ranges
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    skipped += 1
                    continue

                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    },
                    "properties": {
                        "type": "speed_camera",
                        "description": description,
                        "reference": reference,
                        "latitude": lat,
                        "longitude": lon
                    }
                }
                features.append(feature)

            except (ValueError, IndexError) as e:
                skipped += 1
                if row_num <= 5:  # Only show first few errors
                    print(f"⚠️  Skipping row {row_num}: {e}")
                continue

        # Close file
        if f:
            f.close()

        # Create FeatureCollection
        geojson = {
            "type": "FeatureCollection",
            "features": features
        }

        # Write to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, indent=2)

        print(f"✅ Converted {len(features)} cameras")
        print(f"⚠️  Skipped {skipped} invalid rows")
        print(f"✅ Saved to: {output_file}")
        return True

    except FileNotFoundError:
        print(f"❌ Error: File not found: {csv_file}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    if len(sys.argv) < 3:
        print("Usage: python convert_cameras_to_geojson.py <input_csv> <output_geojson>")
        print("Example: python convert_cameras_to_geojson.py cameras.csv cameras.geojson")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    output_file = sys.argv[2]
    
    print(f"📥 Reading: {csv_file}")
    print(f"📤 Writing: {output_file}")
    
    success = csv_to_geojson(csv_file, output_file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

