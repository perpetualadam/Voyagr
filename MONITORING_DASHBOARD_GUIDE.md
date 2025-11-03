# Voyagr Monitoring Dashboard - Complete Guide

## Overview

The enhanced Voyagr Monitoring Dashboard provides real-time health monitoring and comprehensive cost analysis for all three routing engines (GraphHopper, Valhalla, OSRM) with interactive visualizations and manual controls.

**Access**: http://localhost:5000/monitoring

## Features

### 1. Real-Time Status Display ✅
- **Engine Health Indicators**:
  - ✅ Green = Healthy (UP)
  - ⚠️ Yellow = Degraded
  - ❌ Red = Down
- **Response Times**: Milliseconds for each engine
- **Uptime Percentage**: 24-hour uptime for each engine
- **Last Health Check**: Timestamp of most recent check
- **Status Icons**: Visual indicators (✅, ⚠️, ❌)

### 2. Alert Management ✅
- **Alert Summary**: Count of critical, warning, and info alerts
- **Recent Alerts**: Last 10 unresolved alerts with:
  - Severity indicator (🔴 critical, ⚠️ warning, ℹ️ info)
  - Alert type (engine_down, engine_failure, engine_recovery)
  - Timestamp
  - Individual "Resolve" button
- **Filter Buttons**: Show alerts by severity (All, Critical, Warning)
- **Unresolved Count**: Prominently displayed
- **Bulk Actions**: "Resolve All" button per engine

### 3. Cost Visualization ✅

#### Metric Cards
- **Today's Cost**: Current day's cost
- **30-Day Total**: Total cost for selected period
- **Projected Monthly**: Estimated monthly cost
- **Cost Alert Status**: ✅ Normal or ⚠️ Alert (>$10 threshold)

#### Charts
1. **Bandwidth Usage Chart** (Line chart, 30 days)
   - Shows daily outbound bandwidth in GB
   - Trend visualization

2. **API Request Volume Chart** (Bar chart, 7 days)
   - Health checks vs. route calculations
   - Stacked bar comparison

3. **Cost Breakdown Chart** (Pie chart)
   - Bandwidth cost
   - Compute cost
   - Request cost

4. **Daily Cost Trend Chart** (Line chart, 30 days)
   - Daily costs with trend line
   - Forecast overlay

#### Cost Spikes Section
- Displays detected cost spikes (>20% day-over-day increase)
- Shows date, percentage increase, bandwidth, and request count
- Helps identify anomalies

### 4. Manual Controls ✅

#### Engine Controls
- **🔄 Refresh All Engines**: Manually trigger health checks

#### Alert Controls
- **Resolve All [Engine] Alerts**: Bulk resolve by engine
- **Individual Resolve**: Per-alert resolution

#### Export & Settings
- **📥 Export CSV**: Download 30-day cost history
- **Time Period Selector**: 7, 30, or 90 days
- **Charts update** based on selected period

### 5. Auto-Refresh ✅
- **60-Second Interval**: Auto-refresh every 60 seconds
- **Countdown Timer**: Shows seconds until next refresh
- **⏸ Pause Button**: Pause/resume auto-refresh
- **localStorage Persistence**: Remembers pause preference
- **Manual Refresh**: "Refresh" buttons on each section

## Dashboard Sections

### Header
- Title and description
- Refresh countdown timer
- Pause/Resume toggle button

### Real-Time Status Section
- **Engine Health Card**: Current status of all 3 engines
- **Alert Summary Card**: Count of alerts by severity
- **Cost Metrics Card**: Key cost indicators

### Alerts Section
- **Recent Alerts**: Last 10 unresolved alerts
- **Filter Buttons**: By severity
- **Resolve Controls**: Individual and bulk actions

### Cost Analysis Section
- **Metric Cards**: 4 key metrics (today, 30-day, projected, alert status)
- **Bandwidth Chart**: 30-day trend
- **Request Chart**: 7-day volume by type
- **Cost Breakdown**: Pie chart of cost categories
- **Cost Trend**: 30-day daily costs
- **Cost Spikes**: Detected anomalies

### Manual Controls Section
- **Engine Controls**: Manual health check
- **Alert Controls**: Bulk resolve by engine
- **Export & Settings**: CSV export and time period selector

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `/api/monitoring/engine-status` | Get engine health status |
| `/api/monitoring/alerts/unresolved` | Get unresolved alerts |
| `/api/monitoring/alerts/summary` | Get alert summary |
| `/api/monitoring/costs/bandwidth` | Get bandwidth history |
| `/api/monitoring/costs/requests` | Get request counts |
| `/api/monitoring/costs/estimate` | Get cost estimate |
| `/api/monitoring/costs/trends` | Get trend analysis |
| `/api/monitoring/costs/history` | Get cost history |
| `/api/monitoring/costs/export` | Export to CSV |
| `/api/monitoring/health-check` | Trigger health check |
| `/api/monitoring/alerts/{id}/resolve` | Resolve alert |
| `/api/monitoring/alerts/engine/{engine}/resolve-all` | Bulk resolve |

## Usage Examples

### View Dashboard
```
Open browser: http://localhost:5000/monitoring
```

### Manual Health Check
1. Click "🔄 Refresh All Engines" button
2. Wait for check to complete
3. Status updates automatically

### Resolve Alerts
1. Click "Resolve" button on individual alert, OR
2. Click "Resolve All [Engine] Alerts" for bulk action
3. Alert list updates automatically

### Export Cost Data
1. Select time period (7, 30, or 90 days)
2. Click "📥 Export CSV (30d)" button
3. CSV file downloads automatically

### Pause Auto-Refresh
1. Click "⏸ Pause" button in header
2. Auto-refresh stops
3. Preference saved to localStorage
4. Click "▶ Resume" to restart

### View Cost Trends
1. Select time period from dropdown
2. Charts update automatically
3. Bandwidth, requests, costs, and trends display
4. Cost spikes highlighted if detected

## Responsive Design

- **Desktop**: Full grid layout with all charts visible
- **Tablet**: 2-column grid, charts stack
- **Mobile**: Single column, charts responsive

## Performance

- **Initial Load**: ~2-3 seconds
- **Auto-Refresh**: ~1 second
- **Chart Updates**: <500ms
- **Export**: <1 second

## Troubleshooting

### Charts Not Displaying
- Check browser console for errors
- Verify Chart.js CDN is accessible
- Refresh page

### No Data Showing
- Ensure monitoring system is running
- Check that cost tracking is enabled
- Verify database has data

### Auto-Refresh Not Working
- Check browser console
- Verify API endpoints are accessible
- Check localStorage for pause preference

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Responsive design

## Keyboard Shortcuts

- `R`: Refresh all data (future enhancement)
- `E`: Export CSV (future enhancement)
- `P`: Pause/resume auto-refresh (future enhancement)

## Customization

### Change Auto-Refresh Interval
Edit line in JavaScript:
```javascript
autoRefreshInterval = setInterval(() => {
    if (!isAutoRefreshPaused) {
        loadAllData();
    }
}, 60000); // Change 60000 to desired milliseconds
```

### Change Cost Alert Threshold
Edit in `routing_monitor.py`:
```python
cost_alert = forecast_30_days > 10.0  # Change 10.0 to desired threshold
```

### Add More Engines
Edit engine list in JavaScript:
```javascript
const engines = ['graphhopper', 'valhalla', 'osrm', 'new_engine'];
```

## Support

For issues or questions:
- Check browser console for errors
- Review API endpoint responses
- Check routing_monitor.py logs
- Refer to COST_ANALYSIS_SYSTEM.md for cost data details

## Files

- `voyagr_web.py` - Dashboard HTML and API endpoints
- `routing_monitor.py` - Backend monitoring logic
- `MONITORING_DASHBOARD_GUIDE.md` - This file
- `COST_ANALYSIS_SYSTEM.md` - Cost analysis details

