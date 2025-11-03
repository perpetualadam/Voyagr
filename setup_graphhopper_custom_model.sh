#!/bin/bash

# GraphHopper Custom Model Setup Script
# Run this on your Contabo server after GraphHopper finishes building
# Usage: bash setup_graphhopper_custom_model.sh

set -e

GRAPHHOPPER_URL="http://localhost:8989"
DATA_DIR="/opt/valhalla/custom_files"
MODEL_FILE="$DATA_DIR/custom_model.json"
CAMERAS_CSV="$DATA_DIR/cameras.csv"
CAMERAS_GEOJSON="$DATA_DIR/cameras.geojson"
CONVERT_SCRIPT="$DATA_DIR/convert_cameras.py"

echo "=========================================="
echo "GraphHopper Custom Model Setup"
echo "=========================================="
echo ""

# Step 1: Check if GraphHopper is running
echo "Step 1: Checking GraphHopper status..."
if curl -s "$GRAPHHOPPER_URL/info" > /dev/null; then
    echo "✅ GraphHopper is running"
else
    echo "❌ GraphHopper is not responding"
    echo "Please wait for GraphHopper to finish building (10-40 minutes)"
    exit 1
fi
echo ""

# Step 2: Create custom model JSON
echo "Step 2: Creating custom model JSON..."
cat > "$MODEL_FILE" << 'EOF'
{
  "priority": [
    {
      "if": "tags[\"highway\"] == \"speed_camera\"",
      "multiply_by": 0,
      "description": "Fully avoid speed cameras"
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\" AND tags[\"enforcement\"] == \"speed_camera\"",
      "multiply_by": 0,
      "description": "Fully avoid camera-equipped traffic lights"
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\"",
      "multiply_by": 0.1,
      "description": "Penalize regular traffic lights"
    }
  ]
}
EOF
echo "✅ Custom model created: $MODEL_FILE"
echo ""

# Step 3: Upload custom model
echo "Step 3: Uploading custom model to GraphHopper..."
RESPONSE=$(curl -s -X POST "$GRAPHHOPPER_URL/custom-model" \
  -H "Content-Type: application/json" \
  -d @"$MODEL_FILE")

echo "Response: $RESPONSE"

# Extract model ID
MODEL_ID=$(echo "$RESPONSE" | grep -o '"custom_model_id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$MODEL_ID" ]; then
    MODEL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
fi

if [ -n "$MODEL_ID" ]; then
    echo "✅ Custom model uploaded with ID: $MODEL_ID"
else
    echo "⚠️  Could not extract model ID from response"
    echo "Response was: $RESPONSE"
fi
echo ""

# Step 4: Download camera data
echo "Step 4: Downloading UK camera data from SCDB..."
if wget -q -O "$CAMERAS_CSV" "https://scdb.info/speedcam/download.php?country=gb&type=csv"; then
    CAMERA_COUNT=$(wc -l < "$CAMERAS_CSV")
    echo "✅ Downloaded $CAMERA_COUNT camera records"
else
    echo "⚠️  Could not download camera data (SCDB may be unavailable)"
    echo "You can manually download from: https://scdb.info/"
fi
echo ""

# Step 5: Install Python dependencies
echo "Step 5: Installing Python dependencies..."
apt-get update -qq
apt-get install -y -qq python3-pip > /dev/null 2>&1
pip3 install -q pandas geopandas > /dev/null 2>&1
echo "✅ Python dependencies installed"
echo ""

# Step 6: Convert CSV to GeoJSON
echo "Step 6: Converting camera data to GeoJSON..."
cat > "$CONVERT_SCRIPT" << 'EOF'
import pandas as pd
import geopandas as gpd
import json
import sys

try:
    # Read CSV
    df = pd.read_csv("/opt/valhalla/custom_files/cameras.csv")
    
    # Rename columns
    df = df.rename(columns={
        'latitude': 'lat',
        'longitude': 'lon'
    })
    
    # Create GeoDataFrame
    gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df['lon'], df['lat']),
        crs='EPSG:4326'
    )
    
    # Add properties
    gdf['name'] = gdf.get('name', 'Speed Camera')
    gdf['type'] = 'speed_camera'
    
    # Save as GeoJSON
    gdf.to_file("/opt/valhalla/custom_files/cameras.geojson", driver="GeoJSON")
    print(f"✅ Converted {len(gdf)} cameras to GeoJSON")
    
except Exception as e:
    print(f"❌ Error converting cameras: {e}")
    sys.exit(1)
EOF

python3 "$CONVERT_SCRIPT"
echo ""

# Step 7: Verify files
echo "Step 7: Verifying files..."
if [ -f "$MODEL_FILE" ]; then
    echo "✅ Custom model file exists"
fi
if [ -f "$CAMERAS_GEOJSON" ]; then
    GEOJSON_SIZE=$(wc -c < "$CAMERAS_GEOJSON")
    echo "✅ GeoJSON file exists ($GEOJSON_SIZE bytes)"
fi
echo ""

# Step 8: Test custom model
echo "Step 8: Testing custom model routing..."
TEST_RESPONSE=$(curl -s "$GRAPHHOPPER_URL/route?point=51.5074,-0.1278&point=51.5174,-0.1278&vehicle=car&custom_model_id=$MODEL_ID")

if echo "$TEST_RESPONSE" | grep -q "paths"; then
    echo "✅ Custom model routing works!"
    echo "Response: $TEST_RESPONSE" | head -c 200
    echo "..."
else
    echo "⚠️  Custom model routing test inconclusive"
    echo "Response: $TEST_RESPONSE"
fi
echo ""

# Summary
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Custom Model ID: $MODEL_ID"
echo "Model File: $MODEL_FILE"
echo "Camera Data: $CAMERAS_GEOJSON"
echo ""
echo "Next steps:"
echo "1. Update voyagr_web.py with custom_model_id: $MODEL_ID"
echo "2. Add to .env: GRAPHHOPPER_CUSTOM_MODEL_ID=$MODEL_ID"
echo "3. Test routing with custom model"
echo "4. Verify cameras are avoided"
echo ""
echo "Test route with custom model:"
echo "curl \"$GRAPHHOPPER_URL/route?point=51.5074,-0.1278&point=51.5174,-0.1278&vehicle=car&custom_model_id=$MODEL_ID\""
echo ""

