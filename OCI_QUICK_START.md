# OCI Valhalla Quick Start Guide

**Fast-track setup for Valhalla on Oracle Cloud + Voyagr Integration**

**Version**: 1.0.0  
**Estimated Time**: 2-3 hours (mostly waiting for downloads/tile building)

---

## 🚀 QUICK START (COPY-PASTE READY)

### Phase 1: Check Current Status (5 minutes)

```bash
# SSH into OCI instance
ssh ubuntu@141.147.102.102

# Check for OSM file
find ~ -name "*.osm.pbf" -type f 2>/dev/null

# Check disk space
df -h

# Check Docker
docker ps -a
```

### Phase 2: Download OSM Data (10-30 minutes)

```bash
# Create working directory
mkdir -p ~/valhalla-data
cd ~/valhalla-data

# Download UK OSM data (if not already done)
wget -c https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# Monitor progress
watch -n 10 'ls -lh great-britain-latest.osm.pbf'

# When complete, verify size (should be ~1.2-1.5 GB)
ls -lh great-britain-latest.osm.pbf
```

### Phase 3: Create Valhalla Configuration (5 minutes)

```bash
# Create directories
mkdir -p ~/valhalla/{tiles,config,logs}

# Create valhalla.json
cat > ~/valhalla/valhalla.json << 'EOF'
{
  "mjolnir": {
    "tile_dir": "/data/valhalla/tiles",
    "tile_extract": "/data/valhalla/tiles.tar",
    "logging": {"type": "std_out", "level": "info"}
  },
  "httpd": {
    "service": [{"actions": ["route", "locate", "map_match", "isochrone", "matrix"], "admin": false}],
    "base_url": "0.0.0.0:8002",
    "listen": "0.0.0.0",
    "port": 8002,
    "threads": 2
  },
  "service": {
    "max_locations": 10,
    "max_matrix_distance": 100000,
    "max_matrix_locations": 25
  },
  "costing_options": {
    "auto": {"use_toll": true, "use_ferry": true},
    "pedestrian": {"use_ferry": true},
    "bicycle": {"use_bike_lanes": true, "use_roads": true}
  }
}
EOF

# Verify file created
cat ~/valhalla/valhalla.json
```

### Phase 4: Build Tiles (30-60 minutes)

```bash
# Create docker-compose.yml for tile building
cat > ~/valhalla/docker-compose-build.yml << 'EOF'
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
EOF

# Start tile building
cd ~/valhalla
docker-compose -f docker-compose-build.yml up

# Monitor progress (in another terminal)
docker logs -f valhalla-tile-builder

# When complete, verify tiles
ls -lh ~/valhalla/tiles/ | head -20
find ~/valhalla/tiles -name "*.gph" | wc -l
```

### Phase 5: Start Valhalla Service (5 minutes)

```bash
# Create docker-compose.yml for running service
cat > ~/valhalla/docker-compose.yml << 'EOF'
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
EOF

# Start service
cd ~/valhalla
docker-compose up -d

# Wait for startup
sleep 30

# Verify running
docker ps | grep valhalla
docker logs valhalla-server

# Test local connection
curl http://localhost:8002/status
```

### Phase 6: Configure Firewall (5 minutes)

```bash
# Check firewall status
sudo ufw status

# Allow port 8002
sudo ufw allow 8002/tcp

# Reload firewall
sudo ufw reload

# Verify
sudo ufw status | grep 8002
```

### Phase 7: Test External Connection (2 minutes)

```bash
# From your local machine:
curl http://141.147.102.102:8002/status

# Expected response:
# {"version":"...","tileset_last_modified":"..."}
```

### Phase 8: Configure Voyagr (10 minutes)

```bash
# On your local machine, in Voyagr project directory:

# Create .env file
cat > .env << 'EOF'
VALHALLA_URL=http://141.147.102.102:8002
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
VALHALLA_RETRY_DELAY=1
EOF

# Install python-dotenv if needed
pip install python-dotenv

# Test connection
python -c "
import os
from dotenv import load_dotenv
load_dotenv()
print(f'Valhalla URL: {os.getenv(\"VALHALLA_URL\")}')
"
```

### Phase 9: Integrate Code Changes (20 minutes)

See: **OCI_VOYAGR_INTEGRATION.md** for complete code modifications

Key changes:
1. Add Valhalla configuration to `__init__`
2. Add `check_valhalla_connection()` method
3. Add `_make_valhalla_request()` method with retry logic
4. Update `calculate_route()` method
5. Add `_fallback_route()` method
6. Add `get_costing_options()` method

### Phase 10: Test Integration (10 minutes)

```bash
# Test configuration
python -c "
from satnav import SatNavApp
app = SatNavApp()
print(f'Valhalla URL: {app.valhalla_url}')
"

# Test connection
python -c "
from satnav import SatNavApp
app = SatNavApp()
result = app.check_valhalla_connection()
print(f'Connected: {result}')
"

# Test route calculation
python -c "
from satnav import SatNavApp
app = SatNavApp()
route = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
if route:
    print(f'✓ Route: {app.route_distance:.1f} km, {app.route_time/60:.0f} min')
else:
    print('✗ Route failed')
"
```

---

## 📊 TIMELINE

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Check Status | 5 min | ⏳ |
| 2 | Download OSM | 10-30 min | ⏳ |
| 3 | Create Config | 5 min | ⏳ |
| 4 | Build Tiles | 30-60 min | ⏳ |
| 5 | Start Service | 5 min | ⏳ |
| 6 | Firewall | 5 min | ⏳ |
| 7 | Test External | 2 min | ⏳ |
| 8 | Configure Voyagr | 10 min | ⏳ |
| 9 | Code Changes | 20 min | ⏳ |
| 10 | Test Integration | 10 min | ⏳ |
| **Total** | | **2-3 hours** | |

---

## 🔍 VERIFICATION CHECKLIST

- [ ] OSM file downloaded (1.2-1.5 GB)
- [ ] Tiles built (8-12 GB, 1000+ files)
- [ ] Valhalla container running
- [ ] Local health check passes
- [ ] Firewall allows port 8002
- [ ] External health check passes
- [ ] .env file created
- [ ] Code changes integrated
- [ ] Route calculation works
- [ ] Fallback mechanism works

---

## 🆘 QUICK TROUBLESHOOTING

### Download stuck?
```bash
wget -c https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

### Tile building failed?
```bash
docker logs valhalla-tile-builder
docker-compose -f docker-compose-build.yml down
# Fix issue, then retry
```

### Can't connect to Valhalla?
```bash
# Check if running
docker ps | grep valhalla

# Check logs
docker logs valhalla-server

# Check firewall
sudo ufw status
```

### Route calculation fails?
```bash
# Test with curl
curl -X POST http://141.147.102.102:8002/route \
  -H "Content-Type: application/json" \
  -d '{"locations":[{"lat":51.5074,"lon":-0.1278},{"lat":53.4808,"lon":-2.2426}],"costing":"auto"}'
```

---

## 📚 DETAILED GUIDES

- **OCI_VALHALLA_SETUP_COMPLETE.md** - Detailed setup guide
- **OCI_VOYAGR_INTEGRATION.md** - Complete code modifications
- **VALHALLA_COMPLETE_GUIDE.md** - Comprehensive Valhalla guide

---

**Status**: ✅ Ready to Deploy

---

**End of Quick Start Guide**

