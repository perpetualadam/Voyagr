# Complete OCI Valhalla Setup Guide for Voyagr

**Step-by-step guide to complete Valhalla setup on Oracle Cloud Infrastructure**

**Version**: 1.0.0  
**Date**: October 2025  
**Target**: UK Routing with Voyagr Integration

---

## 📋 TABLE OF CONTENTS

1. [Diagnostic & Status Check](#diagnostic--status-check)
2. [OSM Data Download](#osm-data-download)
3. [Tile Building](#tile-building)
4. [Valhalla Configuration](#valhalla-configuration)
5. [Docker Setup](#docker-setup)
6. [Network Security](#network-security)
7. [Voyagr Integration](#voyagr-integration)
8. [Testing & Verification](#testing--verification)
9. [Troubleshooting](#troubleshooting)

---

## 1. DIAGNOSTIC & STATUS CHECK

### Step 1.1: Run Diagnostic Script

```bash
# Copy diagnostic script to OCI instance
scp oci_diagnostic.sh ubuntu@141.147.102.102:~/

# SSH into instance
ssh ubuntu@141.147.102.102

# Run diagnostic
bash ~/oci_diagnostic.sh
```

### Step 1.2: Check Current Downloads

```bash
# Check if wget/curl is running
ps aux | grep -E "wget|curl|aria2" | grep -v grep

# Check active network connections
netstat -an | grep ESTABLISHED | grep -E "80|443"

# Monitor download progress (if active)
watch -n 5 'ls -lh ~/great-britain-latest.osm.pbf 2>/dev/null || echo "File not found"'
```

### Step 1.3: Check Disk Space

```bash
# Check available space
df -h

# Expected: At least 50GB free for download + tile building
# UK OSM data: ~1.2-1.5 GB
# Built tiles: ~8-12 GB
# Total needed: ~20-25 GB
```

---

## 2. OSM DATA DOWNLOAD

### Step 2.1: Create Data Directory

```bash
# Create directory structure
mkdir -p ~/valhalla-data
cd ~/valhalla-data

# Check permissions
ls -la ~/valhalla-data
```

### Step 2.2: Download UK OSM Data

**Option A: Using wget (Recommended)**

```bash
# Download UK data from Geofabrik
wget -c https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# The -c flag allows resuming if interrupted
# Expected size: ~1.2-1.5 GB
# Expected time: 10-30 minutes (depends on OCI bandwidth)
```

**Option B: Using curl**

```bash
curl -L -o great-britain-latest.osm.pbf \
  https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

**Option C: Run in background with nohup**

```bash
# Download in background
nohup wget -c https://download.geofabrik.de/europe/great-britain-latest.osm.pbf > download.log 2>&1 &

# Monitor progress
tail -f download.log

# Check file size periodically
watch -n 10 'ls -lh great-britain-latest.osm.pbf'
```

### Step 2.3: Verify Download Completion

```bash
# Check file size
ls -lh great-britain-latest.osm.pbf

# Expected: 1.2-1.5 GB

# Verify file integrity (optional)
# Geofabrik provides MD5 checksums
wget https://download.geofabrik.de/europe/great-britain-latest.osm.pbf.md5
md5sum -c great-britain-latest.osm.pbf.md5

# Expected output: great-britain-latest.osm.pbf: OK
```

---

## 3. TILE BUILDING

### Step 3.1: Create Valhalla Directory Structure

```bash
# Create directories
mkdir -p ~/valhalla/{tiles,config,logs}

# Set permissions
chmod -R 755 ~/valhalla
```

### Step 3.2: Create valhalla.json Configuration

**Create file**: `~/valhalla/valhalla.json`

```json
{
  "mjolnir": {
    "tile_dir": "/data/valhalla/tiles",
    "tile_extract": "/data/valhalla/tiles.tar",
    "logging": {
      "type": "std_out",
      "level": "info"
    },
    "admin": "/data/valhalla/admin.sqlite"
  },
  "httpd": {
    "service": [
      {
        "actions": ["route", "locate", "map_match", "isochrone", "matrix"],
        "admin": false
      }
    ],
    "base_url": "0.0.0.0:8002",
    "listen": "0.0.0.0",
    "port": 8002,
    "threads": 4
  },
  "service": {
    "max_locations": 20,
    "max_matrix_distance": 200000,
    "max_matrix_locations": 50,
    "max_avoid_locations": 5,
    "max_reachability": 100,
    "max_radius": 200000,
    "max_timedep_distance": 500000,
    "max_timedep_locations": 50,
    "max_excluded_polygons": 20
  },
  "costing_options": {
    "auto": {
      "maneuver_penalty": 5,
      "destination_only_penalty": 25,
      "alley_penalty": 5,
      "toll_factor": 1.0,
      "motorway_factor": 1.0,
      "use_ferry": true,
      "use_toll": true
    },
    "pedestrian": {
      "walking_speed": 5.1,
      "step_penalty": 30,
      "max_hiking_difficulty": 1,
      "use_ferry": true
    },
    "bicycle": {
      "cycling_speed": 25,
      "use_bike_lanes": true,
      "use_roads": true,
      "use_ferry": true
    }
  },
  "logging": {
    "type": "std_out",
    "level": "info"
  }
}
```

### Step 3.3: Build Tiles Using Docker

**Option A: Using Docker directly**

```bash
# Navigate to valhalla directory
cd ~/valhalla-data

# Build tiles
docker run -v ~/valhalla-data:/data:ro \
  -v ~/valhalla/tiles:/tiles \
  gisops/valhalla:latest \
  valhalla_build_tiles -c /data/valhalla.json /data/great-britain-latest.osm.pbf

# Expected time: 30-60 minutes for UK data
# Expected output: "Finished building tiles"
```

**Option B: Using docker-compose (Recommended)**

Create `~/valhalla/docker-compose.yml`:

```yaml
version: '3.8'

services:
  tile-builder:
    image: gisops/valhalla:latest
    container_name: valhalla-tile-builder
    volumes:
      - ~/valhalla-data:/data:ro
      - ~/valhalla/tiles:/tiles
      - ~/valhalla/valhalla.json:/etc/valhalla/valhalla.json:ro
    command: valhalla_build_tiles -c /etc/valhalla/valhalla.json /data/great-britain-latest.osm.pbf
    environment:
      - VALHALLA_TILE_DIR=/tiles
```

Run:

```bash
cd ~/valhalla
docker-compose up tile-builder

# Monitor progress
docker logs -f valhalla-tile-builder
```

### Step 3.4: Verify Tile Building

```bash
# Check tiles directory
ls -lh ~/valhalla/tiles/

# Expected: Multiple .gph files (graph files)
# Total size: 8-12 GB for UK

# Count tiles
find ~/valhalla/tiles -name "*.gph" | wc -l

# Expected: 1000+ tile files
```

---

## 4. VALHALLA CONFIGURATION

### Step 4.1: Optimize for OCI Free Tier

**Edit**: `~/valhalla/valhalla.json`

```json
{
  "httpd": {
    "threads": 2,
    "port": 8002,
    "base_url": "0.0.0.0:8002"
  },
  "service": {
    "max_locations": 10,
    "max_matrix_distance": 100000,
    "max_matrix_locations": 25
  }
}
```

### Step 4.2: Configure for Higher Tier (if applicable)

```json
{
  "httpd": {
    "threads": 4,
    "port": 8002,
    "base_url": "0.0.0.0:8002"
  },
  "service": {
    "max_locations": 20,
    "max_matrix_distance": 200000,
    "max_matrix_locations": 50
  }
}
```

---

## 5. DOCKER SETUP

### Step 5.1: Start Valhalla Service

**Using docker-compose**:

```yaml
version: '3.8'

services:
  valhalla:
    image: gisops/valhalla:latest
    container_name: valhalla-server
    restart: unless-stopped
    ports:
      - "0.0.0.0:8002:8002"
    volumes:
      - ~/valhalla/tiles:/data/valhalla/tiles:ro
      - ~/valhalla/valhalla.json:/etc/valhalla/valhalla.json:ro
      - ~/valhalla/logs:/var/log/valhalla
    environment:
      - VALHALLA_TILE_DIR=/data/valhalla/tiles
      - VALHALLA_THREADS=2
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Start service:

```bash
cd ~/valhalla
docker-compose up -d

# Verify running
docker ps
docker logs valhalla-server
```

### Step 5.2: Test Local Connection

```bash
# Wait 30 seconds for service to start
sleep 30

# Test health check
curl http://localhost:8002/status

# Expected response:
# {"version":"...","tileset_last_modified":"..."}
```

---

## 6. NETWORK SECURITY

### Step 6.1: OCI Security List Configuration

**In OCI Console**:

1. Navigate to: **Networking** → **Virtual Cloud Networks**
2. Select your VCN
3. Click **Security Lists**
4. Select the security list for your subnet
5. Click **Add Ingress Rule**
6. Configure:
   - **Source Type**: CIDR
   - **Source CIDR**: `0.0.0.0/0` (or your IP)
   - **IP Protocol**: TCP
   - **Source Port Range**: All
   - **Destination Port Range**: `8002`
   - **Description**: "Valhalla Routing Service"
7. Click **Add Ingress Rule**

### Step 6.2: Instance Firewall Configuration

```bash
# Check firewall status
sudo ufw status

# If UFW is active:
sudo ufw allow 8002/tcp
sudo ufw reload

# Verify
sudo ufw status | grep 8002

# If using iptables:
sudo iptables -I INPUT -p tcp --dport 8002 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### Step 6.3: Test External Connectivity

```bash
# From your local machine:
curl http://141.147.102.102:8002/status

# Expected: Same JSON response as local test
```

---

## 7. VOYAGR INTEGRATION

See: **OCI_VOYAGR_INTEGRATION.md** (separate file)

---

## 8. TESTING & VERIFICATION

### Step 8.1: Health Check

```bash
curl http://141.147.102.102:8002/status
```

### Step 8.2: Sample Route Request

```bash
curl -X POST http://141.147.102.102:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 53.4808, "lon": -2.2426}
    ],
    "costing": "auto",
    "format": "json"
  }'
```

---

## 9. TROUBLESHOOTING

### Issue: Download Stuck

```bash
# Resume download
wget -c https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

### Issue: Tile Building Fails

```bash
# Check Docker logs
docker logs valhalla-tile-builder

# Increase memory
docker run -m 4g ...
```

### Issue: Cannot Connect to Valhalla

```bash
# Check if container is running
docker ps | grep valhalla

# Check logs
docker logs valhalla-server

# Test local connection
curl http://localhost:8002/status

# Check firewall
sudo ufw status
sudo iptables -L -n | grep 8002
```

---

**Status**: ✅ Complete Setup Guide

---

**End of OCI Valhalla Setup Guide**

