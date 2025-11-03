# 🎯 Valhalla OCI Fix - Complete Guide

**Problem:** Valhalla not responding at 141.147.102.102:8002  
**Goal:** Get Valhalla running and responding  
**Time:** 5-15 minutes

---

## 📋 WHAT YOU NEED TO DO

### 1. SSH into OCI Server
```bash
ssh ubuntu@141.147.102.102
```

### 2. Run Diagnostic Commands
Copy-paste these commands one by one and **share the output**:

```bash
# Check Docker container
docker ps -a | grep valhalla

# Check port 8002
netstat -tlnp | grep 8002

# Check logs
docker logs valhalla 2>&1 | tail -100

# Check disk space
df -h

# Check memory
free -h

# Check tiles
ls -lh ~/valhalla/tiles/ | head -10
```

### 3. Based on Output, Apply Fix

---

## 🔧 FIXES BY SYMPTOM

### Symptom 1: Container Status is "Exited"

**Fix:**
```bash
docker start valhalla
docker ps | grep valhalla
docker logs valhalla | tail -50
```

Then test:
```bash
curl http://localhost:8002/status
```

---

### Symptom 2: Container Status is "Up" but Port Not Listening

**Fix:**
```bash
# Check firewall
sudo ufw status

# Allow port 8002
sudo ufw allow 8002/tcp

# Restart container
docker restart valhalla

# Test
curl http://localhost:8002/status
```

---

### Symptom 3: Container Keeps Exiting

**Check logs for errors:**
```bash
docker logs valhalla | tail -100
```

**Common errors:**

**Error: "Address already in use"**
```bash
netstat -tlnp | grep 8002
kill -9 <PID>
docker restart valhalla
```

**Error: "Out of memory"**
```bash
free -h
docker update --memory 4g valhalla
docker restart valhalla
```

**Error: "Tiles not found"**
```bash
ls -lh ~/valhalla/tiles/
# If empty, rebuild tiles (takes 30-60 min)
cd ~/valhalla
docker-compose -f docker-compose-build.yml up
```

**Error: "Disk full"**
```bash
df -h
du -sh ~/* | sort -h | tail -5
# Delete old files if needed
```

---

### Symptom 4: Container Doesn't Exist

**Fix:**
```bash
cd ~/valhalla
docker-compose -f docker-compose.yml up -d
docker-compose -f docker-compose.yml ps
docker logs valhalla | tail -50
```

---

### Symptom 5: Container Running but Curl Fails

**Check firewall:**
```bash
sudo ufw status
sudo ufw allow 8002/tcp
```

**Check if port is actually listening:**
```bash
netstat -tlnp | grep 8002
```

**Restart container:**
```bash
docker restart valhalla
sleep 5
curl http://localhost:8002/status
```

---

## ✅ VERIFICATION TESTS

Once you think it's fixed, run these:

### Test 1: Local Health Check
```bash
curl http://localhost:8002/status
```

**Expected:** JSON response like:
```json
{"version":"...","build_date":"..."}
```

---

### Test 2: Route Calculation
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

### Test 3: External Access (From Your PC)
```bash
curl http://141.147.102.102:8002/status
```

**Expected:** Same JSON response as local test

---

## 🆘 IF NOTHING WORKS

**Full restart:**
```bash
cd ~/valhalla
docker-compose -f docker-compose.yml down
docker rm valhalla
docker-compose -f docker-compose.yml up -d
docker-compose -f docker-compose.yml ps
docker logs valhalla | tail -100
```

---

## 📞 WHAT TO SHARE WITH ME

If you're stuck, run this and share the output:

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
curl -s http://localhost:8002/status 2>&1 | head -20 && \
echo "" && \
echo "4. Disk Space:" && \
df -h | grep -E "Filesystem|/$" && \
echo "" && \
echo "5. Memory:" && \
free -h && \
echo "" && \
echo "6. Recent Logs:" && \
docker logs valhalla 2>&1 | tail -30
```

---

## 🎯 SUCCESS CHECKLIST

Valhalla is fixed when:
- ✅ `docker ps` shows valhalla as `Up`
- ✅ `curl http://localhost:8002/status` returns JSON
- ✅ `curl http://141.147.102.102:8002/status` returns JSON
- ✅ Route calculation returns valid route data

---

## 📚 RELATED GUIDES

- **VALHALLA_QUICK_REFERENCE.md** - Quick copy-paste commands
- **OCI_VALHALLA_INTERACTIVE_FIX.md** - Step-by-step interactive guide
- **VALHALLA_OCI_TROUBLESHOOTING.md** - Detailed troubleshooting

---

## 🚀 NEXT STEPS

1. **SSH into OCI:** `ssh ubuntu@141.147.102.102`
2. **Run diagnostics:** Copy-paste the diagnostic commands
3. **Share output:** Tell me what you see
4. **Apply fix:** Follow the fix for your symptom
5. **Verify:** Run the verification tests
6. **Done!** Valhalla should be working

---

**Ready? Start with:**
```bash
ssh ubuntu@141.147.102.102
```

**Then run the diagnostic commands and share the output!**

