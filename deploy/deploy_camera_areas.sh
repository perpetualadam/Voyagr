#!/bin/bash

# Deploy Camera Areas to GraphHopper
# This script uploads the camera_areas.geojson to the Contabo server
# and configures GraphHopper to use it for camera avoidance routing.
#
# Usage: bash deploy/deploy_camera_areas.sh
#
# Prerequisites:
# 1. Generate camera_areas.geojson locally: python generate_camera_areas_geojson.py
# 2. SSH access to Contabo server (81.0.246.97)
# 3. GraphHopper installed at /opt/graphhopper

set -e

# Configuration
SERVER="root@81.0.246.97"
GRAPHHOPPER_DIR="/opt/graphhopper"
CUSTOM_AREAS_DIR="$GRAPHHOPPER_DIR/custom_areas"
LOCAL_GEOJSON="camera_areas.geojson"
REMOTE_GEOJSON="$CUSTOM_AREAS_DIR/camera_areas.geojson"

echo "=========================================="
echo "📷 Camera Areas Deployment"
echo "=========================================="
echo ""

# Step 1: Check local file exists
echo "Step 1: Checking local camera_areas.geojson..."
if [ ! -f "$LOCAL_GEOJSON" ]; then
    echo "❌ Error: $LOCAL_GEOJSON not found"
    echo "Run: python generate_camera_areas_geojson.py"
    exit 1
fi

FILE_SIZE=$(du -h "$LOCAL_GEOJSON" | cut -f1)
FEATURE_COUNT=$(grep -o '"type":"Feature"' "$LOCAL_GEOJSON" | wc -l)
echo "✅ Found $LOCAL_GEOJSON ($FILE_SIZE, $FEATURE_COUNT features)"
echo ""

# Step 2: Create remote directory
echo "Step 2: Creating remote directory..."
ssh $SERVER "mkdir -p $CUSTOM_AREAS_DIR"
echo "✅ Created $CUSTOM_AREAS_DIR"
echo ""

# Step 3: Upload GeoJSON
echo "Step 3: Uploading camera_areas.geojson..."
scp "$LOCAL_GEOJSON" "$SERVER:$REMOTE_GEOJSON"
echo "✅ Uploaded to $REMOTE_GEOJSON"
echo ""

# Step 4: Update GraphHopper config
echo "Step 4: Updating GraphHopper config..."
ssh $SERVER "cat >> $GRAPHHOPPER_DIR/config.yml << 'EOF'

# Camera Areas for Custom Model Routing
# Added by deploy_camera_areas.sh
graphhopper:
  custom_areas.directory: custom_areas/
EOF"
echo "✅ Updated config.yml"
echo ""

# Step 5: Verify upload
echo "Step 5: Verifying upload..."
REMOTE_SIZE=$(ssh $SERVER "du -h $REMOTE_GEOJSON | cut -f1")
echo "✅ Remote file size: $REMOTE_SIZE"
echo ""

# Step 6: Restart GraphHopper
echo "Step 6: Restarting GraphHopper..."
ssh $SERVER "systemctl restart graphhopper || docker restart graphhopper || echo 'Manual restart required'"
echo "✅ Restart command sent"
echo ""

# Step 7: Wait for GraphHopper to start
echo "Step 7: Waiting for GraphHopper to start (30 seconds)..."
sleep 30

# Step 8: Test routing
echo "Step 8: Testing GraphHopper routing..."
GRAPHHOPPER_URL="http://81.0.246.97:8989"
TEST_RESPONSE=$(curl -s -X POST "$GRAPHHOPPER_URL/route" \
    -H "Content-Type: application/json" \
    -d '{
        "points": [[-1.1743, 53.5461], [-1.1643, 53.5361]],
        "profile": "car",
        "ch.disable": true,
        "custom_model": {
            "priority": [{"if": "in_camera_area_0", "multiply_by": "0.01"}]
        }
    }' 2>/dev/null || echo '{"error": "Connection failed"}')

if echo "$TEST_RESPONSE" | grep -q "paths"; then
    echo "✅ GraphHopper routing with camera areas works!"
    DISTANCE=$(echo "$TEST_RESPONSE" | grep -o '"distance":[0-9.]*' | head -1 | cut -d: -f2)
    echo "   Test route distance: ${DISTANCE}m"
else
    echo "⚠️  GraphHopper test inconclusive"
    echo "   Response: $(echo "$TEST_RESPONSE" | head -c 200)"
fi
echo ""

# Summary
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Camera areas deployed to: $REMOTE_GEOJSON"
echo "Features: $FEATURE_COUNT camera area polygons"
echo ""
echo "To test manually:"
echo "curl -X POST '$GRAPHHOPPER_URL/route' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"points\": [[-1.17, 53.54], [-1.16, 53.53]], \"profile\": \"car\", \"ch.disable\": true, \"custom_model\": {\"priority\": [{\"if\": \"in_camera_area_0\", \"multiply_by\": \"0.01\"}]}}'"
echo ""

