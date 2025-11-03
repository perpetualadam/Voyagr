# Voyagr Alerting System - Quick Reference

## Alert Lifecycle

```
Engine Fails
    ↓
1st Failure → ⚠️ WARNING (1/3)
    ↓
2nd Failure → ⚠️ WARNING (2/3)
    ↓
3rd Failure → 🔴 CRITICAL (DOWN)
    ↓
Engine Recovers → ✅ INFO (RECOVERED)
    ↓
Alert Resolved → ✓ RESOLVED
```

---

## API Endpoints

### Get Alerts
```bash
# Get recent alerts (default 10)
GET /api/monitoring/alerts?limit=20

# Get unresolved alerts only
GET /api/monitoring/alerts/unresolved?limit=50

# Get alerts by severity
GET /api/monitoring/alerts/severity/critical
GET /api/monitoring/alerts/severity/warning
GET /api/monitoring/alerts/severity/info

# Get alerts for specific engine
GET /api/monitoring/alerts/engine/graphhopper
GET /api/monitoring/alerts/engine/valhalla
GET /api/monitoring/alerts/engine/osrm

# Get alert summary
GET /api/monitoring/alerts/summary
```

### Manage Alerts
```bash
# Resolve single alert
POST /api/monitoring/alerts/1/resolve

# Resolve all alerts for engine
POST /api/monitoring/alerts/engine/graphhopper/resolve-all

# Send notification for alert
POST /api/monitoring/alerts/1/notify
Content-Type: application/json
{"method": "log"}  # or "email", "browser"
```

---

## Python Usage

### Import
```python
from routing_monitor import get_monitor

monitor = get_monitor()
```

### Get Alerts
```python
# Recent alerts
alerts = monitor.get_recent_alerts(limit=10)

# Unresolved only
alerts = monitor.get_recent_alerts(limit=10, unresolved_only=True)

# By severity
critical = monitor.get_alerts_by_severity('critical')
warnings = monitor.get_alerts_by_severity('warning')

# By engine
gh_alerts = monitor.get_alerts_by_engine('graphhopper')

# Summary
summary = monitor.get_alert_summary()
# Returns: {
#   'total_unresolved': 5,
#   'total_all': 42,
#   'by_severity': {'critical': 2, 'warning': 3},
#   'by_engine': {'graphhopper': 2, 'valhalla': 3}
# }
```

### Manage Alerts
```python
# Resolve single alert
monitor.resolve_alert(alert_id=1)

# Resolve all for engine
monitor.resolve_all_alerts_for_engine('graphhopper')

# Send notification
monitor.send_alert_notification(alert_id=1, method='log')
```

### Check Engine Status
```python
status = monitor.get_engine_status('graphhopper')
# Returns: {
#   'engine_name': 'graphhopper',
#   'status': 'down',
#   'consecutive_failures': 3,
#   'uptime_percentage': 95.2
# }
```

---

## Alert Structure

```json
{
  "id": 1,
  "engine": "graphhopper",
  "type": "engine_down",
  "severity": "critical",
  "message": "graphhopper is DOWN - 3 consecutive failures",
  "created_at": "2025-11-03 19:30:00",
  "resolved": false
}
```

---

## Severity Levels

| Level | Color | Meaning | Action |
|-------|-------|---------|--------|
| **critical** | 🔴 Red | Engine DOWN (3+ failures) | Immediate attention |
| **warning** | ⚠️ Orange | Engine degraded (1-2 failures) | Monitor closely |
| **info** | ℹ️ Blue | Recovery or informational | Acknowledge |

---

## Alert Types

| Type | Severity | Trigger | Message |
|------|----------|---------|---------|
| **engine_failure** | warning | 1st or 2nd consecutive failure | "health check failed (1/3)" |
| **engine_down** | critical | 3rd consecutive failure | "is DOWN - 3 consecutive failures" |
| **engine_recovery** | info | Engine comes back online | "recovered after X failures" |

---

## Monitoring Loop

The monitoring system runs automatically every 5 minutes:

```
Every 5 minutes:
  ├─ Check GraphHopper health
  ├─ Check Valhalla health
  ├─ Check OSRM health
  ├─ Record results
  ├─ Create alerts if needed
  └─ Log summary
```

---

## Key Features

✅ **Threshold-based**: 3 consecutive failures = critical  
✅ **Severity levels**: Critical, Warning, Info  
✅ **Alert types**: Failure, Down, Recovery  
✅ **Recovery detection**: Automatic when engine recovers  
✅ **Alert resolution**: Manual or bulk  
✅ **Deduplication**: No duplicate alerts within 5 min  
✅ **Filtering**: By severity, engine, or status  
✅ **Statistics**: Summary of all alerts  
✅ **Persistence**: All data in database  
✅ **Logging**: Emoji-enhanced visibility  

---

## Common Tasks

### Check if engine is down
```python
status = monitor.get_engine_status('graphhopper')
if status['status'] == 'down':
    print(f"Engine is DOWN with {status['consecutive_failures']} failures")
```

### Get all critical alerts
```python
critical = monitor.get_alerts_by_severity('critical')
for alert in critical:
    print(f"{alert['engine']}: {alert['message']}")
```

### Resolve all alerts for failed engine
```python
monitor.resolve_all_alerts_for_engine('valhalla')
```

### Get alert statistics
```python
summary = monitor.get_alert_summary()
print(f"Total unresolved: {summary['total_unresolved']}")
print(f"By severity: {summary['by_severity']}")
print(f"By engine: {summary['by_engine']}")
```

---

## Testing

Run all alerting tests:
```bash
pytest test_alerting_system.py -v
```

Run specific test:
```bash
pytest test_alerting_system.py::TestAlertingSystem::test_critical_alert_on_third_failure -v
```

---

## Troubleshooting

**Q: Why isn't an alert being created?**  
A: Check if a similar alert already exists (deduplication within 5 min)

**Q: How do I clear all alerts?**  
A: Use `resolve_all_alerts_for_engine(engine_name)` for specific engine

**Q: Can I customize the 3-failure threshold?**  
A: Yes, modify `ALERT_THRESHOLD` constant in `routing_monitor.py`

**Q: How long are alerts kept?**  
A: Indefinitely in database (consider archiving old alerts)

---

## Dashboard Access

```
http://localhost:5000/monitoring
```

View real-time status of all engines and recent alerts.

---

**Last Updated**: 2025-11-03  
**Status**: Production Ready ✅

