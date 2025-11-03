# 🚀 Contabo Valhalla Setup Guide

## Step 1: Create Contabo Account & VPS

1. Go to https://contabo.com/
2. Sign up and create a new VPS:
   - **OS:** Ubuntu 22.04 LTS
   - **RAM:** 8GB minimum (16GB recommended for Valhalla)
   - **Storage:** 100GB SSD minimum
   - **Location:** Choose closest to you (EU recommended for UK)
3. Note your IP address and root password

---

## Step 2: Connect to Your VPS

```bash
# On Windows, use PowerShell or WSL
ssh root@YOUR_CONTABO_IP

# Enter your password when prompted
```

---

## Step 3: Install Docker (Easiest Method)

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Verify Docker is running
docker --version
```

---

## Step 4: Run Valhalla in Docker

```bash
# Create directory for Valhalla data
mkdir -p /opt/valhalla
cd /opt/valhalla

# Run Valhalla container
docker run -d \
  --name valhalla \
  -p 8002:8002 \
  -v /opt/valhalla/valhalla_tiles:/data/valhalla/tiles \
  -e tile_url="https://planet.openstreetmap.org/pbf/{name}.osm.pbf" \
  gisops/valhalla:latest

# Check if running
docker ps | grep valhalla
```

---

## Step 5: Download Map Tiles

This takes 10-40 minutes depending on region:

```bash
# For UK only (smaller, faster)
docker exec valhalla valhalla_build_tiles \
  -c /etc/valhalla/valhalla.json \
  -i /data/valhalla/tiles/gb-united-kingdom-latest.osm.pbf

# For Europe (larger, more comprehensive)
docker exec valhalla valhalla_build_tiles \
  -c /etc/valhalla/valhalla.json \
  -i /data/valhalla/tiles/europe-latest.osm.pbf
```

---

## Step 6: Test Valhalla

```bash
# Test from your PC
curl -X POST http://YOUR_CONTABO_IP:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 51.5174, "lon": -0.1278}
    ],
    "costing": "auto"
  }'

# Should return route data
```

---

## Step 7: Update .env File

Edit `.env` in your Voyagr project:

```env
VALHALLA_URL=http://YOUR_CONTABO_IP:8002
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
```

---

## Step 8: Restart Web App

```bash
# Kill old process
pkill -f "python voyagr_web.py"

# Start new one
python voyagr_web.py
```

---

## 💰 Contabo Pricing

- **VPS M (8GB RAM, 100GB SSD):** ~€4/month
- **VPS L (16GB RAM, 200GB SSD):** ~€8/month

Much cheaper than OCI!

---

## 🔧 Troubleshooting

### Valhalla not responding
```bash
# Check if container is running
docker ps

# View logs
docker logs valhalla

# Restart container
docker restart valhalla
```

### Tiles not building
```bash
# Check disk space
df -h

# Monitor build progress
docker exec valhalla tail -f /var/log/valhalla/valhalla.log
```

### Connection timeout
- Check firewall: `sudo ufw allow 8002`
- Check IP is correct
- Wait for tiles to finish building

---

## ✅ Once Running

Your web app will automatically use Contabo Valhalla instead of OSRM!

No code changes needed - just update `.env` and restart.

