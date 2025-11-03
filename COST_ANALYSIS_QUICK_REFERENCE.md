# Cost Analysis System - Quick Reference

## Quick Start

### Track Bandwidth
```python
monitor.track_bandwidth('valhalla', inbound_gb=0.5, outbound_gb=1.2, request_type='route_calculation')
```

### Track API Requests
```python
monitor.track_api_request('valhalla', 'route_calculation')
```

### Get Bandwidth Usage
```python
bandwidth = monitor.get_bandwidth_usage(days=30)
# Returns: [{'date': '2025-11-03', 'engine': 'valhalla', 'inbound_gb': 0.5, 'outbound_gb': 1.2, 'total_gb': 1.7}, ...]
```

### Get Request Counts
```python
requests = monitor.get_request_counts(days=30)
# Returns: {'2025-11-03': {'valhalla_health_check': 288, 'valhalla_route_calculation': 45}, ...}
```

### Estimate Monthly Cost
```python
estimate = monitor.estimate_monthly_cost(days=30)
# Returns: {
#     'projected_bandwidth_gb': 300.0,
#     'total_monthly_cost': 4.35,
#     'bandwidth_cost': 2.55,
#     'compute_cost': 1.50,
#     'request_cost': 0.30,
#     'daily_average_cost': 0.145
# }
```

### Analyze Trends
```python
trends = monitor.analyze_cost_trends(days=30)
# Returns: {
#     'daily_average_cost': 0.145,
#     'cost_spikes_detected': 2,
#     'forecast_7_days': 1.015,
#     'forecast_30_days': 4.35,
#     'cost_alert_threshold_exceeded': False
# }
```

### Get Cost History
```python
history = monitor.get_cost_history(days=30)
# Returns: {
#     'history': [...],
#     'summary': {'total_cost': 4.35, 'average_daily_cost': 0.145, ...}
# }
```

### Export to CSV
```python
filename = monitor.export_cost_history_csv(days=30, filename='costs.csv')
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/monitoring/costs/bandwidth` | GET | Get bandwidth usage history |
| `/api/monitoring/costs/requests` | GET | Get API request counts |
| `/api/monitoring/costs/estimate` | GET | Get monthly cost estimate |
| `/api/monitoring/costs/trends` | GET | Analyze cost trends |
| `/api/monitoring/costs/history` | GET | Get cost history |
| `/api/monitoring/costs/export` | GET | Export to CSV |
| `/api/monitoring/costs/track` | POST | Track bandwidth/requests |

## Query Parameters

All GET endpoints support:
- `days=30` - Number of days to retrieve (default: 30)

## Response Format

All endpoints return JSON:
```json
{
    "success": true,
    "bandwidth": [...],
    "requests": {...},
    "estimate": {...},
    "trends": {...},
    "history": {...}
}
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `bandwidth_tracking` | Stores bandwidth per request |
| `api_request_tracking` | Stores request counts by type |
| `cost_trends` | Stores trend analysis results |
| `oci_cost_tracking` | Stores daily cost totals |

## Pricing

- **Bandwidth**: $0.0085/GB egress
- **Compute**: ~$0.05/day
- **Requests**: $0.00001/request

## Common Tasks

### Monitor Daily Costs
```python
costs = monitor.get_daily_costs(days=1)
print(f"Today: ${costs[0]['estimated_cost']}")
```

### Check for Cost Spikes
```python
trends = monitor.analyze_cost_trends(days=30)
if trends['cost_spikes_detected'] > 0:
    for spike in trends['cost_spikes']:
        print(f"Spike on {spike['date']}: +{spike['increase_pct']}%")
```

### Get Monthly Forecast
```python
estimate = monitor.estimate_monthly_cost(days=30)
print(f"Projected monthly cost: ${estimate['total_monthly_cost']}")
```

### Export for Analysis
```python
filename = monitor.export_cost_history_csv(days=30)
# Open in Excel/Google Sheets
```

## Alert Thresholds

- **Cost Alert**: Triggered when projected monthly cost > $10
- **Spike Alert**: Triggered when day-over-day increase > 20%

## Testing

```bash
# Run all cost analysis tests
pytest test_cost_analysis.py -v

# Run specific test
pytest test_cost_analysis.py::TestBandwidthMonitoring::test_track_bandwidth -v

# Run with coverage
pytest test_cost_analysis.py --cov=routing_monitor
```

## Troubleshooting

### No data returned
- Ensure `track_bandwidth()` or `track_oci_cost()` has been called
- Check date range with `days` parameter
- Verify database file exists

### Cost seems too high
- Check bandwidth usage with `get_bandwidth_usage()`
- Verify request counts with `get_request_counts()`
- Review pricing model ($0.0085/GB)

### CSV export fails
- Ensure write permissions in current directory
- Check disk space
- Verify filename is valid

## Performance

- Bandwidth tracking: <1ms
- Request counting: <1ms
- Cost estimation: <10ms
- Trend analysis: <50ms
- CSV export: <100ms

## Integration Points

1. **Health Checks** - Track bandwidth per health check
2. **Route Calculations** - Track bandwidth per route request
3. **Monitoring Dashboard** - Display cost metrics
4. **Alerting System** - Trigger cost alerts
5. **Admin Panel** - Export and analyze costs

## Files

- `routing_monitor.py` - Core implementation
- `voyagr_web.py` - API endpoints
- `test_cost_analysis.py` - Test suite
- `COST_ANALYSIS_SYSTEM.md` - Full documentation

