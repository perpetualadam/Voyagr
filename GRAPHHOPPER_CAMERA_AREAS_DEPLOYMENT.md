# GraphHopper Camera Areas Deployment Guide

## Overview

This guide explains how to deploy the camera areas GeoJSON to GraphHopper for server-side camera avoidance routing.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Voyagr PWA    │────▶│   GraphHopper    │────▶│  camera_areas   │
│   (Frontend)    │     │   (Contabo)      │     │   .geojson      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                      │
         │                      ▼
         │              ┌──────────────────┐
         └─────────────▶│    Valhalla      │ (Fallback)
                        │   (Contabo)      │
                        └──────────────────┘
```

## Prerequisites

1. **Local**: Python 3.8+, SQLite database with cameras
2. **Server**: GraphHopper installed at `/opt/graphhopper`
3. **SSH**: Access to `root@81.0.246.97`

## Step 1: Generate Camera Areas GeoJSON

```bash
# On local machine
python generate_camera_areas_geojson.py
```

This creates `camera_areas.geojson` with:
- ~50,000 UK cameras grouped into 137 grid cells (0.5° grid)
- Each cell is a MultiPolygon feature with 30m radius circles
- File size: ~1.6 MB

## Step 2: Deploy to Contabo

### Option A: Automated Script

```bash
bash deploy/deploy_camera_areas.sh
```

### Option B: Manual Deployment

```bash
# 1. Create directory on server
ssh root@81.0.246.97 "mkdir -p /opt/graphhopper/custom_areas"

# 2. Upload GeoJSON
scp camera_areas.geojson root@81.0.246.97:/opt/graphhopper/custom_areas/

# 3. Update GraphHopper config
ssh root@81.0.246.97 "cat >> /opt/graphhopper/config.yml << 'EOF'
graphhopper:
  custom_areas.directory: custom_areas/
EOF"

# 4. Restart GraphHopper
ssh root@81.0.246.97 "systemctl restart graphhopper"
```

## Step 3: Verify Deployment

```bash
# Test routing with camera avoidance
curl -X POST 'http://81.0.246.97:8989/route' \
  -H 'Content-Type: application/json' \
  -d '{
    "points": [[-1.17, 53.54], [-1.16, 53.53]],
    "profile": "car",
    "ch.disable": true,
    "custom_model": {
      "priority": [{"if": "in_camera_area_0", "multiply_by": "0.01"}]
    }
  }'
```

## Configuration

### Environment Variables

```bash
# Enable GraphHopper camera avoidance (default: true)
USE_GRAPHHOPPER_CAMERA_AVOIDANCE=true

# Number of camera area features (UK only: 137)
GRAPHHOPPER_CAMERA_AREAS_COUNT=137

# GraphHopper timeout in seconds (default: 30)
GRAPHHOPPER_TIMEOUT=30

# GraphHopper URL
GRAPHHOPPER_URL=http://81.0.246.97:8989
```

### Routing Priority

1. **GraphHopper** (if camera avoidance enabled) - Uses pre-loaded camera areas
2. **Valhalla** (primary fallback) - Uses exclude_locations (max 50)
3. **OSRM** (secondary fallback) - No camera avoidance

## Troubleshooting

### GraphHopper Not Loading Areas

```bash
# Check GraphHopper logs
ssh root@81.0.246.97 "journalctl -u graphhopper -n 100"

# Verify file exists
ssh root@81.0.246.97 "ls -la /opt/graphhopper/custom_areas/"
```

### StackOverflow Error

If GraphHopper throws StackOverflow with too many areas:
1. Reduce `max_areas` in `build_graphhopper_camera_avoidance_model()`
2. Or use larger grid cells in `generate_camera_areas_geojson.py`

### Route Not Found

If routes fail with camera avoidance:
1. Check if `ch.disable: true` is set
2. Verify custom_model syntax
3. Fall back to Valhalla automatically

## Files

| File | Description |
|------|-------------|
| `generate_camera_areas_geojson.py` | Generates camera_areas.geojson from database |
| `camera_areas.geojson` | GeoJSON with camera area polygons |
| `deploy/deploy_camera_areas.sh` | Deployment script for Contabo |
| `voyagr_web.py` | Main app with GraphHopper routing integration |

## API Response

When GraphHopper is used, the response includes:

```json
{
  "success": true,
  "source": "GraphHopper+Valhalla ✅",
  "camera_avoidance_engine": "GraphHopper",
  "routes": [...]
}
```

