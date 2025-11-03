# 🔧 Valhalla OCI Troubleshooting Guide

**Status:** Valhalla not responding (timeout)  
**Action Required:** Run these commands on OCI server

---

## 🚀 QUICK DIAGNOSIS (Run These Commands)

SSH into your OCI server and run these commands in order:

```bash
ssh ubuntu@141.147.102.102
```

### Step 1: Check if Valhalla Process is Running

```bash
# Check for Valhalla Docker container
docker ps | grep valhalla

# If not found, check all containers
docker ps -a | grep valhalla

# Check if Valhalla process is running
ps aux | grep valhalla | grep -v grep
```

**Expected Output:**
- Should see a container named `valhalla` or similar
- Status should be `Up` (not `Exited`)

**If NOT running:** Go to Step 3 (Restart Valhalla)

---

### Step 2: Check Valhalla Logs

```bash
# Check Docker logs
docker logs valhalla

# Or if using docker-compose
docker-compose -f ~/valhalla/docker-compose.yml logs

# Check for recent errors
docker logs valhalla | tail -50
```

**Look for:**
- Error messages
- Port binding issues
- Memory/disk space errors
- Configuration errors

---

### Step 3: Check Port 8002 is Listening

```bash
# Check if port 8002 is listening
netstat -tlnp | grep 8002

# Or use ss command
ss -tlnp | grep 8002

# Or check with curl locally
curl http://localhost:8002/status
```

**Expected Output:**
- Should show `LISTEN` on port 8002
- curl should return JSON status

**If NOT listening:** Valhalla is not running properly

---

### Step 4: Check Disk Space

```bash
# Check available disk space
df -h

# Check valhalla directory size
du -sh ~/valhalla/
du -sh ~/valhalla-data/
```

**Expected:**
- At least 20GB free space
- Tiles directory should be 8-12GB

**If low on space:** Delete old files or expand disk

---

### Step 5: Check Firewall

```bash
# Check UFW status
sudo ufw status

# Check if port 8002 is allowed
sudo ufw status | grep 8002

# If not allowed, enable it
sudo ufw allow 8002/tcp
```

---

## 🔄 RESTART VALHALLA

If Valhalla is not running, restart it:

### Option A: Using Docker Compose

```bash
cd ~/valhalla

# Stop container
docker-compose -f docker-compose.yml down

# Start container
docker-compose -f docker-compose.yml up -d

# Check status
docker-compose -f docker-compose.yml ps
```

### Option B: Using Docker Directly

```bash
# Stop container
docker stop valhalla

# Remove container
docker rm valhalla

# Start new container
docker run -d \
  --name valhalla \
  -p 8002:8002 \
  -v ~/valhalla/tiles:/data/valhalla/tiles \
  -v ~/valhalla/valhalla.json:/etc/valhalla/valhalla.json \
  gisops/valhalla:latest

# Check status
docker ps | grep valhalla
```

### Option C: Using Systemd (if installed)

```bash
# Check if service exists
systemctl status valhalla

# Restart service
sudo systemctl restart valhalla

# Check status
sudo systemctl status valhalla
```

---

## ✅ VERIFY VALHALLA IS WORKING

After restart, run these tests:

### Test 1: Local Health Check

```bash
curl http://localhost:8002/status
```

**Expected:** JSON response with status information

### Test 2: External Health Check (from your PC)

```bash
curl http://141.147.102.102:8002/status
```

**Expected:** Same JSON response

### Test 3: Route Calculation

```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 51.5174, "lon": -0.1378}
    ],
    "costing": "auto",
    "alternatives": true
  }'
```

**Expected:** JSON response with route information

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: "Connection refused"
**Cause:** Valhalla not running or port not listening  
**Fix:** Restart Valhalla (see Step 4 above)

### Issue 2: "Timeout"
**Cause:** Firewall blocking port 8002  
**Fix:** Allow port 8002 in firewall (see Step 5 above)

### Issue 3: "Out of memory"
**Cause:** Tiles too large for available RAM  
**Fix:** Increase Docker memory limit or reduce tile size

### Issue 4: "Tiles not found"
**Cause:** Tiles not built or in wrong location  
**Fix:** Rebuild tiles (see OCI_QUICK_START.md Phase 4)

### Issue 5: "Port already in use"
**Cause:** Another service using port 8002  
**Fix:** Find and stop the other service, or use different port

---

## 📋 DIAGNOSTIC CHECKLIST

Run this to get full diagnostic output:

```bash
echo "=== VALHALLA DIAGNOSTIC ===" && \
echo "" && \
echo "1. Docker Status:" && \
docker ps -a | grep valhalla && \
echo "" && \
echo "2. Port Status:" && \
netstat -tlnp | grep 8002 || echo "Port not listening" && \
echo "" && \
echo "3. Local Health Check:" && \
curl -s http://localhost:8002/status | head -20 && \
echo "" && \
echo "4. Disk Space:" && \
df -h | grep -E "Filesystem|/$" && \
echo "" && \
echo "5. Recent Logs:" && \
docker logs valhalla 2>&1 | tail -20
```

---

## 📞 NEXT STEPS

1. **Run the diagnostic commands above**
2. **Share the output with me**
3. **I'll help you fix any issues**
4. **Once Valhalla is running, we'll test the PWA fallback**

---

## 🎯 SUCCESS CRITERIA

Valhalla is working when:
- ✅ `docker ps` shows valhalla container as `Up`
- ✅ `curl http://localhost:8002/status` returns JSON
- ✅ `curl http://141.147.102.102:8002/status` returns JSON
- ✅ Route calculation returns valid route data

---

**Please run the diagnostic commands and share the output!**

