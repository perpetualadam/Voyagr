# Valhalla Self-Hosting Guide for Voyagr

**Comprehensive guide for implementing and self-hosting the Valhalla routing engine**

**Version**: 1.0.0  
**Last Updated**: October 2025  
**Target**: UK and EU routing for Voyagr satellite navigation

---

## 📋 TABLE OF CONTENTS

1. [System Requirements](#system-requirements)
2. [Installation Methods](#installation-methods)
3. [Map Data Acquisition](#map-data-acquisition)
4. [Tile Building](#tile-building)
5. [Configuration](#configuration)
6. [Running Valhalla Server](#running-valhalla-server)
7. [Integration with Voyagr](#integration-with-voyagr)
8. [Production Deployment](#production-deployment)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)

---

## 1. SYSTEM REQUIREMENTS

### Minimum Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| **CPU** | 2 cores | 4+ cores | More cores = faster tile building |
| **RAM** | 4 GB | 16+ GB | Tile building is memory-intensive |
| **Storage** | 50 GB | 200+ GB | Depends on geographic coverage |
| **OS** | Linux | Ubuntu 20.04+ | Docker works on all OS |
| **Network** | 1 Mbps | 10+ Mbps | For tile downloads |

### Storage Requirements by Region

| Region | Size | Build Time | RAM Needed |
|--------|------|-----------|-----------|
| **UK Only** | 8-12 GB | 30-60 min | 8 GB |
| **Europe** | 40-60 GB | 2-4 hours | 16 GB |
| **UK + EU** | 50-80 GB | 3-5 hours | 16-32 GB |
| **World** | 800+ GB | 24+ hours | 64+ GB |

### Disk Space Breakdown

```
Valhalla Installation:     ~2 GB
OSM Data (UK):             ~8 GB
Tiles (UK):                ~12 GB
Tiles (Europe):            ~60 GB
Logs & Temp:               ~5 GB
Total (UK + EU):           ~87 GB
```

---

## 2. INSTALLATION METHODS

### Method 1: Docker Installation (Recommended)

**Advantages**:
- ✅ Easiest setup
- ✅ Works on all OS
- ✅ Isolated environment
- ✅ Easy to scale

**Prerequisites**:
```bash
# Install Docker
# Windows/macOS: Download Docker Desktop
# Linux: sudo apt-get install docker.io docker-compose

# Verify installation
docker --version
docker-compose --version
```

**Quick Start**:
```bash
# Create project directory
mkdir -p ~/valhalla-voyagr
cd ~/valhalla-voyagr

# Create docker-compose.yml (see Section 6)
# Create valhalla.json (see Section 5)

# Build and start
docker-compose up -d

# Check status
docker-compose logs -f valhalla
```

### Method 2: Native Linux Installation

**Prerequisites**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  git \
  pkg-config \
  libcurl4-openssl-dev \
  libprotobuf-dev \
  protobuf-compiler \
  libboost-all-dev \
  libsqlite3-dev \
  libgeos-dev \
  libgeos++-dev \
  libproj-dev \
  libtool \
  jq \
  curl
```

**Installation Steps**:
```bash
# Clone Valhalla repository
git clone https://github.com/valhalla/valhalla.git
cd valhalla

# Create build directory
mkdir build
cd build

# Configure and build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
sudo make install

# Verify installation
valhalla_service --version
```

### Method 3: macOS Installation

**Prerequisites**:
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install cmake boost protobuf curl geos proj sqlite3
```

**Installation Steps**:
```bash
# Clone and build (same as Linux)
git clone https://github.com/valhalla/valhalla.git
cd valhalla
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(sysctl -n hw.ncpu)
sudo make install
```

### Method 4: Windows Installation

**Recommended**: Use Docker Desktop for Windows

**Alternative - Native Installation**:
```bash
# Install Visual Studio Build Tools
# Install vcpkg for dependencies
git clone https://github.com/Microsoft/vcpkg.git
cd vcpkg
./vcpkg integrate install

# Install dependencies
./vcpkg install boost:x64-windows protobuf:x64-windows curl:x64-windows

# Clone and build Valhalla
git clone https://github.com/valhalla/valhalla.git
cd valhalla
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=<vcpkg-path>/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

---

## 3. MAP DATA ACQUISITION

### Data Sources

**Primary Sources**:
1. **Geofabrik** (Recommended)
   - URL: https://download.geofabrik.de/
   - Coverage: Continents, countries, regions
   - Format: PBF (Protocol Buffer Format)
   - Update: Daily

2. **Planet.osm**
   - URL: https://planet.openstreetmap.org/
   - Coverage: Entire world
   - Format: PBF or XML
   - Size: 70+ GB

3. **BBBike**
   - URL: https://extract.bbbike.org/
   - Coverage: Custom extracts
   - Format: PBF, Shapefile, GeoJSON
   - Size: Custom

### Downloading Data

**UK Data**:
```bash
# Create data directory
mkdir -p ~/valhalla-data
cd ~/valhalla-data

# Download UK data from Geofabrik
wget https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# Verify download
ls -lh great-britain-latest.osm.pbf
# Expected: ~2-3 GB
```

**Europe Data**:
```bash
# Download Europe data
wget https://download.geofabrik.de/europe-latest.osm.pbf

# Expected: ~25-30 GB
# Download time: 30-60 minutes on 10 Mbps connection
```

**Multiple Regions**:
```bash
# UK
wget https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# Ireland
wget https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf

# France
wget https://download.geofabrik.de/europe/france-latest.osm.pbf

# Germany
wget https://download.geofabrik.de/europe/germany-latest.osm.pbf

# Spain
wget https://download.geofabrik.de/europe/spain-latest.osm.pbf

# Italy
wget https://download.geofabrik.de/europe/italy-latest.osm.pbf
```

### Extracting Specific Regions

**Using Osmium**:
```bash
# Install osmium
sudo apt-get install osmium-tool

# Extract bounding box
# Format: left,bottom,right,top (longitude, latitude)
# UK bounding box: -8.6,49.9,1.8,58.6

osmium extract -b -8.6,49.9,1.8,58.6 \
  europe-latest.osm.pbf \
  -o uk-extract.osm.pbf
```

**Using Valhalla Tools**:
```bash
# Valhalla includes extraction tools
valhalla_build_tiles -c valhalla.json uk-extract.osm.pbf
```

---

## 4. TILE BUILDING

### Understanding Tiles

Valhalla converts OSM data into optimized tiles for fast routing queries.

**Tile Structure**:
- Tiles are organized in a hierarchical grid
- Each tile covers a geographic area
- Tiles are indexed for fast lookup
- Typical tile size: 100-500 KB

### Building Tiles

**Basic Tile Building**:
```bash
# Create tiles directory
mkdir -p ~/valhalla-tiles

# Build tiles from OSM data
valhalla_build_tiles -c valhalla.json \
  ~/valhalla-data/great-britain-latest.osm.pbf

# Output: Tiles in ./tiles directory
# Time: 30-60 minutes for UK
# RAM: 8-16 GB
```

**Building Multiple Regions**:
```bash
# Create combined OSM file
osmium merge \
  great-britain-latest.osm.pbf \
  ireland-and-northern-ireland-latest.osm.pbf \
  france-latest.osm.pbf \
  -o uk-eu-combined.osm.pbf

# Build tiles from combined file
valhalla_build_tiles -c valhalla.json uk-eu-combined.osm.pbf
```

**Tile Building Configuration**:
```json
{
  "mjolnir": {
    "tile_dir": "./tiles",
    "tile_extract": "./tiles/tiles.tar",
    "logging": {
      "type": "std_out",
      "level": "info"
    },
    "admin": "./admin.sqlite",
    "timezone": "./tz_world.sqlite"
  }
}
```

### Monitoring Tile Building

```bash
# Watch progress
watch -n 5 'du -sh ~/valhalla-tiles'

# Check tile count
find ~/valhalla-tiles -name "*.gph" | wc -l

# Monitor memory usage
top -p $(pgrep valhalla_build_tiles)
```

---

## 5. CONFIGURATION

### Valhalla Configuration File

**Location**: `valhalla.json`

**Key Sections**:

1. **Mjolnir** (Tile Management)
2. **HTTPD** (HTTP Server)
3. **Service** (API Limits)
4. **Costing Options** (Routing Models)
5. **Logging** (Debug Output)

### See VALHALLA_CONFIG_DETAILED.md for complete configuration guide

---

## 6. RUNNING VALHALLA SERVER

### Starting the Server

**Docker**:
```bash
docker-compose up -d valhalla
```

**Native**:
```bash
valhalla_service valhalla.json
```

### Testing the Server

**Health Check**:
```bash
curl http://localhost:8002/status
```

**Sample Route Request**:
```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 51.5165, "lon": -0.0945}
    ],
    "costing": "auto"
  }'
```

---

## 7. INTEGRATION WITH VOYAGR

### Modifying satnav.py

**Current Configuration**:
```python
# Localhost (development)
VALHALLA_URL = "http://localhost:8002"
```

**Production Configuration**:
```python
# Self-hosted server
VALHALLA_URL = "http://your-server.com:8002"

# Or with environment variable
import os
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
```

### See VALHALLA_VOYAGR_INTEGRATION.md for detailed integration guide

---

## 8. PRODUCTION DEPLOYMENT

### Docker Compose Setup

**See VALHALLA_DOCKER_COMPOSE.md for complete docker-compose.yml**

### Reverse Proxy (nginx)

**See VALHALLA_NGINX_CONFIG.md for nginx configuration**

### Monitoring

**See VALHALLA_MONITORING.md for monitoring setup**

---

## 9. PERFORMANCE OPTIMIZATION

### Caching

- Enable HTTP caching headers
- Use Redis for result caching
- Implement client-side caching

### Load Balancing

- Use nginx load balancing
- Deploy multiple Valhalla instances
- Use health checks

### Database Optimization

- Use SSD storage for tiles
- Enable memory mapping
- Optimize tile cache size

---

## 10. TROUBLESHOOTING

### Common Issues

**Issue**: Tiles not found
```bash
# Solution: Verify tile directory
ls -la ./tiles/
# Should contain .gph files
```

**Issue**: Server won't start
```bash
# Check logs
docker-compose logs valhalla

# Verify configuration
valhalla_service --help
```

**Issue**: Slow routing
```bash
# Check tile cache
# Increase memory allocation
# Use SSD storage
```

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_CONFIG_DETAILED.md** - Complete configuration reference
- **VALHALLA_DOCKER_COMPOSE.md** - Docker deployment
- **VALHALLA_NGINX_CONFIG.md** - Reverse proxy setup
- **VALHALLA_MONITORING.md** - Monitoring and logging
- **VALHALLA_VOYAGR_INTEGRATION.md** - Voyagr integration
- **VALHALLA_PERFORMANCE_TUNING.md** - Performance optimization

---

**Status**: ✅ Complete  
**Next**: See VALHALLA_CONFIG_DETAILED.md for configuration details

---

**End of Valhalla Self-Hosting Guide**

