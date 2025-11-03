# ⚡ Voyagr Monitoring - Quick Start Guide

**Get your routing engine monitoring up and running in 5 minutes**

---

## 🚀 Step 1: Start the App (1 minute)

```bash
python voyagr_web.py
```

You'll see:
```
✅ Routing engine monitoring started
🚀 Voyagr Web App is running!
🌐 Access the app at: http://localhost:5000
📊 Monitoring Dashboard: http://localhost:5000/monitoring
```

---

## 📊 Step 2: Open the Dashboard (1 minute)

### On Your PC:
```
http://localhost:5000/monitoring
```

### On Your Pixel 6:
```
http://YOUR_PC_IP:5000/monitoring
```

**Example:**
```
http://192.168.1.100:5000/monitoring
```

---

## 👀 Step 3: View Real-Time Status (1 minute)

The dashboard shows:

### Engine Status
```
GRAPHHOPPER: UP (Uptime: 99.5%)
VALHALLA: UP (Uptime: 98.2%)
OSRM: UP (Uptime: 100%)
```

### Recent Alerts
```
⚠️ VALHALLA - Engine failure: Timeout
   Created: 2025-11-03 10:25:00
```

### OCI Costs (30 days)
```
Total Cost: $0.82
Bandwidth: 96.5 GB
API Requests: 12,450
Daily Average: $0.03
```

---

## 🔧 Step 4: Manual Health Check (1 minute)

Click **"Check Now"** button to:
- Immediately test all 3 engines
- Update status in real-time
- Record response times

---

## 🔄 Step 5: Enable Auto-Refresh (1 minute)

Click **"Auto Refresh"** button to:
- Auto-update every 30 seconds
- Monitor live changes
- See alerts as they happen

---

## 📱 API Quick Reference

### Check Engine Status
```bash
curl http://localhost:5000/api/monitoring/engine-status
```

### Get Recent Alerts
```bash
curl http://localhost:5000/api/monitoring/alerts
```

### Get OCI Costs
```bash
curl http://localhost:5000/api/monitoring/costs
```

### Manual Health Check
```bash
curl -X POST http://localhost:5000/api/monitoring/health-check
```

---

## 🎯 What to Monitor

### ✅ Good Status
```
Status: UP
Uptime: 95%+
Response Time: <100ms
Consecutive Failures: 0
```

### ⚠️ Warning Status
```
Status: DEGRADED
Uptime: 80-95%
Response Time: 100-500ms
Consecutive Failures: 1-2
```

### 🔴 Critical Status
```
Status: DOWN
Uptime: <80%
Response Time: >500ms
Consecutive Failures: 3+
```

---

## 🚨 Alert Levels

### 🔴 CRITICAL
- Engine failed 3 consecutive checks
- Requires immediate attention
- Fallback engines active

### 🟠 WARNING
- Single health check failure
- May be temporary
- Monitor for escalation

### 🔵 INFO
- Engine recovered
- Status changed to UP
- Normal operation

---

## 💰 Cost Monitoring

### Daily Tracking
- Bandwidth usage (GB)
- API requests count
- Estimated cost

### 30-Day Summary
- Total bandwidth
- Total requests
- Total cost
- Daily average

### Budget Alerts
- Alert if daily cost > $1
- Alert if monthly cost > $50
- Review trends weekly

---

## 🔍 Dashboard Buttons

| Button | Action | Result |
|--------|--------|--------|
| **Check Now** | Manual health check | Immediate status update |
| **Auto Refresh** | Enable 30s refresh | Live monitoring |
| **Refresh Alerts** | Update alerts list | Latest alerts shown |
| **Refresh Costs** | Update cost data | Latest costs shown |

---

## 📊 Dashboard Sections

### Engine Status Card
- Shows all 3 engines
- Current status (UP/DOWN/DEGRADED)
- 24-hour uptime %
- Last check time

### Alerts Card
- Recent 10 alerts
- Severity color-coded
- Engine name
- Timestamp

### Costs Card
- 30-day total cost
- Bandwidth used
- API requests
- Daily average

---

## 🔧 Configuration

### Change Health Check Interval
Edit `routing_monitor.py`:
```python
HEALTH_CHECK_INTERVAL = 300  # 5 minutes
```

### Change Alert Threshold
```python
ALERT_THRESHOLD = 3  # Alert after 3 failures
```

### Update Engine URLs
Edit `.env`:
```
GRAPHHOPPER_URL=http://81.0.246.97:8989
VALHALLA_URL=http://141.147.102.102:8002
```

---

## 📈 Monitoring Workflow

```
Every 5 minutes:
  1. Check GraphHopper health
  2. Check Valhalla health
  3. Check OSRM health
  4. Record results
  5. Update status
  6. Check alert thresholds
  7. Create alerts if needed
```

---

## 🎯 Success Checklist

- ✅ App started with monitoring enabled
- ✅ Dashboard accessible at /monitoring
- ✅ All 3 engines showing status
- ✅ Health checks running every 5 minutes
- ✅ Alerts visible in dashboard
- ✅ Cost data tracking
- ✅ Manual health check working
- ✅ Auto-refresh enabled

---

## 🚀 Next Steps

1. **Monitor Daily**
   - Check dashboard each morning
   - Review alerts
   - Check costs

2. **Set Up Alerts**
   - Configure budget limits
   - Set up email notifications
   - Monitor response times

3. **Optimize**
   - Analyze failure patterns
   - Improve engine configuration
   - Optimize routing parameters

4. **Document**
   - Record baseline metrics
   - Track improvements
   - Document issues

---

## 📞 Quick Troubleshooting

### Dashboard Not Loading
```bash
# Check if app is running
curl http://localhost:5000/

# Check monitoring endpoint
curl http://localhost:5000/api/monitoring/engine-status
```

### No Health Check Data
```bash
# Manually trigger check
curl -X POST http://localhost:5000/api/monitoring/health-check

# Check database
sqlite3 voyagr_web.db "SELECT COUNT(*) FROM engine_health_checks;"
```

### Alerts Not Showing
- Wait 15 minutes (3 x 5-minute checks)
- Check engine URLs in .env
- Verify network connectivity

---

## 📚 Full Documentation

For detailed information, see:
- `MONITORING_SYSTEM_GUIDE.md` - Complete guide
- `routing_monitor.py` - Source code
- `voyagr_web.py` - API endpoints

---

**Your routing infrastructure is now monitored!** 🎉

**Dashboard:** http://localhost:5000/monitoring

