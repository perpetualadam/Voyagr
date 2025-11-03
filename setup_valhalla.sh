#!/bin/bash

# Voyagr Valhalla Setup Script
# Run this on your Contabo server

echo "🚀 Setting up Valhalla..."

# Stop and remove old container
echo "Stopping old container..."
docker stop valhalla 2>/dev/null
docker rm valhalla 2>/dev/null

# Run new container with proper configuration
echo "Starting Valhalla container..."
docker run -dt \
  --name valhalla \
  -p 8002:8002 \
  -v /opt/valhalla/custom_files:/custom_files \
  -e force_rebuild=True \
  -e serve_tiles=True \
  ghcr.io/valhalla/valhalla:latest \
  /bin/bash -c "cd /custom_files && valhalla_build_tiles -c /etc/valhalla/valhalla.json -i united-kingdom-latest.osm.pbf && valhalla_service /etc/valhalla/valhalla.json"

# Wait a moment
sleep 2

# Check if running
echo ""
echo "✅ Container status:"
docker ps | grep valhalla

echo ""
echo "📊 Monitoring logs (Ctrl+C to stop)..."
echo "Tile building will take 10-40 minutes..."
echo ""

# Show logs
docker logs -f valhalla

