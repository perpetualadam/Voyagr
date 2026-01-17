# PowerShell script to test Snap to Roads API with multiple UK locations
# This tests the production API at http://localhost:5000

Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "TESTING SNAP TO ROADS API - MULTIPLE UK LOCATIONS" -ForegroundColor Cyan
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host ""

# Test locations across the UK
$locations = @(
    @{lat="51.5074"; lon="-0.1278"; name="London (Central)"},
    @{lat="53.4808"; lon="-2.2426"; name="Manchester"},
    @{lat="52.4862"; lon="-1.8904"; name="Birmingham"},
    @{lat="55.9533"; lon="-3.1883"; name="Edinburgh"},
    @{lat="51.4545"; lon="-2.5879"; name="Bristol"},
    @{lat="53.8008"; lon="-1.5491"; name="Leeds"},
    @{lat="51.3811"; lon="-2.3590"; name="Bath"}
)

$successCount = 0
$failureCount = 0

foreach ($location in $locations) {
    Write-Host "-----------------------------------------------------------------------" -ForegroundColor Gray
    Write-Host "Testing: $($location.name) (Lat: $($location.lat), Lon: $($location.lon))" -ForegroundColor Yellow
    Write-Host "-----------------------------------------------------------------------" -ForegroundColor Gray
    
    # Make API request
    $url = "http://localhost:5000/api/speed-limit?lat=$($location.lat)&lon=$($location.lon)&road_type=residential"
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        
        if ($response.success -eq $true) {
            $speedMph = $response.data.speed_limit_mph
            $speedKmh = $response.data.speed_limit_kmh
            Write-Host "✅ SUCCESS: $speedMph mph ($speedKmh km/h)" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "❌ FAILED" -ForegroundColor Red
            Write-Host ($response | ConvertTo-Json -Depth 10)
            $failureCount++
        }
    } catch {
        Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $failureCount++
    }
    
    Write-Host ""
}

Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "Total locations tested: $($locations.Count)"
Write-Host "Successful: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor $(if ($failureCount -eq 0) { "Green" } else { "Red" })
Write-Host ""

# Get metrics
Write-Host "-----------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "API METRICS" -ForegroundColor Yellow
Write-Host "-----------------------------------------------------------------------" -ForegroundColor Gray

try {
    $metrics = Invoke-RestMethod -Uri "http://localhost:5000/api/speed-limit/metrics" -Method Get
    
    Write-Host "`nSnap to Roads API:" -ForegroundColor Cyan
    Write-Host "  Total calls: $($metrics.data.tomtom_snap_to_roads.total_calls)"
    Write-Host "  Successful: $($metrics.data.tomtom_snap_to_roads.successful)" -ForegroundColor Green
    Write-Host "  Failures: $($metrics.data.tomtom_snap_to_roads.failures)" -ForegroundColor $(if ($metrics.data.tomtom_snap_to_roads.failures -eq 0) { "Green" } else { "Red" })
    Write-Host "  Success rate: $($metrics.data.tomtom_snap_to_roads.success_rate)%" -ForegroundColor $(if ($metrics.data.tomtom_snap_to_roads.success_rate -eq 100) { "Green" } else { "Yellow" })
    
    Write-Host "`nTraffic Flow API:" -ForegroundColor Cyan
    Write-Host "  Total calls: $($metrics.data.tomtom_traffic_flow.total_calls)"
    Write-Host "  Successful: $($metrics.data.tomtom_traffic_flow.successful)"
    Write-Host "  Failures: $($metrics.data.tomtom_traffic_flow.failures)"
    
    Write-Host "`nCache:" -ForegroundColor Cyan
    Write-Host "  Hits: $($metrics.data.cache.hits)" -ForegroundColor Green
    Write-Host "  Misses: $($metrics.data.cache.misses)"
    Write-Host "  Size: $($metrics.data.cache.size)"
    
} catch {
    Write-Host "❌ ERROR getting metrics: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=======================================================================" -ForegroundColor Cyan
if ($failureCount -eq 0) {
    Write-Host "✅ ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "⚠️  SOME TESTS FAILED" -ForegroundColor Yellow
}
Write-Host "=======================================================================" -ForegroundColor Cyan

