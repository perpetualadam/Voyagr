# Voyagr Monitoring Dashboard - Quick Start

## Access Dashboard

```
http://localhost:5000/monitoring
```

## Dashboard at a Glance

### 🔍 Real-Time Status
- **Engine Health**: ✅ UP, ⚠️ DEGRADED, ❌ DOWN
- **Response Times**: Milliseconds per engine
- **Uptime**: 24-hour percentage
- **Last Check**: Timestamp

### ⚠️ Alert Management
- **Summary**: Count of critical/warning/info alerts
- **Recent Alerts**: Last 10 unresolved
- **Filters**: By severity level
- **Actions**: Resolve individual or bulk by engine

### 💰 Cost Analysis
- **Today's Cost**: Current day total
- **30-Day Total**: Selected period total
- **Projected Monthly**: Estimated cost
- **Alert Status**: ✅ Normal or ⚠️ Alert

### 📊 Visualizations
1. **Bandwidth Chart**: 30-day outbound GB trend
2. **Request Chart**: 7-day health checks vs. route calculations
3. **Cost Breakdown**: Pie chart (bandwidth, compute, requests)
4. **Cost Trend**: 30-day daily costs
5. **Cost Spikes**: Detected anomalies (>20% increase)

## Common Tasks

### Check Engine Health
1. Click **🔄 Refresh All Engines**
2. Wait for check to complete
3. View status badges (✅/⚠️/❌)

### Resolve Alerts
**Individual Alert**:
1. Find alert in "Recent Alerts" section
2. Click **Resolve** button
3. Alert disappears

**All Alerts for Engine**:
1. Scroll to "Manual Controls"
2. Click **Resolve All [ENGINE] Alerts**
3. All engine alerts resolved

### View Cost Trends
1. Select time period: 7, 30, or 90 days
2. Charts update automatically
3. View bandwidth, requests, costs, trends
4. Check for cost spikes

### Export Cost Data
1. Select time period (7, 30, or 90 days)
2. Click **📥 Export CSV (30d)**
3. CSV file downloads
4. Open in Excel/Sheets

### Pause Auto-Refresh
1. Click **⏸ Pause** in header
2. Auto-refresh stops
3. Click **▶ Resume** to restart
4. Preference saved automatically

## Dashboard Sections

| Section | Purpose | Update |
|---------|---------|--------|
| Engine Status | Health of all 3 engines | Auto 60s |
| Alert Summary | Count by severity | Auto 60s |
| Cost Metrics | Key cost indicators | Auto 60s |
| Recent Alerts | Last 10 unresolved | Auto 60s |
| Bandwidth Chart | 30-day trend | Auto 60s |
| Request Chart | 7-day volume | Auto 60s |
| Cost Breakdown | Cost categories | Auto 60s |
| Cost Trend | Daily costs | Auto 60s |
| Cost Spikes | Anomalies detected | Auto 60s |

## Status Indicators

### Engine Status
- ✅ **UP**: Engine healthy, responding normally
- ⚠️ **DEGRADED**: 1-2 consecutive failures
- ❌ **DOWN**: 3+ consecutive failures

### Alert Severity
- 🔴 **CRITICAL**: Engine DOWN (3+ failures)
- ⚠️ **WARNING**: Engine degraded (1-2 failures)
- ℹ️ **INFO**: Recovery or informational

### Cost Alert
- ✅ **Normal**: Projected cost < $10/month
- ⚠️ **Alert**: Projected cost > $10/month

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/monitoring/engine-status` | GET | Engine health |
| `/api/monitoring/alerts/unresolved` | GET | Unresolved alerts |
| `/api/monitoring/costs/bandwidth` | GET | Bandwidth history |
| `/api/monitoring/costs/requests` | GET | Request counts |
| `/api/monitoring/costs/estimate` | GET | Cost estimate |
| `/api/monitoring/costs/trends` | GET | Trend analysis |
| `/api/monitoring/costs/history` | GET | Cost history |
| `/api/monitoring/costs/export` | GET | CSV export |
| `/api/monitoring/health-check` | POST | Manual health check |
| `/api/monitoring/alerts/{id}/resolve` | POST | Resolve alert |
| `/api/monitoring/alerts/engine/{engine}/resolve-all` | POST | Bulk resolve |

## Keyboard Shortcuts

- **R**: Refresh all (future)
- **E**: Export CSV (future)
- **P**: Pause/resume (future)

## Performance

- **Initial Load**: 2-3 seconds
- **Auto-Refresh**: 1 second
- **Chart Updates**: <500ms
- **Export**: <1 second

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Charts not showing | Refresh page, check console |
| No data | Verify monitoring is running |
| Auto-refresh not working | Check API endpoints, clear localStorage |
| Slow performance | Check network, reduce time period |

## Browser Support

- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (responsive)

## Tips & Tricks

1. **Pause before exporting** to avoid data changes
2. **Check cost spikes** for unusual activity
3. **Monitor uptime** for reliability trends
4. **Export weekly** for record keeping
5. **Set alerts** for cost thresholds

## Related Documentation

- **MONITORING_DASHBOARD_GUIDE.md** - Full guide
- **COST_ANALYSIS_SYSTEM.md** - Cost analysis details
- **ALERTING_SYSTEM_COMPLETE.md** - Alert system details

## Support

For issues:
1. Check browser console (F12)
2. Verify API endpoints accessible
3. Check routing_monitor.py logs
4. Review documentation files

---

**Last Updated**: 2025-11-03
**Version**: 1.0
**Status**: Production Ready ✅

