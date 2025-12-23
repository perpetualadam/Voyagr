#!/bin/bash
# ============================================================================
# Valhalla Setup Script for Contabo VPS
# Run this on your Contabo server (81.0.246.97) to set up Valhalla routing
# ============================================================================

set -e

echo "=============================================="
echo "   Valhalla Routing Engine Setup for Contabo"
echo "=============================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root: sudo bash setup-valhalla-contabo.sh"
    exit 1
fi

# Check system resources
echo "[1/6] Checking system resources..."
TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
FREE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')

echo "  RAM: ${TOTAL_RAM}GB total"
echo "  Disk: ${FREE_DISK}GB free"

if [ "$TOTAL_RAM" -lt 6 ]; then
    echo "⚠️  WARNING: Less than 6GB RAM. Valhalla may struggle."
    echo "   Recommended: 8GB+ RAM for UK tiles"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

if [ "$FREE_DISK" -lt 30 ]; then
    echo "⚠️  WARNING: Less than 30GB free disk space."
    echo "   UK tiles need ~5GB, Europe needs ~30GB+"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install Docker if not present
echo ""
echo "[2/6] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "  Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl enable docker
    systemctl start docker
    rm get-docker.sh
    echo "  ✅ Docker installed"
else
    echo "  ✅ Docker already installed"
fi

# Stop existing Valhalla if running
echo ""
echo "[3/6] Preparing Valhalla container..."
if docker ps -a --format '{{.Names}}' | grep -q '^valhalla$'; then
    echo "  Stopping existing Valhalla container..."
    docker stop valhalla 2>/dev/null || true
    docker rm valhalla 2>/dev/null || true
fi

# Create directory structure
mkdir -p /opt/valhalla/tiles
cd /opt/valhalla

# Download UK map data
echo ""
echo "[4/6] Downloading Great Britain map data (~1.2GB)..."
echo "  This may take 5-15 minutes depending on connection..."
if [ ! -f tiles/great-britain-latest.osm.pbf ]; then
    wget -O tiles/great-britain-latest.osm.pbf \
        https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
    echo "  ✅ Download complete"
else
    echo "  ✅ Map data already exists, skipping download"
fi

# Run Valhalla container with resource limits
echo ""
echo "[5/6] Starting Valhalla container (4GB RAM limit)..."
docker run -d \
    --name valhalla \
    -p 8002:8002 \
    --restart unless-stopped \
    --memory="4g" \
    --memory-swap="4g" \
    --cpus="2" \
    -v /opt/valhalla/tiles:/custom_files \
    -e tile_urls=http://download.geofabrik.de/europe/great-britain-latest.osm.pbf \
    -e serve_tiles=True \
    -e build_elevation=False \
    -e build_admins=False \
    -e build_time_zones=False \
    ghcr.io/gis-ops/docker-valhalla/valhalla:latest

echo "  ✅ Container started"

# Wait for Valhalla to build tiles (this takes a while)
echo ""
echo "[6/6] Building routing tiles (this takes 10-30 minutes)..."
echo "  You can monitor progress with: docker logs -f valhalla"
echo ""
echo "  Waiting for Valhalla to become ready..."

# Poll for status
MAX_WAIT=2400  # 40 minutes max
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8002/status > /dev/null 2>&1; then
        echo ""
        echo "=============================================="
        echo "   ✅ Valhalla is READY!"
        echo "=============================================="
        echo ""
        echo "Test with:"
        echo "  curl http://localhost:8002/status"
        echo ""
        echo "Route test:"
        echo "  curl -X POST http://localhost:8002/route \\"
        echo "    -H 'Content-Type: application/json' \\"
        echo "    -d '{\"locations\":[{\"lat\":51.5074,\"lon\":-0.1278},{\"lat\":51.5174,\"lon\":-0.1278}],\"costing\":\"auto\"}'"
        echo ""
        echo "Now update your .env file:"
        echo "  VALHALLA_URL=http://localhost:8002"
        echo ""
        echo "And restart the Voyagr service:"
        echo "  systemctl restart voyagr"
        echo ""
        exit 0
    fi
    sleep 30
    WAITED=$((WAITED + 30))
    MINS=$((WAITED / 60))
    echo "  Still building... (${MINS} minutes elapsed)"
done

echo ""
echo "⚠️  Valhalla is still building after 40 minutes."
echo "   Check logs with: docker logs valhalla"
echo "   Wait for it to finish, then test with: curl http://localhost:8002/status"
