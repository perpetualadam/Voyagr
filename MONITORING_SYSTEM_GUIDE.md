# 🚀 Voyagr Routing Engine Monitoring System

**Comprehensive monitoring and alerting for GraphHopper, Valhalla, and OSRM routing engines**

---

## 📋 Overview

The Voyagr Monitoring System provides real-time health monitoring, alerting, and cost tracking for your routing infrastructure:

- **3 Routing Engines:** GraphHopper, Valhalla, OSRM
- **Health Checks:** Every 5 minutes
- **Alerts:** Automatic notifications on failures
- **Cost Tracking:** OCI Valhalla usage and costs
- **Dashboard:** Real-time web interface

---

## 🎯 Features

### 1. **Routing Engine Health Monitoring**
- ✅ Automated health checks every 5 minutes
- ✅ Response time tracking
- ✅ Uptime percentage calculation (24-hour)
- ✅ Consecutive failure tracking
- ✅ Status history in database

### 2. **Intelligent Alerting System**
- ✅ Alert threshold: 3 consecutive failures
- ✅ Severity levels: critical, warning, info
- ✅ Alert types: engine_down, engine_failure, recovery
- ✅ Automatic recovery detection
- ✅ Alert resolution tracking

### 3. **OCI Cost Monitoring**
- ✅ Daily bandwidth tracking (GB)
- ✅ API request counting
- ✅ Estimated cost calculation
- ✅ 30-day cost history
- ✅ Budget alert support

### 4. **Admin Dashboard**
- ✅ Real-time engine status display
- ✅ Recent alerts list
- ✅ Cost trends visualization
- ✅ Manual health check trigger
- ✅ Auto-refresh capability

---

## 🚀 Getting Started

### 1. **Start the Monitoring System**

The monitoring system starts automatically when you run voyagr_web.py:

```bash
python voyagr_web.py
```

You'll see:
```
✅ Routing engine monitoring started
```

### 2. **Access the Dashboard**

Open your browser and go to:
```
http://localhost:5000/monitoring
```

Or from your Pixel 6:
```
http://YOUR_PC_IP:5000/monitoring
```

### 3. **View Real-Time Status**

The dashboard shows:
- **Engine Status:** UP, DOWN, DEGRADED, UNKNOWN
- **Uptime:** 24-hour uptime percentage
- **Recent Alerts:** Last 10 alerts with timestamps
- **OCI Costs:** 30-day cost breakdown

---

## 📊 API Endpoints

### Get All Engine Status
```bash
GET /api/monitoring/engine-status
```

**Response:**
```json
{
  "success": true,
  "engines": [
    {
      "engine": "graphhopper",
      "status": "up",
      "last_check": "2025-11-03T10:30:00",
      "consecutive_failures": 0,
      "uptime_24h": 99.5
    }
  ]
}
```

### Get Specific Engine Status
```bash
GET /api/monitoring/engine-status/<engine_name>
```

### Get Recent Alerts
```bash
GET /api/monitoring/alerts?limit=10
```

**Response:**
```json
{
  "success": true,
  "alerts": [
    {
      "id": 1,
      "engine": "valhalla",
      "type": "engine_down",
      "severity": "critical",
      "message": "Valhalla has failed 3 consecutive health checks",
      "created_at": "2025-11-03T10:25:00",
      "resolved": false
    }
  ]
}
```

### Resolve an Alert
```bash
POST /api/monitoring/alerts/<alert_id>/resolve
```

### Get OCI Costs
```bash
GET /api/monitoring/costs?days=30
```

**Response:**
```json
{
  "success": true,
  "costs": [
    {
      "date": "2025-11-03",
      "bandwidth_gb": 2.5,
      "api_requests": 1250,
      "estimated_cost": 0.27
    }
  ]
}
```

### Track OCI Costs
```bash
POST /api/monitoring/costs
Content-Type: application/json

{
  "bandwidth_gb": 2.5,
  "api_requests": 1250
}
```

### Manual Health Check
```bash
POST /api/monitoring/health-check
```

**Response:**
```json
{
  "success": true,
  "results": {
    "graphhopper": {
      "status": "up",
      "response_time_ms": 45.2,
      "error": ""
    },
    "valhalla": {
      "status": "up",
      "response_time_ms": 52.1,
      "error": ""
    },
    "osrm": {
      "status": "up",
      "response_time_ms": 38.5,
      "error": ""
    }
  }
}
```

---

## 🔧 Configuration

### Health Check Interval
Edit `routing_monitor.py`:
```python
HEALTH_CHECK_INTERVAL = 300  # 5 minutes
```

### Alert Threshold
```python
ALERT_THRESHOLD = 3  # Alert after 3 consecutive failures
```

### Engine URLs
Configure in `.env`:
```
GRAPHHOPPER_URL=http://81.0.246.97:8989
VALHALLA_URL=http://141.147.102.102:8002
```

### OCI Cost Calculation
Edit `routing_monitor.py`:
```python
def _calculate_cost(self, bandwidth_gb: float, api_requests: int) -> float:
    bandwidth_cost = bandwidth_gb * 0.0085  # $0.0085 per GB
    compute_cost = 0.05  # Rough estimate
    return round(bandwidth_cost + compute_cost, 2)
```

---

## 📈 Database Schema

### engine_health_checks
```sql
CREATE TABLE engine_health_checks (
    id INTEGER PRIMARY KEY,
    engine_name TEXT,
    status TEXT,
    response_time_ms REAL,
    error_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### engine_status
```sql
CREATE TABLE engine_status (
    engine_name TEXT PRIMARY KEY,
    status TEXT,
    last_check DATETIME,
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_time DATETIME,
    uptime_percentage REAL DEFAULT 100.0
)
```

### routing_alerts
```sql
CREATE TABLE routing_alerts (
    id INTEGER PRIMARY KEY,
    engine_name TEXT,
    alert_type TEXT,
    severity TEXT,
    message TEXT,
    is_resolved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
)
```

### oci_cost_tracking
```sql
CREATE TABLE oci_cost_tracking (
    id INTEGER PRIMARY KEY,
    date DATE,
    bandwidth_gb REAL DEFAULT 0,
    compute_hours REAL DEFAULT 0,
    api_requests INTEGER DEFAULT 0,
    storage_gb REAL DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

---

## 🎯 Monitoring Workflow

### 1. **Health Check Cycle (Every 5 Minutes)**
```
Check GraphHopper → Check Valhalla → Check OSRM
    ↓
Record results in database
    ↓
Update engine status
    ↓
Check alert thresholds
    ↓
Create alerts if needed
```

### 2. **Alert Generation**
```
1st failure → Log in database
2nd failure → Log in database
3rd failure → CREATE ALERT (severity: critical)
    ↓
Alert visible in dashboard
    ↓
Admin can resolve alert
```

### 3. **Recovery Detection**
```
Engine down (3+ failures)
    ↓
Health check succeeds
    ↓
Reset consecutive_failures to 0
    ↓
Status changes to "up"
    ↓
Optional: Create recovery alert
```

---

## 📊 Dashboard Features

### Real-Time Status
- Engine name and current status
- Last check timestamp
- 24-hour uptime percentage
- Color-coded status badges

### Alert Management
- Recent alerts with timestamps
- Severity indicators
- Engine information
- Alert resolution tracking

### Cost Analysis
- Total 30-day cost
- Bandwidth usage
- API request count
- Daily average cost

### Manual Controls
- **Check Now:** Trigger immediate health check
- **Auto Refresh:** Enable 30-second auto-refresh
- **Refresh Alerts:** Update alerts list
- **Refresh Costs:** Update cost data

---

## 🚨 Alert Types

### engine_down (Critical)
- Engine failed 3 consecutive health checks
- Requires immediate attention
- Fallback routing engines should be active

### engine_failure (Warning)
- Single health check failure
- May be temporary
- Monitor for escalation

### engine_recovery (Info)
- Engine came back online
- Status changed from down to up
- Normal operation resumed

---

## 💡 Best Practices

### 1. **Monitor Regularly**
- Check dashboard daily
- Review alerts weekly
- Analyze cost trends monthly

### 2. **Set Budget Alerts**
- Monitor OCI costs
- Alert if daily cost exceeds $1
- Alert if monthly cost exceeds $50

### 3. **Maintain Fallback Chain**
- Ensure all 3 engines are monitored
- Test fallback chain regularly
- Document engine URLs

### 4. **Log Analysis**
- Check `routing_monitor.log` for errors
- Review health check history
- Analyze failure patterns

### 5. **Performance Optimization**
- Monitor response times
- Identify slow engines
- Optimize routing parameters

---

## 🔍 Troubleshooting

### Monitoring Not Starting
```bash
# Check if routing_monitor.py is in the same directory
ls routing_monitor.py

# Check for import errors
python -c "from routing_monitor import get_monitor; print('OK')"
```

### No Health Check Data
```bash
# Manually trigger health check
curl -X POST http://localhost:5000/api/monitoring/health-check

# Check database
sqlite3 voyagr_web.db "SELECT * FROM engine_health_checks LIMIT 5;"
```

### Dashboard Not Loading
```bash
# Check if Flask is running
curl http://localhost:5000/

# Check monitoring endpoint
curl http://localhost:5000/api/monitoring/engine-status
```

### Alerts Not Triggering
- Check `ALERT_THRESHOLD` setting (default: 3)
- Verify engine URLs are correct
- Check network connectivity

---

## 📞 Support

For issues or questions:
1. Check `routing_monitor.log` for errors
2. Review database tables for data
3. Test endpoints manually with curl
4. Check engine URLs in `.env`

---

## ✅ Success Criteria

- ✅ Health checks run every 5 minutes
- ✅ Alerts trigger within 1 minute of failure
- ✅ Cost data updates daily
- ✅ Dashboard displays real-time status
- ✅ Historical data retained for 30+ days
- ✅ All 3 engines monitored
- ✅ Fallback chain working

---

**Your routing infrastructure is now fully monitored!** 🎉

