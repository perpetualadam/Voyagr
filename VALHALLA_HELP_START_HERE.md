# 🆘 Valhalla Help - START HERE

**Problem:** Valhalla not responding at 141.147.102.102:8002  
**Solution:** Follow this guide step by step

---

## 🚀 QUICK START (5 Minutes)

### Step 1: SSH into OCI
```bash
ssh ubuntu@141.147.102.102
```

### Step 2: Check Status
```bash
docker ps -a | grep valhalla
```

**What you'll see:**
- `Up` → Container is running (go to Step 3)
- `Exited` → Container stopped (go to Step 4)
- Nothing → Container doesn't exist (go to Step 5)

---

## 📊 STEP 3: If Container is Running

```bash
# Test if it's responding
curl http://localhost:8002/status
```

**If you see JSON:** ✅ Valhalla is working!

**If you see error:** Check firewall:
```bash
sudo ufw allow 8002/tcp
docker restart valhalla
curl http://localhost:8002/status
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

**If it exits again:** Share the logs with me

---

## 🆕 STEP 5: If Container Doesn't Exist

```bash
cd ~/valhalla
docker-compose -f docker-compose.yml up -d
docker-compose -f docker-compose.yml ps
docker logs valhalla | tail -50
```

---

## ✅ VERIFY IT'S WORKING

Once you think it's fixed, run these tests:

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

## 🐛 TROUBLESHOOTING

### Container keeps exiting?
```bash
docker logs valhalla | tail -100
```

**Share the error message with me**

### Port 8002 not listening?
```bash
sudo ufw status
sudo ufw allow 8002/tcp
docker restart valhalla
```

### Out of memory?
```bash
free -h
docker update --memory 4g valhalla
docker restart valhalla
```

### Disk full?
```bash
df -h
du -sh ~/* | sort -h | tail -5
```

---

## 📚 DETAILED GUIDES

If you need more help, see:

1. **VALHALLA_QUICK_REFERENCE.md** - Copy-paste commands
2. **VALHALLA_FIX_GUIDE.md** - Symptom-based fixes
3. **OCI_VALHALLA_INTERACTIVE_FIX.md** - Step-by-step guide

---

## 📞 NEED HELP?

Run this diagnostic command and share the output:

```bash
echo "=== VALHALLA DIAGNOSTIC ===" && \
docker ps -a | grep valhalla && \
echo "" && \
netstat -tlnp | grep 8002 || echo "Port not listening" && \
echo "" && \
curl -s http://localhost:8002/status 2>&1 | head -10 && \
echo "" && \
docker logs valhalla 2>&1 | tail -30
```

---

## 🎯 SUCCESS CRITERIA

Valhalla is fixed when:
- ✅ Container shows as `Up`
- ✅ `curl http://localhost:8002/status` returns JSON
- ✅ `curl http://141.147.102.102:8002/status` returns JSON
- ✅ Route calculation works

---

## 🚀 START HERE

```bash
ssh ubuntu@141.147.102.102
docker ps -a | grep valhalla
```

**Then tell me what you see!**

---

**Next:** Follow the appropriate step (3, 4, or 5) based on what you see

