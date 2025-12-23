#!/usr/bin/env python3
"""
Generate GraphHopper Custom Areas GeoJSON from SCDB Camera Database.

This script converts the 144,528+ cameras from the SQLite database into a 
GraphHopper-compatible custom_areas.geojson file. Cameras are grouped into
geographic grid cells to create manageable MultiPolygon areas.

Based on GraphHopper Custom Areas documentation:
https://github.com/graphhopper/graphhopper/blob/master/docs/core/custom-areas-and-country-rules.md

Usage:
    python generate_camera_areas_geojson.py
    
Output:
    camera_areas.geojson - Upload to GraphHopper server custom_areas directory
"""

import sqlite3
import json
import math
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Any

# Configuration
DB_FILE = 'voyagr.db'  # Primary database
BACKUP_DB = 'voyagr_web.db'  # Backup database
OUTPUT_FILE = 'camera_areas.geojson'
GRID_SIZE_DEG = 0.5  # Grid cell size in degrees (~50km)
CAMERA_RADIUS_M = 30  # Radius around each camera in meters
INCLUDE_ALL_CAMERAS = False  # Set to True for global, False for UK-only

# Maximum number of areas for GraphHopper (limit is ~100 for custom model)
MAX_AREAS = 100

# UK bounding box (focus area)
UK_BOUNDS = {
    'min_lat': 49.9,
    'max_lat': 60.9,
    'min_lon': -8.2,
    'max_lon': 1.8
}

# Global bounding box (for all cameras)
GLOBAL_BOUNDS = {
    'min_lat': -90,
    'max_lat': 90,
    'min_lon': -180,
    'max_lon': 180
}


def get_grid_cell(lat: float, lon: float, bounds: Dict[str, float]) -> Tuple[int, int]:
    """Get grid cell index for a coordinate."""
    cell_lat = int((lat - bounds['min_lat']) / GRID_SIZE_DEG)
    cell_lon = int((lon - bounds['min_lon']) / GRID_SIZE_DEG)
    return (cell_lat, cell_lon)


def create_square_polygon(lat: float, lon: float, radius_m: float = 30) -> List[List[float]]:
    """
    Create a small square polygon around a point.
    
    Args:
        lat: Latitude of center point
        lon: Longitude of center point
        radius_m: Radius in meters (half-width of square)
    
    Returns:
        List of [lon, lat] coordinates forming a closed polygon (GeoJSON format)
    """
    # Convert radius from meters to degrees
    # 1 degree latitude ≈ 111km
    # 1 degree longitude ≈ 111km * cos(latitude)
    lat_offset = radius_m / 111000
    lon_offset = radius_m / (111000 * math.cos(math.radians(lat)))
    
    # Create square corners (closed polygon - first point repeated at end)
    # GeoJSON uses [lon, lat] order!
    return [
        [lon - lon_offset, lat - lat_offset],
        [lon + lon_offset, lat - lat_offset],
        [lon + lon_offset, lat + lat_offset],
        [lon - lon_offset, lat + lat_offset],
        [lon - lon_offset, lat - lat_offset]  # Close the polygon
    ]


def load_cameras_from_db(include_all: bool = False) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """Load cameras from SQLite database.

    Returns:
        Tuple of (cameras list, bounds used)
    """
    db_file = DB_FILE if Path(DB_FILE).exists() else BACKUP_DB

    if not Path(db_file).exists():
        print(f"❌ Error: Database file not found: {db_file}")
        return [], UK_BOUNDS

    print(f"📂 Loading cameras from {db_file}...")

    bounds = GLOBAL_BOUNDS if include_all else UK_BOUNDS
    region = "global" if include_all else "UK"

    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Get cameras within bounds
    cursor.execute("""
        SELECT lat, lon, type, description
        FROM cameras
        WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
    """, (bounds['min_lat'], bounds['max_lat'],
          bounds['min_lon'], bounds['max_lon']))

    cameras = []
    for row in cursor.fetchall():
        cameras.append({
            'lat': row[0],
            'lon': row[1],
            'type': row[2] or 'speed_camera',
            'description': row[3] or ''
        })

    conn.close()
    print(f"✅ Loaded {len(cameras):,} {region} cameras")
    return cameras, bounds


def group_cameras_by_grid(cameras: List[Dict[str, Any]], bounds: Dict[str, float]) -> Dict[Tuple[int, int], List[Dict[str, Any]]]:
    """Group cameras into geographic grid cells."""
    grid = defaultdict(list)

    for camera in cameras:
        cell = get_grid_cell(camera['lat'], camera['lon'], bounds)
        grid[cell].append(camera)

    print(f"📊 Grouped into {len(grid)} grid cells")
    return grid


def generate_geojson(cameras: List[Dict[str, Any]], bounds: Dict[str, float]) -> Dict[str, Any]:
    """
    Generate GraphHopper custom_areas.geojson from cameras.

    Creates MultiPolygon features grouped by grid cell for efficient
    server-side loading and routing.
    """
    # Group cameras by grid cell
    grid = group_cameras_by_grid(cameras, bounds)
    
    features = []
    area_index = 0
    
    # Sort grid cells for consistent output
    for cell in sorted(grid.keys()):
        cell_cameras = grid[cell]
        
        if not cell_cameras:
            continue
        
        # Create MultiPolygon with all camera squares in this cell
        polygons = []
        for camera in cell_cameras:
            square = create_square_polygon(
                camera['lat'], 
                camera['lon'], 
                CAMERA_RADIUS_M
            )
            # MultiPolygon format: [[[[coords]]]] - extra nesting level
            polygons.append([[square]])
        
        # Flatten the polygon structure for MultiPolygon
        # Format: [[[ring1], [ring2], ...], [[ring1], ...]]
        multi_coords = [p[0] for p in polygons]
        
        feature = {
            "type": "Feature",
            "id": f"camera_area_{area_index}",
            "properties": {
                "camera_count": len(cell_cameras),
                "grid_cell": f"{cell[0]}_{cell[1]}"
            },
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": multi_coords
            }
        }
        
        features.append(feature)
        area_index += 1
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    print(f"📦 Created {len(features)} area features")
    return geojson


def save_geojson(geojson: Dict[str, Any], output_file: str = OUTPUT_FILE) -> bool:
    """Save GeoJSON to file."""
    try:
        # Calculate file size estimate
        json_str = json.dumps(geojson, separators=(',', ':'))
        size_mb = len(json_str) / (1024 * 1024)

        with open(output_file, 'w') as f:
            # Use compact format to reduce file size
            json.dump(geojson, f, separators=(',', ':'))

        print(f"💾 Saved to {output_file} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        return False


def generate_custom_model_config(area_ids: List[str]) -> Dict[str, Any]:
    """
    Generate GraphHopper custom model configuration to avoid camera areas.

    This is the custom model that should be added to GraphHopper's config.yml
    or sent with each routing request.
    """
    # Build priority rules to avoid all camera areas
    # Using "in_camera_area_0 || in_camera_area_1 || ..." format
    area_conditions = " || ".join([f"in_{area_id}" for area_id in area_ids[:50]])  # Limit to prevent StackOverflow

    custom_model = {
        "priority": [
            {
                "if": area_conditions,
                "multiply_by": "0.01"  # Strong avoidance but not complete block
            }
        ]
    }

    return custom_model


def main():
    """Main entry point."""
    print("\n" + "=" * 70)
    print("📷 GRAPHHOPPER CAMERA AREAS GENERATOR")
    print("=" * 70)
    print(f"Grid size: {GRID_SIZE_DEG}° (~{GRID_SIZE_DEG * 111:.0f}km)")
    print(f"Camera radius: {CAMERA_RADIUS_M}m")
    print(f"Include all cameras: {INCLUDE_ALL_CAMERAS}")
    print()

    # Load cameras
    cameras, bounds = load_cameras_from_db(include_all=INCLUDE_ALL_CAMERAS)
    if not cameras:
        print("❌ No cameras found. Run import_scdb_cameras.py first.")
        return False

    # Generate GeoJSON
    geojson = generate_geojson(cameras, bounds)

    # Save to file
    if not save_geojson(geojson):
        return False

    # Generate sample custom model config
    area_ids = [f["id"] for f in geojson["features"]]
    print(f"\n📝 Area IDs created: {len(area_ids)}")
    print(f"   First 5: {area_ids[:5]}")
    print(f"   Last 5: {area_ids[-5:]}")

    # Show deployment instructions
    print("\n" + "=" * 70)
    print("🚀 DEPLOYMENT INSTRUCTIONS")
    print("=" * 70)
    print("""
1. Upload camera_areas.geojson to Contabo server:
   scp camera_areas.geojson root@81.0.246.97:/opt/graphhopper/custom_areas/

2. Update GraphHopper config.yml:
   graphhopper:
     custom_areas.directory: custom_areas/

3. Restart GraphHopper:
   systemctl restart graphhopper

4. Test with routing request including custom_model:
   POST /route
   {
     "points": [[lon1, lat1], [lon2, lat2]],
     "profile": "car",
     "ch.disable": true,
     "custom_model": {
       "priority": [{"if": "in_camera_area_0", "multiply_by": "0.01"}]
     }
   }
""")

    print("=" * 70)
    print("✅ GENERATION COMPLETE")
    print("=" * 70)

    return True


if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)

