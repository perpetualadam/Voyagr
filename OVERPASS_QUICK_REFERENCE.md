# Overpass API - Quick Reference Card

**Server**: Contabo VPS (81.0.246.97)  
**Port**: 12345  
**URL**: `http://81.0.246.97:12345/api/interpreter`

---

## ⚡ Quick Commands

### Check if Overpass is Running
```bash
ssh root@81.0.246.97
docker ps | grep overpass
```

### View Logs
```bash
docker logs overpass --tail 100
docker logs -f overpass  # Follow in real-time
```

### Restart Container
```bash
docker restart overpass
```

### Test from Local Machine
```bash
curl -X POST "http://81.0.246.97:12345/api/interpreter" \
  --data '[out:json];node(51.5074,-0.1278,51.5174,-0.1178)[amenity];out 10;'
```

---

## 🔧 Configuration

### .env Settings
```env
# Self-hosted Overpass URL (tried first)
OVERPASS_API_URL=http://81.0.246.97:12345/api/interpreter

# Rate limiting (requests per second)
OVERPASS_RATE_LIMIT=2.0
```

### Fallback Endpoints
If self-hosted fails, automatically falls back to:
1. `https://overpass-api.de/api/interpreter`
2. `https://lz4.overpass-api.de/api/interpreter`
3. `https://z.overpass-api.de/api/interpreter`
4. `https://overpass.kumi.systems/api/interpreter`

---

## 📊 Rate Limiting

**Default**: 2 requests per second  
**Configurable**: Set `OVERPASS_RATE_LIMIT` in `.env`

**Examples**:
- Conservative: `OVERPASS_RATE_LIMIT=1.0` (1 req/s)
- Default: `OVERPASS_RATE_LIMIT=2.0` (2 req/s)
- Aggressive: `OVERPASS_RATE_LIMIT=5.0` (5 req/s)

**How it works**:
- Tracks timestamp of last request
- Enforces minimum interval: `1 / OVERPASS_RATE_LIMIT` seconds
- Sleeps if needed to maintain rate limit

---

## 🐛 Troubleshooting

### Overpass Not Responding
```bash
# Check container status
docker ps -a | grep overpass

# Check resource usage
docker stats overpass --no-stream

# Restart if needed
docker restart overpass
```

### Port Not Accessible
```bash
# Check firewall
ufw status | grep 12345

# Open port if needed
ufw allow 12345/tcp
ufw reload
```

### High Memory Usage
```bash
# Check memory
docker stats overpass --no-stream

# Restart to clear cache
docker restart overpass
```

---

## 📈 Monitoring

### Check Resource Usage
```bash
docker stats overpass --no-stream
```

### Watch Logs for Errors
```bash
docker logs -f overpass | grep -i error
```

### Test Query Performance
```python
import time
import requests

url = "http://81.0.246.97:12345/api/interpreter"
query = "[out:json];node(51.5074,-0.1278,51.5174,-0.1178)[amenity];out 10;"

start = time.time()
response = requests.post(url, data=query)
elapsed = time.time() - start

print(f"Status: {response.status_code}")
print(f"Time: {elapsed:.2f}s")
print(f"Results: {len(response.json().get('elements', []))}")
```

---

## 🔄 Update Container

```bash
# Pull latest image
docker pull wiktorn/overpass-api:latest

# Stop and remove old container
docker stop overpass
docker rm overpass

# Run new container
docker run -d \
  --name overpass \
  -p 12345:80 \
  --restart unless-stopped \
  --memory="4g" \
  --memory-swap="4g" \
  -v /opt/overpass/db:/db \
  wiktorn/overpass-api:latest

# Wait for initialization (5-10 minutes)
docker logs -f overpass
```

---

## ✅ Health Check

```bash
# Quick health check script
curl -s -X POST "http://81.0.246.97:12345/api/interpreter" \
  --data '[out:json];node(51.5074,-0.1278)[amenity];out 1;' \
  | jq '.elements | length'

# Should return: 1 (or any number > 0)
```

---

## 📝 Notes

- **Data Coverage**: Worldwide OpenStreetMap data
- **Update Frequency**: Depends on container configuration
- **Memory**: 4GB allocated (configurable)
- **Restart Policy**: `unless-stopped` (auto-restart on reboot)
- **Data Persistence**: `/opt/overpass/db` volume

---

## 🆘 Emergency Commands

### Kill and Restart
```bash
docker kill overpass
docker rm overpass
# Then run the container again (see Update Container section)
```

### Check Disk Space
```bash
df -h /opt/overpass
```

### Clear Cache (if needed)
```bash
docker stop overpass
rm -rf /opt/overpass/db/*
docker start overpass
# Wait for re-initialization
```

---

**For detailed verification steps, see `OVERPASS_VERIFICATION_COMMANDS.md`**

