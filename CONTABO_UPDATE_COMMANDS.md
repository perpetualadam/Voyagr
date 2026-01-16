# Contabo Server Update Commands

**Date**: 2026-01-16  
**Commits to Deploy**: 
- `a980c1e` - Fix UI issues: speed limit defaults, battery position, turn instructions
- `4a2395a` - Update UI_FIXES_SUMMARY.md to clarify speed limit fix context

---

## 🚀 Quick Deployment Commands

Copy and paste these commands into your Contabo SSH session:

```bash
# 1. Navigate to the voyagr directory
cd /root/voyagr

# 2. Pull the latest changes from GitHub
git pull origin main

# 3. Restart the voyagr service to apply changes
systemctl restart voyagr

# 4. Check service status
systemctl status voyagr

# 5. Verify the service is running (should show "active (running)")
# Press 'q' to exit the status view

# 6. Check recent logs for any errors
journalctl -u voyagr -n 50 --no-pager

# 7. Test the web interface
curl -I http://localhost:5000
```

---

## 📋 Step-by-Step Instructions

### Step 1: Connect to Contabo Server

```bash
ssh root@your-contabo-ip
```

### Step 2: Navigate to voyagr Directory

```bash
cd /root/voyagr
```

### Step 3: Check Current Status

```bash
# Check current git status
git status

# Check current commit
git log --oneline -1

# Should show: 3443a3b Add deployment instructions for Contabo
```

### Step 4: Pull Latest Changes

```bash
git pull origin main
```

**Expected Output**:
```
Updating 3443a3b..f1ddd19
Fast-forward
 ANDROID_APP_DEPENDENCIES_ANALYSIS.md | 267 ++++++++++++++++++++++++++++++
 CONTABO_UPDATE_COMMANDS.md           | 262 +++++++++++++++++++++++++++++
 DEPLOYMENT_SUMMARY_2026_01_16.md     | 220 ++++++++++++++++++++++++
 UI_FIXES_SUMMARY.md                  | 151 +++++++++++++++++
 static/css/voyagr.css                |   2 +-
 voyagr_web.py                        |   4 +-
 6 files changed, 904 insertions(+), 2 deletions(-)
```

### Step 5: Restart Voyagr Service

```bash
systemctl restart voyagr
```

### Step 6: Verify Service is Running

```bash
systemctl status voyagr
```

**Expected Output** (should show "active (running)"):
```
● voyagr.service - Voyagr Navigation App
     Loaded: loaded (/etc/systemd/system/voyagr.service; enabled; vendor preset: enabled)
     Active: active (running) since [timestamp]
   Main PID: [process-id] (python3)
      Tasks: [number] (limit: [limit])
     Memory: [memory-usage]
        CPU: [cpu-time]
     CGroup: /system.slice/voyagr.service
             └─[process-id] /usr/bin/python3 voyagr_web.py
```

Press `q` to exit.

### Step 7: Check Logs for Errors

```bash
journalctl -u voyagr -n 50 --no-pager
```

Look for:
- ✅ "Running on http://0.0.0.0:5000"
- ✅ No Python errors or tracebacks
- ✅ Speed limit detector initialized

### Step 8: Test the Application

```bash
# Test HTTP response
curl -I http://localhost:5000

# Should return: HTTP/1.1 200 OK
```

---

## 🔍 Verification Checklist

After deployment, verify these changes are live:

### 1. Battery Indicator Position
- [ ] Battery indicator appears **below** the speed widget (not overlapping)
- [ ] Battery is at `top: 90px` instead of `top: 10px`

### 2. Turn Instructions Default Text
- [ ] Turn widget shows "Follow Route" instead of "--"
- [ ] Turn widget shows "Continue on current road" instead of "Calculating route..."

### 3. Speed Limit Defaults
- [ ] `/api/speed-violation` endpoint defaults to 30 mph when no limit provided
- [ ] Test: `curl http://localhost:5000/api/speed-violation -X POST -H "Content-Type: application/json" -d '{"current_speed_mph": 35}'`
- [ ] Should return violation warning (35 > 30 default)

---

## 🛠️ Troubleshooting

### If Service Fails to Start

```bash
# Check detailed error logs
journalctl -u voyagr -n 100 --no-pager

# Check if port 5000 is already in use
netstat -tulpn | grep 5000

# Manually test the app
cd /root/voyagr
python3 voyagr_web.py
# Press Ctrl+C to stop, then restart service
```

### If Git Pull Fails

```bash
# Check for local changes
git status

# If there are local changes, stash them
git stash

# Pull again
git pull origin main

# Reapply stashed changes if needed
git stash pop
```

### If Changes Don't Appear

```bash
# Clear browser cache or use hard refresh (Ctrl+F5)
# Check cache version in voyagr_web.py (should be 20260109)

# Force restart with cache clear
systemctl stop voyagr
sleep 2
systemctl start voyagr
```

---

## ✅ Success Indicators

You'll know the deployment was successful when:

1. ✅ `git log --oneline -1` shows: `f1ddd19 Add deployment summary for 2026-01-16`
2. ✅ `systemctl status voyagr` shows: `active (running)`
3. ✅ `curl -I http://localhost:5000` returns: `HTTP/1.1 200 OK`
4. ✅ No errors in `journalctl -u voyagr -n 50`
5. ✅ Battery indicator is positioned below speed widget in browser
6. ✅ Turn instructions show "Follow Route" by default

---

## 📞 Quick Reference

**Service Commands**:
```bash
systemctl start voyagr      # Start service
systemctl stop voyagr       # Stop service
systemctl restart voyagr    # Restart service
systemctl status voyagr     # Check status
```

**Log Commands**:
```bash
journalctl -u voyagr -f                    # Follow logs in real-time
journalctl -u voyagr -n 100 --no-pager    # Last 100 log entries
journalctl -u voyagr --since "1 hour ago" # Logs from last hour
```

**Git Commands**:
```bash
git pull origin main        # Pull latest changes
git log --oneline -5        # Show last 5 commits
git status                  # Check working directory status
```

