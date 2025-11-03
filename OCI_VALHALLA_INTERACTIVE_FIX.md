# 🔧 OCI Valhalla - Interactive Fix Guide

**Status:** Valhalla not responding  
**Goal:** Get Valhalla running and responding on port 8002

---

## 🚀 STEP 1: SSH INTO OCI SERVER

Run this command on your PC:

```bash
ssh ubuntu@141.147.102.102
```

**Expected:** You should be logged into the OCI server

**If it fails:** 
- Check your SSH key is set up
- Try: `ssh -i /path/to/key ubuntu@141.147.102.102`

---

## 🔍 STEP 2: RUN DIAGNOSTIC COMMANDS

Once logged in, run these commands one by one and **share the output with me**:

### Command 1: Check Docker Status
```bash
docker ps -a
```

**What to look for:**
- Is there a container named `valhalla`?
- What is its status? (Up, Exited, etc.)

---

### Command 2: Check if Valhalla Process is Running
```bash
ps aux | grep valhalla | grep -v grep
```

**What to look for:**
- Any valhalla processes running?
- If nothing shows, Valhalla is not running

---

### Command 3: Check Port 8002
```bash
netstat -tlnp | grep 8002
```

**What to look for:**
- Is port 8002 listening?
- If nothing shows, nothing is listening on that port

---

### Command 4: Check Valhalla Logs
```bash
docker logs valhalla 2>&1 | tail -100
```

**What to look for:**
- Error messages
- "Address already in use"
- "Out of memory"
- "Tiles not found"
- Any other errors

---

### Command 5: Check Disk Space
```bash
df -h
```

**What to look for:**
- Is the disk full? (100% usage)
- How much free space is available?

---

### Command 6: Check Memory
```bash
free -h
```

**What to look for:**
- How much memory is available?
- Is it running out of memory?

---

### Command 7: Check Valhalla Directory
```bash
ls -lh ~/valhalla/
```

**What to look for:**
- Does the directory exist?
- What files are there?

---

### Command 8: Check Tiles Directory
```bash
ls -lh ~/valhalla/tiles/ | head -20
```

**What to look for:**
- Are there tile files (.gph)?
- How many files?
- What's the total size?

---

## 📋 DIAGNOSTIC CHECKLIST

Run all commands above and share the output. I need to see:

- [ ] Docker container status
- [ ] Valhalla process status
- [ ] Port 8002 status
- [ ] Valhalla logs (last 100 lines)
- [ ] Disk space
- [ ] Memory usage
- [ ] Valhalla directory contents
- [ ] Tiles directory contents

---

## 🔄 COMMON ISSUES & QUICK FIXES

### Issue 1: Container is Exited
**Symptom:** `docker ps -a` shows valhalla with status "Exited"

**Fix:**
```bash
# Start the container
docker start valhalla

# Check if it's running
docker ps | grep valhalla

# Check logs
docker logs valhalla | tail -50
```

---

### Issue 2: Port Already in Use
**Symptom:** Logs show "Address already in use" or "Port 8002 already in use"

**Fix:**
```bash
# Find what's using port 8002
netstat -tlnp | grep 8002

# Kill the process (replace PID with actual number)
kill -9 <PID>

# Or restart Docker
docker restart valhalla
```

---

### Issue 3: Out of Memory
**Symptom:** Logs show "Out of memory" or container keeps restarting

**Fix:**
```bash
# Check memory
free -h

# Increase Docker memory limit
docker update --memory 4g valhalla

# Restart container
docker restart valhalla
```

---

### Issue 4: Tiles Not Found
**Symptom:** Logs show "Tiles not found" or "No tiles available"

**Fix:**
```bash
# Check if tiles exist
ls -lh ~/valhalla/tiles/

# If empty, rebuild tiles (takes 30-60 min)
cd ~/valhalla
docker-compose -f docker-compose-build.yml up
```

---

### Issue 5: Disk Full
**Symptom:** `df -h` shows 100% usage

**Fix:**
```bash
# Find large files
du -sh ~/* | sort -h | tail -10

# Delete old files if needed
rm -rf ~/old-files/

# Or expand disk (contact OCI support)
```

---

## ✅ RESTART VALHALLA (If Needed)

### Option A: Using Docker Compose (Recommended)
```bash
cd ~/valhalla

# Stop container
docker-compose -f docker-compose.yml down

# Start container
docker-compose -f docker-compose.yml up -d

# Check status
docker-compose -f docker-compose.yml ps
```

---

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

---

### Option C: Using Systemd (If Installed)
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

**Expected:** JSON response with route information

---

### Test 3: External Health Check (From Your PC)
```bash
curl http://141.147.102.102:8002/status
```

**Expected:** Same JSON response as local test

---

## 📞 NEXT STEPS

1. **Run all diagnostic commands above**
2. **Share the output with me**
3. **I'll help you fix the specific issue**
4. **Once fixed, we'll verify Valhalla is working**

---

## 💡 TIPS

- Copy-paste commands one at a time
- Share the full output (even if it looks like an error)
- Don't worry if some commands fail - that's useful info
- If you get stuck, just share what you see

---

**Ready? Start with Step 1: SSH into OCI**

```bash
ssh ubuntu@141.147.102.102
```

**Then run the diagnostic commands and share the output!**

