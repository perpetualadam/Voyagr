# ⚡ Valhalla Quick Reference Card

**Problem:** Valhalla not responding at 141.147.102.102:8002  
**Solution:** Follow these steps

---

## 🚀 QUICK START (Copy-Paste These)

### Step 1: SSH In
```bash
ssh ubuntu@141.147.102.102
```

### Step 2: Check Status
```bash
docker ps -a | grep valhalla
```

**If you see:**
- `Up` → Go to Step 3
- `Exited` → Go to Step 4
- Nothing → Go to Step 5

---

## 📊 STEP 3: If Container is Running

```bash
# Check if port 8002 is listening
netstat -tlnp | grep 8002

# Check logs for errors
docker logs valhalla | tail -50

# Test locally
curl http://localhost:8002/status
```

**If curl works:** Valhalla is running! Test from your PC:
```bash
curl http://141.147.102.102:8002/status
```

**If curl fails:** Check firewall:
```bash
sudo ufw status
sudo ufw allow 8002/tcp
```

---

## 🔄 STEP 4: If Container is Exited

```bash
# Start it
docker start valhalla

# Check status
docker ps | grep valhalla

# Check logs
docker logs valhalla | tail -50
```

**If it stays running:** Test it (see Step 3)

**If it exits again:** Check logs for errors and go to Step 6

---

## 🆕 STEP 5: If Container Doesn't Exist

```bash
# Create and start container
cd ~/valhalla
docker-compose -f docker-compose.yml up -d

# Check status
docker-compose -f docker-compose.yml ps

# Check logs
docker logs valhalla | tail -50
```

---

## 🐛 STEP 6: Troubleshoot Errors

### Error: "Address already in use"
```bash
# Find what's using port 8002
netstat -tlnp | grep 8002

# Kill it (replace PID)
kill -9 <PID>

# Restart Valhalla
docker restart valhalla
```

### Error: "Out of memory"
```bash
# Check memory
free -h

# Increase Docker memory
docker update --memory 4g valhalla

# Restart
docker restart valhalla
```

### Error: "Tiles not found"
```bash
# Check tiles exist
ls -lh ~/valhalla/tiles/ | head -5

# If empty, rebuild (takes 30-60 min)
cd ~/valhalla
docker-compose -f docker-compose-build.yml up
```

### Error: "Disk full"
```bash
# Check disk
df -h

# Find large files
du -sh ~/* | sort -h | tail -5

# Delete old files if needed
rm -rf ~/old-files/
```

---

## ✅ VERIFY IT'S WORKING

### Test 1: Local
```bash
curl http://localhost:8002/status
```

### Test 2: External (From Your PC)
```bash
curl http://141.147.102.102:8002/status
```

### Test 3: Route Calculation
```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 51.5174, "lon": -0.1378}
    ],
    "costing": "auto"
  }'
```

**Expected:** JSON response with route data

---

## 🔧 FULL RESTART (Nuclear Option)

If nothing else works:

```bash
# Stop everything
cd ~/valhalla
docker-compose -f docker-compose.yml down

# Remove container
docker rm valhalla

# Start fresh
docker-compose -f docker-compose.yml up -d

# Check status
docker-compose -f docker-compose.yml ps

# Check logs
docker logs valhalla | tail -100
```

---

## 📋 DIAGNOSTIC CHECKLIST

Run these and share output:

```bash
# 1. Container status
docker ps -a | grep valhalla

# 2. Port status
netstat -tlnp | grep 8002

# 3. Logs
docker logs valhalla | tail -50

# 4. Disk space
df -h

# 5. Memory
free -h

# 6. Tiles
ls -lh ~/valhalla/tiles/ | head -5

# 7. Local test
curl http://localhost:8002/status

# 8. External test
curl http://141.147.102.102:8002/status
```

---

## 🎯 SUCCESS CRITERIA

Valhalla is working when:
- ✅ `docker ps` shows valhalla as `Up`
- ✅ `curl http://localhost:8002/status` returns JSON
- ✅ `curl http://141.147.102.102:8002/status` returns JSON
- ✅ Route calculation returns valid route data

---

## 📞 NEED HELP?

1. Run the diagnostic checklist above
2. Share the output with me
3. I'll help you fix it

---

**Start here:** `ssh ubuntu@141.147.102.102`

