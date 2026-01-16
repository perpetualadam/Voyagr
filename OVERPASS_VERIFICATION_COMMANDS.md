# Overpass API Self-Hosted Verification & Configuration

**Server**: Contabo VPS (81.0.246.97)  
**Port**: 12345  
**URL**: http://81.0.246.97:12345/api/interpreter

---

## 1. Verify Overpass is Running on Contabo

```bash
# SSH into Contabo server
ssh root@81.0.246.97

# Check if Overpass container is running
docker ps | grep overpass

# Expected output:
# CONTAINER ID   IMAGE                    COMMAND                  CREATED        STATUS        PORTS                     NAMES
# abc123def456   wiktorn/overpass-api     "/docker-entrypoint.…"   X days ago     Up X days     0.0.0.0:12345->80/tcp     overpass
```

---

## 2. Test Overpass API from Contabo Server

```bash
# Test query from server itself
curl -X POST "http://localhost:12345/api/interpreter" \
  --data '[out:json];node(51.5074,-0.1278,51.5174,-0.1178)[amenity=restaurant];out;' \
  -H "Content-Type: application/x-www-form-urlencoded"

# Should return JSON with restaurant data
```

---

## 3. Test Overpass API from Your Local Machine

```bash
# Test from Windows PowerShell or WSL
curl -X POST "http://81.0.246.97:12345/api/interpreter" `
  --data '[out:json];node(51.5074,-0.1278,51.5174,-0.1178)[amenity=restaurant];out;' `
  -H "Content-Type: application/x-www-form-urlencoded"

# Should return JSON data
```

---

## 4. Check Overpass Container Logs

```bash
# SSH into Contabo
ssh root@81.0.246.97

# View recent logs
docker logs overpass --tail 100

# Follow logs in real-time
docker logs -f overpass

# Look for:
# - Query execution times
# - Rate limit warnings
# - Memory usage warnings
```

---

## 5. Check Overpass Resource Usage

```bash
# Check container stats
docker stats overpass --no-stream

# Expected output:
# CONTAINER ID   NAME       CPU %     MEM USAGE / LIMIT     MEM %     NET I/O
# abc123def456   overpass   5.23%     1.2GiB / 4GiB        30.00%    1.5MB / 2.3MB
```

---

## 6. Configure Rate Limiting in .env

Add to your `.env` file (already done in code):

```bash
# Overpass API rate limiting (for self-hosted instance)
# Default: 2 requests per second (conservative for self-hosted)
# Increase if your server can handle more load
OVERPASS_RATE_LIMIT=2.0

# For more powerful server, you can increase:
# OVERPASS_RATE_LIMIT=5.0  # 5 requests per second
# OVERPASS_RATE_LIMIT=10.0 # 10 requests per second
```

---

## 7. Test Rate Limiting

```python
# Run this Python script to test rate limiting
import time
import requests

url = "http://81.0.246.97:12345/api/interpreter"
query = "[out:json];node(51.5074,-0.1278,51.5174,-0.1178)[amenity];out;"

print("Testing Overpass rate limiting...")
for i in range(10):
    start = time.time()
    response = requests.post(url, data=query)
    elapsed = time.time() - start
    print(f"Request {i+1}: {response.status_code} - {elapsed:.2f}s")
    
# Should see consistent timing between requests
```

---

## 8. Monitor Overpass Performance

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Install htop if not available
apt install htop -y

# Monitor CPU/RAM usage
htop

# Filter to show only Overpass process
# Press F4, type "overpass", press Enter
```

---

## 9. Restart Overpass Container (if needed)

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Restart container
docker restart overpass

# Check if it's running
docker ps | grep overpass

# View startup logs
docker logs overpass --tail 50
```

---

## 10. Update Overpass Container (if needed)

```bash
# SSH into Contabo
ssh root@81.0.246.97

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

# Wait for initialization (can take 5-10 minutes)
docker logs -f overpass
```

---

## 11. Check Firewall Rules

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Check if port 12345 is open
ufw status | grep 12345

# If not open, add rule:
ufw allow 12345/tcp
ufw reload
```

---

## 12. Verify from Voyagr Application

```bash
# In your Voyagr directory, run Python shell
python

# Test Overpass connection
>>> import os
>>> from dotenv import load_dotenv
>>> load_dotenv()
>>> overpass_url = os.getenv('OVERPASS_API_URL')
>>> print(f"Overpass URL: {overpass_url}")
>>> 
>>> import requests
>>> query = "[out:json];node(51.5074,-0.1278,51.5174,-0.1178)[amenity];out 10;"
>>> response = requests.post(overpass_url, data=query, timeout=10)
>>> print(f"Status: {response.status_code}")
>>> print(f"Elements: {len(response.json().get('elements', []))}")
```

---

## Summary

✅ **Overpass API URL**: `http://81.0.246.97:12345/api/interpreter`  
✅ **Already configured in `.env`**: Line 68  
✅ **Rate limiting added**: `OVERPASS_RATE_LIMIT=2.0` (configurable)  
✅ **Fallback endpoints**: Public Overpass APIs if self-hosted fails  

The code changes I made will:
1. Use your self-hosted Overpass first
2. Apply rate limiting (2 req/s by default, configurable)
3. Fall back to public APIs if self-hosted is down
4. Cache results to minimize API calls

