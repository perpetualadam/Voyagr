#!/bin/bash
# Deploy Speed Limit System Enhancements to Contabo Server
# Run this script on your Contabo server

set -e  # Exit on error

echo "=========================================="
echo "Speed Limit System Enhancement Deployment"
echo "=========================================="
echo ""

# Navigate to Voyagr directory
echo "📁 Navigating to /opt/voyagr..."
cd /opt/voyagr

# Pull latest changes
echo "⬇️  Pulling latest changes from GitHub..."
git pull origin main

# Restart the service
echo "🔄 Restarting Voyagr service..."
sudo systemctl restart voyagr

# Wait for service to start
echo "⏳ Waiting for service to start..."
sleep 5

# Check service status
echo "✅ Checking service status..."
sudo systemctl status voyagr --no-pager | head -20

echo ""
echo "=========================================="
echo "🧪 Running Tests"
echo "=========================================="
echo ""

# Test 1: Speed limit detection
echo "Test 1: Speed Limit Detection (London)"
curl -s "http://localhost:5000/api/speed-limit?lat=51.5074&lon=-0.1278&road_type=primary" | jq

echo ""
echo "Test 2: Speed Limit Detection (Manchester)"
curl -s "http://localhost:5000/api/speed-limit?lat=53.4808&lon=-2.2426&road_type=primary" | jq

echo ""
echo "Test 3: Get Metrics"
curl -s "http://localhost:5000/api/speed-limit/metrics" | jq

echo ""
echo "Test 4: Get TomTom Quota"
curl -s "http://localhost:5000/api/speed-limit/quota" | jq

echo ""
echo "=========================================="
echo "📊 Recent Logs"
echo "=========================================="
echo ""

journalctl -u voyagr --since "2 minutes ago" --no-pager | grep -E "Speed Limit|TomTom|Overpass" | tail -20

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "New Features:"
echo "  ✅ Overpass rate limiting removed (local instance)"
echo "  ✅ Cache TTL increased to 10 minutes"
echo "  ✅ Comprehensive metrics tracking"
echo "  ✅ TomTom quota and cost monitoring"
echo "  ✅ Speed limit change detection"
echo ""
echo "New Endpoints:"
echo "  📡 GET  /api/speed-limit/metrics"
echo "  📡 GET  /api/speed-limit/quota"
echo "  📡 POST /api/speed-limit/metrics/reset"
echo ""
echo "Monitor metrics:"
echo "  curl http://localhost:5000/api/speed-limit/metrics | jq"
echo ""
echo "Watch logs:"
echo "  journalctl -u voyagr -f | grep 'Speed Limit'"
echo ""

