#!/bin/bash

# OCI Valhalla Setup Diagnostic Script
# This script checks the current status of Valhalla setup on OCI

echo "=========================================="
echo "OCI VALHALLA SETUP DIAGNOSTIC"
echo "=========================================="
echo ""

# 1. Check for OSM data files
echo "1. CHECKING FOR OSM DATA FILES..."
echo "---"
echo "Searching for .osm.pbf files in common locations..."
echo ""

# Check home directory
if [ -f "$HOME/great-britain-latest.osm.pbf" ]; then
    echo "✓ Found: $HOME/great-britain-latest.osm.pbf"
    ls -lh "$HOME/great-britain-latest.osm.pbf"
    echo ""
fi

# Check /tmp
if [ -f "/tmp/great-britain-latest.osm.pbf" ]; then
    echo "✓ Found: /tmp/great-britain-latest.osm.pbf"
    ls -lh "/tmp/great-britain-latest.osm.pbf"
    echo ""
fi

# Check /data
if [ -d "/data" ]; then
    echo "✓ Found /data directory:"
    ls -lh /data/*.osm.pbf 2>/dev/null || echo "  No .osm.pbf files in /data"
    echo ""
fi

# Check /home/ubuntu
if [ -d "/home/ubuntu" ]; then
    echo "✓ Checking /home/ubuntu:"
    find /home/ubuntu -name "*.osm.pbf" -type f 2>/dev/null | while read file; do
        echo "  Found: $file"
        ls -lh "$file"
    done
    echo ""
fi

# Search all .osm.pbf files
echo "Searching entire filesystem for .osm.pbf files..."
find / -name "*.osm.pbf" -type f 2>/dev/null | head -10

echo ""
echo "2. CHECKING DOWNLOAD PROCESSES..."
echo "---"
ps aux | grep -E "wget|curl|aria2" | grep -v grep || echo "No active downloads found"

echo ""
echo "3. CHECKING DISK SPACE..."
echo "---"
df -h

echo ""
echo "4. CHECKING DOCKER STATUS..."
echo "---"
docker ps -a

echo ""
echo "5. CHECKING FOR VALHALLA TILES..."
echo "---"
if [ -d "$HOME/valhalla/tiles" ]; then
    echo "✓ Found: $HOME/valhalla/tiles"
    ls -lh "$HOME/valhalla/tiles/" | head -20
elif [ -d "/data/valhalla/tiles" ]; then
    echo "✓ Found: /data/valhalla/tiles"
    ls -lh "/data/valhalla/tiles/" | head -20
else
    echo "✗ No valhalla/tiles directory found"
fi

echo ""
echo "6. CHECKING FOR VALHALLA CONFIG..."
echo "---"
if [ -f "$HOME/valhalla.json" ]; then
    echo "✓ Found: $HOME/valhalla.json"
elif [ -f "/data/valhalla.json" ]; then
    echo "✓ Found: /data/valhalla.json"
else
    echo "✗ No valhalla.json found"
fi

echo ""
echo "7. CHECKING FIREWALL STATUS..."
echo "---"
sudo ufw status || echo "UFW not available"
echo ""
sudo iptables -L -n | grep 8002 || echo "No iptables rules for port 8002"

echo ""
echo "8. CHECKING NETWORK CONNECTIVITY..."
echo "---"
echo "Public IP:"
curl -s https://checkip.amazonaws.com || echo "Cannot determine public IP"

echo ""
echo "=========================================="
echo "DIAGNOSTIC COMPLETE"
echo "=========================================="

